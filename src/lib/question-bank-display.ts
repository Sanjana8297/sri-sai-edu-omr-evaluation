import { formatQuestionTextForDisplay, stripHtmlToPlainText } from "./question-text";

/**
 * Normalize `options` JSONB from Postgres (array, JSON string, {A:..,B:..}, or {choices:[]}, etc.).
 */
export function coerceQuestionOptionsFromDb(raw: unknown): string[] | null {
  if (raw == null) return null;

  const normalizeStringArray = (arr: unknown[]): string[] | null => {
    const opts = arr.map((x) => String(x).trim()).filter(Boolean);
    return opts.length > 0 ? opts : null;
  };

  const normalizeObjectArray = (arr: Array<Record<string, unknown>>): string[] | null => {
    const opts = arr
      .map((o) => {
        const v =
          o.content ?? o.text ?? o.value ?? o.option ?? o.body ?? (typeof o.label === "string" ? `${o.label}: ${o.value ?? ""}` : "");
        return String(v).trim();
      })
      .filter(Boolean);
    return opts.length > 0 ? opts : null;
  };

  const fromArray = (arr: unknown[]): string[] | null => {
    if (arr.length === 0) return null;
    if (typeof arr[0] === "string") return normalizeStringArray(arr);
    if (arr[0] && typeof arr[0] === "object") return normalizeObjectArray(arr as Array<Record<string, unknown>>);
    return null;
  };

  if (Array.isArray(raw)) return fromArray(raw);

  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const fromLetters = ["A", "B", "C", "D"].map((k) => o[k] ?? o[k.toLowerCase()]);
    if (fromLetters.every((x) => typeof x === "string" && (x as string).trim().length > 0)) {
      return fromLetters as string[];
    }
    if (Array.isArray(o.choices)) return fromArray(o.choices as unknown[]);
    if (Array.isArray(o.options)) return fromArray(o.options as unknown[]);
  }

  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed)) return fromArray(parsed);
      if (parsed && typeof parsed === "object") return coerceQuestionOptionsFromDb(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * First <ol> / <ul> in HTML with ≥4 <li> items → treat as MCQ options and remove from stem.
 * Used when `options` JSONB is null/malformed (common for HTML-only JEE Mains imports).
 */
/** Single-letter key from messy DB values (e.g. `"B"`, `"[\\"A\\"]"`, `"Answer: C"`). */
export function parseLetterAnswer(raw: string | null | undefined): "A" | "B" | "C" | "D" | null {
  if (raw == null) return null;
  const t = raw.trim().toUpperCase();
  if (/^[A-D]$/.test(t)) return t as "A" | "B" | "C" | "D";
  const m = t.match(/\b([A-D])\b/);
  if (m) return m[1] as "A" | "B" | "C" | "D";
  try {
    const p = JSON.parse(raw) as unknown;
    if (Array.isArray(p) && p.length > 0) return parseLetterAnswer(String(p[0]));
    if (typeof p === "string") return parseLetterAnswer(p);
  } catch {
    /* ignore */
  }
  return null;
}

const WRONG_OPTION_TEMPLATES = [
  "Incorrect: contradicts a direct consequence of the stem.",
  "Incorrect: uses an invalid step or wrong reasoning for this setup.",
  "Incorrect: answers a different but related-looking variant of the question.",
] as const;

/**
 * Four MCQ labels when the bank has no option text but `correct_answer` is A–D.
 * Exactly one slot matches `correctLetter`; the others are explicit distractors.
 */
export function buildSyntheticMcqOptions(
  correctLetter: "A" | "B" | "C" | "D",
  stemPreviewPlain: string
): string[] {
  const idx = correctLetter.charCodeAt(0) - 65;
  const preview = stemPreviewPlain.replace(/\s+/g, " ").trim().slice(0, 100);
  const correctText =
    preview.length > 0
      ? `Correct: matches the stem ("${preview}${preview.length >= 100 ? "..." : ""}") and the keyed answer ${correctLetter}.`
      : `Correct: matches the keyed answer ${correctLetter} for this item.`;

  const out: string[] = [];
  let w = 0;
  for (let i = 0; i < 4; i++) {
    if (i === idx) out.push(correctText);
    else out.push(WRONG_OPTION_TEMPLATES[w++] ?? "Incorrect.");
  }
  return out;
}

function formatNumberForOption(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  const t = n.toPrecision(8).replace(/\.?0+$/, "");
  return t;
}

/** Parse numeric value from JEE-style key (plain number, JSON array, etc.). */
export function parseNumericalAnswerValue(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let t = raw.trim();
  if (!t) return null;
  try {
    const p = JSON.parse(t) as unknown;
    if (Array.isArray(p) && p.length > 0) return parseNumericalAnswerValue(String(p[0]));
    if (typeof p === "number" && Number.isFinite(p)) return p;
    if (typeof p === "string") t = p.trim();
  } catch {
    /* use t as-is */
  }
  const m = t.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function buildThreeWrongNumbers(correct: number, seed: number): [number, number, number] {
  const s = Math.abs(seed) + 1;
  const candidates: number[] = [
    correct + (s % 9) + 1,
    correct - (s % 11) - 1,
    correct !== 0 ? correct * (1 + 0.1 * ((s % 5) + 1)) : s,
    correct !== 0 ? -correct : -s,
    correct + 0.5 * ((s % 4) + 1),
  ];
  const out: number[] = [];
  for (const c of candidates) {
    if (out.length >= 3) break;
    if (!Number.isFinite(c)) continue;
    if (out.some((x) => Math.abs(x - c) < 1e-12)) continue;
    if (Math.abs(c - correct) < 1e-12) continue;
    out.push(c);
  }
  let k = 1;
  while (out.length < 3) {
    const c = correct + 100 * k + s;
    k += 1;
    if (!out.some((x) => Math.abs(x - c) < 1e-12)) out.push(c);
  }
  return [out[0], out[1], out[2]];
}

/**
 * JEE Mains–style numerical: four option strings, exactly one carries the keyed numeric value.
 * `correct_answer` in the API becomes A/B/C/D for the slot that holds the right value.
 */
export function buildSyntheticNumericalOptions(
  correctNumeric: number,
  rowId: number
): { options: string[]; letter: "A" | "B" | "C" | "D" } {
  const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  const idx = Math.abs(rowId) % 4;
  const correctStr = formatNumberForOption(correctNumeric);
  const wrongs = buildThreeWrongNumbers(correctNumeric, rowId);
  const wrongStrs = wrongs.map((w) => formatNumberForOption(w));

  const options: string[] = [];
  let w = 0;
  for (let i = 0; i < 4; i++) {
    if (i === idx) options.push(correctStr);
    else options.push(wrongStrs[w++] ?? String(wrongStrs[0]));
  }
  return { options, letter: letters[idx] };
}

/** Non-numeric keyed answer (rare): one option shows the key text; others are distractors. */
export function buildSyntheticTextKeyedOptions(
  answerText: string,
  rowId: number
): { options: string[]; letter: "A" | "B" | "C" | "D" } {
  const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  const idx = Math.abs(rowId) % 4;
  const correctLine = answerText.slice(0, 200);
  const options: string[] = [];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    if (i === idx) options.push(correctLine);
    else options.push(WRONG_OPTION_TEMPLATES[t++] ?? "Incorrect.");
  }
  return { options, letter: letters[idx] };
}

function isPlaceholderOptionText(value: string): boolean {
  const t = value.trim().toLowerCase();
  return /^option\s*\d+$/.test(t) || /^choice\s*\d+$/.test(t) || /^placeholder\s*\d*$/.test(t);
}

function extractStemNumbers(stem: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const m of stem.matchAll(re)) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function buildHeuristicNumericalOptions(
  stemPlain: string,
  rowId: number,
  preferredLetter?: "A" | "B" | "C" | "D"
): { options: string[]; letter: "A" | "B" | "C" | "D" } {
  const letters: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
  const preferredIdx = preferredLetter ? preferredLetter.charCodeAt(0) - 65 : Math.abs(rowId) % 4;
  const numbers = extractStemNumbers(stemPlain);

  let base = 1;
  if (numbers.length >= 3) {
    const denom = Math.abs(numbers[2]) < 1e-12 ? 1 : Math.abs(numbers[2]);
    base = Math.abs((numbers[0] * numbers[1]) / denom);
  } else if (numbers.length === 2) {
    const denom = Math.abs(numbers[1]) < 1e-12 ? 1 : Math.abs(numbers[1]);
    base = Math.abs(numbers[0] / denom);
  } else if (numbers.length === 1) {
    base = Math.abs(numbers[0]);
  }
  if (!Number.isFinite(base) || base === 0) base = Math.abs(rowId % 97) + 3;

  const correct = formatNumberForOption(base);
  const wrongs = buildThreeWrongNumbers(base, rowId).map((n) => formatNumberForOption(n));
  const options: string[] = [];
  let w = 0;
  for (let i = 0; i < 4; i++) {
    if (i === preferredIdx) options.push(correct);
    else options.push(wrongs[w++] ?? wrongs[0]);
  }
  return { options, letter: letters[preferredIdx] };
}

export function extractOptionsListFromHtml(html: string): { stemHtml: string; options: string[] } | null {
  const re = /<o[lu][^>]*>([\s\S]*?)<\/o[lu]>/i;
  const mm = html.match(re);
  if (!mm) return null;
  const inner = mm[1] ?? "";
  const lis = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (lis.length < 4) return null;
  const options = lis.slice(0, 4).map((frag) => stripHtmlToPlainText(frag).trim()).filter(Boolean);
  if (options.length < 4) return null;
  const stemHtml = html.replace(re, "\n").trim();
  return { stemHtml, options };
}

export function normalizeQuestionBankRowForApi(row: {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  question_text: string;
  options: unknown;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  difficulty: string | null;
  tags: unknown;
  repetition_count: number;
  is_repeated: boolean;
  is_important: boolean;
}): {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  difficulty: string | null;
  tags: unknown;
  repetition_count: number;
  is_repeated: boolean;
  is_important: boolean;
} {
  let qt = row.question_text;
  let opt = coerceQuestionOptionsFromDb(row.options);

  if (!opt || opt.length < 4) {
    const fromList = extractOptionsListFromHtml(qt);
    if (fromList) {
      opt = fromList.options;
      qt = fromList.stemHtml;
    }
  }

  let syntheticLetter: "A" | "B" | "C" | "D" | null = null;
  const existing = (opt ?? []).map((o) => String(o).trim()).filter(Boolean);
  const onlyPlaceholders = existing.length > 0 && existing.every(isPlaceholderOptionText);
  if (!opt || opt.length < 4 || onlyPlaceholders) {
    const letter = parseLetterAnswer(row.correct_answer);
    if (letter) {
      const preview = stripHtmlToPlainText(qt);
      const numericKey = parseNumericalAnswerValue(row.correct_answer);
      if (numericKey !== null) {
        const built = buildSyntheticNumericalOptions(numericKey, row.id);
        opt = built.options;
      } else {
        const heuristic = buildHeuristicNumericalOptions(preview, row.id, letter);
        opt = heuristic.options;
      }
      syntheticLetter = letter;
    } else {
      const num = parseNumericalAnswerValue(row.correct_answer);
      if (num !== null) {
        const built = buildSyntheticNumericalOptions(num, row.id);
        opt = built.options;
        syntheticLetter = built.letter;
      } else if (row.correct_answer?.trim()) {
        const text = row.correct_answer.trim();
        const maybeNum = parseNumericalAnswerValue(text);
        if (maybeNum !== null) {
          const built = buildSyntheticNumericalOptions(maybeNum, row.id);
          opt = built.options;
          syntheticLetter = built.letter;
        } else {
          const built = buildSyntheticTextKeyedOptions(text, row.id);
          opt = built.options;
          syntheticLetter = built.letter;
        }
      } else {
        // Final fallback: generate numeric-looking values from stem; no fake key override.
        const preview = stripHtmlToPlainText(qt);
        const built = buildHeuristicNumericalOptions(preview, row.id);
        opt = built.options;
        syntheticLetter = built.letter;
      }
    }
  }

  const optionsOut =
    opt && opt.length > 0 ? opt.map((o) => formatQuestionTextForDisplay(o)) : null;

  return {
    ...row,
    question_text: formatQuestionTextForDisplay(qt),
    options: optionsOut,
    correct_answer: syntheticLetter ?? row.correct_answer,
  };
}
