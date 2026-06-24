import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionBankRowForApi } from "@/lib/question-bank-display";
import { sqlQuestionBankFrom } from "@/lib/question-bank-table";
import {
  buildFilteredQuestionBankExportCsv,
  type QuestionBankExportRow,
} from "@/lib/question-bank-csv";
import { buildQuestionBankWhereClause, QUESTION_BANK_ORDER_BY } from "./build-where";
import type { QuestionBankFilters } from "./types";

const EXPORT_BATCH = 500;

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

async function fetchExportBatch(
  filters: QuestionBankFilters,
  offset: number
): Promise<FullRowDb[]> {
  const whereClause = buildQuestionBankWhereClause(filters);
  const fromClause = sqlQuestionBankFrom(filters.exam, filters.subject);
  return prisma.$queryRaw<FullRowDb[]>(
    Prisma.sql`
      SELECT
        id::int AS id, exam, subject, year, chapter, question_text, options, correct_answer,
        source_name, source_url, difficulty, tags, repetition_count, is_repeated, is_important
      ${fromClause}
      ${whereClause}
      ${QUESTION_BANK_ORDER_BY}
      LIMIT ${EXPORT_BATCH}
      OFFSET ${offset}
    `
  );
}

export async function exportQuestionsCsv(filters: QuestionBankFilters): Promise<string> {
  const exportRows: QuestionBankExportRow[] = [];
  let offset = 0;

  for (;;) {
    const batch = await fetchExportBatch(filters, offset);
    if (batch.length === 0) break;

    for (const row of batch) {
      const q = normalizeQuestionBankRowForApi(row);
      const opts = q.options ?? [];
      exportRows.push({
        id: q.id,
        exam: q.exam ?? filters.exam,
        subject: q.subject,
        question_text: q.question_text,
        options: opts.length > 0 ? opts : q.options,
        correct_answer: q.correct_answer,
        chapter: q.chapter,
        difficulty: q.difficulty,
        year: q.year,
        tags: q.tags,
        source_name: q.source_name,
        source_url: q.source_url,
        is_important: q.is_important,
        is_repeated: q.is_repeated,
        repetition_count: q.repetition_count,
      });
    }

    offset += batch.length;
    if (batch.length < EXPORT_BATCH) break;
  }

  return buildFilteredQuestionBankExportCsv(exportRows);
}

export async function exportQuestionsForPdf(filters: QuestionBankFilters): Promise<QuestionBankExportRow[]> {
  const exportRows: QuestionBankExportRow[] = [];
  let offset = 0;

  for (;;) {
    const batch = await fetchExportBatch(filters, offset);
    if (batch.length === 0) break;

    for (const row of batch) {
      const q = normalizeQuestionBankRowForApi(row);
      const opts = q.options ?? [];
      exportRows.push({
        id: q.id,
        exam: q.exam ?? filters.exam,
        subject: q.subject,
        question_text: q.question_text,
        options: opts.length > 0 ? opts : q.options,
        correct_answer: q.correct_answer,
        chapter: q.chapter,
        difficulty: q.difficulty,
        year: q.year,
        tags: q.tags,
        source_name: q.source_name,
        source_url: q.source_url,
        is_important: q.is_important,
        is_repeated: q.is_repeated,
        repetition_count: q.repetition_count,
      });
    }

    offset += batch.length;
    if (batch.length < EXPORT_BATCH) break;
  }

  return exportRows;
}
