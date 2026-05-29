/** Official JEE Main exam template — duration, structure, marking, and instructions. */

export const JEE_MAINS_EXAM_DURATION_HOURS = 3;
export const JEE_MAINS_EXAM_DURATION_MINUTES = 180;
export const JEE_MAINS_TOTAL_QUESTIONS = 75;
export const JEE_MAINS_QUESTIONS_PER_SUBJECT = 25;
export const JEE_MAINS_SECTION1_MCQ_COUNT = 20;
export const JEE_MAINS_SECTION2_NUMERICAL_COUNT = 5;
export const JEE_MAINS_MAX_MARKS = 300;
export const JEE_MAINS_MARKS_CORRECT = 4;
export const JEE_MAINS_MARKS_WRONG = -1;
export const JEE_MAINS_SUBJECTS = ["Mathematics", "Physics", "Chemistry"] as const;

export const JEE_MAINS_INSTRUCTIONS_TITLE = "IMPORTANT INSTRUCTIONS";

/** Numbered instruction points as printed on the official JEE Main test booklet. */
export const JEE_MAINS_INSTRUCTION_LINES = [
  "Immediately fill in the Admission number on this page of the Test Booklet with Blue/Black Ball Point Pen only.",
  "The candidates should not write their Admission Number anywhere (except in the specified space) on the Test Booklet / Answer Sheet.",
  "The test is of 3 hours duration.",
  "The Test Booklet consists of 75 Questions. The maximum marks are 300.",
  "There are three parts in the question paper 1, 2, 3 consisting of Mathematics, Physics and Chemistry having 25 Questions in each subject and subject having two sections:",
] as const;

export const JEE_MAINS_SECTION_INSTRUCTIONS = [
  {
    label: "(I) Section - I",
    lines: [
      "Contains 20 Multiple Choice Questions with only one correct option.",
      "+4 for correct answer, 0 if not attempted and -1 in all other cases.",
    ],
  },
  {
    label: "(II) Section - II",
    lines: [
      "Contains 05 Numerical Value Type Questions. The Answer should be within 0 to 9999.",
      "If the Answer is in Decimal then round off to the Nearest Integer value (If answer is above 10 and less than 10.5 round off is 10; if answer is from 10.5 and less than 11 round off is 11).",
      "To cancel any attempted question bubble on the question number box. (For example: To cancel attempted Question 21, bubble on 21.)",
    ],
  },
] as const;

export function formatJeeMainsInstructionsPlain(): string {
  const sectionText = JEE_MAINS_SECTION_INSTRUCTIONS.map(
    (section) =>
      `${section.label}\n${section.lines.map((line) => `  ${line}`).join("\n")}`
  ).join("\n");

  return [
    JEE_MAINS_INSTRUCTIONS_TITLE,
    "",
    ...JEE_MAINS_INSTRUCTION_LINES.map((line, index) => `${index + 1}. ${line}`),
    sectionText,
  ].join("\n");
}

/** Blueprint / AI compose helper lines derived from the official template. */
export function jeeMainsBlueprintInstructionLines(): string[] {
  return [
    JEE_MAINS_INSTRUCTIONS_TITLE,
    ...JEE_MAINS_INSTRUCTION_LINES,
    ...JEE_MAINS_SECTION_INSTRUCTIONS.flatMap((section) => [
      section.label,
      ...section.lines,
    ]),
  ];
}

/** Detect JEE Advance papers so JEE Main instructions are not shown for them. */
export function isJeeAdvancePaperContent(content: string): boolean {
  if (/JEE Advance structure:/i.test(content)) return true;
  const hasAllSections =
    /Section\s*I\b/i.test(content) &&
    /Section\s*II\b/i.test(content) &&
    /Section\s*III\b/i.test(content);
  return hasAllSections && /Mathematics/i.test(content) && /Physics/i.test(content);
}
