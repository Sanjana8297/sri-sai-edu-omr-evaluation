import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { contentHashLookupKeys, hashText, sqlContentHashInClause } from "@/lib/question-bank-content-hash";
import { insertQuestionBankRow } from "@/lib/question-bank-insert";
import { sqlHashLookupFrom } from "@/lib/question-bank-table";

export type FlexibleTeacherQuestionInput = {
  subject: string;
  questionText: string;
  options: string[];
  correctAnswer: string | null;
  chapter: string | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  year: number | null;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
};

export type FlexibleTeacherQuestionResult =
  | { ok: true; id: number; alreadyExisted: boolean }
  | { ok: false; error: string; status: number };

export async function insertFlexibleTeacherQuestionRow(
  prisma: PrismaClient,
  examCategory: "JEE" | "NEET",
  input: FlexibleTeacherQuestionInput
): Promise<FlexibleTeacherQuestionResult> {
  const subject = input.subject.trim();
  const questionText = input.questionText.trim();
  if (!subject || !questionText) {
    return { ok: false, error: "subject and questionText are required", status: 400 };
  }
  if (questionText.length > 50_000) {
    return { ok: false, error: "questionText is too long", status: 400 };
  }

  const options = input.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 20);
  for (const o of options) {
    if (o.length > 8000) {
      return { ok: false, error: "An option is too long", status: 400 };
    }
  }

  const correctRaw = input.correctAnswer?.trim() ?? "";
  if (correctRaw.length > 2000) {
    return { ok: false, error: "correctAnswer is too long", status: 400 };
  }
  let correctAnswer: string | null = correctRaw.length > 0 ? correctRaw : null;
  if (correctAnswer && options.length === 4 && /^[a-d]$/i.test(correctAnswer)) {
    correctAnswer = correctAnswer.toUpperCase();
  }

  const chapter = input.chapter?.trim() || null;
  const difficulty = input.difficulty ?? null;
  const year = input.year;
  const tags = input.tags.length > 0 ? input.tags : ["teacher-added", "manual-builder-custom"];
  const sourceName = input.sourceName.trim() || "Teacher Added";
  const sourceUrl = input.sourceUrl.trim() || "manual-builder";

  if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) {
    return { ok: false, error: "difficulty must be easy/medium/hard", status: 400 };
  }

  const contentHash = hashText(questionText);
  const scopedHash = `${subject}:${contentHash}`;
  const exam = examCategory === "JEE" ? "JEE" : "NEET";
  const hashKeys = contentHashLookupKeys(exam, subject, questionText);
  const fromClause = sqlHashLookupFrom(subject);

  const preexisting = await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      SELECT id::int AS id ${fromClause}
      WHERE exam = ${examCategory} AND ${sqlContentHashInClause(hashKeys)}
      ORDER BY id DESC
      LIMIT 1
    `
  );
  if (preexisting[0]?.id != null) {
    return { ok: true, id: preexisting[0].id, alreadyExisted: true };
  }

  const { id, inserted } = await insertQuestionBankRow(prisma, {
    exam: examCategory,
    subject,
    year,
    chapter,
    difficulty: difficulty ?? null,
    questionText,
    optionsJson: JSON.stringify(options),
    correctAnswer,
    sourceName,
    sourceUrl,
    tagsJson: JSON.stringify(tags),
    contentHash: scopedHash,
  });

  if (inserted && id != null) {
    return { ok: true, id, alreadyExisted: false };
  }

  const existing = await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      SELECT id::int AS id ${fromClause}
      WHERE exam = ${examCategory} AND ${sqlContentHashInClause(hashKeys)}
      ORDER BY id DESC
      LIMIT 1
    `
  );
  const existingId = existing[0]?.id;
  if (existingId == null) {
    return { ok: false, error: "Could not save or locate this question in the bank", status: 500 };
  }
  return { ok: true, id: existingId, alreadyExisted: true };
}
