import {
  normalizeOptionAnswerToLetter,
  parseQuestionPaperContentWithOptions,
} from "@/lib/exam-paper-parser";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

export type WrongQuestionForAi = {
  key: string;
  section: string;
  questionNumber: number;
  prompt: string;
  options: string[];
  studentAnswer: string;
  correctAnswer: string;
  wasUnanswered: boolean;
  correctOptionText: string | null;
  studentOptionText: string | null;
};

function optionTextByLetter(options: string[], letter: string): string | null {
  if (!letter) return null;
  const upper = letter.toUpperCase();
  for (const opt of options) {
    const m = opt.match(/^([A-H])[\.\)]/i);
    if (m?.[1]?.toUpperCase() === upper) {
      return opt.replace(/^[A-H][\.\)]\s*/i, "").trim() || opt;
    }
  }
  return null;
}

function normalizeAnswer(value: string | undefined, asMcqLetter: boolean): string {
  if (!value?.trim()) return "";
  return asMcqLetter ? normalizeOptionAnswerToLetter(value) : value.trim();
}

export function collectIncorrectQuestions(input: {
  questionContent: string;
  keyContent: string;
  submittedAnswers: Record<string, string>;
}): WrongQuestionForAi[] {
  const { sections, answerKey } = parseQuestionPaperContentWithOptions(
    input.questionContent,
    input.keyContent
  );

  const wrong: WrongQuestionForAi[] = [];

  for (const section of sections) {
    for (const q of section.questions) {
      const key = `${section.name}::${q.indexInSection}`;
      const isMcq = q.options.length > 0;
      const selected = normalizeAnswer(input.submittedAnswers[key], isMcq);
      const expected = normalizeAnswer(answerKey[key], isMcq);
      const correct = Boolean(selected && expected && selected === expected);
      if (correct) continue;

      const formattedOptions = q.options.map((opt) => formatQuestionTextForDisplay(opt));
      wrong.push({
        key,
        section: section.name,
        questionNumber: q.indexInSection,
        prompt: formatQuestionTextForDisplay(q.prompt),
        options: formattedOptions,
        studentAnswer: selected || "Not answered",
        correctAnswer: expected || "N/A",
        wasUnanswered: !selected,
        correctOptionText: isMcq ? optionTextByLetter(formattedOptions, expected) : expected || null,
        studentOptionText: isMcq && selected ? optionTextByLetter(formattedOptions, selected) : selected || null,
      });
    }
  }

  return wrong;
}

export function formatWhyCorrectHeading(q: WrongQuestionForAi): string {
  const isMcq = q.options.length > 0;
  const letter =
    isMcq && q.correctAnswer && q.correctAnswer !== "N/A"
      ? q.correctAnswer.toUpperCase()
      : null;
  const value = q.correctOptionText?.trim() || null;

  if (letter && value) {
    return `Why option ${letter} (${value}) is right:`;
  }
  if (letter) {
    return `Why option ${letter} is right:`;
  }
  if (value) {
    return `Why ${value} is right:`;
  }
  if (q.correctAnswer && q.correctAnswer !== "N/A") {
    return `Why ${q.correctAnswer} is right:`;
  }
  return "Why this answer is right:";
}

export function formatExplanationSections(
  question: WrongQuestionForAi,
  steps: string[],
  takeaway: string
): string {
  const whyHeading = formatWhyCorrectHeading(question);
  const stepLines = steps
    .map((step) => step.trim())
    .filter(Boolean)
    .map((step, index) => `Step ${index + 1}: ${step}`);
  const sections = [
    stepLines.length > 0 ? `${whyHeading}\n${stepLines.join("\n")}` : "",
    takeaway.trim() ? `Remember:\n${takeaway.trim()}` : "",
  ].filter(Boolean);
  return sections.join("\n\n");
}
