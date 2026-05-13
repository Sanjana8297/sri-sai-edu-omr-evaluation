import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionBankRowForApi } from "@/lib/question-bank-display";
import { contentHashLookupKeys, hashText, sqlContentHashInClause } from "@/lib/question-bank-content-hash";
import { insertFlexibleTeacherQuestionRow } from "@/lib/teacher-question-bank-flexible-insert";

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

/** Filter bank rows: MCQ (four options / tag) vs Numericals (tag or fill-in style). */
function parseQuestionTypeFilter(value: string | null): "mcq" | "numerical" | null {
  if (!value) return null;
  const n = value.trim().toLowerCase();
  if (n === "mcq") return "mcq";
  if (n === "numerical" || n === "numericals") return "numerical";
  return null;
}

/** SQL: option array length when options is a JSON array, else 0. */
const optionsArrayLenSql = Prisma.sql`
  CASE
    WHEN jsonb_typeof(COALESCE(options, '[]'::jsonb)) = 'array'
      THEN jsonb_array_length(COALESCE(options, '[]'::jsonb))
    ELSE 0
  END
`;

function sqlQuestionTypeMcq(): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem
      WHERE lower(elem) IN ('mcq', 'multiple choice', 'multiple_choice', 'objective')
    )
    OR (
      (${optionsArrayLenSql}) >= 4
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem2
        WHERE lower(elem2) IN (
          'numerical', 'numeric', 'integer', 'integer type', 'numerical answer',
          'numerical value', 'numericals'
        )
      )
    )
  )`;
}

function sqlQuestionTypeNumerical(): Prisma.Sql {
  return Prisma.sql`(
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS elem
      WHERE lower(elem) IN (
        'numerical', 'numeric', 'integer', 'integer type', 'numerical answer',
        'numerical value', 'numericals'
      )
    )
    OR (
      (${optionsArrayLenSql}) < 4
      AND (
        question_text ILIKE '%____%'
        OR question_text ~* '(integer type|numerical value|fill in the blank|fill in blank)'
      )
    )
  )`;
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
  const matchText = (searchParams.get("matchText") ?? "").trim();
  const matchSubject = (searchParams.get("matchSubject") ?? "").trim();

  /** Exact bank row by content_hash (same normalization as inserts / imports). */
  if (matchText.length > 0 && matchSubject.length > 0) {
    if (matchText.length > 50_000) {
      return NextResponse.json({ error: "matchText is too long" }, { status: 400 });
    }
    const allowedSubjects =
      me.category === "JEE"
        ? new Set(["Maths", "Physics", "Chemistry"])
        : new Set(["Physics", "Chemistry", "Botany", "Zoology"]);
    if (!allowedSubjects.has(matchSubject)) {
      return NextResponse.json({ error: "Invalid matchSubject for your track" }, { status: 400 });
    }
    const exam = me.category === "JEE" ? "JEE" : "NEET";
    const hashKeys = contentHashLookupKeys(exam, matchSubject, matchText);
    const matchRows = await prisma.$queryRaw<
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
        WHERE exam = ${me.category} AND ${sqlContentHashInClause(hashKeys)}
        ORDER BY id DESC
        LIMIT 1
      `
    );
    const match = matchRows[0] ? normalizeQuestionBankRowForApi(matchRows[0]) : null;
    return NextResponse.json({ match, matchSubject, matchMode: true as const });
  }

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
  const questionTypeFilter = parseQuestionTypeFilter(searchParams.get("questionType"));

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
  if (questionTypeFilter === "mcq") {
    conditions.push(sqlQuestionTypeMcq());
  }
  if (questionTypeFilter === "numerical") {
    conditions.push(sqlQuestionTypeNumerical());
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

  const questions = rows.map((row) => normalizeQuestionBankRowForApi(row));

  return NextResponse.json({ questions, total: Number(count), limit, offset });
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
    flexible?: boolean;
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

  const allowedSubjects =
    me.category === "JEE"
      ? new Set(["Maths", "Physics", "Chemistry"])
      : new Set(["Physics", "Chemistry", "Botany", "Zoology"]);

  /** Stem + optional options/answer (e.g. Manual builder when no bank match). */
  if (body.flexible) {
    const subject = body.subject?.trim();
    const questionText = body.questionText?.trim();
    if (!subject || !questionText) {
      return NextResponse.json({ error: "subject and questionText are required" }, { status: 400 });
    }
    if (!allowedSubjects.has(subject)) {
      return NextResponse.json({ error: "Subject does not match your track" }, { status: 400 });
    }
    const options = Array.isArray(body.options)
      ? body.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 20)
      : [];
    const correctRaw = body.correctAnswer?.trim() ?? "";
    let correctAnswer: string | null = correctRaw.length > 0 ? correctRaw : null;
    if (correctAnswer && options.length === 4 && /^[a-d]$/i.test(correctAnswer)) {
      correctAnswer = correctAnswer.toUpperCase();
    }
    const chapter = body.chapter?.trim() || null;
    const difficulty = body.difficulty;
    const year = body.year ?? null;
    const tags =
      Array.isArray(body.tags) && body.tags.length > 0 ? body.tags.filter(Boolean) : [];
    const sourceName = body.sourceName?.trim() || "Teacher Added";
    const sourceUrl = body.sourceUrl?.trim() || "manual-builder";

    const examCategory = me.category === "JEE" ? "JEE" : "NEET";
    const result = await insertFlexibleTeacherQuestionRow(prisma, examCategory, {
      subject,
      questionText,
      options,
      correctAnswer,
      chapter,
      difficulty: difficulty ?? null,
      year,
      tags,
      sourceName,
      sourceUrl,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      id: result.id,
      ok: true,
      ...(result.alreadyExisted ? { alreadyExisted: true as const } : {}),
    });
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
