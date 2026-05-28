import { jsPDF } from "jspdf";
import { parseQuestionPaperContent } from "@/lib/exam-paper-parser";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  JEE_ADVANCE_SECTION_MARKS,
  sectionMarksFromCounts,
  totalExamMarksFromSubjects,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import type { OmrTemplateSettings } from "@/lib/omr-template";

export type OmrTrack = "NEET" | "JEE" | "JEE_MAINS" | "JEE_ADVANCE";

export type OmrPdfOptions = {
  track: OmrTrack;
  rollDigits: number;
  paperTitle: string;
  questionCount: number;
  sectionsLabel: string;
  /** Number of duplicate OMR sheets (for separate students). */
  copies?: number;
  advance?: OmrTemplateSettings["advance"];
};

const OMR_LAYOUT: Record<OmrTrack, { questions: number; sections: string }> = {
  NEET: { questions: 200, sections: "Physics · Chemistry · Botany · Zoology (50 each)" },
  JEE: { questions: 75, sections: "Maths · Physics · Chemistry (25 each)" },
  JEE_MAINS: { questions: 75, sections: "Maths · Physics · Chemistry (25 each)" },
  JEE_ADVANCE: {
    questions: JEE_ADVANCE_QUESTIONS_PER_SUBJECT * 3,
    sections: "Maths · Physics · Chemistry (18 each, 3 sections)",
  },
};

function isJeeMainsTrack(track: OmrTrack): boolean {
  return track === "JEE" || track === "JEE_MAINS";
}

function isJeeAdvanceTrack(track: OmrTrack): boolean {
  return track === "JEE_ADVANCE";
}

function isAnyJeeTrack(track: OmrTrack): boolean {
  return isJeeMainsTrack(track) || isJeeAdvanceTrack(track);
}

const SRI_SAI_LOGO_SRC = "/images/Sri-Sai-logo.png";

export const JEE_MAINS_SECTION_COPY = {
  section1: {
    title: "SECTION-I",
    subtitle: "(SINGLE CORRECT ANSWER TYPE)",
    lines: [
      "This section contains 20 multiple choice questions. Each question has 4 options (1), (2), (3) and (4) for its answer, out of which ONLY ONE option can be correct.",
      "Marking scheme: +4 for correct answer, 0 if not attempted and -1 if not correct.",
    ],
  },
  section2: {
    title: "SECTION-II",
    subtitle: "(NUMERICAL VALUE ANSWER TYPE)",
    lines: [
      "This section contains 10 questions. The answer to each question is Numerical values. If the answer is in decimals, mark nearest integer only.",
      "Have to answer any 5 only out of 10 questions and question will be evaluated according to the following marking scheme: +4 for correct answer, -1 in all other cases.",
    ],
  },
} as const;

type JeeSectionCopy = typeof JEE_MAINS_SECTION_COPY.section1 | typeof JEE_MAINS_SECTION_COPY.section2;

function slugify(name: string): string {
  return name.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function drawBubble(doc: jsPDF, cx: number, cy: number, radius: number) {
  doc.circle(cx, cy, radius, "S");
}

function writeWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  style: "normal" | "bold" = "normal",
  lineHeight = 11
): number {
  doc.setFont("times", style);
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text, width);
  const arr = Array.isArray(lines) ? lines : [String(lines)];
  for (const line of arr) {
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawRule(doc: jsPDF, x1: number, y: number, x2: number): void {
  doc.setLineWidth(1);
  doc.line(x1, y, x2, y);
}

function loadBrowserImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

async function addInstituteLogo(doc: jsPDF, x: number, y: number, maxWidth: number, maxHeight: number): Promise<number> {
  try {
    const image = await loadBrowserImage(SRI_SAI_LOGO_SRC);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    doc.addImage(image, "PNG", x, y, width, height);
    return height;
  } catch {
    return 0;
  }
}

function drawInstructionBlock(
  doc: jsPDF,
  title: string,
  subtitle: string,
  lines: readonly string[],
  x: number,
  y: number,
  width: number
): number {
  drawRule(doc, x, y, x + width);
  y += 14;
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(title, x + width / 2, y, { align: "center" });
  y += 14;
  doc.text(subtitle, x + width / 2, y, { align: "center" });
  y += 16;
  for (const line of lines) {
    y = writeWrappedText(doc, line, x, y, width, 9.5, "normal", 11);
    y += 2;
  }
  return y + 6;
}

function getJeeSectionCopy(
  sectionName: string,
  questionOptions: Array<{ options: string[] }>
): JeeSectionCopy {
  const lower = sectionName.toLowerCase();
  if (
    lower.includes("section-ii") ||
    lower.includes("section ii") ||
    lower.includes("numerical")
  ) {
    return JEE_MAINS_SECTION_COPY.section2;
  }
  if (
    lower.includes("section-i") ||
    lower.includes("section i") ||
    lower.includes("single correct")
  ) {
    return JEE_MAINS_SECTION_COPY.section1;
  }
  const hasOnlyNumericalStyle = questionOptions.length > 0 && questionOptions.every((q) => q.options.length === 0);
  return hasOnlyNumericalStyle ? JEE_MAINS_SECTION_COPY.section2 : JEE_MAINS_SECTION_COPY.section1;
}

function getJeeSectionKind(
  sectionName: string,
  questionOptions: Array<{ options: string[] }>
): "section1" | "section2" {
  return getJeeSectionCopy(sectionName, questionOptions).title === JEE_MAINS_SECTION_COPY.section2.title
    ? "section2"
    : "section1";
}

function getSubjectLabelFromSectionName(sectionName: string): string {
  const cleaned = sectionName
    .replace(/section[\s-]*ii/gi, "")
    .replace(/section[\s-]*i/gi, "")
    .replace(/single correct answer type/gi, "")
    .replace(/numerical value answer type/gi, "")
    .replace(/[()\-:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || sectionName.trim();
}

function getJeeSubjectOrder(sectionName: string): number {
  const subject = getSubjectLabelFromSectionName(sectionName).toLowerCase();
  if (subject.includes("math")) return 0;
  if (subject.includes("physics")) return 1;
  if (subject.includes("chem")) return 2;
  return 99;
}

function advanceInstructionLines(subject: JeeAdvanceSubjectConfig): string[] {
  const marks = sectionMarksFromCounts(subject.sectionCounts);
  const c = subject.sectionCounts;
  const m = JEE_ADVANCE_SECTION_MARKS;
  return [
    `${subject.subject.toUpperCase()} — ${JEE_ADVANCE_QUESTIONS_PER_SUBJECT} questions, ${marks.total} marks`,
    `${m.section1.label}: ${c.section1} Qs (+${m.section1.correct}/−${Math.abs(m.section1.wrong)} each, ${marks.section1} marks)`,
    `${m.section2.label}: ${c.section2} Qs (+${m.section2.correct}/−${Math.abs(m.section2.wrong)} each, ${marks.section2} marks; partial +1 per correct option)`,
    `${m.section3.label}: ${c.section3} Qs (+${m.section3.correct}/0 each, ${marks.section3} marks)`,
  ];
}

async function addJeeAdvanceTemplateTopBlock(
  doc: jsPDF,
  opts: OmrPdfOptions,
  margin: number,
  pageWidth: number
): Promise<number> {
  const subjects = opts.advance?.subjects ?? [];
  const maxMarks = subjects.length > 0 ? totalExamMarksFromSubjects(subjects) : 198;
  const hours = opts.advance?.examDurationHours ?? JEE_ADVANCE_EXAM_DURATION_HOURS;

  let y = margin;
  const boxX = margin - 8;
  const boxWidth = pageWidth - margin * 2 + 16;
  doc.setLineWidth(1.2);
  doc.rect(boxX, margin - 8, boxWidth, 100);

  const logoHeight = await addInstituteLogo(doc, margin, y, 230, 78);
  const textTop = y + 8;

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text(`Time: ${hours.toFixed(2)} Hrs`, margin, textTop + 62);

  doc.setFontSize(14);
  doc.text("JEE ADVANCE MODEL", pageWidth / 2, textTop + 72, { align: "center" });

  doc.setFontSize(12);
  doc.text("Sri Sai Educational Institutions", pageWidth - margin, textTop + 62, { align: "right" });
  doc.text(`Max. Marks: ${maxMarks}`, pageWidth - margin, textTop + 82, { align: "right" });

  y += Math.max(logoHeight, 88);
  drawRule(doc, margin, y, pageWidth - margin);
  y += 16;

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text("IMPORTANT INSTRUCTIONS", margin, y);
  y += 14;

  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  const intro = `Each subject has exactly ${JEE_ADVANCE_QUESTIONS_PER_SUBJECT} questions in three sections. Marks per question are fixed; total exam marks depend on section question counts.`;
  y = writeWrappedText(doc, intro, margin, y, pageWidth - margin * 2, 9.5, "normal", 11);
  y += 6;

  for (const subject of subjects) {
    for (const line of advanceInstructionLines(subject)) {
      y = writeWrappedText(doc, line, margin, y, pageWidth - margin * 2, 9, "normal", 10);
    }
    y += 4;
  }

  return y + 8;
}

async function addJeeTemplateTopBlock(
  doc: jsPDF,
  opts: OmrPdfOptions,
  margin: number,
  pageWidth: number
): Promise<number> {
  let y = margin;
  const boxX = margin - 8;
  const boxWidth = pageWidth - margin * 2 + 16;
  doc.setLineWidth(1.2);
  doc.rect(boxX, margin - 8, boxWidth, 112);

  const logoHeight = await addInstituteLogo(doc, margin, y, 230, 78);
  const textTop = y + 8;

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text("JR IIT CBSE SC-A", margin, textTop + 62);
  doc.text("Time: 3.00 Hrs", margin, textTop + 82);

  doc.text("WTM-", pageWidth / 2, textTop + 62, { align: "center" });
  doc.setFontSize(14);
  doc.text("JEE MAINS MODEL", pageWidth / 2, textTop + 82, { align: "center" });

  doc.setFontSize(12);
  doc.text("Sri Sai Educational Institutions", pageWidth - margin, textTop + 62, { align: "right" });
  doc.text("Max. Marks: 300", pageWidth - margin, textTop + 82, { align: "right" });

  y += Math.max(logoHeight, 92);
  drawRule(doc, margin, y, pageWidth - margin);
  y += 18;

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.text("JEE MAIN EXAM TEMPLATE", margin, y);
  doc.text("MAX. MARKS: 300", pageWidth - margin, y, { align: "right" });
  return y + 16;
}

async function addOmrPages(doc: jsPDF, opts: OmrPdfOptions, options?: { prependNewPage?: boolean }): Promise<void> {
  const layout = OMR_LAYOUT[opts.track];
  const questionCount = opts.questionCount || layout.questions;
  const rollDigits = Math.min(Math.max(opts.rollDigits, 6), 12);
  const margin = 36;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const copies = Math.min(Math.max(opts.copies ?? 1, 1), 100);
  let needNewPage = options?.prependNewPage ?? false;

  for (let copy = 0; copy < copies; copy++) {
    if (needNewPage) doc.addPage();
    needNewPage = true;

    let y = margin;

    if (isJeeAdvanceTrack(opts.track)) {
      y = await addJeeAdvanceTemplateTopBlock(doc, opts, margin, pageW);
    } else if (isJeeMainsTrack(opts.track)) {
      y = await addJeeTemplateTopBlock(doc, opts, margin, pageW);
    } else {
      const heading =
        copies > 1 ? `${opts.paperTitle} - OMR (${copy + 1}/${copies})` : `${opts.paperTitle} - OMR Sheet`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(heading, margin, y);
      y += 18;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Track: ${opts.track} - ${layout.sections}`, margin, y);
      y += 12;
      doc.text("Fill roll number in the grid below. Mark one bubble per question (A-D).", margin, y);
      y += 16;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Roll number", margin, y);
    y += 10;

    const gridLeft = margin;
    const colW = 22;
    const rowH = 14;
    const bubbleR = 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let col = 0; col < rollDigits; col++) {
      const x = gridLeft + col * colW + colW / 2;
      doc.text(String(col + 1), x, y, { align: "center" });
    }
    y += 8;

    for (let digit = 0; digit <= 9; digit++) {
      doc.text(String(digit), gridLeft - 10, y + 4);
      for (let col = 0; col < rollDigits; col++) {
        const cx = gridLeft + col * colW + colW / 2;
        drawBubble(doc, cx, y, bubbleR);
      }
      y += rowH;
    }

    y += 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      isAnyJeeTrack(opts.track) ? "Responses (Objective marking)" : "Responses (A-D)",
      margin,
      y
    );
    y += 12;

    const cols = opts.track === "NEET" ? 4 : 3;
    const blockW = (pageW - 2 * margin) / cols;
    const qRowH = 11;
    const optLabels = ["A", "B", "C", "D"];
    const optGap = 14;
    const colYs = Array.from({ length: cols }, () => y);

    for (let qNum = 1; qNum <= questionCount; qNum++) {
      const col = (qNum - 1) % cols;
      const x0 = margin + col * blockW;
      if (colYs[col] + qRowH > pageH - margin) {
        doc.addPage();
        for (let i = 0; i < cols; i++) colYs[i] = margin;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const qLabel = String(qNum).padStart(3, " ");
      doc.text(qLabel, x0, colYs[col] + 3);
      for (let o = 0; o < 4; o++) {
        const cx = x0 + 28 + o * optGap;
        drawBubble(doc, cx, colYs[col], 3);
        doc.text(optLabels[o], cx - 2, colYs[col] + 3, { align: "center" });
      }
      colYs[col] += qRowH;
    }
  }
}

export async function downloadOmrSheetPdf(opts: OmrPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await addOmrPages(doc, opts);
  const name = slugify(opts.paperTitle || "omr");
  doc.save(`${name}-omr.pdf`);
}

async function addQuestionPaperPages(
  doc: jsPDF,
  opts: OmrPdfOptions,
  questionContent: string
): Promise<void> {
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

  const writeBlock = (text: string, fontSize: number, style: "normal" | "bold") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const arr = Array.isArray(lines) ? lines : [String(lines)];
    for (const line of arr) {
      needSpace(lineStep);
      doc.text(line, margin, y);
      y += lineStep;
    }
  };

  const parsed = parseQuestionPaperContent(questionContent);
  if (parsed.flatQuestions.length === 0) {
    if (isJeeAdvanceTrack(opts.track)) {
      y = await addJeeAdvanceTemplateTopBlock(doc, opts, margin, pageW);
    } else if (isJeeMainsTrack(opts.track)) {
      y = await addJeeTemplateTopBlock(doc, opts, margin, pageW);
    } else {
      writeBlock(opts.paperTitle, 14, "bold");
      y += 8;
      writeBlock(`Generated: ${new Date().toLocaleString()}`, 9, "normal");
      y += 10;
    }
    const plain = formatQuestionTextForDisplay(questionContent);
    writeBlock(plain || "(No structured questions — see raw content below)", 10, "normal");
    if (plain !== questionContent.trim()) {
      y += 6;
      writeBlock(questionContent.slice(0, 8000), 9, "normal");
    }
    return;
  }

  if (isJeeAdvanceTrack(opts.track)) {
    y = await addJeeAdvanceTemplateTopBlock(doc, opts, margin, pageW);
  } else if (isJeeMainsTrack(opts.track)) {
    y = await addJeeTemplateTopBlock(doc, opts, margin, pageW);
  } else {
    writeBlock(opts.paperTitle, 14, "bold");
    y += 8;
    writeBlock(`Generated: ${new Date().toLocaleString()}`, 9, "normal");
    y += 10;
  }

  if (isJeeAdvanceTrack(opts.track)) {
    const subjects = opts.advance?.subjects ?? [];
    for (const subject of subjects) {
      needSpace(28);
      writeBlock(subject.subject.toUpperCase(), 12, "bold");
      y += 4;
      for (const line of advanceInstructionLines(subject)) {
        writeBlock(line, 9, "normal");
      }
      y += 6;
    }

    for (const section of parsed.sections) {
      const subjectLabel = getSubjectLabelFromSectionName(section.name);
      needSpace(20);
      writeBlock(subjectLabel, 12, "bold");
      y += 4;
      for (const q of section.questions) {
        needSpace(24);
        const stem = formatQuestionTextForDisplay(q.prompt);
        writeBlock(`Q${q.indexInSection}. ${stem}`, 10, "normal");
        if (q.options.length > 0) {
          for (const opt of q.options) {
            writeBlock(`   ${formatQuestionTextForDisplay(opt)}`, 9, "normal");
          }
        } else {
          writeBlock("   Numerical answer", 9, "normal");
        }
        y += 4;
      }
      y += 6;
    }
    return;
  }

  if (isJeeMainsTrack(opts.track)) {
    const grouped = {
      section1: [] as typeof parsed.sections,
      section2: [] as typeof parsed.sections,
    };

    for (const section of parsed.sections) {
      const kind = getJeeSectionKind(section.name, section.questions);
      grouped[kind].push(section);
    }

    grouped.section1.sort((a, b) => getJeeSubjectOrder(a.name) - getJeeSubjectOrder(b.name));
    grouped.section2.sort((a, b) => getJeeSubjectOrder(a.name) - getJeeSubjectOrder(b.name));

    const orderedGroups: Array<{
      key: "section1" | "section2";
      sections: typeof parsed.sections;
    }> = [
      { key: "section1", sections: grouped.section1 },
      { key: "section2", sections: grouped.section2 },
    ];

    let wroteAnyGroup = false;
    for (const group of orderedGroups) {
      if (group.sections.length === 0) continue;
      if (wroteAnyGroup) {
        doc.addPage();
        y = margin;
      }
      wroteAnyGroup = true;

      const copy = JEE_MAINS_SECTION_COPY[group.key];
      y = drawInstructionBlock(doc, copy.title, copy.subtitle, copy.lines, margin, y, maxW);

      for (const section of group.sections) {
        const subjectLabel = getSubjectLabelFromSectionName(section.name);
        needSpace(20);
        writeBlock(subjectLabel, 12, "bold");
        y += 4;
        for (const q of section.questions) {
          needSpace(24);
          const stem = formatQuestionTextForDisplay(q.prompt);
          writeBlock(`Q${q.indexInSection}. ${stem}`, 10, "normal");
          if (q.options.length > 0) {
            for (const opt of q.options) {
              writeBlock(`   ${formatQuestionTextForDisplay(opt)}`, 9, "normal");
            }
          } else {
            writeBlock("   Numerical answer", 9, "normal");
          }
          y += 4;
        }
        y += 6;
      }
    }
    return;
  }

  for (const section of parsed.sections) {
    needSpace(20);
    writeBlock(section.name, 12, "bold");
    y += 4;
    for (const q of section.questions) {
      needSpace(24);
      const stem = formatQuestionTextForDisplay(q.prompt);
      writeBlock(`Q${q.indexInSection}. ${stem}`, 10, "normal");
      if (q.options.length > 0) {
        for (const opt of q.options) {
          writeBlock(`   ${formatQuestionTextForDisplay(opt)}`, 9, "normal");
        }
      } else {
        writeBlock("   Numerical answer", 9, "normal");
      }
      y += 4;
    }
  }
}

export async function downloadOmrBundlePdf(opts: OmrPdfOptions & { questionContent: string }): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  await addQuestionPaperPages(doc, opts, opts.questionContent);
  await addOmrPages(doc, opts, { prependNewPage: true });
  const name = slugify(opts.paperTitle || "exam-bundle");
  doc.save(`${name}-bundle.pdf`);
}

export { OMR_LAYOUT };
