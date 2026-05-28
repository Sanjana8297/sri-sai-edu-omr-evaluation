export const JEE_ADVANCE_EXAM_DURATION_HOURS = 3;
export const JEE_ADVANCE_QUESTIONS_PER_SUBJECT = 18;

/** Fixed marks per question type (Section I / II / III). */
export const JEE_ADVANCE_SECTION_MARKS = {
  section1: {
    key: "section1" as const,
    label: "Section I",
    subtitle: "(Single Correct Options Type)",
    correct: 3,
    wrong: -1,
  },
  section2: {
    key: "section2" as const,
    label: "Section II",
    subtitle: "(One or More Correct Options Type)",
    correct: 4,
    wrong: -2,
    partialNote: "+1 for each correct option (partial marking)",
  },
  section3: {
    key: "section3" as const,
    label: "Section III",
    subtitle: "(Numerical Value Type)",
    correct: 4,
    wrong: 0,
  },
} as const;

export type JeeAdvanceSectionKey = "section1" | "section2" | "section3";

export type JeeAdvanceSectionCounts = Record<JeeAdvanceSectionKey, number>;

export type JeeAdvanceSubjectConfig = {
  subject: string;
  sectionCounts: JeeAdvanceSectionCounts;
};

export const JEE_ADVANCE_DEFAULT_SUBJECTS: JeeAdvanceSubjectConfig[] = [
  { subject: "Mathematics", sectionCounts: { section1: 6, section2: 6, section3: 6 } },
  { subject: "Physics", sectionCounts: { section1: 6, section2: 6, section3: 6 } },
  { subject: "Chemistry", sectionCounts: { section1: 6, section2: 6, section3: 6 } },
];

export function sectionMarksFromCounts(counts: JeeAdvanceSectionCounts): {
  section1: number;
  section2: number;
  section3: number;
  total: number;
} {
  const s1 = counts.section1 * JEE_ADVANCE_SECTION_MARKS.section1.correct;
  const s2 = counts.section2 * JEE_ADVANCE_SECTION_MARKS.section2.correct;
  const s3 = counts.section3 * JEE_ADVANCE_SECTION_MARKS.section3.correct;
  return {
    section1: s1,
    section2: s2,
    section3: s3,
    total: s1 + s2 + s3,
  };
}

export function totalExamMarksFromSubjects(subjects: JeeAdvanceSubjectConfig[]): number {
  return subjects.reduce((sum, s) => sum + sectionMarksFromCounts(s.sectionCounts).total, 0);
}

export function validateSubjectSectionCounts(counts: JeeAdvanceSectionCounts): string | null {
  const total =
    counts.section1 + counts.section2 + counts.section3;
  if (total !== JEE_ADVANCE_QUESTIONS_PER_SUBJECT) {
    return `Section question counts must add up to ${JEE_ADVANCE_QUESTIONS_PER_SUBJECT} (currently ${total}).`;
  }
  if (counts.section1 < 0 || counts.section2 < 0 || counts.section3 < 0) {
    return "Each section must have at least 0 questions.";
  }
  return null;
}

export function normalizeSubjectCounts(
  counts: Partial<JeeAdvanceSectionCounts>
): JeeAdvanceSectionCounts {
  let s1 = Math.max(0, Math.floor(Number(counts.section1) || 0));
  let s2 = Math.max(0, Math.floor(Number(counts.section2) || 0));
  let s3 = Math.max(0, Math.floor(Number(counts.section3) || 0));
  let remaining = JEE_ADVANCE_QUESTIONS_PER_SUBJECT - (s1 + s2 + s3);
  if (remaining > 0) s3 += remaining;
  else if (remaining < 0) {
    while (remaining < 0 && s3 > 0) {
      s3 -= 1;
      remaining += 1;
    }
    while (remaining < 0 && s2 > 0) {
      s2 -= 1;
      remaining += 1;
    }
    while (remaining < 0 && s1 > 0) {
      s1 -= 1;
      remaining += 1;
    }
  }
  return { section1: s1, section2: s2, section3: s3 };
}

export function buildDefaultAdvanceSubjects(): JeeAdvanceSubjectConfig[] {
  return JEE_ADVANCE_DEFAULT_SUBJECTS.map((s) => ({ ...s }));
}
