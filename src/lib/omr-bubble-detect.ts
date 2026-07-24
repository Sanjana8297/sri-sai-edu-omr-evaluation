import { callOpenAiChatCompletion } from "@/lib/openai-runtime";
import { readAnswersFromUploadedImage } from "@/lib/omr-answers-opencv";
import { readRollFromUploadedImage } from "@/lib/omr-roll-opencv";
import { OMR_SHEET_ROLL_COLUMNS } from "@/lib/omr-sheet-html";

export type DetectedAnswer = {
  question: number;
  answer: "A" | "B" | "C" | "D" | null;
  confidence: number;
  flagged: boolean;
};

export type OmrVisionResult = {
  /** Handwritten name from the "Student's Name:" line. */
  studentName: string | null;
  rollNumber: string | null;
  answers: DetectedAnswer[];
  issues: string[];
  /** Per-column roll readings (1 = leftmost vertical column). */
  rollDigits?: RollDigitReading[];
};

export type RollDigitReading = {
  /** Vertical column from the LEFT of the Roll Number grid (1 = first digit). */
  position: number;
  /** Digit 0–9 from the top write-in box and/or filled bubble in that column. */
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
 * Build the roll number from vertical Roll Number columns (left→right).
 * Each position is a top write-in digit and/or filled bubble digit 0–9.
 * Trailing blank columns are ignored; any blank in the middle fails.
 */
export function assembleRollNumberFromDigits(digits: RollDigitReading[]): {
  rollNumber: string | null;
  issues: string[];
} {
  const sorted = [...digits].sort((a, b) => a.position - b.position);
  let end = sorted.length;
  while (end > 0 && sorted[end - 1].digit == null) end -= 1;
  if (end === 0) {
    return {
      rollNumber: null,
      issues: ["No roll digits were detected in the Roll Number top boxes or bubbles."],
    };
  }

  const active = sorted.slice(0, end);
  const missing = active.filter((d) => d.digit == null);
  if (missing.length > 0) {
    return {
      rollNumber: null,
      issues: [
        `Roll number incomplete: missing digit in column(s) ${missing.map((m) => m.position).join(", ")} ` +
          "(positions are vertical columns left→right; values come from top write-in boxes or bubbles).",
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
        // Agreement across passes → higher confidence and clear flag when filled.
        confidence: leftAns
          ? Math.min(1, Math.max(leftConf, rightConf) + 0.08)
          : Math.max(leftConf, rightConf),
        flagged: leftAns == null,
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
    `Grid layout (Sri Sai sheet): ${columns} response columns × ${rows} rows, numbered column-major ` +
    `(column 1 = Q1–Q${rows}, column 2 continues after that, and so on). ` +
    "Each question row has four circular bubbles with the letter A, B, C, or D printed INSIDE the bubble " +
    "(left→right = A, B, C, D). A filled mark darkens most of the bubble interior beyond the printed letter.";

  // Map UI sensitivity to an explicit darkness rule the model must follow.
  const acceptLightFills = sensitivity >= 75;
  const strictFills = sensitivity <= 55;

  let taskText: string;
  if (mode === "column" && input.columnIndex != null) {
    taskText =
      `Read ONLY column ${input.columnIndex + 1} of the OMR response grid (${questionRangeLabel(startQ, endQ)}). ` +
      `Return exactly ${expectedCount} answer objects for every question from ${startQ} through ${endQ} in ascending order. ` +
      layoutHint;
  } else if (mode === "fill" && focusQuestions) {
    taskText =
      `Re-inspect ONLY these question numbers: ${focusQuestions.join(", ")}. ` +
      "Previously they were blank or uncertain. Look again for any darkened / filled A–D bubble. " +
      `Return exactly ${expectedCount} records — one per listed question, in ascending order. Do not invent other question numbers. ` +
      layoutHint;
  } else {
    taskText =
      `Read the full OMR response grid for ${questionRangeLabel(startQ, endQ)}. ` +
      `Return exactly ${expectedCount} answer objects for every question from ${startQ} through ${endQ} in ascending order. ` +
      layoutHint;
  }

  const fillRules =
    "FILL RULES (apply consistently — same sheet scanned twice must yield the same letters):\n" +
    "1) Compare the four bubbles in the SAME question row; pick the single darkest interior.\n" +
    "2) Printed A/B/C/D glyphs alone are NOT fills — require pencil/pen darkening beyond the letter ink.\n" +
    "3) If two options are nearly equally dark, return null with flagged=true (do not guess).\n" +
    "4) If none is clearly darker than the others, return null.\n" +
    (strictFills
      ? "5) Sensitivity is LOW: only accept clearly blacked-out bubbles.\n"
      : acceptLightFills
        ? "5) Sensitivity is HIGH: accept light but deliberate pencil shading if it is clearly darker than siblings.\n"
        : "5) Sensitivity is MEDIUM: accept definite fills; skip faint smudges.\n") +
    `Sensitivity setting: ${sensitivity}%. Never invent answers. Never skip required question numbers.`;

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED + (input.columnIndex ?? 0) * 17 + (mode === "fill" ? 91 : 0),
    max_tokens: Math.min(16_000, Math.max(2500, expectedCount * 45)),
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_bubble_detection", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You are a deterministic OMR bubble reader for Sri Sai sheets. " +
          "Report which A–D bubble is filled for each question. " +
          "Be consistent across rescans: use relative darkness within each question row. " +
          "Missed clear fills are worse than over-flagging uncertain ones.",
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
    "Look ONLY at the pink \"Roll Number\" panel (upper-left). Ignore A–D responses and Student's Name.\n\n" +
    "Grid rules (Sri Sai sheet):\n" +
    `- ${totalDigits} VERTICAL columns left→right. Position = column index from the LEFT (1…${totalDigits}).\n` +
    "- TOP ROW: square write-in boxes — prefer OCR of handwritten digits there.\n" +
    "- BELOW: circular bubbles; digit printed inside; rows top→bottom = 0…9.\n\n" +
    `YOUR TASK: Read column position(s) ${positionList} only.\n` +
    `Start at ${leftOrdinal} and move right.\n` +
    `Return exactly ${count} objects with position: ${positionList}.\n` +
    "Prefer the top write-in digit; if blank, use the filled oval's row digit in that column.\n" +
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
          "You read Sri Sai OMR Roll Number columns. Position = left→right column. " +
          "Digit = top write-in box or filled bubble row (0–9). Never use A–D bubbles.",
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
    "This image shows the \"Roll Number\" panel on a Sri Sai OMR sheet (or the full sheet).\n" +
    `There are exactly ${rollDigits} VERTICAL columns left→right. Position = column index 1…${rollDigits}.\n` +
    "TOP ROW: square write-in boxes — OCR handwritten digits there first.\n" +
    "BELOW: circular bubbles with the digit printed inside; rows top→bottom = 0…9.\n" +
    "For each column: use the top-box digit if readable; else the filled bubble's row digit.\n" +
    "Never use A–D exam answers. digit=null only if empty or double-marked (flagged=true).\n" +
    `Return exactly ${rollDigits} digit objects with positions 1…${rollDigits}.\n` +
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
          "You read Sri Sai OMR Roll Number grids. Prefer top write-in boxes; " +
          "fallback to filled digit bubbles (0–9 top→bottom) in each vertical column.",
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
 * Read the handwritten name on the OMR "Student's Name:" dotted line.
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
          "Return only the name written on the Student's Name line — never invent one.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "On this Sri Sai OMR sheet, find the pink-bordered field labeled " +
              '"Student\'s Name:" (wide box to the RIGHT of the Roll Number grid, near the top). ' +
              "Read the handwritten name on the dotted line. " +
              "Return studentName as the full name exactly as written (fix obvious letter confusions only if clear). " +
              "If the name line is blank, illegible, or missing, return studentName null and explain in issues. " +
              "Do not return roll numbers, exam titles, dates, batch codes, class labels, or printed headings as the name.",
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
      issues: issues.length > 0 ? issues : ["Could not read a clear student name from the Student's Name line."],
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
 * Primary roll read: OCR digits in the TOP ROW of square boxes inside "Roll Number"
 * (one box per vertical column, left→right). Falls back to filled bubbles in that column.
 */
async function detectRollFromTopWriteInBoxes(input: {
  imageUrl: string;
  rollDigits: number;
  sensitivity: number;
}): Promise<{ digits: RollDigitReading[]; issues: string[] }> {
  const { rollDigits, sensitivity } = input;
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
          required: ["position", "digit", "confidence", "flagged", "source"],
          properties: {
            position: { type: "integer", minimum: 1, maximum: rollDigits },
            digit: { type: ["integer", "null"], minimum: 0, maximum: 9 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            flagged: { type: "boolean" },
            source: { type: "string", enum: ["write_in", "bubble", "none"] },
          },
        },
      },
      issues: { type: "array", items: { type: "string" } },
    },
  };

  const instructions =
    "Find the pink box titled \"Roll Number\" (upper-left of the sheet).\n\n" +
    "Layout:\n" +
    `- Exactly ${rollDigits} VERTICAL columns left→right.\n` +
    `- TOP ROW: ${rollDigits} square write-in boxes (one per column). Students write one digit 0–9 in each.\n` +
    "- BELOW: circular bubbles per column; digit printed inside; rows top→bottom = 0…9.\n\n" +
    "Read the roll from those vertical columns:\n" +
    `1) PRIMARY: OCR the handwritten digit in each TOP square box (positions 1…${rollDigits} left→right).\n` +
    "2) If a top box is blank/illegible, use the filled circular bubble in that SAME column " +
    "(bubble row digit: top=0 … bottom=9).\n" +
    "3) If write-in and bubble disagree, prefer the darker filled bubble and set flagged=true.\n" +
    `Return exactly ${rollDigits} objects with positions 1…${rollDigits}.\n` +
    "Ignore Student's Name, booklet code, date, class, barcode, and A–D responses.\n" +
    `Sensitivity: ${sensitivity}%.`;

  const response = await callOpenAiChatCompletion({
    temperature: 0,
    top_p: 1,
    seed: DETECTION_SEED + 3,
    max_tokens: 1200,
    response_format: {
      type: "json_schema",
      json_schema: { name: "omr_roll_top_boxes", strict: true, schema },
    },
    messages: [
      {
        role: "system",
        content:
          "You read Sri Sai OMR roll numbers from the Roll Number panel. " +
          "Primary: top-row square write-in boxes (left→right). " +
          "Fallback: filled digit bubbles in the same vertical column.",
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
    throw new Error(`Roll top-box detection failed (${response.status}): ${message.slice(0, 300)}`);
  }

  const payload = (await response.json()) as OpenAiResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned no roll top-box result.");

  let parsed: { digits?: unknown[]; issues?: unknown };
  try {
    parsed = JSON.parse(content) as { digits?: unknown[]; issues?: unknown };
  } catch {
    throw new Error("AI returned an invalid roll top-box result.");
  }

  const byPos = new Map<number, RollDigitReading>();
  for (const item of Array.isArray(parsed.digits) ? parsed.digits : []) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const position = Number(row.position);
    if (!Number.isInteger(position) || position < 1 || position > rollDigits) continue;
    if (byPos.has(position)) continue;
    const digit = normalizeRollDigit(row.digit);
    const source = String(row.source ?? "none");
    byPos.set(position, {
      position,
      digit,
      confidence: clampConfidence(row.confidence),
      flagged: Boolean(row.flagged) || digit == null || source === "none",
    });
  }

  const digits: RollDigitReading[] = Array.from({ length: rollDigits }, (_, i) => {
    const position = i + 1;
    return byPos.get(position) ?? { position, digit: null, confidence: 0, flagged: true };
  });

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((i): i is string => typeof i === "string").slice(0, 10)
    : [];
  if (digits.every((d) => d.digit == null)) {
    issues.push("Could not read digits from the Roll Number top write-in boxes or bubbles.");
  }

  return { digits, issues };
}

/**
 * High-accuracy OMR detection for the Sri Sai sheet:
 * 1) Read "Student's Name:" for profile matching.
 * 2) Read roll from top-row write-in boxes (primary), then OpenCV/AI column bubbles.
 * 3) Read A–D responses via OpenCV lattice (deterministic), with AI fill for gaps only.
 */
export async function detectOmrBubbles(input: DetectOmrBubblesInput): Promise<OmrVisionResult> {
  const { questionCount, columns, sensitivity } = input;
  const rollDigitCount = Math.min(
    12,
    Math.max(5, input.rollDigits ?? OMR_SHEET_ROLL_COLUMNS)
  );
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

  // Roll PRIMARY: top-row write-in boxes in each vertical column of "Roll Number".
  let rollDigits: RollDigitReading[] = [];
  let rollNumber: string | null = null;
  let rollFromPrimary = false;
  let rollCropUrl: string | null = null;

  try {
    const topPass = await detectRollFromTopWriteInBoxes({
      imageUrl,
      rollDigits: rollDigitCount,
      sensitivity,
    });
    rollDigits = topPass.digits;
    issues.push(...topPass.issues);
    const assembled = assembleRollNumberFromDigits(rollDigits);
    rollNumber = assembled.rollNumber;
    if (rollNumber) {
      rollFromPrimary = true;
      issues.push("Roll number read from Roll Number top write-in boxes / column bubbles.");
    } else {
      issues.push(...assembled.issues);
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `Roll top-box read skipped: ${error.message}`
        : "Roll top-box read skipped."
    );
  }

  // OpenCV bubble lattice fills blank / low-confidence columns.
  try {
    const opencv = await readRollFromUploadedImage({
      imageBytes: input.imageBytes,
      imageMime: input.imageMime,
      columns: rollDigitCount,
    });
    if (opencv) {
      if (opencv.cropDataUrl) rollCropUrl = opencv.cropDataUrl;
      issues.push(...opencv.issues);
      const byPos = new Map(rollDigits.map((d) => [d.position, d]));
      for (const d of opencv.digits) {
        const prev = byPos.get(d.position);
        if (
          !prev ||
          prev.digit == null ||
          prev.flagged ||
          prev.confidence < d.confidence
        ) {
          byPos.set(d.position, {
            position: d.position,
            digit: d.digit,
            confidence: d.confidence,
            flagged: d.flagged,
          });
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
      const assembled = assembleRollNumberFromDigits(rollDigits);
      if (assembled.rollNumber) {
        rollNumber = assembled.rollNumber;
        if (!rollFromPrimary) {
          rollFromPrimary = true;
          issues.push("Roll number completed with OpenCV column bubbles.");
        }
      }
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `OpenCV roll read skipped: ${error.message}`
        : "OpenCV roll read skipped."
    );
  }

  if (
    !rollFromPrimary ||
    rollDigits.some((d) => d.digit == null || d.flagged || d.confidence < 0.45)
  ) {
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
        // Merge: keep confident top-box digits.
        const merged = new Map(rollDigits.map((d) => [d.position, d]));
        for (const d of fullPass.digits) {
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
        issues.push(...fullPass.issues);
      } else if (missingPositions.length > 0) {
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

  // ── A–D responses: OpenCV lattice (deterministic) first, AI only for gaps ──
  let answersImageUrl = imageUrl;
  let opencvAnswers: DetectedAnswer[] | null = null;

  try {
    const opencv = await readAnswersFromUploadedImage({
      imageBytes: input.imageBytes,
      imageMime: input.imageMime,
      columns,
      rows,
      questionCount,
      sensitivity,
    });
    if (opencv) {
      opencvAnswers = opencv.answers;
      if (opencv.cropDataUrl) answersImageUrl = opencv.cropDataUrl;
      issues.push(...opencv.issues);
      const marked = opencv.answers.filter((a) => a.answer != null).length;
      issues.push(`OpenCV response grid read ${marked}/${questionCount} marked bubbles.`);
    }
  } catch (error) {
    issues.push(
      error instanceof Error
        ? `OpenCV answer read skipped: ${error.message}`
        : "OpenCV answer read skipped."
    );
  }

  const needsAiFullPass =
    !opencvAnswers ||
    opencvAnswers.filter((a) => a.answer != null && !a.flagged && a.confidence >= 0.55).length <
      Math.max(1, Math.floor(questionCount * 0.15));

  let firstPass: DetectedAnswer[] = opencvAnswers
    ? opencvAnswers.map((a) => ({ ...a }))
    : [];

  if (needsAiFullPass || !opencvAnswers) {
    const aiPass: DetectedAnswer[] = [];
    for (let col = 0; col < columns; col++) {
      const startQ = col * rows + 1;
      if (startQ > questionCount) break;
      const endQ = Math.min(questionCount, (col + 1) * rows);
      const chunk = await callBubbleVision({
        imageUrl: answersImageUrl,
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
      aiPass.push(...chunk.answers);
    }
    if (opencvAnswers) {
      firstPass = mergeDetectedAnswers(opencvAnswers, aiPass, questionCount);
      // Prefer OpenCV when both agree or OpenCV is confident — re-apply for consistency.
      firstPass = firstPass.map((merged) => {
        const cv = opencvAnswers!.find((a) => a.question === merged.question);
        if (!cv) return merged;
        if (cv.answer != null && cv.confidence >= 0.55 && !cv.flagged) {
          if (merged.answer != null && merged.answer !== cv.answer) {
            return { ...cv, flagged: true, confidence: Math.min(cv.confidence, 0.7) };
          }
          return cv;
        }
        return merged;
      });
    } else {
      firstPass = aiPass;
    }
  }

  // Fill-in pass(es): anything still blank, ambiguous, or very low confidence.
  let afterFill = firstPass;
  for (let attempt = 0; attempt < 2; attempt++) {
    const needsRetry = afterFill
      .filter((row) => row.answer == null || row.flagged || row.confidence < 0.5)
      .map((row) => row.question)
      .filter((q) => q >= 1 && q <= questionCount);
    if (needsRetry.length === 0) break;

    const fillMap = new Map<number, DetectedAnswer>();
    for (let i = 0; i < needsRetry.length; i += 40) {
      const batch = needsRetry.slice(i, i + 40);
      const startQ = Math.min(...batch);
      const endQ = Math.max(...batch);
      const fill = await callBubbleVision({
        imageUrl: answersImageUrl,
        imageMime: input.imageMime,
        startQ,
        endQ,
        columns,
        rows,
        sensitivity: Math.min(100, sensitivity + 8 + attempt * 5),
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
      // Keep a confident OpenCV/AI mark unless the retry is clearly better.
      if (row.answer != null && row.confidence >= 0.7 && !row.flagged) {
        if (retry.answer != null && retry.answer !== row.answer) {
          return { ...row, flagged: true };
        }
        return row;
      }
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

  // Stability pass: second column read merged in (≤120 Q) for AI-heavy paths.
  let finalAnswers = afterFill;
  const shouldStabilityPass =
    questionCount <= 120 &&
    (!opencvAnswers ||
      afterFill.filter((a) => a.answer == null || a.flagged).length > questionCount * 0.2);

  if (shouldStabilityPass) {
    const secondPass: DetectedAnswer[] = [];
    for (let col = 0; col < columns; col++) {
      const startQ = col * rows + 1;
      if (startQ > questionCount) break;
      const endQ = Math.min(questionCount, (col + 1) * rows);
      const chunk = await callBubbleVision({
        imageUrl: answersImageUrl,
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

  // Ensure every question slot exists exactly once (deterministic output shape).
  const byFinal = new Map(finalAnswers.map((a) => [a.question, a]));
  finalAnswers = Array.from({ length: questionCount }, (_, i) => {
    const question = i + 1;
    return (
      byFinal.get(question) ?? {
        question,
        answer: null,
        confidence: 0,
        flagged: true,
      }
    );
  });

  const uniqueIssues = [...new Set(issues)].slice(0, 24);
  return {
    studentName,
    rollNumber,
    rollDigits,
    answers: finalAnswers,
    issues: uniqueIssues,
  };
}
