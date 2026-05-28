import { Prisma } from "@prisma/client";
import type { QuestionBankFilters } from "./types";

/** SQL: option array length when options is a JSON array, else 0. */
const optionsArrayLenSql = Prisma.sql`
  CASE
    WHEN jsonb_typeof(COALESCE(options, '[]'::jsonb)) = 'array'
      THEN jsonb_array_length(COALESCE(options, '[]'::jsonb))
    ELSE 0
  END
`;

function sqlQuestionTypeMcq(): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem
      WHERE lower(elem) IN ('mcq', 'multiple choice', 'multiple_choice', 'objective')
    )
    OR (
      (${optionsArrayLenSql}) >= 4
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem2
        WHERE lower(elem2) IN (
          'numerical', 'numeric', 'integer', 'integer type', 'numerical answer',
          'numerical value', 'numericals'
        )
      )
    )
  )`;
}

function sqlQuestionTypeNumerical(): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem
      WHERE lower(elem) IN (
        'numerical', 'numeric', 'integer', 'integer type', 'numerical answer',
        'numerical value', 'numericals'
      )
    )
    OR (
      (${optionsArrayLenSql}) < 4
      AND (
        question_text ILIKE '%____%'
        OR question_text ~* '(integer type|numerical value|fill in the blank|fill in blank)'
      )
    )
  )`;
}

/** Full-text search when search_vector column exists; falls back to ILIKE. */
function sqlSearchCondition(search: string): Prisma.Sql {
  const trimmed = search.trim();
  if (trimmed.length < 2) {
    return Prisma.sql`question_text ILIKE ${`%${trimmed}%`}`;
  }
  return Prisma.sql`(
    search_vector @@ websearch_to_tsquery('english', ${trimmed})
    OR question_text ILIKE ${`%${trimmed}%`}
  )`;
}

export function buildQuestionBankWhereClause(filters: QuestionBankFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`exam = ${filters.exam}`];

  if (filters.subject) conditions.push(Prisma.sql`subject = ${filters.subject}`);
  if (filters.chapter) conditions.push(Prisma.sql`chapter ILIKE ${`%${filters.chapter}%`}`);
  if (filters.difficulty) conditions.push(Prisma.sql`difficulty = ${filters.difficulty}`);
  if (filters.search) conditions.push(sqlSearchCondition(filters.search));
  if (filters.year != null && !Number.isNaN(filters.year)) {
    conditions.push(Prisma.sql`year = ${filters.year}`);
  }
  if (filters.important !== undefined) conditions.push(Prisma.sql`is_important = ${filters.important}`);
  if (filters.repeated !== undefined) conditions.push(Prisma.sql`is_repeated = ${filters.repeated}`);
  if (filters.jeeExamType === "mains") conditions.push(Prisma.sql`exam_type = 'mains'`);
  if (filters.jeeExamType === "advanced") conditions.push(Prisma.sql`exam_type = 'advanced'`);
  if (filters.questionType === "mcq") conditions.push(sqlQuestionTypeMcq());
  if (filters.questionType === "numerical") conditions.push(sqlQuestionTypeNumerical());

  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

export const QUESTION_BANK_ORDER_BY = Prisma.sql`
  ORDER BY is_important DESC, repetition_count DESC, id DESC
`;
