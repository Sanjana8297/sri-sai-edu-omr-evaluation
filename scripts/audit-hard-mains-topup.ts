import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ subject: string; cnt: number }>>(
    `
      SELECT subject, COUNT(*)::int AS cnt
      FROM (
        SELECT subject, exam, exam_type, difficulty, source_name FROM maths
        UNION ALL SELECT subject, exam, exam_type, difficulty, source_name FROM physics
        UNION ALL SELECT subject, exam, exam_type, difficulty, source_name FROM chemistry
      ) qb
      WHERE exam = 'JEE'
        AND exam_type = 'mains'
        AND difficulty = 'hard'
        AND source_name = 'AI generated JEE mains hard top-up'
      GROUP BY subject
      ORDER BY subject
    `
  );
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
