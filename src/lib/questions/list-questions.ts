import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionBankRowForApi } from "@/lib/question-bank-display";
import { buildQuestionBankWhereClause, QUESTION_BANK_ORDER_BY } from "./build-where";
import type { ListQuestionsInput, ListQuestionsResult, QuestionDetail, QuestionListItem } from "./types";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

type ListRowDb = {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: string | null;
  preview: string;
  has_options: boolean;
  is_important: boolean;
  is_repeated: boolean;
  repetition_count: number;
};

type FullRowDb = {
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
};

function clampLimit(limit?: number): number {
  const n = limit ?? DEFAULT_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIMIT);
}

function mapListRow(row: ListRowDb): QuestionListItem {
  return {
    id: row.id,
    exam: row.exam,
    subject: row.subject,
    year: row.year,
    chapter: row.chapter,
    difficulty: row.difficulty,
    preview: row.preview,
    has_options: row.has_options,
    is_important: row.is_important,
    is_repeated: row.is_repeated,
    repetition_count: row.repetition_count,
  };
}

export async function listQuestions(input: ListQuestionsInput): Promise<ListQuestionsResult> {
  const limit = clampLimit(input.limit);
  const offset = Math.max(input.offset ?? 0, 0);
  const whereClause = buildQuestionBankWhereClause(input);

  if (input.fullRows) {
    const rows = await prisma.$queryRaw<FullRowDb[]>(
      Prisma.sql`
        SELECT
          id::int AS id, exam, subject, year, chapter, question_text, options, correct_answer,
          source_name, source_url, difficulty, tags, repetition_count, is_repeated, is_important
        FROM question_bank
        ${whereClause}
        ${QUESTION_BANK_ORDER_BY}
        LIMIT ${limit}
        OFFSET ${offset}
      `
    );
    const questions = rows.map((row) => normalizeQuestionBankRowForApi(row)) as QuestionDetail[];
    let total: number | null = null;
    if (input.includeTotal) {
      const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM question_bank ${whereClause}`
      );
      total = Number(count);
    }
    return {
      questions,
      total,
      limit,
      offset,
      hasMore: total != null ? offset + questions.length < total : questions.length === limit,
    };
  }

  const rows = await prisma.$queryRaw<ListRowDb[]>(
    Prisma.sql`
      SELECT
        id::int AS id,
        exam,
        subject,
        year,
        chapter,
        difficulty,
        COALESCE(question_text_preview, left(question_text, 280)) AS preview,
        (
          CASE
            WHEN jsonb_typeof(COALESCE(options, '[]'::jsonb)) = 'array'
              THEN jsonb_array_length(COALESCE(options, '[]'::jsonb)) > 0
            ELSE false
          END
        ) AS has_options,
        is_important,
        is_repeated,
        repetition_count
      FROM question_bank
      ${whereClause}
      ${QUESTION_BANK_ORDER_BY}
      LIMIT ${limit}
      OFFSET ${offset}
    `
  );

  let total: number | null = null;
  if (input.includeTotal) {
    const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM question_bank ${whereClause}`
    );
    total = Number(count);
  }

  const questions = rows.map(mapListRow);

  return {
    questions,
    total,
    limit,
    offset,
    hasMore: total != null ? offset + questions.length < total : questions.length === limit,
  };
}
