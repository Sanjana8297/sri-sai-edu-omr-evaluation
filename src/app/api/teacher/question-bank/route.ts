import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

function parseBool(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

type JeeExamType = "mains" | "advanced";

function parseJeeExamType(value: string | null): JeeExamType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "mains") return "mains";
  if (normalized === "advanced") return "advanced";
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

export async function GET(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const subject = (searchParams.get("subject") ?? "").trim();
  const search = (searchParams.get("search") ?? "").trim();
  const chapter = (searchParams.get("chapter") ?? "").trim();
  const difficulty = (searchParams.get("difficulty") ?? "").trim().toLowerCase();
  const yearText = (searchParams.get("year") ?? "").trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "50"), 1), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);
  const important = parseBool(searchParams.get("important"));
  const repeated = parseBool(searchParams.get("repeated"));
  const jeeExamType = parseJeeExamType(searchParams.get("jeeExamType"));

  const conditions: Prisma.Sql[] = [Prisma.sql`exam = ${me.category}`];
  if (subject) conditions.push(Prisma.sql`subject = ${subject}`);
  if (chapter) conditions.push(Prisma.sql`chapter ILIKE ${`%${chapter}%`}`);
  if (difficulty && (difficulty === "easy" || difficulty === "medium" || difficulty === "hard")) {
    conditions.push(Prisma.sql`difficulty = ${difficulty}`);
  }
  if (search) conditions.push(Prisma.sql`question_text ILIKE ${`%${search}%`}`);
  if (yearText) {
    const year = Number(yearText);
    if (!Number.isNaN(year)) conditions.push(Prisma.sql`year = ${year}`);
  }
  if (important !== null) conditions.push(Prisma.sql`is_important = ${important}`);
  if (repeated !== null) conditions.push(Prisma.sql`is_repeated = ${repeated}`);
  if (jeeExamType === "mains") {
    conditions.push(Prisma.sql`exam_type = 'mains'`);
  }
  if (jeeExamType === "advanced") {
    conditions.push(Prisma.sql`exam_type = 'advanced'`);
  }

  const whereClause =
    conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      exam: string;
      subject: string;
      year: number | null;
      chapter: string | null;
      question_text: string;
      options: unknown;
      correct_answer: string | null;
      source_name: string;
      source_url: string;
      difficulty: string | null;
      tags: unknown;
      repetition_count: number;
      is_repeated: boolean;
      is_important: boolean;
    }>
  >(
    Prisma.sql`
      SELECT
        id::int AS id, exam, subject, year, chapter, question_text, options, correct_answer, source_name, source_url, difficulty,
        tags, repetition_count, is_repeated, is_important
      FROM question_bank
      ${whereClause}
      ORDER BY is_important DESC, repetition_count DESC, id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  );

  const [{ count }] = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM question_bank
      ${whereClause}
    `
  );

  return NextResponse.json({ questions: rows, total: Number(count), limit, offset });
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  let body: {
    subject?: string;
    questionText?: string;
    options?: string[];
    correctAnswer?: string;
    chapter?: string;
    difficulty?: "easy" | "medium" | "hard";
    year?: number | null;
    tags?: string[];
    sourceName?: string;
    sourceUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subject = body.subject?.trim();
  const questionText = body.questionText?.trim();
  const options = Array.isArray(body.options)
    ? body.options.map((o) => o.trim()).filter(Boolean)
    : [];
  const correctAnswer = body.correctAnswer?.trim().toUpperCase();
  const chapter = body.chapter?.trim() || null;
  const difficulty = body.difficulty;
  const year = body.year ?? null;
  const tags = Array.isArray(body.tags) ? body.tags.filter(Boolean) : ["teacher-added"];
  const sourceName = body.sourceName?.trim() || "Teacher Added";
  const sourceUrl = body.sourceUrl?.trim() || "teacher-profile";

  if (!subject || !questionText || options.length !== 4 || !correctAnswer) {
    return NextResponse.json(
      { error: "subject, questionText, exactly 4 options, and correctAnswer are required" },
      { status: 400 }
    );
  }
  if (!["A", "B", "C", "D"].includes(correctAnswer)) {
    return NextResponse.json({ error: "correctAnswer must be one of A/B/C/D" }, { status: 400 });
  }
  if (difficulty && !["easy", "medium", "hard"].includes(difficulty)) {
    return NextResponse.json({ error: "difficulty must be easy/medium/hard" }, { status: 400 });
  }

  const allowedSubjects =
    me.category === "JEE"
      ? new Set(["Maths", "Physics", "Chemistry"])
      : new Set(["Physics", "Chemistry", "Botany", "Zoology"]);
  if (!allowedSubjects.has(subject)) {
    return NextResponse.json({ error: "Subject does not match your track" }, { status: 400 });
  }

  const contentHash = hashText(questionText);
  const scopedHash = `${subject}:${contentHash}`;

  const inserted = await prisma.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`
      INSERT INTO question_bank (
        exam, subject, year, chapter, difficulty, question_text, options, correct_answer, source_name, source_url, tags,
        content_hash, repetition_count, is_repeated, is_important, updated_at
      )
      VALUES (
        ${me.category}, ${subject}, ${year}, ${chapter}, ${difficulty ?? null}, ${questionText}, ${JSON.stringify(
      options
    )}::jsonb, ${correctAnswer}, ${sourceName}, ${sourceUrl}, ${JSON.stringify(tags)}::jsonb,
        ${scopedHash}, 1, false, true, NOW()
      )
      ON CONFLICT (content_hash) DO NOTHING
      RETURNING id::int AS id
    `
  );

  if (inserted.length === 0) {
    return NextResponse.json({ error: "Duplicate question already exists" }, { status: 409 });
  }

  return NextResponse.json({ id: inserted[0].id, ok: true });
}
