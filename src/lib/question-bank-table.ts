import { Prisma } from "@prisma/client";
import { SUBJECTS_BY_TRACK, type TeacherTrack } from "@/lib/dashboard-nav";

export const QUESTION_BANK_TABLES = [
  "physics",
  "chemistry",
  "maths",
  "zoology",
  "botany",
] as const;

export type QuestionBankTableName = (typeof QUESTION_BANK_TABLES)[number];

const SUBJECT_TO_TABLE: Record<string, QuestionBankTableName> = {
  physics: "physics",
  chemistry: "chemistry",
  maths: "maths",
  mathematics: "maths",
  zoology: "zoology",
  botany: "botany",
};

const TABLE_SET = new Set<string>(QUESTION_BANK_TABLES);

export function resolveQuestionBankTable(subject: string): QuestionBankTableName {
  const key = subject.trim().toLowerCase();
  const table = SUBJECT_TO_TABLE[key];
  if (!table) {
    throw new Error(`Unknown subject: ${subject}`);
  }
  return table;
}

export function tablesForTrack(exam: string, subject?: string): QuestionBankTableName[] {
  if (subject?.trim()) {
    return [resolveQuestionBankTable(subject)];
  }
  const track: TeacherTrack = exam === "NEET" ? "NEET" : "JEE";
  return SUBJECTS_BY_TRACK[track].map((s) => resolveQuestionBankTable(s));
}

export function sqlTableRef(table: QuestionBankTableName): Prisma.Sql {
  if (!TABLE_SET.has(table)) {
    throw new Error(`Invalid question bank table: ${table}`);
  }
  return Prisma.raw(table);
}

export function sqlQuestionBankFrom(exam: string, subject?: string): Prisma.Sql {
  const tables = tablesForTrack(exam, subject);
  if (tables.length === 1) {
    return Prisma.sql`FROM ${sqlTableRef(tables[0])}`;
  }

  const branches = tables.map(
    (table) => Prisma.sql`(SELECT * FROM ${sqlTableRef(table)})`
  );
  return Prisma.sql`FROM (${Prisma.join(branches, " UNION ALL ")}) AS qb`;
}

export function sqlQuestionBankFromForIdLookup(exam: string): Prisma.Sql {
  const tables = tablesForTrack(exam);
  const branches = tables.map(
    (table) =>
      Prisma.sql`(SELECT id, exam, subject, year, chapter, question_text, options, correct_answer, source_name, source_url, difficulty, tags, repetition_count, is_repeated, is_important FROM ${sqlTableRef(table)})`
  );
  return Prisma.sql`FROM (${Prisma.join(branches, " UNION ALL ")}) AS qb`;
}

export function insertTableForSubject(subject: string): QuestionBankTableName {
  return resolveQuestionBankTable(subject);
}

export function sqlHashLookupFrom(subject: string): Prisma.Sql {
  return Prisma.sql`FROM ${sqlTableRef(insertTableForSubject(subject))}`;
}
