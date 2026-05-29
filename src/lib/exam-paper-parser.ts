import {
  ensureFourOptionsForQuestion,
  parseLetterAnswer,
  parseNumericalAnswerValue,
} from "@/lib/question-bank-display";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

export type ParsedQuestion = {
  id: string;
  section: string;
  indexInSection: number;
  prompt: string;
  options: string[];
};

function letterByIndex(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Map A–D, (1)–(4), or plain 1–4 MCQ keys to a single letter for comparison/display. */
export function normalizeOptionAnswerToLetter(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const letter = parseLetterAnswer(trimmed);
  if (letter) return letter;

  const parenMatch = trimmed.match(/^\((\d{1,2})\)$/);
  if (parenMatch) {
    const n = Number(parenMatch[1]);
    if (n >= 1 && n <= 8) return letterByIndex(n - 1);
  }

  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n >= 1 && n <= 8) return letterByIndex(n - 1);
  }

  return trimmed.toUpperCase();
}

/** True when the keyed value is an MCQ label (A–D, (1)–(4), etc.), not a numerical answer. */
export function isMcqAnswerFormat(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^[A-H]$/i.test(trimmed)) return true;
  if (/^\(\d{1,2}\)$/.test(trimmed)) return true;
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    return n >= 1 && n <= 4;
  }
  return parseLetterAnswer(trimmed) !== null;
}

export function compareExamAnswers(selectedRaw: string, expectedRaw: string): boolean {
  const selected = selectedRaw.trim();
  const expected = expectedRaw.trim();
  if (!selected || !expected) return false;

  if (isMcqAnswerFormat(expected) || isMcqAnswerFormat(selected)) {
    return normalizeOptionAnswerToLetter(selected) === normalizeOptionAnswerToLetter(expected);
  }

  return selected.toUpperCase() === expected.toUpperCase();
}

function normalizeLabel(value: string): string {
  return value.trim().toUpperCase();
}

export function parseQuestionPaperContent(content: string): {
  sections: Array<{ name: string; questions: ParsedQuestion[] }>;
  flatQuestions: ParsedQuestion[];
} {
  const sections: Array<{ name: string; questions: ParsedQuestion[] }> = [];
  let currentSection: { name: string; questions: ParsedQuestion[] } | null = null;
  let currentQuestion: ParsedQuestion | null = null;

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      if (currentQuestion && currentSection) currentSection.questions.push(currentQuestion);
      currentQuestion = null;
      currentSection = { name: sectionMatch[1].trim(), questions: [] };
      sections.push(currentSection);
      continue;
    }

    const questionMatch = line.match(/^Q(\d+)[\.\):\-]\s*(.+)$/i);
    if (questionMatch && currentSection) {
      if (currentQuestion) currentSection.questions.push(currentQuestion);
      currentQuestion = {
        id: `${currentSection.name}::${questionMatch[1]}`,
        section: currentSection.name,
        indexInSection: Number(questionMatch[1]),
        prompt: questionMatch[2].trim(),
        options: [],
      };
      continue;
    }

    const optionMatch =
      line.match(/^\(([A-H])\)\s*(.+)$/i) ??
      line.match(/^([A-H])[\.\)]\s*(.+)$/i) ??
      line.match(/^option\s*([A-H])\s*[:\.\-\)]\s*(.+)$/i);
    if (optionMatch && currentQuestion) {
      currentQuestion.options.push(`${normalizeLabel(optionMatch[1])}. ${optionMatch[2].trim()}`);
      continue;
    }

    /** JEE Advance / NTA style: (1), (2), (3), (4) */
    const parenNumericOptionMatch = line.match(/^\((\d{1,2})\)\s*(.+)$/);
    if (parenNumericOptionMatch && currentQuestion && currentQuestion.options.length < 8) {
      const idx = Number(parenNumericOptionMatch[1]);
      if (idx >= 1 && idx <= 8) {
        const label = letterByIndex(idx - 1);
        currentQuestion.options.push(`${label}. ${parenNumericOptionMatch[2].trim()}`);
        continue;
      }
    }

    const numericOptionMatch = line.match(/^([1-9][0-9]?)\s*[\.\)]\s*(.+)$/);
    if (numericOptionMatch && currentQuestion && currentQuestion.options.length < 8) {
      const label = letterByIndex(currentQuestion.options.length);
      currentQuestion.options.push(`${label}. ${numericOptionMatch[2].trim()}`);
      continue;
    }

    if (currentQuestion && line) {
      currentQuestion.prompt = `${currentQuestion.prompt}\n${line}`.trim();
    }
  }

  if (currentQuestion && currentSection) currentSection.questions.push(currentQuestion);
  const flatQuestions = sections.flatMap((s) => s.questions);
  return { sections, flatQuestions };
}

function seedFromQuestionId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function stripOptionPrefix(option: string): string {
  return option.replace(/^[A-H][\.\)]\s*/i, "").trim() || option.trim();
}

function formatParsedOptions(options: string[]): string[] {
  return options.map((value, index) => {
    const stripped = stripOptionPrefix(value);
    return `${letterByIndex(index)}. ${formatQuestionTextForDisplay(stripped)}`;
  });
}

export function enrichParsedPaperWithOptions(
  parsed: { sections: Array<{ name: string; questions: ParsedQuestion[] }>; flatQuestions: ParsedQuestion[] },
  answerKey: Record<string, string> = {}
): {
  sections: Array<{ name: string; questions: ParsedQuestion[] }>;
  flatQuestions: ParsedQuestion[];
  answerKey: Record<string, string>;
} {
  const enrichedKey = { ...answerKey };

  const sections = parsed.sections.map((section) => ({
    ...section,
    questions: section.questions.map((question) => {
      if (question.options.length >= 4) return question;

      const rawOptions =
        question.options.length > 0 ? question.options.map(stripOptionPrefix) : null;
      const ensured = ensureFourOptionsForQuestion({
        questionText: question.prompt,
        options: rawOptions,
        correctAnswer: answerKey[question.id] ?? null,
        seedId: seedFromQuestionId(question.id),
      });

      const letter = parseLetterAnswer(ensured.correctAnswer);
      if (letter) {
        enrichedKey[question.id] = letter;
      } else {
        const expectedNum = parseNumericalAnswerValue(answerKey[question.id]);
        if (expectedNum !== null) {
          const idx = ensured.options.findIndex((option) => {
            const n = parseNumericalAnswerValue(option);
            return n !== null && Math.abs(n - expectedNum) < 1e-9;
          });
          if (idx >= 0) enrichedKey[question.id] = letterByIndex(idx);
        }
      }

      return {
        ...question,
        prompt: formatQuestionTextForDisplay(question.prompt),
        options: formatParsedOptions(ensured.options),
      };
    }),
  }));

  return {
    sections,
    flatQuestions: sections.flatMap((s) => s.questions),
    answerKey: enrichedKey,
  };
}

export function parseQuestionPaperContentWithOptions(
  content: string,
  keyContent?: string | null
): {
  sections: Array<{ name: string; questions: ParsedQuestion[] }>;
  flatQuestions: ParsedQuestion[];
  answerKey: Record<string, string>;
} {
  const parsed = parseQuestionPaperContent(content);
  const answerKey = keyContent ? parseAnswerKeyByQuestion(keyContent) : {};
  return enrichParsedPaperWithOptions(parsed, answerKey);
}

export function prepareQuestionForPaperBlock(input: {
  questionText: string;
  options: string[] | null | undefined;
  correctAnswer: string | null | undefined;
  seedId?: number;
  formatOptionsBlock: (options: string[] | null) => string;
}): { questionBlock: string; correctAnswer: string | null } {
  const ensured = ensureFourOptionsForQuestion({
    questionText: input.questionText,
    options: input.options,
    correctAnswer: input.correctAnswer,
    seedId: input.seedId,
  });
  const stem = formatQuestionTextForDisplay(input.questionText);
  const letter = parseLetterAnswer(ensured.correctAnswer);
  return {
    questionBlock: `${stem}${input.formatOptionsBlock(ensured.options)}`,
    correctAnswer: letter ?? ensured.correctAnswer ?? input.correctAnswer ?? null,
  };
}

export function parseAnswerKeyByQuestion(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  let currentSection = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const answerMatch = line.match(/Q(\d+)\s*:\s*(.+)$/i);
    if (answerMatch && currentSection) {
      map[`${currentSection}::${answerMatch[1]}`] = answerMatch[2].trim();
    }
  }
  return map;
}
