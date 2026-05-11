import "dotenv/config";
import { PrismaClient } from "@prisma/client";

type Difficulty = "easy" | "medium" | "hard";

type QuestionRow = {
  id: number;
  subject: string;
  exam_type: string | null;
  chapter: string | null;
  tags_text: string | null;
  question_text: string;
  options_count: number;
  correct_answer: string | null;
};

const prisma = new PrismaClient();

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function scoreComplexity(row: QuestionRow): number {
  const examType = normalize(row.exam_type);
  const chapter = normalize(row.chapter);
  const tags = normalize(row.tags_text);
  const question = normalize(row.question_text);
  const answer = normalize(row.correct_answer);

  let score = 0;

  // Explicit exam pattern signal
  if (examType === "advanced") score += 2;

  // Question structure / format signals
  if (row.options_count === 0) score += 1; // integer/numerical style often no options
  if (answer.length > 1 && /^[a-d]+$/i.test(answer)) score += 2; // multiple-correct
  if (tags.includes("mcq(multiple)") || tags.includes("multiple")) score += 2;
  if (tags.includes("integer") || question.includes("integer")) score += 2;
  if (tags.includes("matrix") || question.includes("matrix match")) score += 2;
  if (question.includes("assertion") && question.includes("reason")) score += 2;
  if (question.includes("comprehension") || question.includes("paragraph")) score += 1;

  // Conceptual / computational complexity markers (not based on length)
  const complexPhrases = [
    "prove",
    "derive",
    "evaluate",
    "find all",
    "maximum",
    "minimum",
    "least value",
    "determinant",
    "differential equation",
    "probability",
    "electrochemical",
    "thermodynamic",
    "electrostatic",
    "rotation",
    "vector",
    "stoichiometric",
    "equilibrium",
  ];
  const hits = complexPhrases.reduce((acc, token) => (question.includes(token) || chapter.includes(token) ? acc + 1 : acc), 0);
  if (hits >= 2) score += 1;
  if (hits >= 4) score += 1;

  // Symbol density as complexity proxy (formula-heavy reasoning), independent of length
  const symbolHits =
    (question.match(/\\frac|\\sqrt|\\int|\\sum|\\lim|\\log|\\sin|\\cos|\\tan|\\vec|\\alpha|\\beta|\\gamma/g) ?? [])
      .length;
  if (symbolHits >= 3) score += 1;
  if (symbolHits >= 7) score += 1;

  return score;
}

function difficultyFromScore(score: number): Difficulty {
  if (score >= 5) return "hard";
  if (score >= 3) return "medium";
  return "easy";
}

async function main() {
  const rows = await prisma.$queryRawUnsafe<QuestionRow[]>(
    `
      SELECT
        id::int,
        subject,
        exam_type,
        chapter,
        tags::text AS tags_text,
        question_text,
        CASE
          WHEN jsonb_typeof(options) = 'array' THEN jsonb_array_length(options)
          ELSE 0
        END::int AS options_count,
        correct_answer
      FROM question_bank
      WHERE subject IN ('Maths', 'Physics', 'Chemistry', 'Botany', 'Zoology')
    `
  );

  let updated = 0;
  for (const row of rows) {
    const difficulty = difficultyFromScore(scoreComplexity(row));
    await prisma.$executeRawUnsafe(`UPDATE question_bank SET difficulty = $1 WHERE id = $2`, difficulty, row.id);
    updated += 1;
  }

  const summary = await prisma.$queryRawUnsafe<
    Array<{ subject: string; exam_type: string | null; difficulty: string | null; cnt: number }>
  >(
    `
      SELECT subject, exam_type, difficulty, COUNT(*)::int AS cnt
      FROM question_bank
      GROUP BY subject, exam_type, difficulty
      ORDER BY subject, exam_type, difficulty
    `
  );

  console.log(`Reclassified ${updated} questions using complexity-based difficulty.`);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
