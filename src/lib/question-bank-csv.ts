/** Column order for template download and bulk CSV import (RFC 4180). */
export const QUESTION_BANK_CSV_HEADERS = [
  "subject",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "chapter",
  "difficulty",
  "year",
  "tags",
  "source_name",
  "source_url",
] as const;

export type QuestionBankCsvHeader = (typeof QUESTION_BANK_CSV_HEADERS)[number];

export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize one CSV row (no trailing newline). */
export function csvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

export function stringifyCsv(rows: string[][]): string {
  const body = rows.map((r) => csvRow(r)).join("\r\n");
  return body.endsWith("\n") ? body : `${body}\r\n`;
}

/**
 * Parse CSV text into rows; supports quoted fields and newlines inside quotes.
 */
export function parseCsv(text: string): string[][] {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  while (i < t.length) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushCell();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }

  pushCell();
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export type ParsedBulkCsvRow = {
  subject: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  chapter: string;
  difficulty: string;
  year: string;
  tags: string;
  source_name: string;
  source_url: string;
};

export function parseQuestionBankCsvToObjects(text: string): ParsedBulkCsvRow[] {
  const table = parseCsv(text.trim());
  if (table.length < 2) return [];

  const headerCells = table[0].map(normalizeHeader);
  const idx = (name: QuestionBankCsvHeader): number => headerCells.indexOf(name);

  const required: QuestionBankCsvHeader[] = ["subject", "question_text"];
  for (const r of required) {
    if (idx(r) < 0) {
      throw new Error(`CSV must include a "${r}" column (header row).`);
    }
  }

  const out: ParsedBulkCsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const get = (name: QuestionBankCsvHeader): string => {
      const i = idx(name);
      if (i < 0 || i >= line.length) return "";
      return line[i] ?? "";
    };

    if (!get("subject").trim() && !get("question_text").trim()) continue;

    out.push({
      subject: get("subject"),
      question_text: get("question_text"),
      option_a: get("option_a"),
      option_b: get("option_b"),
      option_c: get("option_c"),
      option_d: get("option_d"),
      correct_answer: get("correct_answer"),
      chapter: get("chapter"),
      difficulty: get("difficulty"),
      year: get("year"),
      tags: get("tags"),
      source_name: get("source_name"),
      source_url: get("source_url"),
    });
  }
  return out;
}

export function buildQuestionBankTemplateCsv(exampleSubject: string): string {
  const header = [...QUESTION_BANK_CSV_HEADERS];
  const example = [
    exampleSubject,
    "Sample: What is 2 + 2?",
    "3",
    "4",
    "5",
    "6",
    "B",
    "Arithmetic",
    "easy",
    "2026",
    "mcq|csv-template",
    "CSV template",
    "question-bank-template",
  ];
  return stringifyCsv([header, example]);
}

export type QuestionBankExportRow = {
  id: number;
  exam: string;
  subject: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  chapter: string | null;
  difficulty: string | null;
  year: number | null;
  tags: unknown;
  source_name: string;
  source_url: string;
  is_important: boolean;
  is_repeated: boolean;
  repetition_count: number;
};

const EXPORT_HEADERS = [
  "id",
  "exam",
  "subject",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "chapter",
  "difficulty",
  "year",
  "tags",
  "source_name",
  "source_url",
  "is_important",
  "is_repeated",
  "repetition_count",
] as const;

export function tagsToCell(tags: unknown): string {
  if (tags == null) return "";
  if (Array.isArray(tags)) {
    return tags.map((x) => String(x).trim()).filter(Boolean).join("|");
  }
  if (typeof tags === "string") return tags;
  try {
    return JSON.stringify(tags);
  } catch {
    return "";
  }
}

export function buildFilteredQuestionBankExportCsv(items: QuestionBankExportRow[]): string {
  const rows: string[][] = [[...EXPORT_HEADERS]];
  for (const q of items) {
    const opts = q.options ?? [];
    rows.push([
      String(q.id),
      q.exam,
      q.subject,
      q.question_text,
      opts[0] ?? "",
      opts[1] ?? "",
      opts[2] ?? "",
      opts[3] ?? "",
      q.correct_answer ?? "",
      q.chapter ?? "",
      q.difficulty ?? "",
      q.year == null ? "" : String(q.year),
      tagsToCell(q.tags),
      q.source_name,
      q.source_url,
      q.is_important ? "true" : "false",
      q.is_repeated ? "true" : "false",
      String(q.repetition_count),
    ]);
  }
  return stringifyCsv(rows);
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
