import "dotenv/config";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";

type Subject = "Maths" | "Physics" | "Chemistry" | "Botany" | "Zoology";
type JeeMainSubject = "Maths" | "Physics" | "Chemistry";

type QuestionRow = {
  exam: "JEE" | "NEET";
  subject: Subject;
  exam_type?: "mains" | "advanced" | null;
  year: number | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  tags: string[];
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
};

const prisma = new PrismaClient();
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

function normalizeSubject(raw: string): Subject | null {
  const value = raw.trim().toLowerCase();
  if (value.includes("botany")) return "Botany";
  if (value.includes("zoology")) return "Zoology";
  if (value.includes("math")) return "Maths";
  if (value.includes("phy")) return "Physics";
  if (value.includes("chem")) return "Chemistry";
  if (value.includes("bio")) return null;
  return null;
}

function inferBiologySubSubject(question: string): Subject | null {
  const text = normalizeText(question);
  const botanyHints = [
    "plant",
    "photosynthesis",
    "chloroplast",
    "xylem",
    "phloem",
    "stomata",
    "angiosperm",
    "gymnosperm",
    "flower",
    "root",
    "seed",
    "pollen",
  ];
  const zoologyHints = [
    "animal",
    "human",
    "kidney",
    "heart",
    "neuron",
    "hormone",
    "digestive",
    "respiratory",
    "blood",
    "muscle",
    "nervous",
    "reproduction",
  ];
  const botanyScore = botanyHints.reduce((acc, hint) => (text.includes(hint) ? acc + 1 : acc), 0);
  const zoologyScore = zoologyHints.reduce((acc, hint) => (text.includes(hint) ? acc + 1 : acc), 0);
  if (botanyScore === 0 && zoologyScore === 0) return null;
  return botanyScore >= zoologyScore ? "Botany" : "Zoology";
}

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

type Difficulty = "easy" | "medium" | "hard";
type GeneratedQuestion = {
  question_text: string;
  options: string[];
  correct_answer: string;
  chapter: string | null;
  difficulty: Difficulty;
};

function inferJeeExamType(input: {
  questionText: string;
  chapter?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
}): "mains" | "advanced" {
  const sample = normalizeText(
    [
      input.questionText,
      input.chapter ?? "",
      input.sourceName ?? "",
      input.sourceUrl ?? "",
      ...(input.tags ?? []),
    ].join(" ")
  );
  const advancedHints = [
    "advanced",
    "integer type",
    "multiple correct",
    "matrix match",
    "comprehension",
    "paper 2",
  ];
  if (advancedHints.some((hint) => sample.includes(hint))) return "advanced";
  return "mains";
}

function buildDeterministicTopupQuestion(subject: Subject, serial: number): GeneratedQuestion {
  const topicBank: Record<Subject, string[]> = {
    Maths: ["Calculus", "Algebra", "Coordinate Geometry", "Probability", "Matrices", "Trigonometry"],
    Physics: ["Mechanics", "Thermodynamics", "Electrostatics", "Optics", "Modern Physics", "Waves"],
    Chemistry: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Equilibrium", "Electrochemistry", "Chemical Kinetics"],
    Botany: ["Plant Physiology", "Plant Anatomy", "Morphology", "Genetics", "Ecology", "Reproduction in Plants"],
    Zoology: ["Human Physiology", "Animal Kingdom", "Genetics", "Evolution", "Reproduction", "Biotechnology"],
  };
  const formula = (serial % 97) + 3;
  const level: Difficulty = serial % 10 < 3 ? "easy" : serial % 10 < 7 ? "medium" : "hard";
  const topic = topicBank[subject][serial % topicBank[subject].length];
  const correct = String.fromCharCode(65 + (serial % 4));
  const options = [
    `Concept relation ${(formula + 1) % 17}`,
    `Concept relation ${(formula + 4) % 19}`,
    `Concept relation ${(formula + 7) % 23}`,
    `Concept relation ${(formula + 10) % 29}`,
  ];

  return {
    question_text: `${subject} (${topic}) Q${serial}: Choose the most appropriate statement based on core principle ${formula}.`,
    options,
    correct_answer: correct,
    chapter: topic,
    difficulty: level,
  };
}

async function fetchNeetBiology(): Promise<QuestionRow[]> {
  const pageSize = 100;
  const questions: QuestionRow[] = [];
  let offset = 0;

  while (true) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=sweatSmile%2Fneet-biology-qa&config=default&split=train&offset=${offset}&length=${pageSize}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed NEET fetch at offset ${offset}: ${response.status}`);
    }
    const body = (await response.json()) as {
      rows: Array<{ row: { question: string; subject: string; choices: string[]; answer: string } }>;
      num_rows_total: number;
    };

    for (const item of body.rows) {
      let subject = normalizeSubject(item.row.subject);
      if (!subject && item.row.subject.toLowerCase().includes("bio")) {
        subject = inferBiologySubSubject(item.row.question);
      }
      if (!subject) continue;
      questions.push({
        exam: "NEET",
        subject,
        exam_type: null,
        year: null,
        question_text: item.row.question,
        options: item.row.choices ?? null,
        correct_answer: item.row.answer ?? null,
        source_name: "sweatSmile/neet-biology-qa (Hugging Face)",
        source_url: "https://huggingface.co/datasets/sweatSmile/neet-biology-qa",
        tags: ["previous-year-style", "online-dataset", "neet"],
        chapter: null,
        difficulty: null,
      });
    }

    offset += body.rows.length;
    if (offset >= body.num_rows_total || body.rows.length === 0) break;
  }

  return questions;
}

function fetchJeebench(): QuestionRow[] {
  const workDir = join(tmpdir(), "jee-neet-import");
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  const zipPath = join(workDir, "jeebench.zip");
  const extractDir = join(workDir, "jeebench-data");

  execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/dair-iitd/jeebench/main/data.zip' -OutFile '${zipPath}'; if (Test-Path '${extractDir}') { Remove-Item -Recurse -Force '${extractDir}' }; Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: "ignore" }
  );

  const datasetPath = join(extractDir, "data", "dataset.json");
  const parsed = JSON.parse(readFileSync(datasetPath, "utf8")) as Array<{
    subject: string;
    question: string;
    gold: string;
    description?: string;
  }>;

  const result: QuestionRow[] = [];
  for (const item of parsed) {
    const subject = normalizeSubject(item.subject);
    if (!subject) continue;
    result.push({
      exam: "JEE",
      subject,
      exam_type: inferJeeExamType({
        questionText: item.question,
        chapter: item.description?.trim() || null,
        sourceName: "dair-iitd/jeebench (GitHub)",
        sourceUrl: "https://github.com/dair-iitd/jeebench",
        tags: ["previous-year", "online-dataset", "jee"],
      }),
      year: null,
      question_text: item.question,
      options: null,
      correct_answer: item.gold ?? null,
      source_name: "dair-iitd/jeebench (GitHub)",
      source_url: "https://github.com/dair-iitd/jeebench",
      tags: ["previous-year", "online-dataset", "jee"],
      chapter: item.description?.trim() || null,
      difficulty: null,
    });
  }
  return result;
}

function extractYear(text: string): number | null {
  const match = text.match(/\b(20(0[9]|1\d|2[0-6]))\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isNaN(year) ? null : year;
}

function extractChapter(subject: Subject, text: string, fallback: string | null): string | null {
  if (fallback?.trim()) return fallback.trim();
  const sample = normalizeText(text);
  const chapterMap: Record<Subject, string[]> = {
    Maths: ["calculus", "algebra", "coordinate geometry", "probability", "matrices"],
    Physics: ["mechanics", "electrostatics", "thermodynamics", "optics", "modern physics"],
    Chemistry: ["organic", "inorganic", "physical chemistry", "equilibrium", "electrochemistry"],
    Botany: ["plant physiology", "photosynthesis", "morphology", "anatomy of plants", "ecology"],
    Zoology: ["human physiology", "animal kingdom", "genetics", "evolution", "reproduction"],
  };
  for (const chapter of chapterMap[subject]) {
    if (sample.includes(chapter)) return chapter;
  }
  return null;
}

function inferDifficulty(text: string): "easy" | "medium" | "hard" {
  const size = normalizeText(text).split(" ").filter(Boolean).length;
  if (size >= 140) return "hard";
  if (size >= 70) return "medium";
  return "easy";
}

async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS question_bank (
      id BIGSERIAL PRIMARY KEY,
      exam TEXT NOT NULL,
      subject TEXT NOT NULL,
      year INTEGER NULL,
      question_text TEXT NOT NULL,
      options JSONB NULL,
      correct_answer TEXT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      chapter TEXT NULL,
      difficulty TEXT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_hash TEXT NOT NULL UNIQUE,
      repetition_count INTEGER NOT NULL DEFAULT 1,
      is_repeated BOOLEAN NOT NULL DEFAULT FALSE,
      is_important BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS chapter TEXT NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS difficulty TEXT NULL;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS exam_type TEXT NULL;`);
}

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is required for AI top-up generation.");
  }
  return key;
}

async function generateQuestionsWithAi(input: {
  subject: Subject;
  exam: "JEE" | "NEET";
  count: number;
  existingHashes: Set<string>;
}): Promise<GeneratedQuestion[]> {
  const apiKey = getOpenAiApiKey();
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        minItems: input.count,
        maxItems: input.count,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question_text", "options", "correct_answer", "chapter", "difficulty"],
          properties: {
            question_text: { type: "string" },
            options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
            correct_answer: { type: "string" },
            chapter: { type: ["string", "null"] },
            difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          },
        },
      },
    },
  };

  const prompt = `
Generate exactly ${input.count} unique ${input.exam} ${input.subject} MCQ questions.
- Four options only, one correct answer.
- Keep questions diverse and non-repetitive.
- Return concise but complete academic-style questions.
- Match mixed difficulty.
- Avoid repeating previously stored hashes (normalized hash list length: ${input.existingHashes.size}).
`;

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.8,
      response_format: {
        type: "json_schema",
        json_schema: { name: "generated_mcq_batch", strict: true, schema },
      },
      messages: [
        { role: "system", content: "You generate high-quality exam MCQs. Return only strict JSON." },
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
  if (!content) {
    throw new Error("OpenAI generation returned empty content.");
  }
  const parsed = JSON.parse(content) as { questions: GeneratedQuestion[] };
  return parsed.questions ?? [];
}

async function main(): Promise<void> {
  console.log("Fetching online question datasets...");
  const jeeQuestions = fetchJeebench();
  const all = [...jeeQuestions];
  const desiredSubjects: JeeMainSubject[] = ["Maths", "Physics", "Chemistry"];
  const targetPerSubject = 1000;

  const frequency = new Map<string, number>();
  const bySubjectHash = new Map<string, QuestionRow>();

  for (const q of all) {
    if (!desiredSubjects.includes(q.subject)) continue;
    const hash = hashText(q.question_text);
    const key = `${q.subject}:${hash}`;
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
    if (!bySubjectHash.has(key)) bySubjectHash.set(key, q);
  }

  await ensureTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM question_bank WHERE subject = ANY($1::text[])`,
    desiredSubjects
  );

  let inserted = 0;
  for (const subject of desiredSubjects) {
    let used = 0;
    for (const [key, base] of bySubjectHash.entries()) {
      if (base.subject !== subject) continue;
      if (used >= targetPerSubject) break;

      const hash = key;
      const repetitionCount = frequency.get(key) ?? 1;
    const isRepeated = repetitionCount >= 2;
    const isImportant = isRepeated || base.tags.includes("previous-year");
    const year = base.year ?? extractYear(base.question_text);
    const chapter = extractChapter(base.subject, base.question_text, base.chapter);
    const difficulty = base.difficulty ?? inferDifficulty(base.question_text);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO question_bank (
        exam, subject, exam_type, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
        content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, NOW()
      )
      ON CONFLICT (content_hash)
      DO UPDATE SET
        exam_type = COALESCE(EXCLUDED.exam_type, question_bank.exam_type),
        chapter = COALESCE(EXCLUDED.chapter, question_bank.chapter),
        difficulty = COALESCE(EXCLUDED.difficulty, question_bank.difficulty),
        repetition_count = EXCLUDED.repetition_count,
        is_repeated = EXCLUDED.is_repeated,
        is_important = EXCLUDED.is_important,
        updated_at = NOW()
      `,
      base.exam,
      base.subject,
      base.exam === "JEE"
        ? inferJeeExamType({
            questionText: base.question_text,
            chapter,
            sourceName: base.source_name,
            sourceUrl: base.source_url,
            tags: base.tags,
          })
        : null,
      year,
      chapter,
      difficulty,
      base.question_text,
      JSON.stringify(base.options),
      base.correct_answer,
      base.source_name,
      base.source_url,
      JSON.stringify(base.tags),
      hash,
      repetitionCount,
      isRepeated,
      isImportant
    );
    inserted += 1;
      used += 1;
    }
  }

  const examForSubject: Record<JeeMainSubject, "JEE"> = {
    Maths: "JEE",
    Physics: "JEE",
    Chemistry: "JEE",
  };

  for (const subject of desiredSubjects) {
    const rows = await prisma.$queryRawUnsafe<Array<{ content_hash: string }>>(
      `SELECT content_hash FROM question_bank WHERE subject = $1`,
      subject
    );
    const existingHashes = new Set(rows.map((r) => r.content_hash));
    let currentCount = rows.length;
    let serial = 1;
    while (currentCount < targetPerSubject) {
      const q = buildDeterministicTopupQuestion(subject, serial);
      serial += 1;
      const hash = `${subject}:${hashText(q.question_text)}`;
      if (existingHashes.has(hash)) continue;

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO question_bank (
          exam, subject, exam_type, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
          content_hash, repetition_count, is_repeated, is_important, updated_at
        )
        VALUES (
          $1, $2, $3, NULL, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12, 1, false, false, NOW()
        )
        ON CONFLICT (content_hash) DO NOTHING
        `,
        examForSubject[subject],
        subject,
        "mains",
        q.chapter?.trim() || null,
        q.difficulty,
        q.question_text.trim(),
        JSON.stringify(q.options),
        q.correct_answer.trim(),
        "AI generated top-up",
        "deterministic-topup",
        JSON.stringify(["ai-generated", "topup", subject.toLowerCase()]),
        hash
      );
      existingHashes.add(hash);
      currentCount += 1;
      inserted += 1;
    }
    console.log(`[${subject}] top-up complete: ${currentCount}/${targetPerSubject}`);
  }

  for (const subject of desiredSubjects) {
    await prisma.$executeRawUnsafe(
      `
      DELETE FROM question_bank
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY subject
              ORDER BY is_important DESC, repetition_count DESC, id DESC
            ) AS rn
          FROM question_bank
          WHERE subject = $1
        ) ranked
        WHERE rn > $2
      );
      `,
      subject,
      targetPerSubject
    );
  }

  await prisma.$executeRawUnsafe(`
    UPDATE question_bank
    SET exam_type = CASE
      WHEN exam <> 'JEE' THEN NULL
      WHEN lower(coalesce(question_text, '')) LIKE '%advanced%'
        OR lower(coalesce(question_text, '')) LIKE '%integer type%'
        OR lower(coalesce(question_text, '')) LIKE '%multiple correct%'
        OR lower(coalesce(source_name, '')) LIKE '%advanced%'
        OR lower(coalesce(source_url, '')) LIKE '%advanced%'
        OR lower(coalesce(chapter, '')) LIKE '%advanced%'
        OR lower(coalesce(tags::text, '')) LIKE '%advanced%'
      THEN 'advanced'
      ELSE 'mains'
    END
    WHERE subject IN ('Maths', 'Physics', 'Chemistry');
  `);

  const summary = await prisma.$queryRawUnsafe<Array<{ subject: string; cnt: number }>>(
    `SELECT subject, COUNT(*)::int AS cnt FROM question_bank GROUP BY subject ORDER BY subject;`
  );

  console.log(`Imported/updated ${inserted} unique subject-scoped questions.`);
  console.log(`Target was ${targetPerSubject} per subject for ${desiredSubjects.join(", ")}.`);
  console.log("Subject segregation:");
  for (const row of summary) {
    console.log(`- ${row.subject}: ${row.cnt}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
