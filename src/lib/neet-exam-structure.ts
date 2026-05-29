/** Official NEET (UG) exam template — duration, structure, marking, and instructions. */

export const NEET_EXAM_DURATION_HOURS = 3;
export const NEET_EXAM_DURATION_MINUTES = 180;
export const NEET_TOTAL_QUESTIONS = 180;
export const NEET_QUESTIONS_PER_SUBJECT = 45;
export const NEET_MAX_MARKS = 720;
export const NEET_MARKS_CORRECT = 4;
export const NEET_MARKS_WRONG = -1;
export const NEET_SUBJECTS = ["Physics", "Chemistry", "Botany", "Zoology"] as const;

export const NEET_INSTRUCTIONS_TITLE = "Read the instructions carefully.";

/** Numbered instruction points as printed on the official NEET test booklet. */
export const NEET_INSTRUCTION_LINES = [
  "The test is of 3 hours duration and the Test Booklet contains 180 multiple choice questions (four options with a single correct answer) from Physics, Chemistry, Botany and Zoology. 45 questions in each subject as per details given below:",
  "Each question carries 4 marks. For each correct response, the candidate will get 4 marks. For each incorrect response, 1 mark will be deducted from the total scores. The maximum marks are 720.",
  "Use Blue / Black Ball point Pen only for writing particulars on this page / marking responses on Answer Sheet.",
  "Rough work is to be done in the space provided for this purpose in the Test Booklet only.",
  "On completion of the test, the candidate must handover the Answer Sheet to the Invigilator before leaving the Room. The candidates are allowed to take away this Test Booklet with them.",
  "The candidates should ensure that the Answer Sheet is not folded. Do not make any stray marks on the Answer Sheet. Do not write your Roll No. anywhere else except in the specified space in the Test Booklet/Answer Sheet. Use of white fluid for correction is NOT permissible on the Answer Sheet.",
  "Each candidate must show on-demand his/her Admit Card to the Invigilator.",
  "No candidate, without special permission of the Centre Superintendent or Invigilator, would leave his/her seat.",
  "Use of Electronic/Manual Calculator is prohibited.",
  "All cases of unfair means will be dealt with as per Rules and Regulations of this examination.",
  "Things not allowed in Exam hall : Blank Paper, clipboard, log table, slide rule, calculator, camera, mobile and any electronic or electrical gadget. If you are carrying any of these, then keep them at a place specified by invigilator at your own responsibility.",
] as const;

export function formatNeetInstructionsPlain(): string {
  return [
    NEET_INSTRUCTIONS_TITLE,
    "",
    ...NEET_INSTRUCTION_LINES.map((line, index) => `${index + 1}. ${line}`),
  ].join("\n");
}

/** Blueprint / AI compose helper lines derived from the official template. */
export function neetBlueprintInstructionLines(): string[] {
  return [
    NEET_INSTRUCTIONS_TITLE,
    ...NEET_INSTRUCTION_LINES,
  ];
}
