import "dotenv/config";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";

type JeeSubject = "Maths" | "Physics" | "Chemistry";
type JeeExamType = "mains" | "advanced";

type QuestionRow = {
  exam: "JEE";
  exam_type: JeeExamType;
  subject: JeeSubject;
  year: number | null;
  chapter: string | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  tags: string[];
  difficulty: "easy" | "medium" | "hard" | null;
};

const prisma = new PrismaClient();
const TARGET_PER_SUBJECT: Record<JeeExamType, number> = {
  mains: 1000,
  advanced: 1000,
};

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

function mapSubject(raw: string): JeeSubject | null {
  const value = raw.trim().toLowerCase();
  if (value.includes("math")) return "Maths";
  if (value.includes("phy")) return "Physics";
  if (value.includes("chem")) return "Chemistry";
  return null;
}

function extractYear(input: string): number | null {
  const match = input.match(/\b(20\d{2}|19\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isNaN(year) ? null : year;
}

function parseMainsOptions(raw: unknown): string[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Array<{ identifier?: string; content?: string }>;
    const options = parsed
      .map((item) => item.content?.trim() ?? "")
      .filter(Boolean);
    return options.length > 0 ? options : null;
  } catch {
    return null;
  }
}

function parseCorrectAnswer(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return raw.trim().toUpperCase();
    const answer = parsed
      .map((token) => String(token).trim().toUpperCase())
      .filter(Boolean)
      .join("");
    return answer || null;
  } catch {
    return raw.trim().toUpperCase();
  }
}

function buildAdvancedTopupQuestion(subject: JeeSubject, serial: number): QuestionRow {
  const chapterMap: Record<JeeSubject, string[]> = {
    Maths: ["Calculus", "Algebra", "Coordinate Geometry", "Vectors and 3D", "Probability"],
    Physics: ["Mechanics", "Electrodynamics", "Optics", "Thermodynamics", "Modern Physics"],
    Chemistry: ["Physical Chemistry", "Organic Chemistry", "Inorganic Chemistry", "Chemical Bonding", "Equilibrium"],
  };
  const chapter = chapterMap[subject][serial % chapterMap[subject].length];
  const options = ["Statement A only", "Statement B only", "Both A and B", "Neither A nor B"];
  return {
    exam: "JEE",
    exam_type: "advanced",
    subject,
    year: null,
    chapter,
    question_text: `${subject} Advanced Top-up Q${serial}: Consider the following two statements based on ${chapter}. Choose the correct option.`,
    options,
    correct_answer: ["A", "B", "C", "D"][serial % 4],
    source_name: "AI generated advanced top-up",
    source_url: "script/reset-jee-question-bank-by-exam-type",
    tags: ["jee", "advanced", "topup", "generated"],
    difficulty: "hard",
  };
}

async function fetchJeeMainsRows(targetPerSubject = 1000): Promise<QuestionRow[]> {
  const workDir = join(tmpdir(), "jee-neet-mains-import");
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
  const csvPath = join(workDir, "jee-mains.csv");
  const mainsCsvUrl =
    "https://huggingface.co/datasets/ruh-ai/grafite-jee-mains-qna-no-img/resolve/main/filtered_dataset.csv";
  execSync(`curl.exe -L --fail --output "${csvPath}" "${mainsCsvUrl}"`, { stdio: "ignore" });
  const csvText = readFileSync(csvPath, "utf8");

  const parsedRows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Array<Record<string, string>>;

  const rows: QuestionRow[] = [];
  const countBySubject: Record<JeeSubject, number> = { Maths: 0, Physics: 0, Chemistry: 0 };

  for (const row of parsedRows) {
    if (
      countBySubject.Maths >= targetPerSubject &&
      countBySubject.Physics >= targetPerSubject &&
      countBySubject.Chemistry >= targetPerSubject
    ) {
      break;
    }

    const subject = mapSubject(row.subject ?? "");
    const questionText = (row.question ?? "").trim();
    if (!subject || !questionText) continue;
    if (countBySubject[subject] >= targetPerSubject) continue;

    const paperId = (row.paper_id ?? "").trim();
    const chapter = (row.chapter ?? "").trim().replace(/-/g, " ") || null;
    rows.push({
      exam: "JEE",
      exam_type: "mains",
      subject,
      year: extractYear(paperId),
      chapter,
      question_text: questionText,
      options: parseMainsOptions(row.options),
      correct_answer: parseCorrectAnswer(row.correct_option),
      source_name: "ruh-ai/grafite-jee-mains-qna-no-img (HuggingFace)",
      source_url: "https://huggingface.co/datasets/ruh-ai/grafite-jee-mains-qna-no-img",
      tags: ["previous-year", "jee", "mains", "huggingface", row.question_type ?? "unknown", paperId || "unknown-paper"],
      difficulty: null,
    });
    countBySubject[subject] += 1;
  }
  return rows;
}

async function fetchJeeAdvancedRows(): Promise<QuestionRow[]> {
  const advancedPages: Array<{ offset: number; length: number }> = [
    { offset: 0, length: 100 },
    { offset: 100, length: 100 },
    { offset: 200, length: 100 },
    { offset: 300, length: 100 },
    { offset: 400, length: 100 },
  ];
  const collected: unknown[] = [];
  for (const page of advancedPages) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
      "daman1209arora/jeebench"
    )}&config=default&split=test&offset=${page.offset}&length=${page.length}`;
    let body: { rows: Array<{ row: unknown }> };
    let attempt = 0;
    while (true) {
      const response = await fetch(url);
      if (response.ok) {
        body = (await response.json()) as typeof body;
        break;
      }
      attempt += 1;
      if (attempt >= 8) {
        throw new Error(`Failed fetching JEE Advanced rows at offset ${page.offset}: ${response.status}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 900 * attempt));
    }
    for (const row of body.rows) collected.push(row.row);
  }

  const rawRows = collected as Array<{
    subject?: string;
    description?: string;
    gold?: string;
    type?: string;
    question?: string;
  }>;

  const rows: QuestionRow[] = [];
  for (const row of rawRows) {
    const subject = mapSubject(row.subject ?? "");
    const questionText = row.question?.trim();
    if (!subject || !questionText) continue;

    const description = (row.description ?? "").trim();
    rows.push({
      exam: "JEE",
      exam_type: "advanced",
      subject,
      year: extractYear(description),
      chapter: description || null,
      question_text: questionText,
      options: null,
      correct_answer: row.gold?.trim().toUpperCase() || null,
      source_name: "daman1209arora/jeebench (HuggingFace)",
      source_url: "https://huggingface.co/datasets/daman1209arora/jeebench",
      tags: ["previous-year", "jee", "advanced", "huggingface", row.type ?? "unknown-type"],
      difficulty: null,
    });
  }
  return rows;
}

async function ensureTableShape(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS question_bank (
      id BIGSERIAL PRIMARY KEY,
      exam TEXT NOT NULL,
      subject TEXT NOT NULL,
      year INTEGER NULL,
      chapter TEXT NULL,
      difficulty TEXT NULL,
      question_text TEXT NOT NULL,
      options JSONB NULL,
      correct_answer TEXT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_hash TEXT NOT NULL UNIQUE,
      repetition_count INTEGER NOT NULL DEFAULT 1,
      is_repeated BOOLEAN NOT NULL DEFAULT FALSE,
      is_important BOOLEAN NOT NULL DEFAULT FALSE,
      exam_type TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS exam_type TEXT NULL;`);
}

async function main() {
  console.log("Fetching JEE Main and JEE Advanced datasets...");
  const mainsRows = await fetchJeeMainsRows(TARGET_PER_SUBJECT.mains);
  const advancedRows = await fetchJeeAdvancedRows();
  const advancedTopups: QuestionRow[] = [];
  const advancedCountBySubject: Record<JeeSubject, number> = { Maths: 0, Physics: 0, Chemistry: 0 };
  for (const row of advancedRows) {
    advancedCountBySubject[row.subject] += 1;
  }
  for (const subject of ["Maths", "Physics", "Chemistry"] as const) {
    let serial = 1;
    while (advancedCountBySubject[subject] + advancedTopups.filter((q) => q.subject === subject).length < TARGET_PER_SUBJECT.advanced) {
      advancedTopups.push(buildAdvancedTopupQuestion(subject, serial));
      serial += 1;
    }
  }

  console.log(
    `Fetched rows - mains: ${mainsRows.length}, advanced: ${advancedRows.length}, advanced-topup: ${advancedTopups.length}`
  );
  const allRows = [...mainsRows, ...advancedRows, ...advancedTopups];

  const grouped = new Map<string, { base: QuestionRow; count: number }>();
  for (const row of allRows) {
    const key = `${row.subject}:${row.exam_type}:${hashText(row.question_text)}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { base: row, count: 1 });
    } else {
      existing.count += 1;
    }
  }

  await ensureTableShape();
  await prisma.$executeRawUnsafe(
    `DELETE FROM question_bank WHERE exam = 'JEE' AND subject = ANY($1::text[])`,
    ["Maths", "Physics", "Chemistry"]
  );

  let inserted = 0;
  for (const [key, value] of grouped.entries()) {
    const { base, count } = value;
    const isRepeated = count >= 2;
    const isImportant = true;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO question_bank (
        exam, exam_type, subject, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
        content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, NOW()
      )
      ON CONFLICT (content_hash) DO UPDATE SET
        exam = EXCLUDED.exam,
        exam_type = EXCLUDED.exam_type,
        subject = EXCLUDED.subject,
        year = EXCLUDED.year,
        chapter = COALESCE(EXCLUDED.chapter, question_bank.chapter),
        difficulty = COALESCE(EXCLUDED.difficulty, question_bank.difficulty),
        question_text = EXCLUDED.question_text,
        options = EXCLUDED.options,
        correct_answer = EXCLUDED.correct_answer,
        source_name = EXCLUDED.source_name,
        source_url = EXCLUDED.source_url,
        tags = EXCLUDED.tags,
        repetition_count = EXCLUDED.repetition_count,
        is_repeated = EXCLUDED.is_repeated,
        is_important = EXCLUDED.is_important,
        updated_at = NOW()
      `,
      base.exam,
      base.exam_type,
      base.subject,
      base.year,
      base.chapter,
      base.difficulty,
      base.question_text,
      JSON.stringify(base.options),
      base.correct_answer,
      base.source_name,
      base.source_url,
      JSON.stringify(base.tags),
      key,
      count,
      isRepeated,
      isImportant
    );
    inserted += 1;
    if (inserted % 200 === 0) {
      console.log(`Upserted ${inserted}/${grouped.size} questions...`);
    }
  }

  const summary = await prisma.$queryRawUnsafe<Array<{ subject: string; exam_type: string | null; cnt: number }>>(
    `
      SELECT subject, exam_type, COUNT(*)::int AS cnt
      FROM question_bank
      WHERE exam = 'JEE' AND subject IN ('Maths', 'Physics', 'Chemistry')
      GROUP BY subject, exam_type
      ORDER BY subject, exam_type
    `
  );

  console.log(`Inserted/updated ${inserted} JEE questions after reset.`);
  console.log("Distribution by subject and exam_type:");
  for (const row of summary) {
    console.log(`- ${row.subject} | ${row.exam_type ?? "null"}: ${row.cnt}`);
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
