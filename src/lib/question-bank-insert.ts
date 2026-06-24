import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { insertTableForSubject, sqlTableRef } from "@/lib/question-bank-table";

export type QuestionBankInsertValues = {
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: string | null;
  questionText: string;
  optionsJson: string;
  correctAnswer: string | null;
  sourceName: string;
  sourceUrl: string;
  tagsJson: string;
  contentHash: string;
};

/**
 * Insert into the routed subject table (physics, chemistry, maths, zoology, botany).
 */
export async function insertQuestionBankRow(
  prisma: PrismaClient,
  v: QuestionBankInsertValues
): Promise<{ id: number | null; inserted: boolean }> {
  const table = insertTableForSubject(v.subject);
  const inserted = await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      INSERT INTO ${sqlTableRef(table)}
      (
        exam, subject, year, chapter, difficulty, question_text, options, correct_answer,
        source_name, source_url, tags, content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        ${v.exam}, ${v.subject}, ${v.year}, ${v.chapter}, ${v.difficulty}, ${v.questionText},
        ${v.optionsJson}::jsonb, ${v.correctAnswer}, ${v.sourceName}, ${v.sourceUrl},
        ${v.tagsJson}::jsonb, ${v.contentHash}, 1, false, true, NOW()
      )
      ON CONFLICT (content_hash) DO NOTHING
      RETURNING id::int AS id
    `
  );
  const id = inserted[0]?.id ?? null;
  return { id, inserted: id != null };
}
