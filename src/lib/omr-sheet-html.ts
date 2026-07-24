import type { OmrTrack } from "@/lib/omr-template";
import { INSTITUTE_LOGO_SRC } from "@/lib/institute-brand";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export type OmrSheetHtmlOptions = {
  track: OmrTrack;
  questionCount: number;
  paperTitle?: string;
  /** Ignored for layout — roll grid stays 5 columns as in the sheet template. */
  rollDigits?: number;
  copies?: number;
};

/** Response columns: NEET = 4, JEE tracks = 3. */
export function omrSheetResponseColumns(track: OmrTrack): number {
  return track === "NEET" ? 4 : 3;
}

export function omrSheetExamTitle(track: OmrTrack): string {
  if (track === "NEET") return "NEET";
  if (track === "JEE_ADVANCE") return "JEE ADVANCED";
  return "JEE / NEET";
}

/** Fixed roll-number columns from the official HTML sheet template. */
export const OMR_SHEET_ROLL_COLUMNS = 5;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pink stroke/fill for SVG bubbles (hex — works in html2canvas). */
const OMR_PINK = "#e6007e";
const OMR_PINK_DARK = "#c2006a";

type OmBubbleKind = "opt" | "roll-cell" | "code-circle" | "mini-circle";

/**
 * SVG oval with geometrically centered label — reliable in browser + PDF (html2canvas).
 * Keeps the same outer size as the original CSS circles so layout is unchanged.
 */
function omrBubbleSvg(
  kind: OmBubbleKind,
  label: string,
  variant: "normal" | "filled" | "cross" = "normal"
): string {
  const size =
    kind === "opt" ? 14 : kind === "roll-cell" ? 18 : kind === "code-circle" ? 17 : 12;
  const fontSize =
    kind === "roll-cell" ? 9 : label.length > 1 ? 7 : kind === "mini-circle" ? 7.5 : 8;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 0.55;
  const stroke = kind === "opt" || kind === "mini-circle" ? OMR_PINK_DARK : OMR_PINK;
  const filled = variant === "filled";
  const bold = variant === "cross" ? ` font-weight="700"` : "";
  const circleFill = filled ? OMR_PINK_DARK : "none";
  const textFill = filled ? "#ffffff" : OMR_PINK_DARK;
  // Baseline at circle center + dy lifts Arial glyphs into visual center.
  // Prefer dy over dominant-baseline — html2canvas handles it more reliably.
  const dy = label.length > 1 ? "0.28em" : "0.35em";

  return (
    `<svg class="${kind}${variant !== "normal" ? ` ${variant}` : ""}" ` +
    `width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${circleFill}" stroke="${stroke}" stroke-width="1"/>` +
    `<text x="${cx}" y="${cy}" dy="${dy}" text-anchor="middle" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"` +
    `${bold} fill="${textFill}">${escapeHtml(label)}</text>` +
    `</svg>`
  );
}

function buildRollGridHtml(): string {
  const cols = OMR_SHEET_ROLL_COLUMNS;
  let html = "";
  for (let c = 0; c < cols; c++) {
    html += `<div class="roll-blank"></div>`;
  }
  for (let d = 0; d <= 9; d++) {
    for (let c = 0; c < cols; c++) {
      html += omrBubbleSvg("roll-cell", String(d));
    }
  }
  return html;
}

function buildResponsesHtml(questionCount: number, columns: number): string {
  const total = Math.max(1, questionCount);
  const cols = Math.max(1, columns);
  const perCol = Math.ceil(total / cols);
  const options = ["A", "B", "C", "D"];
  let html = "";

  for (let col = 0; col < cols; col++) {
    const start = col * perCol + 1;
    const end = Math.min(start + perCol - 1, total);
    if (start > total) break;

    html += `<div class="response-col">`;
    html += `<div class="col-header">Responses</div>`;
    for (let q = start; q <= end; q++) {
      html += `<div class="q-row"><div class="q-num">${q}</div>`;
      for (const opt of options) {
        html += omrBubbleSvg("opt", opt);
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  return html;
}

/**
 * Exact styles from the Sri Sai OMR HTML template.
 * Only response column count varies by track.
 */
function sheetStyles(responseColumns: number): string {
  return `
  :root {
    --pink: #e6007e;
    --pink-light: #fbe4f0;
    --pink-dark: #c2006a;
    --gray: #666;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    padding: 10px;
    background: #f2f2f2;
    color: #222;
  }

  /* Sheet Container */
  .sheet {
    max-width: 950px;
    margin: 0 auto;
    background: #fff;
    border: 3px solid var(--pink);
    padding: 10px 12px;
    position: relative;
  }
  .sheet + .sheet { margin-top: 16px; }

  /* ---------- HEADER ---------- */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid var(--pink);
    padding-bottom: 4px;
    margin-bottom: 6px;
  }
  .brand { display: flex; align-items: center; gap: 8px; }
  .logo-img {
    width: 50px; height: 50px; object-fit: contain; flex-shrink: 0;
  }
  .brand-text .title {
    font-size: 26px; font-weight: 800; color: var(--pink); line-height: 1;
    font-style: italic;
  }
  .brand-text .subtitle {
    font-size: 11px; font-weight: 700; color: var(--pink-dark); letter-spacing: 0.5px;
  }
  .brand-text .tagline { font-size: 8.5px; color: var(--gray); }
  .exam-title { font-size: 24px; font-weight: 800; color: var(--pink); }

  /* ---------- INSTRUCTIONS ---------- */
  .instructions {
    border: 1.5px solid var(--pink);
    padding: 0;
    display: flex;
    margin-bottom: 8px;
    font-size: 10px;
    align-items: stretch;
    overflow: hidden;
  }
  .instructions .left {
    font-weight: bold;
    color: var(--pink-dark);
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 8px;
    border-right: 1.5px solid var(--pink);
    text-align: center;
    line-height: 1.15;
    writing-mode: horizontal-tb;
  }
  .instructions .instr-body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 8px;
  }
  .instructions ol {
    margin: 0;
    padding-left: 16px;
    flex: 1;
    min-width: 0;
    font-size: 9.5px;
    line-height: 1.3;
  }
  .instructions ol li { margin-bottom: 2px; }
  .method-table {
    border-collapse: collapse;
    font-size: 9px;
    flex: 0 0 auto;
    align-self: center;
  }
  .method-table td {
    padding: 2px 4px;
    white-space: nowrap;
    vertical-align: middle;
    line-height: 1.2;
  }
  .method-table td:first-child {
    text-align: right;
    color: var(--pink-dark);
    font-weight: bold;
    padding-right: 6px;
  }
  .mini-opt { display: inline-flex; gap: 2px; margin-left: 2px; align-items: center; }
  /* SVG bubbles — letters/digits are centered in the oval (see omrBubbleSvg). */
  svg.mini-circle,
  svg.roll-cell,
  svg.code-circle,
  svg.opt {
    display: block;
    flex-shrink: 0;
    overflow: visible;
  }
  svg.mini-circle { display: inline-block; vertical-align: middle; }
  svg.opt { display: inline-block; vertical-align: middle; margin-right: 2px; }
  svg.roll-cell { margin: 0 auto; }
  svg.code-circle { display: block; }

  /* ---------- TOP SECTION LAYOUT ---------- */
  .top-section {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .box {
    border: 1.5px solid var(--pink);
    padding: 4px;
    font-size: 10px;
  }
  .box-title {
    color: var(--pink-dark);
    font-weight: bold;
    font-size: 10px;
    margin-bottom: 3px;
    text-align: center;
  }

  /* Roll Number Column (FIXED & UNTOUCHED) */
  .col-roll-main {
    flex: 0 0 135px;
    width: 135px;
  }
  .roll-grid {
    display: grid;
    grid-template-columns: repeat(${OMR_SHEET_ROLL_COLUMNS}, 1fr);
    gap: 2px;
  }
  .roll-blank {
    width: 18px; height: 18px; border: 1px solid var(--pink);
    margin: 0 auto 3px;
  }

  /* Right Main Panel (Expands to fill remaining available space) */
  .col-right-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  /* Student's Name Box - Maximized Width */
  .name-box {
    display: flex;
    align-items: flex-end;
    font-size: 11px;
    font-weight: bold;
    color: var(--pink-dark);
    padding: 6px 10px;
    width: 100%;
    box-sizing: border-box;
  }
  .dotted-line-text {
    border-bottom: 1.5px dotted #555;
    flex: 1;
    margin-left: 8px;
    height: 14px;
  }

  /* Inner Grid Layout */
  .inner-grid {
    display: flex;
    gap: 5px;
    flex: 1;
  }

  .col-code { flex: 1; }
  .col-exam { flex: 1; }
  .col-dateclass { flex: 1.1; display: flex; flex-direction: column; gap: 4px; }
  .col-barcode { flex: 0.9; text-align: center; }

  /* Booklet Code */
  .code-row { display: flex; justify-content: space-around; align-items: center; margin: 2px 0; }
  .small-note { font-size: 7.5px; color: var(--pink-dark); margin-top: 3px; line-height: 1.1; text-align: justify; }

  /* Exam Name */
  .exam-lines .line {
    border-bottom: 1px dashed #aaa;
    height: 14px;
    margin-bottom: 3px;
  }
  .batch-time { font-size: 9px; margin-top: 4px; color: var(--pink-dark); font-weight: bold; }

  /* Date Boxes — DD / MM / YY columns evenly centered under the title */
  .date-exam-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .date-exam-box .box-title {
    width: 100%;
    text-align: center;
  }
  .date-fields {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
    margin-top: 2px;
  }
  .date-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    flex: 0 0 auto;
  }
  .date-field .label {
    font-size: 8px;
    color: var(--pink-dark);
    font-weight: bold;
    line-height: 1;
    margin-bottom: 3px;
    text-align: center;
    width: 100%;
  }
  .date-boxes {
    display: flex;
    gap: 2px;
    justify-content: center;
    align-items: center;
  }
  .date-boxes div {
    width: 13px;
    height: 15px;
    border: 1px solid var(--pink);
    box-sizing: border-box;
  }

  /* Class Selection — labels left, radios in a fixed right column */
  .class-study-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .class-study-box .box-title {
    width: 100%;
    text-align: center;
    flex-shrink: 0;
  }
  .class-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 3px;
    width: 100%;
    flex: 1;
    justify-content: space-evenly;
  }
  .class-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 3px 5px;
    font-size: 8.5px;
    color: var(--pink-dark);
    font-weight: bold;
    line-height: 1.2;
    min-height: 14px;
    box-sizing: border-box;
  }
  .class-item .class-label {
    flex: 1 1 auto;
    text-align: left;
    color: var(--pink-dark);
    font-weight: bold;
    white-space: normal;
    overflow: visible;
  }
  .class-item.highlight { background: var(--pink-light); }
  .class-item .radio {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--pink-dark);
    box-sizing: border-box;
    flex: 0 0 10px;
    display: block;
  }

  /* Barcode Box */
  .barcode-wrapper {
    display: flex; height: 80px; align-items: center; justify-content: center; margin-top: 4px;
  }
  .barcode {
    flex: 1; height: 100%;
    background: repeating-linear-gradient(90deg, #000 0 2px, transparent 2px 4px, #000 4px 5px, transparent 5px 8px);
  }
  .barcode-num { writing-mode: vertical-rl; font-size: 8px; margin-left: 2px; color: #222; font-weight: bold; }

  /* ---------- RESPONSES (column count from exam track) ---------- */
  .responses-wrap {
    display: grid;
    grid-template-columns: repeat(${responseColumns}, 1fr);
    gap: 6px;
  }
  .response-col {
    min-width: 0;
    width: 100%;
  }
  .col-header {
    background: var(--pink);
    color: #fff;
    font-size: 10px;
    font-weight: bold;
    margin-bottom: 2px;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1;
    padding: 3px 2px;
    min-height: 16px;
    letter-spacing: 0.02em;
  }
  .q-row {
    display: flex;
    align-items: center;
    font-size: 9px;
    padding: 1px 0;
    color: var(--pink-dark);
  }
  .q-num { width: 20px; font-weight: bold; text-align: right; margin-right: 4px; }

  /* ---------- FOOTER ---------- */
  .footer {
    display: flex;
    margin-top: 8px;
    border: 1.5px solid var(--pink);
  }
  .footer div {
    flex: 1;
    border-right: 1.5px solid var(--pink);
    padding: 8px;
    font-size: 10px;
    font-weight: bold;
    color: var(--pink-dark);
    height: 35px;
  }
  .footer div:last-child { border-right: none; }

  .paper-meta {
    font-size: 9px;
    color: var(--pink-dark);
    margin-bottom: 6px;
    font-weight: bold;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .sheet {
      border: 2px solid var(--pink);
      width: 100%;
      max-width: none;
      page-break-after: always;
    }
    .sheet:last-child { page-break-after: auto; }
    .no-print { display: none !important; }
  }

  .print-btn {
    display: block;
    margin: 0 auto 10px;
    padding: 8px 16px;
    background: var(--pink);
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
  }
`;
}

function buildOneSheetHtml(opts: {
  examTitle: string;
  paperTitle: string;
  questionCount: number;
  columns: number;
  logoSrc: string;
  copyLabel?: string;
}): string {
  const copyNote = opts.copyLabel
    ? `<div class="paper-meta">${escapeHtml(opts.paperTitle)} · ${opts.questionCount} Q · ${escapeHtml(opts.copyLabel)}</div>`
    : opts.paperTitle
      ? `<div class="paper-meta">${escapeHtml(opts.paperTitle)} · ${opts.questionCount} Q</div>`
      : "";

  return `
<div class="sheet">

  <!-- Header -->
  <div class="header">
    <div class="brand">
      <img class="logo-img" src="${escapeHtml(opts.logoSrc)}" alt="Sri Sai Educational Institutions" />
      <div class="brand-text">
        <div class="title">SriSai</div>
        <div class="subtitle">EDUCATIONAL INSTITUTIONS</div>
        <div class="tagline">High School | Junior College | Academy &nbsp;·&nbsp; Recognised by Govt. of AP &amp; Puducherry</div>
      </div>
    </div>
    <div class="exam-title">${escapeHtml(opts.examTitle)}</div>
  </div>

  ${copyNote}

  <!-- Instructions -->
  <div class="instructions">
    <div class="left">Instructions</div>
    <div class="instr-body">
    <ol>
      <li>Use Blue/Ball Fine Tip Ball Point Pen only.</li>
      <li>Do not make any stray marks on this sheet.</li>
      <li>Do not fold the response sheet.</li>
      <li>For making response, darken appropriate oval in the choice as shown.</li>
    </ol>
    <table class="method-table">
      <tr>
        <td>Correct Method</td>
        <td>
          <span class="mini-opt">
            ${omrBubbleSvg("mini-circle", "A")}
            ${omrBubbleSvg("mini-circle", "B", "filled")}
            ${omrBubbleSvg("mini-circle", "C")}
            ${omrBubbleSvg("mini-circle", "D")}
          </span>
        </td>
      </tr>
      <tr>
        <td>Wrong Method</td>
        <td>
          <span class="mini-opt">
            ${omrBubbleSvg("mini-circle", "A")}
            ${omrBubbleSvg("mini-circle", "B", "filled")}
            ${omrBubbleSvg("mini-circle", "C", "filled")}
            ${omrBubbleSvg("mini-circle", "D")}
          </span>
        </td>
      </tr>
      <tr>
        <td>Wrong Method</td>
        <td>
          <span class="mini-opt">
            ${omrBubbleSvg("mini-circle", "A")}
            ${omrBubbleSvg("mini-circle", "B", "cross")}
            ${omrBubbleSvg("mini-circle", "C")}
            ${omrBubbleSvg("mini-circle", "D")}
          </span>
        </td>
      </tr>
    </table>
    </div>
  </div>

  <!-- Top Alignment Section -->
  <div class="top-section">

    <!-- Roll Number Column -->
    <div class="box col-roll-main">
      <div class="box-title">Roll Number</div>
      <div class="roll-grid">${buildRollGridHtml()}</div>
    </div>

    <!-- Right Side Details Panel -->
    <div class="col-right-main">

      <!-- Student's Name Box (Wide Stretch) -->
      <div class="box name-box">
        <span>Student's Name:</span>
        <div class="dotted-line-text"></div>
      </div>

      <!-- Inner Grid Below Name Box -->
      <div class="inner-grid">

        <!-- Test Booklet Code -->
        <div class="box col-code">
          <div class="box-title">Test Booklet Code</div>
          <div class="code-row">
            ${omrBubbleSvg("code-circle", "11")}
            ${omrBubbleSvg("code-circle", "22")}
            ${omrBubbleSvg("code-circle", "33")}
            ${omrBubbleSvg("code-circle", "44")}
          </div>
          <div class="code-row">
            ${omrBubbleSvg("code-circle", "P")}
            ${omrBubbleSvg("code-circle", "Q")}
            ${omrBubbleSvg("code-circle", "R")}
            ${omrBubbleSvg("code-circle", "S")}
          </div>
          <div class="small-note">Before Handing Over The Answer Sheet To The Invigilator, Check That Test Booklet Code &amp; Roll No. Are Marked Correctly.</div>
        </div>

        <!-- Name of Exam -->
        <div class="box col-exam">
          <div class="box-title">NAME OF EXAM<br><span style="font-weight:normal;font-size:8px;">(Topic)</span></div>
          <div class="exam-lines">
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
          </div>
          <div class="batch-time">Batch Time <div class="line"></div></div>
        </div>

        <!-- Date & Class Stack -->
        <div class="col-dateclass">
          <div class="box date-exam-box">
            <div class="box-title">DATE OF EXAM</div>
            <div class="date-fields">
              <div class="date-field">
                <div class="label">DD</div>
                <div class="date-boxes"><div></div><div></div></div>
              </div>
              <div class="date-field">
                <div class="label">MM</div>
                <div class="date-boxes"><div></div><div></div></div>
              </div>
              <div class="date-field">
                <div class="label">YY</div>
                <div class="date-boxes"><div></div><div></div></div>
              </div>
            </div>
          </div>

          <div class="box class-study-box">
            <div class="box-title">CLASS IN WHICH STUDYING</div>
            <div class="class-list">
              <div class="class-item"><span class="class-label">XI Class</span><span class="radio"></span></div>
              <div class="class-item"><span class="class-label">XII Class</span><span class="radio"></span></div>
              <div class="class-item highlight"><span class="class-label">NEET/CET</span><span class="radio"></span></div>
              <div class="class-item"><span class="class-label">Repeater</span><span class="radio"></span></div>
            </div>
          </div>
        </div>

        <!-- Barcode Box -->
        <div class="box col-barcode">
          <div class="box-title">Answer Sheet Type Code</div>
          <div class="barcode-wrapper">
            <div class="barcode"></div>
            <div class="barcode-num">41123001</div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Responses Container -->
  <div class="responses-wrap">${buildResponsesHtml(opts.questionCount, opts.columns)}</div>

  <!-- Footer -->
  <div class="footer">
    <div>Student's Sign</div>
    <div>Invigilator's Name &amp; Sign</div>
  </div>

</div>`;
}

/**
 * Full printable OMR HTML document matching the Sri Sai sheet template.
 * Only the response grid size changes with exam track / question count.
 * Roll number and other top grids stay fixed as in the template.
 */
export function buildOmrSheetHtml(opts: OmrSheetHtmlOptions): string {
  const layoutQuestions = Math.max(1, opts.questionCount);
  const columns = omrSheetResponseColumns(opts.track);
  const examTitle = omrSheetExamTitle(opts.track);
  const paperTitle = (opts.paperTitle ?? "").trim();
  const copies = Math.min(Math.max(opts.copies ?? 1, 1), 100);
  const logoSrc =
    typeof window !== "undefined"
      ? `${window.location.origin}${INSTITUTE_LOGO_SRC}`
      : INSTITUTE_LOGO_SRC;

  const sheets: string[] = [];
  for (let copy = 0; copy < copies; copy++) {
    sheets.push(
      buildOneSheetHtml({
        examTitle,
        paperTitle,
        questionCount: layoutQuestions,
        columns,
        logoSrc,
        copyLabel: copies > 1 ? `Copy ${copy + 1}/${copies}` : undefined,
      })
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>OMR Answer Sheet - ${escapeHtml(examTitle)}</title>
<style>${sheetStyles(columns)}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>
${sheets.join("\n")}
</body>
</html>`;
}

/** Open a print-ready window for the OMR sheet (Save as PDF from the print dialog). */
export function printOmrSheetHtml(opts: OmrSheetHtmlOptions): void {
  const html = buildOmrSheetHtml(opts);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to print or save the OMR sheet.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      // User can still use the on-page Print button.
    }
  }, 400);
}

/**
 * Render the HTML OMR template onto an existing jsPDF (one page per copy).
 */
export async function appendOmrHtmlPagesToPdf(
  pdf: jsPDF,
  opts: OmrSheetHtmlOptions,
  options?: { prependNewPage?: boolean; pageSize?: "a4" | "b4" }
): Promise<void> {
  const html = buildOmrSheetHtml({ ...opts, copies: opts.copies ?? 1 });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "OMR sheet render");
  iframe.style.position = "fixed";
  iframe.style.left = "-12000px";
  iframe.style.top = "0";
  iframe.style.width = "980px";
  iframe.style.height = "1400px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error("Could not create an off-screen renderer for the OMR sheet.");
    }

    doc.open();
    doc.write(html);
    doc.close();

    await new Promise<void>((resolve) => {
      const imgs = Array.from(doc.images);
      if (imgs.length === 0) {
        resolve();
        return;
      }
      let left = imgs.length;
      const done = () => {
        left -= 1;
        if (left <= 0) resolve();
      };
      for (const img of imgs) {
        if (img.complete) done();
        else {
          img.onload = done;
          img.onerror = done;
        }
      }
      window.setTimeout(resolve, 2500);
    });

    await new Promise((r) => window.setTimeout(r, 150));

    const sheets = Array.from(doc.querySelectorAll<HTMLElement>(".sheet"));
    if (sheets.length === 0) {
      throw new Error("OMR sheet HTML did not render.");
    }

    const pageSize = options?.pageSize ?? "a4";
    const format: [number, number] = pageSize === "b4" ? [708.66, 1000.63] : [595.28, 841.89];
    let needNewPage = options?.prependNewPage ?? false;

    for (const sheet of sheets) {
      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 980,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      const x = (pageW - w) / 2;
      const y = margin;
      if (needNewPage) pdf.addPage(format);
      needNewPage = true;
      pdf.addImage(imgData, "JPEG", x, y, w, h);
    }
  } finally {
    iframe.remove();
  }
}

/**
 * Render the HTML OMR template to a PDF blob (one page per copy).
 * Used for Download OMR PDF and for OMR pages inside exam bundles.
 */
export async function buildOmrSheetPdfBlobFromHtml(
  opts: OmrSheetHtmlOptions,
  pageSize: "a4" | "b4" = "a4"
): Promise<Blob> {
  const format: [number, number] = pageSize === "b4" ? [708.66, 1000.63] : [595.28, 841.89];
  const pdf = new jsPDF({ unit: "pt", format });
  await appendOmrHtmlPagesToPdf(pdf, opts, { prependNewPage: false, pageSize });
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
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
