import { jsPDF } from "jspdf";
import { parseQuestionPaperContentWithOptions } from "@/lib/exam-paper-parser";
import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  advanceSubjectInstructionLines,
  totalExamMarksFromSubjects,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import type { OmrTemplateSettings } from "@/lib/omr-template";
import {
  NEET_EXAM_DURATION_HOURS,
  NEET_INSTRUCTION_LINES,
  NEET_INSTRUCTIONS_TITLE,
  NEET_MAX_MARKS,
} from "@/lib/neet-exam-structure";
import {
  JEE_MAINS_EXAM_DURATION_HOURS,
  JEE_MAINS_INSTRUCTION_LINES,
  JEE_MAINS_INSTRUCTIONS_TITLE,
  JEE_MAINS_MAX_MARKS,
  JEE_MAINS_SECTION_INSTRUCTIONS,
} from "@/lib/jee-mains-exam-structure";

export type OmrTrack = "NEET" | "JEE" | "JEE_MAINS" | "JEE_ADVANCE";

export type OmrPageSize = "a4" | "b4";

export type OmrPdfOptions = {
  track: OmrTrack;
  rollDigits: number;
  paperTitle: string;
  questionCount: number;
  sectionsLabel: string;
  /** Number of duplicate OMR sheets (for separate students). */
  copies?: number;
  /** PDF page size — content layout scales to fit. */
  pageSize?: OmrPageSize;
  advance?: OmrTemplateSettings["advance"];
};

/** ISO sizes in points (jsPDF unit). */
const PAGE_SIZE_PT: Record<OmrPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  b4: [708.66, 1000.63],
};

function jsPdfFormat(pageSize: OmrPageSize = "a4"): [number, number] {
  return PAGE_SIZE_PT[pageSize];
}

/** Scale UI metrics from A4 so B4 spreads content across the larger sheet. */
function layoutScaleForWidth(pageW: number): number {
  return pageW / PAGE_SIZE_PT.a4[0];
}

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

function isNeetTrack(track: OmrTrack): boolean {
  return track === "NEET";
}

function isAnyJeeTrack(track: OmrTrack): boolean {
  return isJeeMainsTrack(track) || isJeeAdvanceTrack(track);
}

const SRI_SAI_LOGO_SRC = "/images/Sri-Sai-logo.png";

/** Pink accent matching the official Sri Sai OMR sheet. */
const OMR_PINK: [number, number, number] = [201, 32, 99];
const OMR_PINK_SOFT: [number, number, number] = [252, 228, 236];

function omrResponseColumns(track: OmrTrack): number {
  return track === "NEET" ? 4 : 3;
}

function trackBannerLabel(track: OmrTrack): string {
  if (track === "NEET") return "NEET";
  if (track === "JEE_ADVANCE") return "JEE ADVANCED";
  return "JEE";
}

function drawTimingMarks(doc: jsPDF, pageW: number, pageH: number, markW: number) {
  const markH = 10;
  const gap = 4;
  const step = markH + gap;
  doc.setFillColor(0, 0, 0);
  for (let y = 8, i = 0; y + markH < pageH - 8; y += step, i++) {
    if (i % 2 === 0) {
      doc.rect(0, y, markW, markH, "F");
      doc.rect(pageW - markW, y, markW, markH, "F");
    }
  }
}

function drawPinkBubble(doc: jsPDF, cx: number, cy: number, radius: number) {
  doc.setDrawColor(...OMR_PINK);
  doc.setLineWidth(0.9);
  doc.circle(cx, cy, radius, "S");
  doc.setDrawColor(0, 0, 0);
}

/**
 * Column-major response grid (matches Sri Sai sheet): each column has consecutive
 * question numbers going down. Row count = ceil(questionCount / columns).
 */
function drawTrackResponseGrid(
  doc: jsPDF,
  questionCount: number,
  cols: number,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number
): void {
  const rows = Math.max(1, Math.ceil(questionCount / cols));
  const colGap = 6;
  const colW = (areaW - colGap * (cols - 1)) / cols;
  const headerH = 14;
  // A/B/C/D letters are drawn once per column in this strip (not per row),
  // so bubbles never collide with the labels of the previous question.
  const optionLabelH = 10;
  const usableH = areaH - headerH - optionLabelH;
  const rowH = Math.min(14, Math.max(7.5, usableH / rows));
  // Keep vertical padding inside every row so adjacent bubbles never touch.
  const bubbleR = Math.min(4.2, (rowH - 3) / 2);
  const labelFs = Math.max(5.5, Math.min(7, rowH * 0.55));
  const qFs = Math.max(5.5, Math.min(8, rowH * 0.6));

  for (let c = 0; c < cols; c++) {
    const x0 = areaX + c * (colW + colGap);
    // Column header
    doc.setFillColor(...OMR_PINK);
    doc.rect(x0, areaY, colW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Responses", x0 + colW / 2, areaY + 10, { align: "center" });
    doc.setTextColor(0, 0, 0);

    const qRight = x0 + 18;
    const firstCx = qRight + 10 + bubbleR;
    const pitch = Math.min(16, (colW - (firstCx - x0) - bubbleR - 4) / 3);

    // Option letters drawn once under the header, aligned with the bubble columns.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(labelFs);
    doc.setTextColor(...OMR_PINK);
    for (let o = 0; o < 4; o++) {
      const cx = firstCx + o * pitch;
      doc.text(["A", "B", "C", "D"][o], cx, areaY + headerH + optionLabelH - 2.5, {
        align: "center",
      });
    }
    doc.setTextColor(0, 0, 0);

    const startQ = c * rows + 1;
    for (let r = 0; r < rows; r++) {
      const qNum = startQ + r;
      if (qNum > questionCount) break;
      const rowTop = areaY + headerH + optionLabelH + r * rowH;
      const cy = rowTop + rowH / 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(qFs);
      doc.text(String(qNum), qRight, cy + 2, { align: "right" });

      for (let o = 0; o < 4; o++) {
        drawPinkBubble(doc, firstCx + o * pitch, cy, bubbleR);
      }
    }
  }
}

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
  doc.setLineWidth(0.75);
  doc.circle(cx, cy, radius, "S");
}

const OMR_OPTION_LABELS = ["(A)", "(B)", "(C)", "(D)"] as const;

function drawCenteredLabel(doc: jsPDF, text: string, cx: number, y: number, fontSize: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const w = doc.getTextWidth(text);
  doc.text(text, cx - w / 2, y);
}

type OmrResponseMetrics = {
  bubbleRadius: number;
  bubblePitch: number;
  labelFontSize: number;
  qNumColWidth: number;
  firstBubbleCx: number;
  labelBaselineY: number;
  bubbleCy: number;
  rowHeight: number;
};

function getOmrResponseMetrics(blockW: number): OmrResponseMetrics {
  const tight = blockW < 140;
  const bubbleRadius = tight ? 4.5 : 5;
  const bubblePitch = tight ? 22 : 26;
  const labelFontSize = tight ? 6 : 6.5;
  const qNumColWidth = tight ? 26 : 30;
  const gapAfterQNum = tight ? 10 : 12;
  const firstBubbleCx = qNumColWidth + gapAfterQNum + bubbleRadius;
  const labelArea = 8;
  const rowHeight = labelArea + bubbleRadius * 2 + 10;
  const labelBaselineY = labelArea - 2;
  const bubbleCy = labelArea + bubbleRadius;
  return {
    bubbleRadius,
    bubblePitch,
    labelFontSize,
    qNumColWidth,
    firstBubbleCx,
    labelBaselineY,
    bubbleCy,
    rowHeight,
  };
}

/** Labels sit above empty bubbles — avoids unreliable in-circle text positioning in jsPDF. */
function drawOmrResponseRow(
  doc: jsPDF,
  x0: number,
  rowTop: number,
  qNum: number,
  metrics: OmrResponseMetrics
) {
  const labelY = rowTop + metrics.labelBaselineY;
  const bubbleCy = rowTop + metrics.bubbleCy;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(String(qNum), x0 + metrics.qNumColWidth, bubbleCy + 2, { align: "right" });

  for (let o = 0; o < 4; o++) {
    const cx = x0 + metrics.firstBubbleCx + o * metrics.bubblePitch;
    drawCenteredLabel(doc, OMR_OPTION_LABELS[o], cx, labelY, metrics.labelFontSize);
    drawBubble(doc, cx, bubbleCy, metrics.bubbleRadius);
  }
}

const OMR_CANVAS_SCALE = 2;

function drawOmrResponseRowCanvas(
  ctx: CanvasRenderingContext2D,
  x0Pt: number,
  rowTopPt: number,
  qNum: number,
  metrics: OmrResponseMetrics,
  scale: number
) {
  const x0 = x0Pt * scale;
  const rowTop = rowTopPt * scale;
  const labelY = rowTop + metrics.labelBaselineY * scale;
  const bubbleCy = rowTop + metrics.bubbleCy * scale;
  const r = metrics.bubbleRadius * scale;

  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 0.75 * scale;

  ctx.font = `${8 * scale}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(String(qNum), x0 + metrics.qNumColWidth * scale, bubbleCy);

  ctx.font = `${metrics.labelFontSize * scale}px Helvetica, Arial, sans-serif`;
  for (let o = 0; o < 4; o++) {
    const cx = x0 + (metrics.firstBubbleCx + o * metrics.bubblePitch) * scale;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(OMR_OPTION_LABELS[o], cx, labelY);
    ctx.beginPath();
    ctx.arc(cx, bubbleCy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function renderOmrResponsePageCanvas(
  visualRows: Array<Array<{ qNum: number; col: number }>>,
  blockW: number,
  metrics: OmrResponseMetrics,
  gridWidth: number
): HTMLCanvasElement {
  const scale = OMR_CANVAS_SCALE;
  const height = visualRows.length * metrics.rowHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(gridWidth * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create OMR canvas");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let rowIdx = 0; rowIdx < visualRows.length; rowIdx++) {
    const rowTop = rowIdx * metrics.rowHeight;
    for (const { qNum, col } of visualRows[rowIdx]) {
      drawOmrResponseRowCanvas(ctx, col * blockW, rowTop, qNum, metrics, scale);
    }
  }

  return canvas;
}

function drawOmrResponseGrid(
  doc: jsPDF,
  questionCount: number,
  cols: number,
  margin: number,
  pageW: number,
  pageH: number,
  startY: number
): void {
  const blockW = (pageW - 2 * margin) / cols;
  const gridWidth = pageW - 2 * margin;
  const metrics = getOmrResponseMetrics(blockW);
  const totalVisualRows = Math.ceil(questionCount / cols);
  const useCanvas = typeof document !== "undefined";

  let y = startY;
  let pageVisualRows: Array<Array<{ qNum: number; col: number }>> = [];
  let pageRowStartY = y;

  const flushCanvasPage = () => {
    if (!useCanvas || pageVisualRows.length === 0) return;
    const canvas = renderOmrResponsePageCanvas(pageVisualRows, blockW, metrics, gridWidth);
    const chunkHeight = pageVisualRows.length * metrics.rowHeight;
    doc.addImage(canvas, "PNG", margin, pageRowStartY, gridWidth, chunkHeight);
    pageVisualRows = [];
  };

  for (let visualRow = 0; visualRow < totalVisualRows; visualRow++) {
    if (y + metrics.rowHeight > pageH - margin) {
      flushCanvasPage();
      doc.addPage();
      y = margin;
      pageRowStartY = y;
    }

    const rowQuestions: Array<{ qNum: number; col: number }> = [];
    for (let c = 0; c < cols; c++) {
      const qNum = visualRow * cols + c + 1;
      if (qNum > questionCount) break;
      rowQuestions.push({ qNum, col: c });
    }

    if (useCanvas) {
      pageVisualRows.push(rowQuestions);
    } else {
      const rowTop = y;
      for (const { qNum, col } of rowQuestions) {
        drawOmrResponseRow(doc, margin + col * blockW, rowTop, qNum, metrics);
      }
    }

    y += metrics.rowHeight;
  }

  flushCanvasPage();
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

function drawSubjectEndRule(doc: jsPDF, margin: number, y: number, pageWidth: number): number {
  y += 4;
  drawRule(doc, margin, y, pageWidth - margin);
  return y + 12;
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

type ExamHeaderMeta = {
  examTitle: string;
  maxMarks: number;
  durationHours: number;
  rollDigits?: number;
};

/** Header layout aligned with `OmrTemplatePreview` — logo left, exam meta right, dynamic box height. */
async function drawPreviewStyleHeader(
  doc: jsPDF,
  meta: ExamHeaderMeta,
  margin: number,
  pageWidth: number
): Promise<number> {
  const padding = 12;
  const startY = margin;
  const contentY = startY + padding;
  const boxWidth = pageWidth - margin * 2;

  const logoHeight = await addInstituteLogo(doc, margin + padding, contentY, 230, 78);

  const rightX = pageWidth - margin - padding;
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  let metaY = contentY + 14;
  doc.text(meta.examTitle, rightX, metaY, { align: "right" });
  metaY += 16;
  doc.text(`Time: ${meta.durationHours.toFixed(2)} Hrs`, rightX, metaY, { align: "right" });
  metaY += 16;
  doc.text(`Max. Marks: ${meta.maxMarks}`, rightX, metaY, { align: "right" });
  if (meta.rollDigits != null) {
    metaY += 16;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text(`Roll grid: ${meta.rollDigits} columns`, rightX, metaY, { align: "right" });
  }

  const boxHeight = Math.max(logoHeight + padding * 2, metaY - startY + padding);
  doc.setLineWidth(1.2);
  doc.rect(margin, startY, boxWidth, boxHeight);

  return startY + boxHeight + 16;
}

function drawCenteredSectionLabel(
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  width: number
): number {
  doc.setFont("times", "bold");
  doc.setFontSize(9);
  doc.text(label.toUpperCase(), x + width / 2, y, { align: "center" });
  return y + 14;
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
  return advanceSubjectInstructionLines(subject);
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
  const contentWidth = pageWidth - margin * 2;

  let y = await drawPreviewStyleHeader(
    doc,
    { examTitle: "JEE ADVANCE MODEL", maxMarks, durationHours: hours },
    margin,
    pageWidth
  );

  y = drawCenteredSectionLabel(doc, "Overall instructions", margin, y, contentWidth);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  y = writeWrappedText(doc, "IMPORTANT INSTRUCTIONS", margin, y, contentWidth, 11, "bold", 13);
  y += 6;

  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  const intro = `Each subject has exactly ${JEE_ADVANCE_QUESTIONS_PER_SUBJECT} questions in three sections. Marks per question are fixed; total exam marks depend on section question counts.`;
  y = writeWrappedText(doc, intro, margin, y, contentWidth, 9.5, "normal", 11);
  y += 8;

  for (const subject of subjects) {
    for (const line of advanceInstructionLines(subject)) {
      y = writeWrappedText(doc, line, margin, y, contentWidth, 9, "normal", 10);
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
  const contentWidth = pageWidth - margin * 2;
  const pageBottom = () => doc.internal.pageSize.getHeight() - margin - 40;

  let y = await drawPreviewStyleHeader(
    doc,
    {
      examTitle: "JEE MAIN MODEL",
      maxMarks: JEE_MAINS_MAX_MARKS,
      durationHours: JEE_MAINS_EXAM_DURATION_HOURS,
    },
    margin,
    pageWidth
  );

  y = drawCenteredSectionLabel(doc, "Overall instructions", margin, y, contentWidth);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  y = writeWrappedText(doc, JEE_MAINS_INSTRUCTIONS_TITLE, margin, y, contentWidth, 11, "bold", 13);
  y += 8;

  doc.setFont("times", "normal");
  doc.setFontSize(9);

  const ensureSpace = (needed: number) => {
    if (y + needed > pageBottom()) {
      doc.addPage();
      y = margin;
    }
  };

  for (let i = 0; i < 4; i++) {
    ensureSpace(20);
    y = writeWrappedText(
      doc,
      `${i + 1}. ${JEE_MAINS_INSTRUCTION_LINES[i]}`,
      margin,
      y,
      contentWidth,
      9,
      "normal",
      11
    );
    y += 3;
  }

  ensureSpace(24);
  y = writeWrappedText(
    doc,
    `5. ${JEE_MAINS_INSTRUCTION_LINES[4]}`,
    margin,
    y,
    contentWidth,
    9,
    "normal",
    11
  );
  y += 4;

  for (const section of JEE_MAINS_SECTION_INSTRUCTIONS) {
    ensureSpace(20);
    y = writeWrappedText(doc, section.label, margin + 12, y, contentWidth - 12, 9, "bold", 11);
    y += 2;
    for (const line of section.lines) {
      ensureSpace(16);
      y = writeWrappedText(doc, line, margin + 20, y, contentWidth - 20, 9, "normal", 11);
      y += 2;
    }
    y += 2;
  }

  drawRule(doc, margin, y + 6, pageWidth - margin);
  return y + 18;
}

async function addOmrSheetHeader(
  doc: jsPDF,
  opts: OmrPdfOptions,
  margin: number,
  pageWidth: number
): Promise<number> {
  if (isJeeAdvanceTrack(opts.track)) {
    const subjects = opts.advance?.subjects ?? [];
    const maxMarks = subjects.length > 0 ? totalExamMarksFromSubjects(subjects) : 198;
    const hours = opts.advance?.examDurationHours ?? JEE_ADVANCE_EXAM_DURATION_HOURS;
    return drawPreviewStyleHeader(
      doc,
      { examTitle: "JEE ADVANCE MODEL", maxMarks, durationHours: hours, rollDigits: opts.rollDigits },
      margin,
      pageWidth
    );
  }
  if (isJeeMainsTrack(opts.track)) {
    return drawPreviewStyleHeader(
      doc,
      {
        examTitle: "JEE MAIN MODEL",
        maxMarks: JEE_MAINS_MAX_MARKS,
        durationHours: JEE_MAINS_EXAM_DURATION_HOURS,
        rollDigits: opts.rollDigits,
      },
      margin,
      pageWidth
    );
  }
  if (isNeetTrack(opts.track)) {
    return drawPreviewStyleHeader(
      doc,
      {
        examTitle: "NEET (UG) MODEL",
        maxMarks: NEET_MAX_MARKS,
        durationHours: NEET_EXAM_DURATION_HOURS,
        rollDigits: opts.rollDigits,
      },
      margin,
      pageWidth
    );
  }
  return margin;
}

async function addNeetTemplateTopBlock(
  doc: jsPDF,
  opts: OmrPdfOptions,
  margin: number,
  pageWidth: number
): Promise<number> {
  const contentWidth = pageWidth - margin * 2;

  let y = await drawPreviewStyleHeader(
    doc,
    {
      examTitle: "NEET (UG) MODEL",
      maxMarks: NEET_MAX_MARKS,
      durationHours: NEET_EXAM_DURATION_HOURS,
    },
    margin,
    pageWidth
  );

  y = drawCenteredSectionLabel(doc, "Overall instructions", margin, y, contentWidth);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  y = writeWrappedText(doc, NEET_INSTRUCTIONS_TITLE, margin, y, contentWidth, 11, "bold", 13);
  y += 8;

  doc.setFont("times", "normal");
  doc.setFontSize(9);
  for (let i = 0; i < NEET_INSTRUCTION_LINES.length; i++) {
    y = writeWrappedText(
      doc,
      `${i + 1}. ${NEET_INSTRUCTION_LINES[i]}`,
      margin,
      y,
      contentWidth,
      9,
      "normal",
      11
    );
    y += 3;
    if (y > doc.internal.pageSize.getHeight() - margin - 40 && i < NEET_INSTRUCTION_LINES.length - 1) {
      doc.addPage();
      y = margin;
    }
  }

  drawRule(doc, margin, y + 6, pageWidth - margin);
  return y + 18;
}

function drawRollNumberGrid(
  doc: jsPDF,
  rollDigits: number,
  x: number,
  y: number,
  scale: number
): number {
  const colW = 18 * scale;
  const rowH = 14 * scale;
  const bubbleR = 4 * scale;
  const labelFs = Math.max(6, 7.5 * scale);

  doc.setFillColor(...OMR_PINK);
  doc.rect(x, y, rollDigits * colW + 22 * scale, 12 * scale, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8 * scale);
  doc.text("ROLL NUMBER", x + 6 * scale, y + 9 * scale);
  doc.setTextColor(0, 0, 0);
  y += 16 * scale;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(labelFs);
  for (let col = 0; col < rollDigits; col++) {
    const cx = x + 18 * scale + col * colW + colW / 2;
    doc.text(String(col + 1), cx, y, { align: "center" });
  }
  y += 8 * scale;

  for (let digit = 0; digit <= 9; digit++) {
    const cy = y + bubbleR;
    doc.setFontSize(labelFs);
    doc.text(String(digit), x + 12 * scale, cy + 2 * scale, { align: "right" });
    for (let col = 0; col < rollDigits; col++) {
      const cx = x + 18 * scale + col * colW + colW / 2;
      drawPinkBubble(doc, cx, cy, bubbleR);
    }
    y += rowH;
  }
  return y;
}

/**
 * Programmatic Sri Sai–styled OMR sheet. Column count follows the track
 * (NEET: 4, JEE tracks: 3); row count = ceil(questionCount / columns).
 * Used by Download OMR PDF, Download full bundle, and Print.
 */
async function addOmrPages(doc: jsPDF, opts: OmrPdfOptions, options?: { prependNewPage?: boolean }): Promise<void> {
  const layout = OMR_LAYOUT[opts.track];
  const questionCount = Math.max(1, opts.questionCount || layout.questions);
  const rollDigits = Math.min(Math.max(opts.rollDigits, 5), 12);
  const cols = omrResponseColumns(opts.track);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const scale = layoutScaleForWidth(pageW);
  const markW = 10 * scale;
  const margin = 28 * scale + markW;
  const copies = Math.min(Math.max(opts.copies ?? 1, 1), 100);
  let needNewPage = options?.prependNewPage ?? false;

  for (let copy = 0; copy < copies; copy++) {
    if (needNewPage) doc.addPage(jsPdfFormat(opts.pageSize ?? "a4"));
    needNewPage = true;

    drawTimingMarks(doc, pageW, pageH, markW);

    // Soft pink page wash (light)
    doc.setFillColor(...OMR_PINK_SOFT);
    doc.rect(markW, 0, pageW - markW * 2, pageH, "F");
    doc.setFillColor(255, 255, 255);
    doc.rect(margin - 4 * scale, 10 * scale, pageW - 2 * (margin - 4 * scale), pageH - 20 * scale, "F");

    let y = 16 * scale;
    const contentW = pageW - 2 * margin;

    // Header: logo + institute + track banner
    const logoH = await addInstituteLogo(doc, margin, y, 150 * scale, 48 * scale);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11 * scale);
    doc.setTextColor(...OMR_PINK);
    doc.text("SRI SAI EDUCATIONAL INSTITUTIONS", margin + 158 * scale, y + 16 * scale);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8 * scale);
    doc.setTextColor(60, 60, 60);
    doc.text("OMR RESPONSE SHEET", margin + 158 * scale, y + 28 * scale);

    const bannerW = 110 * scale;
    const bannerH = 28 * scale;
    doc.setFillColor(...OMR_PINK);
    doc.roundedRect(pageW - margin - bannerW, y + 4 * scale, bannerW, bannerH, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12 * scale);
    doc.text(trackBannerLabel(opts.track), pageW - margin - bannerW / 2, y + 4 * scale + bannerH / 2 + 4 * scale, {
      align: "center",
    });
    doc.setTextColor(0, 0, 0);

    y += Math.max(logoH, bannerH) + 12 * scale;

    // Exam meta strip
    doc.setFillColor(...OMR_PINK);
    doc.rect(margin, y, contentW, 16 * scale, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8 * scale);
    const copyLabel = copies > 1 ? `  ·  Copy ${copy + 1}/${copies}` : "";
    doc.text(
      `${opts.paperTitle || "Exam"}  ·  ${questionCount} Q  ·  ${cols} columns × ${Math.ceil(questionCount / cols)} rows${copyLabel}`,
      margin + 6 * scale,
      y + 11 * scale
    );
    doc.setTextColor(0, 0, 0);
    y += 22 * scale;

    // Short instructions
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7 * scale);
    doc.setTextColor(40, 40, 40);
    doc.text(
      "Use HB pencil / blue-black pen. Darken one bubble fully per question. Do not fold or staple this sheet.",
      margin,
      y
    );
    y += 12 * scale;

    // Roll + name fields side by side
    const rollBottom = drawRollNumberGrid(doc, rollDigits, margin, y, scale);
    const fieldsX = margin + rollDigits * 18 * scale + 40 * scale;
    const fieldsW = Math.max(120 * scale, pageW - margin - fieldsX);
    let fy = y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8 * scale);
    doc.setTextColor(...OMR_PINK);
    doc.text("CANDIDATE DETAILS", fieldsX, fy + 10 * scale);
    doc.setTextColor(0, 0, 0);
    fy += 18 * scale;
    const fieldLines = ["Name: ________________________________", "Exam / Paper: ________________________", "Date: ____________  Batch: ___________"];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8 * scale);
    for (const line of fieldLines) {
      doc.text(line, fieldsX, fy);
      fy += 16 * scale;
    }
    doc.setFontSize(7 * scale);
    doc.setTextColor(80, 80, 80);
    doc.text(layout.sections, fieldsX, fy, { maxWidth: fieldsW });
    doc.setTextColor(0, 0, 0);

    y = Math.max(rollBottom, fy) + 10 * scale;

    // Response grid fills remaining space above footer
    const footerH = 36 * scale;
    const gridH = Math.max(80 * scale, pageH - y - footerH - margin);
    drawTrackResponseGrid(doc, questionCount, cols, margin, y, contentW, gridH);

    // Footer signatures
    const footY = pageH - margin - 8 * scale;
    doc.setDrawColor(...OMR_PINK);
    doc.setLineWidth(0.6);
    doc.line(margin, footY - 18 * scale, margin + 140 * scale, footY - 18 * scale);
    doc.line(pageW - margin - 140 * scale, footY - 18 * scale, pageW - margin, footY - 18 * scale);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7 * scale);
    doc.setTextColor(...OMR_PINK);
    doc.text("Candidate signature", margin, footY - 6 * scale);
    doc.text("Invigilator signature", pageW - margin, footY - 6 * scale, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }
}

export async function buildOmrSheetPdfBlob(opts: OmrPdfOptions): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: jsPdfFormat(opts.pageSize ?? "a4") });
  await addOmrPages(doc, opts);
  return doc.output("blob");
}

export async function downloadOmrSheetPdf(opts: OmrPdfOptions): Promise<void> {
  const blob = await buildOmrSheetPdfBlob(opts);
  const name = slugify(opts.paperTitle || "omr");
  triggerBlobDownload(blob, `${name}-omr.pdf`);
}

async function addQuestionPaperPages(
  doc: jsPDF,
  opts: OmrPdfOptions,
  questionContent: string,
  keyContent?: string | null
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const scale = layoutScaleForWidth(pageW);
  const margin = 44 * scale;
  const maxW = pageW - 2 * margin;
  const lineStep = 13 * scale;
  let y = margin;

  const needSpace = (extra: number) => {
    if (y + extra > pageH - margin) {
      doc.addPage(jsPdfFormat(opts.pageSize ?? "a4"));
      y = margin;
    }
  };

  const writeBlock = (text: string, fontSize: number, style: "normal" | "bold") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize * scale);
    const lines = doc.splitTextToSize(text, maxW);
    const arr = Array.isArray(lines) ? lines : [String(lines)];
    for (const line of arr) {
      needSpace(lineStep);
      doc.text(line, margin, y);
      y += lineStep;
    }
  };

  const parsed = parseQuestionPaperContentWithOptions(questionContent, keyContent);
  if (parsed.flatQuestions.length === 0) {
    if (isJeeAdvanceTrack(opts.track)) {
      y = await addJeeAdvanceTemplateTopBlock(doc, opts, margin, pageW);
    } else if (isJeeMainsTrack(opts.track)) {
      y = await addJeeTemplateTopBlock(doc, opts, margin, pageW);
    } else if (isNeetTrack(opts.track)) {
      y = await addNeetTemplateTopBlock(doc, opts, margin, pageW);
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
  } else if (isNeetTrack(opts.track)) {
    y = await addNeetTemplateTopBlock(doc, opts, margin, pageW);
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
      needSpace(16);
      y = drawSubjectEndRule(doc, margin, y, pageW);
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
        needSpace(16);
        y = drawSubjectEndRule(doc, margin, y, pageW);
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
    needSpace(16);
    y = drawSubjectEndRule(doc, margin, y, pageW);
  }
}

export async function buildOmrBundlePdfBlob(
  opts: OmrPdfOptions & { questionContent: string; keyContent?: string | null }
): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: jsPdfFormat(opts.pageSize ?? "a4") });
  await addQuestionPaperPages(doc, opts, opts.questionContent, opts.keyContent);
  await addOmrPages(doc, opts, { prependNewPage: true });
  return doc.output("blob");
}

export async function downloadOmrBundlePdf(
  opts: OmrPdfOptions & { questionContent: string; keyContent?: string | null }
): Promise<void> {
  const blob = await buildOmrBundlePdfBlob(opts);
  const name = slugify(opts.paperTitle || "exam-bundle");
  triggerBlobDownload(blob, `${name}-bundle.pdf`);
}

/** Open the PDF in a hidden frame and invoke the system print dialog (lists connected printers). */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Print OMR bundle");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    const cleanup = () => {
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        iframe.remove();
      }, 60_000);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    iframe.onload = () => {
      window.setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            fail("Could not open print preview.");
            return;
          }
          win.focus();
          win.print();
          if (!settled) {
            settled = true;
            resolve();
            cleanup();
          }
        } catch {
          fail("Printing was blocked. Allow pop-ups/printing for this site, or download the PDF and print it.");
        }
      }, 400);
    };

    iframe.onerror = () => fail("Could not load PDF for printing.");
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export { OMR_LAYOUT };
