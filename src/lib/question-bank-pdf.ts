import { jsPDF } from "jspdf";
import { tagsToCell, type QuestionBankExportRow } from "@/lib/question-bank-csv";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

export type QuestionBankPdfFilterContext = {
  track: string;
  subject: string;
  search: string;
  difficulty: string;
  year: string;
  chapter: string;
  importantOnly: boolean;
  repeatedOnly: boolean;
  jeeExamType: string;
};

function buildFilterLines(ctx: QuestionBankPdfFilterContext): string[] {
  const lines: string[] = [
    `Generated: ${new Date().toISOString().slice(0, 19)}Z`,
    `Track: ${ctx.track} · Subject: ${ctx.subject}`,
  ];
  if (ctx.search.trim()) lines.push(`Search: ${ctx.search.trim()}`);
  if (ctx.difficulty !== "All") lines.push(`Difficulty: ${ctx.difficulty}`);
  if (ctx.year.trim()) lines.push(`Year: ${ctx.year.trim()}`);
  if (ctx.chapter.trim()) lines.push(`Chapter contains: ${ctx.chapter.trim()}`);
  if (ctx.track === "JEE" && ctx.jeeExamType !== "All") lines.push(`JEE exam type: ${ctx.jeeExamType}`);
  if (ctx.importantOnly) lines.push("Important only: yes");
  if (ctx.repeatedOnly) lines.push("Repeated only: yes");
  return lines;
}

/**
 * Printable PDF for the current filtered question list (plain text, Helvetica).
 */
export function downloadQuestionBankFilteredPdf(
  items: QuestionBankExportRow[],
  ctx: QuestionBankPdfFilterContext,
  filename: string
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 44;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - 2 * margin;
  const lineStep = 13;
  let y = margin;

  const needSpace = (extra: number) => {
    if (y + extra > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeBlock = (text: string, fontSize: number, style: "normal" | "bold" | "italic") => {
    const fontStyle = style === "bold" ? "bold" : style === "italic" ? "italic" : "normal";
    doc.setFont("helvetica", fontStyle);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const arr = Array.isArray(lines) ? lines : [String(lines)];
    for (const line of arr) {
      needSpace(lineStep);
      doc.text(line, margin, y);
      y += lineStep;
    }
  };

  writeBlock("Question bank — filtered export", 14, "bold");
  y += 4;
  for (const line of buildFilterLines(ctx)) {
    writeBlock(line, 9, "italic");
  }
  y += 8;
  writeBlock(`Questions: ${items.length}`, 10, "bold");
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  items.forEach((q, idx) => {
    const n = idx + 1;
    const metaParts = [
      `ID ${q.id}`,
      q.year != null ? `Year ${q.year}` : null,
      q.chapter ? `Ch. ${q.chapter}` : null,
      q.difficulty ? q.difficulty : null,
      q.is_important ? "important" : null,
      q.is_repeated ? `repeated×${q.repetition_count}` : null,
    ].filter(Boolean);
    writeBlock(`Q${n} — ${metaParts.join(" · ")}`, 11, "bold");
    writeBlock(formatQuestionTextForDisplay(q.question_text), 10, "normal");

    const opts = q.options ?? [];
    if (opts.length > 0) {
      opts.forEach((opt, i) => {
        const label = String.fromCharCode(65 + i);
        writeBlock(`${label}. ${formatQuestionTextForDisplay(opt)}`, 10, "normal");
      });
    }
    if (q.correct_answer) {
      writeBlock(`Answer: ${q.correct_answer}`, 10, "bold");
    }
    const tags = tagsToCell(q.tags);
    if (tags) {
      writeBlock(`Tags: ${tags}`, 8, "italic");
    }
    if (q.source_name || q.source_url) {
      writeBlock(`Source: ${q.source_name}${q.source_url ? ` · ${q.source_url}` : ""}`, 8, "italic");
    }
    y += 10;
    needSpace(lineStep * 2);
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Page ${p} / ${totalPages}`, margin, pageH - 22);
  }

  doc.save(filename);
}
