import {
  JEE_ADVANCE_EXAM_DURATION_HOURS,
  JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
  JEE_ADVANCE_SECTION_MARKS,
  totalExamMarksFromSubjects,
  validateSubjectSectionCounts,
  type JeeAdvanceSectionKey,
  type JeeAdvanceSubjectConfig,
} from "@/lib/jee-advance-exam-structure";

export type AdvanceDifficultyMix = {
  easy: number;
  medium: number;
  hard: number;
};

export function getJeeAdvanceTotalQuestions(subjects: JeeAdvanceSubjectConfig[]): number {
  return subjects.reduce(
    (sum, s) => sum + s.sectionCounts.section1 + s.sectionCounts.section2 + s.sectionCounts.section3,
    0
  );
}

export function buildJeeAdvanceSectionName(subject: string, sectionKey: JeeAdvanceSectionKey): string {
  const meta = JEE_ADVANCE_SECTION_MARKS[sectionKey];
  return `${subject} - ${meta.label} ${meta.subtitle}`;
}

export function buildJeeAdvanceBlueprintSections(
  subjects: JeeAdvanceSubjectConfig[],
  difficultyMix: AdvanceDifficultyMix
) {
  const sections: Array<{
    name: string;
    questionCount: number;
    marksPerQuestion: number;
    negativeMarks: number;
    topicFocus: string[];
    difficulty: "medium";
    difficultyMix: AdvanceDifficultyMix;
    sectionKey: JeeAdvanceSectionKey;
    subject: string;
  }> = [];

  for (const subj of subjects) {
    const keys: JeeAdvanceSectionKey[] = ["section1", "section2", "section3"];
    for (const key of keys) {
      const count = subj.sectionCounts[key];
      if (count <= 0) continue;
      const meta = JEE_ADVANCE_SECTION_MARKS[key];
      sections.push({
        name: buildJeeAdvanceSectionName(subj.subject, key),
        questionCount: count,
        marksPerQuestion: meta.correct,
        negativeMarks: Math.abs(meta.wrong),
        topicFocus: [subj.subject],
        difficulty: "medium",
        difficultyMix,
        sectionKey: key,
        subject: subj.subject,
      });
    }
  }
  return sections;
}

export function buildJeeAdvanceBlueprintPayload(
  subjects: JeeAdvanceSubjectConfig[],
  difficultyMix: AdvanceDifficultyMix
) {
  for (const s of subjects) {
    const err = validateSubjectSectionCounts(s.sectionCounts);
    if (err) throw new Error(`${s.subject}: ${err}`);
  }

  const totalMarks = totalExamMarksFromSubjects(subjects);
  const totalQuestions = getJeeAdvanceTotalQuestions(subjects);

  return {
    category: "JEE" as const,
    examProfile: "JEE_ADVANCE" as const,
    subject: "Mathematics, Physics, Chemistry",
    durationMinutes: JEE_ADVANCE_EXAM_DURATION_HOURS * 60,
    totalQuestions,
    totalMarks,
    instructions: [
      "JEE Advance format: 3 hours, Mathematics / Physics / Chemistry.",
      `Each subject has exactly ${JEE_ADVANCE_QUESTIONS_PER_SUBJECT} questions in three sections.`,
      "Section I: Single correct option (+3 / −1).",
      "Section II: One or more correct options (+4 / −2; partial +1 per correct option).",
      "Section III: Numerical value answers (+4 / 0).",
      `Total marks for this paper: ${totalMarks} (depends on section question counts).`,
      `Difficulty mix per section: Easy ${difficultyMix.easy}%, Medium ${difficultyMix.medium}%, Hard ${difficultyMix.hard}%.`,
    ],
    sections: buildJeeAdvanceBlueprintSections(subjects, difficultyMix),
    advanceStructure: {
      examDurationHours: JEE_ADVANCE_EXAM_DURATION_HOURS,
      questionsPerSubject: JEE_ADVANCE_QUESTIONS_PER_SUBJECT,
      subjects,
    },
  };
}

export type AdvancePaperSlotItem = {
  question_text: string;
  options?: string[] | null;
  correct_answer?: string | null;
};

export function buildJeeAdvancePaperContent(
  items: AdvancePaperSlotItem[],
  subjects: JeeAdvanceSubjectConfig[],
  formatOptionsBlock: (options: string[] | null) => string
): { questionContent: string; keyContent: string; error?: string } {
  const expected = getJeeAdvanceTotalQuestions(subjects);
  if (items.length !== expected) {
    return {
      questionContent: "",
      keyContent: "",
      error: `JEE Advance paper needs exactly ${expected} questions in slot order (you have ${items.length}).`,
    };
  }

  const questionBlocks: string[] = [];
  const keyBlocks: string[] = [];
  let cursor = 0;

  for (const subj of subjects) {
    const keys: JeeAdvanceSectionKey[] = ["section1", "section2", "section3"];
    for (const key of keys) {
      const count = subj.sectionCounts[key];
      if (count <= 0) continue;
      const sectionName = buildJeeAdvanceSectionName(subj.subject, key);
      questionBlocks.push(`## ${sectionName}`);
      keyBlocks.push(`## ${sectionName}`);
      for (let q = 1; q <= count; q++) {
        const item = items[cursor++];
        questionBlocks.push(`Q${q}. ${item.question_text}${formatOptionsBlock(item.options ?? null)}`);
        keyBlocks.push(`${sectionName} Q${q}: ${item.correct_answer ?? "N/A"}`);
      }
    }
  }

  return {
    questionContent: questionBlocks.join("\n\n"),
    keyContent: keyBlocks.join("\n"),
  };
}
