import {
  JEE_MAINS_QUESTIONS_PER_SUBJECT,
  JEE_MAINS_SECTION1_MCQ_COUNT,
  JEE_MAINS_SECTION2_NUMERICAL_COUNT,
  JEE_MAINS_SUBJECTS,
  JEE_MAINS_TOTAL_QUESTIONS,
} from "@/lib/jee-mains-exam-structure";
import { prepareQuestionForPaperBlock } from "@/lib/exam-paper-parser";

export type JeeMainsSectionKey = "section1" | "section2";

export type JeeMainsPaperSlotItem = {
  question_text: string;
  options?: string[] | null;
  correct_answer?: string | null;
};

const SECTION_META: Record<JeeMainsSectionKey, { label: string; subtitle: string; count: number }> = {
  section1: {
    label: "Section I",
    subtitle: "Single correct answer type",
    count: JEE_MAINS_SECTION1_MCQ_COUNT,
  },
  section2: {
    label: "Section II",
    subtitle: "Numerical value answer type",
    count: JEE_MAINS_SECTION2_NUMERICAL_COUNT,
  },
};

export function getJeeMainsTotalQuestions(): number {
  return JEE_MAINS_TOTAL_QUESTIONS;
}

export function buildJeeMainsSectionName(subject: string, sectionKey: JeeMainsSectionKey): string {
  const meta = SECTION_META[sectionKey];
  return `${subject} - ${meta.label} (${meta.subtitle})`;
}

export function buildJeeMainsPaperContent(
  items: JeeMainsPaperSlotItem[],
  formatOptionsBlock: (options: string[] | null) => string
): { questionContent: string; keyContent: string; error?: string } {
  const expected = getJeeMainsTotalQuestions();
  if (items.length !== expected) {
    return {
      questionContent: "",
      keyContent: "",
      error: `JEE Mains paper needs exactly ${expected} questions in slot order (you have ${items.length}).`,
    };
  }

  const questionBlocks: string[] = [
    "JEE Mains structure: Mathematics, Physics, Chemistry — Section I (20 MCQ) and Section II (5 numerical) per subject.",
  ];
  const keyBlocks: string[] = [];
  let cursor = 0;

  for (const subject of JEE_MAINS_SUBJECTS) {
    const keys: JeeMainsSectionKey[] = ["section1", "section2"];
    for (const key of keys) {
      const count = SECTION_META[key].count;
      const sectionName = buildJeeMainsSectionName(subject, key);
      questionBlocks.push(`## ${sectionName}`);
      keyBlocks.push(`## ${sectionName}`);
      for (let q = 1; q <= count; q++) {
        const item = items[cursor++];
        const { questionBlock, correctAnswer } = prepareQuestionForPaperBlock({
          questionText: item.question_text,
          options: item.options ?? null,
          correctAnswer: item.correct_answer,
          seedId: cursor,
          formatOptionsBlock,
        });
        questionBlocks.push(`Q${q}. ${questionBlock}`);
        keyBlocks.push(`${sectionName} Q${q}: ${correctAnswer ?? "N/A"}`);
      }
    }
  }

  return {
    questionContent: questionBlocks.join("\n\n"),
    keyContent: keyBlocks.join("\n"),
  };
}

export const JEE_MAINS_SLOT_ORDER_HINT = `Mathematics (Section I → Section II), Physics (Section I → Section II), Chemistry (Section I → Section II) — ${JEE_MAINS_QUESTIONS_PER_SUBJECT} questions per subject.`;
