import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ subject: string; exam_type: string | null; total: number; null_difficulty: number }>
  >(
    `
      SELECT
        subject,
        exam_type,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE difficulty IS NULL)::int AS null_difficulty
      FROM question_bank
      GROUP BY subject, exam_type
      ORDER BY subject, exam_type
    `
  );

  const sample = await prisma.$queryRawUnsafe<
    Array<{ id: number; subject: string; exam_type: string | null; chapter: string | null; tags: string; question_text: string }>
  >(
    `
      SELECT
        id::int,
        subject,
        exam_type,
        chapter,
        tags::text AS tags,
        LEFT(question_text, 220) AS question_text
      FROM question_bank
      WHERE difficulty IS NULL
      ORDER BY id DESC
      LIMIT 12
    `
  );

  const byDifficulty = await prisma.$queryRawUnsafe<Array<{ difficulty: string | null; cnt: number }>>(
    `
      SELECT difficulty, COUNT(*)::int AS cnt
      FROM question_bank
      GROUP BY difficulty
      ORDER BY cnt DESC
    `
  );

  const invalidDifficultyRows = await prisma.$queryRawUnsafe<
    Array<{ id: number; subject: string; exam_type: string | null; difficulty: string | null; question_text: string }>
  >(
    `
      SELECT id::int, subject, exam_type, difficulty, LEFT(question_text, 220) AS question_text
      FROM question_bank
      WHERE difficulty IS NULL
         OR TRIM(COALESCE(difficulty, '')) = ''
         OR LOWER(TRIM(difficulty)) NOT IN ('easy', 'medium', 'hard')
      ORDER BY id DESC
      LIMIT 20
    `
  );

  console.log(JSON.stringify(rows, null, 2));
  console.log("BY_DIFFICULTY");
  console.log(JSON.stringify(byDifficulty, null, 2));
  console.log("SAMPLE");
  console.log(JSON.stringify(sample, null, 2));
  console.log("INVALID_OR_EMPTY_SAMPLE");
  console.log(JSON.stringify(invalidDifficultyRows, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
