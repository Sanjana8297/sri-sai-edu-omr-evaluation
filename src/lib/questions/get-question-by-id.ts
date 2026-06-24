import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionBankRowForApi } from "@/lib/question-bank-display";
import { sqlQuestionBankFromForIdLookup } from "@/lib/question-bank-table";
import type { QuestionDetail } from "./types";

export async function getQuestionById(
  id: number,
  exam: string
): Promise<QuestionDetail | null> {
  const fromClause = sqlQuestionBankFromForIdLookup(exam);
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      exam: string;
      subject: string;
      year: number | null;
      chapter: string | null;
      question_text: string;
      options: unknown;
      correct_answer: string | null;
      source_name: string;
      source_url: string;
      difficulty: string | null;
      tags: unknown;
      repetition_count: number;
      is_repeated: boolean;
      is_important: boolean;
    }>
  >(
    Prisma.sql`
      SELECT
        id::int AS id, exam, subject, year, chapter, question_text, options, correct_answer,
        source_name, source_url, difficulty, tags, repetition_count, is_repeated, is_important
      ${fromClause}
      WHERE id = ${id} AND exam = ${exam}
      LIMIT 1
    `
  );

  const row = rows[0];
  if (!row) return null;
  return normalizeQuestionBankRowForApi(row) as QuestionDetail;
}
