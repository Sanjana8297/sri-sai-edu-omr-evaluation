/** Subject → Postgres table name for ops scripts (no Prisma import). */

const SUBJECT_TO_TABLE: Record<string, string> = {
  physics: "physics",
  chemistry: "chemistry",
  maths: "maths",
  mathematics: "maths",
  zoology: "zoology",
  botany: "botany",
};

export const ALL_QUESTION_SUBJECT_TABLES = [
  "physics",
  "chemistry",
  "maths",
  "zoology",
  "botany",
] as const;

export function tableForSubject(subject: string): string {
  const key = subject.trim().toLowerCase();
  const table = SUBJECT_TO_TABLE[key];
  if (!table) {
    throw new Error(`Unknown subject for question bank table: ${subject}`);
  }
  return table;
}

/** UNION ALL subquery alias `qb` over all subject tables (optional column list). */
export function unionAllSubjectsSql(columns = "*"): string {
  return ALL_QUESTION_SUBJECT_TABLES.map((t) => `SELECT ${columns} FROM ${t}`).join(" UNION ALL ");
}
