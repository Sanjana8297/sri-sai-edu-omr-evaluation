import { callOpenAiChatCompletion } from "@/lib/openai-runtime";
import { readRollFromUploadedImage } from "@/lib/omr-roll-opencv";

export type DetectedAnswer = {
  question: number;
  answer: "A" | "B" | "C" | "D" | null;
  confidence: number;
  flagged: boolean;
};

export type OmrVisionResult = {
  /** Handwritten name from the CANDIDATE DETAILS "Name:" line. */
  studentName: string | null;
  rollNumber: string | null;
  answers: DetectedAnswer[];
  issues: string[];
  /** Per-column roll grid readings (position = top header, digit = left row label). */
  rollDigits?: RollDigitReading[];
};

export type RollDigitReading = {
  /** Column header on the sheet (1 = leftmost digit place). */
  position: number;
  /** Row label 0–9 that was bubbled in that column. */
  digit: number | null;
  confidence: number;
  flagged: boolean;
};

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
type OptionLetter = (typeof OPTION_LETTERS)[number];

/** Fixed seed so the same image + paper tends to return the same bubbles. */
const DETECTION_SEED = 42;

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeAnswer(raw: unknown): OptionLetter | null {
  if (raw == null) return null;
  const letter = String(raw).trim().toUpperCase();
  return OPTION_LETTERS.includes(letter as OptionLetter) ? (letter as OptionLetter) : null;
}

function normalizeRollDigit(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > 9) return null;
  return n;
}

/**
 * Build the roll number from the grid:
 * - Top column headers = digit positions (1st, 2nd, …)
 * - Left row labels = digit values (0–9)
 * Concatenate left→right; trailing blank columns are ignored; any blank in the middle fails.
 */
export function assembleRollNumberFromDigits(digits: RollDigitReading[]): {
  rollNumber: string | null;
  issues: string[];
} {
  const sorted = [...digits].sort((a, b) => a.position - b.position);
  let end = sorted.length;
  while (end > 0 && sorted[end - 1].digit == null) end -= 1;
  if (end === 0) {
    return { rollNumber: null, issues: ["No roll-number bubbles were detected in the ROLL NUMBER grid."] };
  }

  const active = sorted.slice(0, end);
  const missing = active.filter((d) => d.digit == null);
  if (missing.length > 0) {
    return {
      rollNumber: null,
      issues: [
        `Roll number incomplete: no bubble in column(s) ${missing.map((m) => m.position).join(", ")} ` +
          "(column headers are digit positions; row labels 0–9 are the values).",
      ],
    };
  }

  const issues: string[] = [];
  if (active.some((d) => d.flagged || d.confidence < 0.5)) {
    issues.push("Some roll-number digits were low-confidence or double-marked — verify the roll.");
  }

  return {
    rollNumber: active.map((d) => String(d.digit)).join(""),
    issues,
  };
}

function isValidAnswerItem(
  item: unknown,
  minQ: number,
  maxQ: number
): item is DetectedAnswer {
  if (!item || typeof item !== "object") return false;
  const row = item as Record<string, unknown>;
  const q = Number(row.question);
  if (!Number.isInteger(q) || q < minQ || q > maxQ) return false;
  const answer = row.answer;
  if (answer !== null && !OPTION_LETTERS.includes(String(answer).toUpperCase() as OptionLetter)) {
    return false;
  }
  return true;
}

function parseVisionJson(content: string): {
  answers: DetectedAnswer[];
  issues: string[];
} {
  const parsed = JSON.parse(content) as Partial<OmrVisionResult>;
  return {
    answers: Array.isArray(parsed.answers) ? (parsed.answers as DetectedAnswer[]) : [],
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.filter((i): i is string => typeof i === "string").slice(0, 20)
      : [],
  };
}

/**
 * Prefer a filled mark over null when either pass saw a darkened bubble.
 * On letter conflicts, keep the higher-confidence reading and flag for review.
 */
export function mergeDetectedAnswers(
  primary: DetectedAnswer[],
  secondary: DetectedAnswer[],
  questionCount: number
): DetectedAnswer[] {
  const a = new Map<number, DetectedAnswer>();
  const b = new Map<number, DetectedAnswer>();
  for (const item of primary) a.set(item.question, item);
  for (const item of secondary) b.set(item.question, item);

  const merged: DetectedAnswer[] = [];
  for (let q = 1; q <= questionCount; q++) {
    const left = a.get(q);
    const right = b.get(q);
    if (!left && !right) {
      merged.push({ question: q, answer: null, confidence: 0, flagged: true });
      continue;
    }
    if (!left) {
      merged.push({
        question: q,
        answer: normalizeAnswer(right!.answer),
        confidence: clampConfidence(right!.confidence),
        flagged: Boolean(right!.flagged) || !right!.answer,
      });
      continue;
    }
    if (!right) {
      merged.push({
        question: q,
        answer: normalizeAnswer(left.answer),
        confidence: clampConfidence(left.confidence),
        flagged: Boolean(left.flagged) || !left.answer,
      });
      continue;
    }

    const leftAns = normalizeAnswer(left.answer);
    const rightAns = normalizeAnswer(right.answer);
    const leftConf = clampConfidence(left.confidence);
    const rightConf = clampConfidence(right.confidence);

    if (leftAns === rightAns) {
      merged.push({
        question: q,
        answer: leftAns,
        confidence: Math.max(leftConf, rightConf),
        flagged: Boolean(left.flagged || right.flagged) && leftAns == null,
      });
      continue;
    }

    // One pass found a fill, the other returned blank — keep the fill.
    if (leftAns && !rightAns) {
      merged.push({
        question: q,
        answer: leftAns,
        confidence: leftConf,
        flagged: leftConf < 0.55,
      });
      continue;
    }
    if (rightAns && !leftAns) {
      merged.push({
        question: q,
        answer: rightAns,
        confidence: rightConf,
        flagged: rightConf < 0.55,
      });
      continue;
    }

    // Conflicting letters — prefer higher confidence, always flag.
    const preferLeft = leftConf >= rightConf;
    merged.push({
      question: q,
      answer: preferLeft ? leftAns : rightAns,
      confidence: preferLeft ? leftConf : rightConf,
      flagged: true,
    });
  }
  return merged;
}

function questionRangeLabel(startQ: number, endQ: number): string {
  return startQ === endQ ? `question ${startQ}` : `questions ${startQ}–${endQ}`;
}

async function callBubbleVision(input: {
  imageUrl: string;
  imageMime: string;
  startQ: number;
  endQ: number;
  columns: number;
  rows: number;
  sensitivity: number;
  mode: "column" | "fill" | "full";
  columnIndex?: number;
  focusQuestions?: number[];
}): Promise<{ answers: DetectedAnswer[]; issues: string[] }> {
  const { startQ, endQ, columns, rows, sensitivity, mode } = input;
  const focusQuestions =
    mode === "fill" && input.focusQuestions?.length
      ? [...new Set(input.focusQuestions)].filter((q) => q >= startQ && q <= endQ).sort((a, b) => a - b)
      : null;
  const expectedQuestions =
    focusQuestions ??
    Array.from({ length: endQ - startQ + 1 }, (_, i) => startQ + i);
  const expectedCount = expectedQuestions.length;
  const qMin = expectedQuestions[0];
  const qMax = expectedQuestions[expectedQuestions.length - 1];

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["answers", "issues"],
    properties: {
      answers: {
        type: "array",
        minItems: expectedCount,
        maxItems: expectedCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "answer", "confidence", "flagged"],
          properties: {
            question: { type: "integer", minimum: qMin, maximum: qMax },
            answer: { type: ["string", "null"], enum: ["A", "B", "C", "D", null] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            flagged: { type: "boolean" },
          },
        },
      },
      issues: { type: "array", items: { type: "string" } },
    },
  };

  const layoutHint =
    `Grid layout: ${columns} response columns × ${rows} rows, numbered column-major ` +
    `(column 1 = Q1–Q${rows}, column 2 continues after that, and so on). ` +
    "A/B/C/D option letters appear once at the top of each column above the bubbles.";

  let taskText: string;
  if (mode === "column" && input.columnIndex != null) {
    taskText =
      `Read ONLY column ${input.columnIndex + 1} of the OMR response grid (${questionRangeLabel(startQ, endQ)}). ` +
      `Return exactly ${expectedCount} answer objects for every question from ${startQ} through ${endQ} in ascending order. ` +
      layoutHint;
  } else if (mode === "fill" && focusQuestions) {
    taskText =
      `Re-inspect ONLY these question numbers: ${focusQuestions.join(", ")}. ` +
      "Previously they were marked blank or uncertain. Look again for any darkened / filled A–D bubble. " +
      `Return exactly ${expectedCount} records — one per listed question, in ascending order. Do not invent other question numbers. ` +
      layoutHint;
  } else {
    taskText =
      `Read the full OMR response grid for ${questionRangeLabel(startQ, endQ)}. ` +
      `Return exactly ${expectedCount} answer objects for every question from ${startQ} through ${endQ} in ascending order. ` +
      layoutHint;
  }

  const fillRules =
    "A bubble is FILLED when most of its interior is dark (pencil, pen, or ink). " +
    "Do NOT mark a filled bubble as null. Prefer the darkest single option among A–D. " +
    "Use null only when all four bubbles are empty OR two+ options are equally dark (then flagged=true). " +
    "Faint but clearly intended marks should still return a letter when sensitivity is mid/high. " +
    `Sensitivity setting: ${sensitivity}% (higher = accept lighter fills, still flag low-confidence). ` +
    "Never invent answers from an answer key — none is provided. Never skip the required question numbers.";

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED,
    max_tokens: Math.min(16_000, Math.max(2500, expectedCount * 45)),
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_bubble_detection", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You are a precise OMR bubble reader. Your job is to report which A–D bubble is filled for each question number. " +
          "Missed filled bubbles are worse than over-flagging. Be thorough and consistent.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `${taskText}\n\n${fillRules}` },
          { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
        ],
      },
    ],
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI bubble detection failed (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned no bubble-detection result.");
  }

  let vision: { answers: DetectedAnswer[]; issues: string[] };
  try {
    vision = parseVisionJson(content);
  } catch {
    throw new Error("AI returned an invalid detection result.");
  }

  const allowed = new Set(expectedQuestions);
  const cleaned: DetectedAnswer[] = [];
  const seen = new Set<number>();
  for (const item of vision.answers) {
    if (!isValidAnswerItem(item, qMin, qMax)) continue;
    if (!allowed.has(item.question) || seen.has(item.question)) continue;
    seen.add(item.question);
    cleaned.push({
      question: item.question,
      answer: normalizeAnswer(item.answer),
      confidence: clampConfidence(item.confidence),
      flagged: Boolean(item.flagged),
    });
  }

  // Ensure every expected question appears exactly once (deterministic slots).
  const byQ = new Map(cleaned.map((row) => [row.question, row]));
  const complete: DetectedAnswer[] = expectedQuestions.map(
    (q) => byQ.get(q) ?? { question: q, answer: null, confidence: 0, flagged: true }
  );

  return {
    answers: complete,
    issues: vision.issues,
  };
}

/**
 * Read a contiguous slice of the ROLL NUMBER grid.
 * Top headers = digit positions; left labels 0–9 = digit values.
 * Also remaps relative positions (1..count) if the model ignores absolute headers.
 */
async function detectRollNumberGridSlice(input: {
  imageUrl: string;
  startPos: number;
  endPos: number;
  totalDigits: number;
  sensitivity: number;
}): Promise<{ digits: RollDigitReading[]; issues: string[] }> {
  const { startPos, endPos, totalDigits, sensitivity } = input;
  const count = endPos - startPos + 1;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["digits", "issues"],
    properties: {
      digits: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["position", "digit", "confidence", "flagged"],
          properties: {
            // Allow 1..totalDigits so we can remap relative indices if needed.
            position: {
              type: "integer",
              minimum: 1,
              maximum: totalDigits,
              description: "Printed column label above the filled bubble.",
            },
            digit: {
              type: ["integer", "null"],
              minimum: 0,
              maximum: 9,
              description: "Printed row label beside the filled bubble.",
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            flagged: { type: "boolean" },
          },
        },
      },
      issues: { type: "array", items: { type: "string" } },
    },
  };

  const absolutePositions = Array.from({ length: count }, (_, i) => startPos + i);
  const positionList = absolutePositions.join(", ");
  const leftOrdinal =
    startPos === 1
      ? "the leftmost column of the ROLL NUMBER grid"
      : `the ${startPos}${ordinalSuffix(startPos)} column from the LEFT of the ROLL NUMBER grid`;

  const instructions =
    "Look ONLY at the ROLL NUMBER bubble grid (header text ROLL NUMBER). Ignore A–D exam responses.\n\n" +
    "Grid rules:\n" +
    `- ${totalDigits} columns. TOP printed numbers (1…${totalDigits}) are POSITIONS from LEFT to RIGHT.\n` +
    "- LEFT printed numbers (0…9) are DIGIT VALUES for each row.\n" +
    "- In each column, the filled row's left label is that position's digit.\n\n" +
    `YOUR TASK: Read column position(s) ${positionList} only.\n` +
    `Start at ${leftOrdinal} and move right through the requested columns.\n` +
    `Return exactly ${count} objects with position set to the absolute header number(s): ${positionList}.\n` +
    "For each column, pair the TOP column label (position) with the LEFT row label (digit) of its darkest fill.\n" +
    "Example: row label 7 filled below column label 3 means position=3, digit=7.\n" +
    "digit=null only if empty or double-marked (flagged=true).\n" +
    `Sensitivity: ${sensitivity}%.`;

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED + startPos * 17,
    max_tokens: 800,
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_roll_number_slice", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You read OMR roll-number columns. Absolute column headers are positions counted from the LEFT. " +
          "Row labels are digit values 0–9. Never use A–D response bubbles.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: instructions },
          { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
        ],
      },
    ],
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI roll-number detection failed (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned no roll-number detection result.");
  }

  let parsed: { digits?: unknown[]; issues?: unknown };
  try {
    parsed = JSON.parse(content) as { digits?: unknown[]; issues?: unknown };
  } catch {
    throw new Error("AI returned an invalid roll-number result.");
  }

  const rawItems = (Array.isArray(parsed.digits) ? parsed.digits : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const position = Number(row.position);
      if (!Number.isInteger(position)) return null;
      return {
        position,
        digit: normalizeRollDigit(row.digit),
        confidence: clampConfidence(row.confidence),
        flagged: Boolean(row.flagged),
      } satisfies RollDigitReading;
    })
    .filter((item): item is RollDigitReading => item != null);

  // Prefer absolute positions in range; if the model returned relative 1..count, remap.
  const absoluteHits = rawItems.filter((d) => d.position >= startPos && d.position <= endPos);
  const looksRelative =
    absoluteHits.length === 0 &&
    rawItems.length === count &&
    rawItems.every((d, i) => d.position === i + 1);

  const mapped: RollDigitReading[] = looksRelative
    ? rawItems.map((d, i) => ({ ...d, position: startPos + i }))
    : absoluteHits.length > 0
      ? absoluteHits
      : // Last resort: assign in returned order to absolute positions.
        rawItems.slice(0, count).map((d, i) => ({ ...d, position: startPos + i }));

  const byPos = new Map<number, RollDigitReading>();
  for (const d of mapped) {
    if (d.position < startPos || d.position > endPos) continue;
    if (!byPos.has(d.position)) byPos.set(d.position, d);
  }

  const digits: RollDigitReading[] = absolutePositions.map(
    (position) => byPos.get(position) ?? { position, digit: null, confidence: 0, flagged: true }
  );

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((i): i is string => typeof i === "string").slice(0, 10)
    : [];

  return { digits, issues };
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Read the full ROLL NUMBER grid in one vision call.
 * Prefer a cropped roll-region image so the model is not distracted by A–D answers.
 */
async function detectRollNumberGridFull(input: {
  imageUrl: string;
  rollDigits: number;
  sensitivity: number;
}): Promise<{ digits: RollDigitReading[]; issues: string[] }> {
  const rollDigits = Math.min(12, Math.max(5, input.rollDigits));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["digits", "issues"],
    properties: {
      digits: {
        type: "array",
        minItems: rollDigits,
        maxItems: rollDigits,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["position", "digit", "confidence", "flagged"],
          properties: {
            position: {
              type: "integer",
              minimum: 1,
              maximum: rollDigits,
              description: "The printed column label above this bubble column.",
            },
            digit: {
              type: ["integer", "null"],
              minimum: 0,
              maximum: 9,
              description: "The printed row label beside the filled bubble in this column.",
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            flagged: { type: "boolean" },
          },
        },
      },
      issues: { type: "array", items: { type: "string" } },
    },
  };

  const instructions =
    "This image is the ROLL NUMBER bubble grid only (or the top-left of an OMR sheet).\n" +
    `There are exactly ${rollDigits} columns left→right. Top headers 1…${rollDigits} are positions.\n` +
    "Left labels 0…9 are digit values (top=0 … bottom=9).\n" +
    "For EACH filled bubble, pair its LEFT row label with its TOP column label.\n" +
    "Row labels are fixed: top row = 0, then 1,2,3,4,5,6,7,8, bottom row = 9.\n" +
    "Example: a filled bubble on row label 7 under column label 3 means position=3, digit=7.\n" +
    "Never use the row number as the position and never use the column header as the digit.\n" +
    "Never shift row labels (do not read row 7 as 6 or 8).\n" +
    "digit=null only if empty or double-marked (set flagged=true).\n" +
    `Return exactly ${rollDigits} digit objects with positions 1…${rollDigits}.\n` +
    "Ignore A–D exam responses and handwritten boxes.\n" +
    `Sensitivity: ${input.sensitivity}%.`;

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED,
    max_tokens: 1200,
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_roll_number_full", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You read OMR roll-number grids. Column headers are positions; row labels are digits 0–9.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: instructions },
          { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
        ],
      },
    ],
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AI roll-number detection failed (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no roll-number detection result.");

  let parsed: { digits?: unknown[]; issues?: unknown };
  try {
    parsed = JSON.parse(content) as { digits?: unknown[]; issues?: unknown };
  } catch {
    throw new Error("AI returned an invalid roll-number result.");
  }

  const byPos = new Map<number, RollDigitReading>();
  for (const item of Array.isArray(parsed.digits) ? parsed.digits : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const position = Number(row.position);
    if (!Number.isInteger(position) || position < 1 || position > rollDigits) continue;
    if (byPos.has(position)) continue;
    byPos.set(position, {
      position,
      digit: normalizeRollDigit(row.digit),
      confidence: clampConfidence(row.confidence),
      flagged: Boolean(row.flagged),
    });
  }

  const digits: RollDigitReading[] = Array.from({ length: rollDigits }, (_, i) => {
    const position = i + 1;
    return byPos.get(position) ?? { position, digit: null, confidence: 0, flagged: true };
  });

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((i): i is string => typeof i === "string").slice(0, 10)
    : [];

  return { digits, issues };
}

/**
 * Read each roll column individually (fallback when a full-grid read is incomplete).
 */
async function detectRollNumberGrid(input: {
  imageUrl: string;
  rollDigits: number;
  sensitivity: number;
}): Promise<{ digits: RollDigitReading[]; issues: string[] }> {
  const rollDigits = Math.min(12, Math.max(5, input.rollDigits));
  const issues: string[] = [];
  const digits: RollDigitReading[] = [];

  for (let position = 1; position <= rollDigits; position++) {
    const slice = await detectRollNumberGridSlice({
      imageUrl: input.imageUrl,
      startPos: position,
      endPos: position,
      totalDigits: rollDigits,
      sensitivity: input.sensitivity,
    });
    issues.push(...slice.issues);
    let reading = slice.digits[0] ?? {
      position,
      digit: null,
      confidence: 0,
      flagged: true,
    };

    // One retry at higher sensitivity if blank/uncertain.
    if (reading.digit == null || reading.confidence < 0.45 || reading.flagged) {
      const retry = await detectRollNumberGridSlice({
        imageUrl: input.imageUrl,
        startPos: position,
        endPos: position,
        totalDigits: rollDigits,
        sensitivity: Math.min(100, input.sensitivity + 18),
      });
      issues.push(...retry.issues);
      const again = retry.digits[0];
      if (again) {
        if (reading.digit == null && again.digit != null) {
          reading = again;
        } else if (
          reading.digit != null &&
          again.digit != null &&
          reading.digit !== again.digit
        ) {
          reading = {
            position,
            digit: again.confidence >= reading.confidence ? again.digit : reading.digit,
            confidence: Math.max(again.confidence, reading.confidence),
            flagged: true,
          };
        } else if (again.confidence > reading.confidence) {
          reading = { ...again, flagged: reading.flagged || again.flagged };
        }
      }
    }

    digits.push({ ...reading, position });
  }

  return { digits, issues: [...new Set(issues)].slice(0, 12) };
}

export type DetectOmrBubblesInput = {
  imageBytes: Buffer;
  imageMime: string;
  questionCount: number;
  columns: number;
  sensitivity: number;
  /** Number of roll-grid columns from the OMR template (6–12). */
  rollDigits?: number;
};

/**
 * Read the handwritten name on the OMR "CANDIDATE DETAILS" Name line.
 * This runs before roll/bubble work so sheets can be matched to student profiles by name.
 */
async function detectStudentNameFromSheet(imageUrl: string): Promise<{
  name: string | null;
  issues: string[];
}> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["studentName", "confidence", "issues"],
    properties: {
      studentName: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      issues: { type: "array", items: { type: "string" } },
    },
  };

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED,
    max_tokens: 400,
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_student_name", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You read handwritten student names from OMR answer sheets. " +
          "Return only the name written on the Name line — never invent one.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Find the CANDIDATE DETAILS block near the top of this OMR sheet " +
              '(next to the ROLL NUMBER grid). Read the handwritten text on the "Name:" line. ' +
              "Return studentName as the full name exactly as written (fix obvious letter confusions only if clear). " +
              "If the Name line is blank, illegible, or missing, return studentName null and explain in issues. " +
              "Do not return roll numbers, exam titles, dates, batch codes, or printed labels as the name.",
          },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ],
      },
    ],
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Name detection failed (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI returned no name-detection result.");
  }

  let parsed: { studentName?: unknown; confidence?: unknown; issues?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new Error("AI returned an invalid name-detection result.");
  }

  const rawName =
    typeof parsed.studentName === "string" ? parsed.studentName.trim().replace(/\s+/g, " ") : "";
  const confidence = clampConfidence(parsed.confidence);
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((item): item is string => typeof item === "string")
    : [];

  if (!rawName || confidence < 0.35) {
    return {
      name: null,
      issues: issues.length > 0 ? issues : ["Could not read a clear student name from the Name line."],
    };
  }

  // Reject values that look like rolls / placeholders rather than names.
  if (/^\d+$/.test(rawName) || /^(name|n\/a|na|none|-|—|_+)$/i.test(rawName)) {
    return {
      name: null,
      issues: ["Name line did not contain a usable handwritten student name."],
    };
  }

  return { name: rawName, issues };
}

/**
 * High-accuracy OMR detection:
 * 1) Read the handwritten student name from CANDIDATE DETAILS (for profile matching).
 * 2) Read the ROLL NUMBER grid from the uploaded image (OpenCV first, AI fallback).
 * 3) Read each response column separately (smaller ranges → fewer misses).
 * 4) Re-read any blank / low-confidence questions in a focused fill-in pass.
 * 5) Merge with a second full-column pass when question count is moderate, for stability.
 */
export async function detectOmrBubbles(input: DetectOmrBubblesInput): Promise<OmrVisionResult> {
  const { questionCount, columns, sensitivity } = input;
  const rollDigitCount = Math.min(12, Math.max(5, input.rollDigits ?? 10));
  const rows = Math.max(1, Math.ceil(questionCount / columns));
  const imageUrl = `data:${input.imageMime};base64,${input.imageBytes.toString("base64")}`;

  const issues: string[] = [];

  // Name first — used to match the sheet to an existing student profile.
  let studentName: string | null = null;
  try {
    const namePass = await detectStudentNameFromSheet(imageUrl);
    studentName = namePass.name;
    issues.push(...namePass.issues);
    if (studentName) {
      issues.push(`Detected student name: ${studentName}.`);
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `Name detection issue: ${error.message}`
        : "Name detection failed."
    );
  }

  // Prefer OpenCV on the uploaded sheet bytes (temp file only — no fixed path).
  // Keep confident OpenCV digits; only AI-fill blank / low-confidence positions.
  let rollDigits: RollDigitReading[] = [];
  let rollNumber: string | null = null;
  let rollFromOpencv = false;
  let rollCropUrl: string | null = null;

  try {
    const opencv = await readRollFromUploadedImage({
      imageBytes: input.imageBytes,
      imageMime: input.imageMime,
      columns: rollDigitCount,
    });
    if (opencv) {
      rollDigits = opencv.digits;
      const assembled = assembleRollNumberFromDigits(rollDigits);
      rollNumber = opencv.rollNumber ?? assembled.rollNumber;
      issues.push(...opencv.issues);
      if (opencv.cropDataUrl) rollCropUrl = opencv.cropDataUrl;
      const markedCount = rollDigits.filter(
        (d) => d.digit != null && !d.flagged && d.confidence >= 0.5
      ).length;
      if (rollNumber) {
        rollFromOpencv = true;
        issues.push("Roll number read with OpenCV from the uploaded OMR image.");
      } else if (markedCount > 0) {
        issues.push(
          `OpenCV read ${markedCount}/${rollDigitCount} roll columns; filling remaining with AI.`
        );
      } else {
        issues.push(...assembled.issues);
      }
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `OpenCV roll read skipped: ${error.message}`
        : "OpenCV roll read skipped."
    );
  }

  if (!rollFromOpencv) {
    const rollImageUrl = rollCropUrl ?? imageUrl;
    const missingPositions = rollDigits
      .filter((d) => d.digit == null || d.flagged || d.confidence < 0.45)
      .map((d) => d.position);
    const needsFullRead = rollDigits.length === 0 || missingPositions.length === rollDigitCount;

    try {
      if (needsFullRead) {
        const fullPass = await detectRollNumberGridFull({
          imageUrl: rollImageUrl,
          rollDigits: rollDigitCount,
          sensitivity,
        });
        rollDigits = fullPass.digits;
        issues.push(...fullPass.issues);
      } else if (missingPositions.length > 0) {
        // Re-read only the remaining columns with the same column→row-label logic.
        const byPos = new Map(rollDigits.map((d) => [d.position, d]));
        for (const position of missingPositions) {
          const slice = await detectRollNumberGridSlice({
            imageUrl: rollImageUrl,
            startPos: position,
            endPos: position,
            totalDigits: rollDigitCount,
            sensitivity: Math.min(100, sensitivity + 8),
          });
          issues.push(...slice.issues);
          const reading = slice.digits[0];
          if (reading && reading.digit != null) {
            byPos.set(position, reading);
          }
        }
        rollDigits = Array.from({ length: rollDigitCount }, (_, i) => {
          const position = i + 1;
          return (
            byPos.get(position) ?? {
              position,
              digit: null,
              confidence: 0,
              flagged: true,
            }
          );
        });
      }

      let assembled = assembleRollNumberFromDigits(rollDigits);
      rollNumber = assembled.rollNumber;
      issues.push(...assembled.issues);

      if (!rollNumber) {
        const rollPass = await detectRollNumberGrid({
          imageUrl: rollImageUrl,
          rollDigits: rollDigitCount,
          sensitivity,
        });
        // Prefer already-confident OpenCV digits over a weaker full AI pass.
        const merged = new Map(rollDigits.map((d) => [d.position, d]));
        for (const d of rollPass.digits) {
          const prev = merged.get(d.position);
          if (
            !prev ||
            prev.digit == null ||
            prev.flagged ||
            prev.confidence < d.confidence
          ) {
            merged.set(d.position, d);
          }
        }
        rollDigits = Array.from({ length: rollDigitCount }, (_, i) => {
          const position = i + 1;
          return (
            merged.get(position) ?? {
              position,
              digit: null,
              confidence: 0,
              flagged: true,
            }
          );
        });
        issues.push(...rollPass.issues);
        assembled = assembleRollNumberFromDigits(rollDigits);
        rollNumber = assembled.rollNumber;
        issues.push(...assembled.issues);
      }
    } catch (error) {
      issues.push(
        error instanceof Error
          ? `Roll-number detection issue: ${error.message}`
          : "Roll-number detection failed."
      );
    }
  }

  const firstPass: DetectedAnswer[] = [];

  for (let col = 0; col < columns; col++) {
    const startQ = col * rows + 1;
    if (startQ > questionCount) break;
    const endQ = Math.min(questionCount, (col + 1) * rows);
    const chunk = await callBubbleVision({
      imageUrl,
      imageMime: input.imageMime,
      startQ,
      endQ,
      columns,
      rows,
      sensitivity,
      mode: "column",
      columnIndex: col,
    });
    issues.push(...chunk.issues);
    firstPass.push(...chunk.answers);
  }

  // Fill-in pass(es): anything still blank or very low confidence.
  let afterFill = firstPass;
  for (let attempt = 0; attempt < 2; attempt++) {
    const needsRetry = afterFill
      .filter((row) => row.answer == null || row.confidence < 0.45)
      .map((row) => row.question)
      .filter((q) => q >= 1 && q <= questionCount);
    if (needsRetry.length === 0) break;

    const fillMap = new Map<number, DetectedAnswer>();
    for (let i = 0; i < needsRetry.length; i += 40) {
      const batch = needsRetry.slice(i, i + 40);
      const startQ = Math.min(...batch);
      const endQ = Math.max(...batch);
      const fill = await callBubbleVision({
        imageUrl,
        imageMime: input.imageMime,
        startQ,
        endQ,
        columns,
        rows,
        sensitivity: Math.min(100, sensitivity + 10 + attempt * 5),
        mode: "fill",
        focusQuestions: batch,
      });
      issues.push(...fill.issues);
      for (const row of fill.answers) {
        if (batch.includes(row.question)) fillMap.set(row.question, row);
      }
    }

    afterFill = afterFill.map((row) => {
      const retry = fillMap.get(row.question);
      if (!retry) return row;
      if (row.answer == null && retry.answer != null) {
        return {
          ...retry,
          flagged: retry.confidence < 0.55 ? true : retry.flagged,
        };
      }
      if (row.answer != null && retry.answer != null && row.answer !== retry.answer) {
        return {
          question: row.question,
          answer: row.confidence >= retry.confidence ? row.answer : retry.answer,
          confidence: Math.max(row.confidence, retry.confidence),
          flagged: true,
        };
      }
      if (row.answer != null) return row;
      return retry;
    });
  }

  // Stability pass for papers that fit in a reasonable number of column calls (≤120 Q).
  let finalAnswers = afterFill;
  if (questionCount <= 120) {
    const secondPass: DetectedAnswer[] = [];
    for (let col = 0; col < columns; col++) {
      const startQ = col * rows + 1;
      if (startQ > questionCount) break;
      const endQ = Math.min(questionCount, (col + 1) * rows);
      const chunk = await callBubbleVision({
        imageUrl,
        imageMime: input.imageMime,
        startQ,
        endQ,
        columns,
        rows,
        sensitivity,
        mode: "column",
        columnIndex: col,
      });
      secondPass.push(...chunk.answers);
    }
    finalAnswers = mergeDetectedAnswers(afterFill, secondPass, questionCount);
  } else {
    finalAnswers = mergeDetectedAnswers(afterFill, afterFill, questionCount);
  }

  const uniqueIssues = [...new Set(issues)].slice(0, 20);
  return {
    studentName,
    rollNumber,
    rollDigits,
    answers: finalAnswers,
    issues: uniqueIssues,
  };
}
