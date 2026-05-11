import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

type Subject = "Maths" | "Physics" | "Chemistry";
type GeneratedQuestion = {
  question_text: string;
  options: string[];
  correct_answer: "A" | "B" | "C" | "D";
  chapter: string | null;
  source_url: string | null;
};

const prisma = new PrismaClient();
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const TARGET_PER_SUBJECT = 100;
const BATCH_SIZE = 10;

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\\[a-z]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(input: string): string {
  return createHash("sha256").update(normalizeText(input)).digest("hex");
}

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is required for hard mains top-up generation.");
  }
  return key;
}

async function generateBatch(subject: Subject, count: number): Promise<GeneratedQuestion[]> {
  const apiKey = getOpenAiApiKey();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question_text", "options", "correct_answer", "chapter", "source_url"],
          properties: {
            question_text: { type: "string" },
            options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
            correct_answer: { type: "string", enum: ["A", "B", "C", "D"] },
            chapter: { type: ["string", "null"] },
            source_url: { type: ["string", "null"] },
          },
        },
      },
    },
  };

  const prompt = `
Generate exactly ${count} unique JEE Main ${subject} MCQ questions.
Constraints:
- Difficulty must be hard.
- Each question must have exactly 4 options and one correct answer (A/B/C/D).
- Questions should be exam-style, calculation/concept heavy, and not trivially guessable.
- Avoid repeating common textbook one-liners.
- Keep question text clean and readable.
- Include a chapter if identifiable.
- Include source_url only if genuinely known, else null.
Return strict JSON only.
`;

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: { name: "jee_mains_hard_topup", strict: true, schema },
      },
      messages: [
        { role: "system", content: "You generate high-quality JEE Main hard MCQs. Return strict JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(`OpenAI generation failed (${response.status}): ${msg}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI generation returned empty content.");
  const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };
  return parsed.questions ?? [];
}

async function insertQuestion(subject: Subject, q: GeneratedQuestion): Promise<boolean> {
  const questionText = q.question_text.trim();
  if (!questionText) return false;
  const contentHash = `${subject}:mains:${hashText(questionText)}`;

  const options =
    Array.isArray(q.options) && q.options.length === 4
      ? q.options.map((x) => x.trim()).filter(Boolean).slice(0, 4)
      : [];
  if (options.length !== 4) return false;

  const correct = q.correct_answer?.trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(correct)) return false;

  const res = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `
      INSERT INTO question_bank (
        exam, exam_type, subject, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
        content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        $1, $2, $3, NULL, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12, 1, false, true, NOW()
      )
      ON CONFLICT (content_hash) DO NOTHING
      RETURNING id::int AS id
    `,
    "JEE",
    "mains",
    subject,
    q.chapter?.trim() || null,
    "hard",
    questionText,
    JSON.stringify(options),
    correct,
    "AI generated JEE mains hard top-up",
    q.source_url?.trim() || "ai://openai",
    JSON.stringify(["jee", "mains", "hard", "ai-generated", "topup"]),
    contentHash
  );

  return res.length > 0;
}

async function main() {
  const subjects: Subject[] = ["Maths", "Physics", "Chemistry"];
  const addedBySubject: Record<Subject, number> = { Maths: 0, Physics: 0, Chemistry: 0 };

  for (const subject of subjects) {
    let attempts = 0;
    while (addedBySubject[subject] < TARGET_PER_SUBJECT && attempts < 40) {
      attempts += 1;
      const needed = TARGET_PER_SUBJECT - addedBySubject[subject];
      const batchCount = Math.min(BATCH_SIZE, needed);
      const generated = await generateBatch(subject, batchCount);
      for (const q of generated) {
        const inserted = await insertQuestion(subject, q);
        if (inserted) addedBySubject[subject] += 1;
        if (addedBySubject[subject] >= TARGET_PER_SUBJECT) break;
      }
      console.log(`[${subject}] added ${addedBySubject[subject]}/${TARGET_PER_SUBJECT} (attempt ${attempts})`);
    }
  }

  const summary = await prisma.$queryRawUnsafe<Array<{ subject: string; cnt: number }>>(
    `
      SELECT subject, COUNT(*)::int AS cnt
      FROM question_bank
      WHERE exam = 'JEE' AND exam_type = 'mains' AND difficulty = 'hard' AND subject IN ('Maths', 'Physics', 'Chemistry')
      GROUP BY subject
      ORDER BY subject
    `
  );

  console.log("Final hard mains counts:");
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
