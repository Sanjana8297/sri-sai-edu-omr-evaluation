import "dotenv/config";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";

type Subject = "Maths" | "Physics" | "Chemistry" | "Biology";

type QuestionRow = {
  exam: "JEE" | "NEET";
  subject: Subject;
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

function normalizeSubject(raw: string): Subject | null {
  const value = raw.trim().toLowerCase();
  if (value.includes("math")) return "Maths";
  if (value.includes("phy")) return "Physics";
  if (value.includes("chem")) return "Chemistry";
  if (value.includes("bio")) return "Biology";
  return null;
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
      const subject = normalizeSubject(item.row.subject);
      if (!subject) continue;
      questions.push({
        exam: "NEET",
        subject,
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
    Biology: ["genetics", "ecology", "human physiology", "plant physiology", "cell biology"],
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
}

async function main(): Promise<void> {
  console.log("Fetching online question datasets...");
  const [neetBiology, jeeQuestions] = await Promise.all([fetchNeetBiology(), Promise.resolve(fetchJeebench())]);
  const all = [...neetBiology, ...jeeQuestions];

  const frequency = new Map<string, number>();
  const byHash = new Map<string, QuestionRow>();

  for (const q of all) {
    const hash = hashText(q.question_text);
    frequency.set(hash, (frequency.get(hash) ?? 0) + 1);
    if (!byHash.has(hash)) byHash.set(hash, q);
  }

  await ensureTable();

  let inserted = 0;
  for (const [hash, base] of byHash.entries()) {
    const repetitionCount = frequency.get(hash) ?? 1;
    const isRepeated = repetitionCount >= 2;
    const isImportant = isRepeated || base.tags.includes("previous-year");
    const year = base.year ?? extractYear(base.question_text);
    const chapter = extractChapter(base.subject, base.question_text, base.chapter);
    const difficulty = base.difficulty ?? inferDifficulty(base.question_text);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO question_bank (
        exam, subject, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
        content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, NOW()
      )
      ON CONFLICT (content_hash)
      DO UPDATE SET
        chapter = COALESCE(EXCLUDED.chapter, question_bank.chapter),
        difficulty = COALESCE(EXCLUDED.difficulty, question_bank.difficulty),
        repetition_count = EXCLUDED.repetition_count,
        is_repeated = EXCLUDED.is_repeated,
        is_important = EXCLUDED.is_important,
        updated_at = NOW()
      `,
      base.exam,
      base.subject,
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
  }

  const summary = await prisma.$queryRawUnsafe<Array<{ subject: string; cnt: number }>>(
    `SELECT subject, COUNT(*)::int AS cnt FROM question_bank GROUP BY subject ORDER BY subject;`
  );

  console.log(`Imported/updated ${inserted} unique questions.`);
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
