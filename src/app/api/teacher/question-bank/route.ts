import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { normalizeQuestionBankRowForApi } from "@/lib/question-bank-display";
import { contentHashLookupKeys, hashText, sqlContentHashInClause } from "@/lib/question-bank-content-hash";
import { insertFlexibleTeacherQuestionRow } from "@/lib/teacher-question-bank-flexible-insert";
import { listQuestions } from "@/lib/questions/list-questions";
import { parseFiltersFromSearchParams } from "@/lib/questions/parse-filters";

export const dynamic = "force-dynamic";

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
    const hashKeys = contentHashLookupKeys(
      me.category as "JEE" | "NEET",
      matchSubject,
      matchText
    );
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

  const filters = parseFiltersFromSearchParams(searchParams, me.category);
  const limit = Number(searchParams.get("limit") ?? "50");
  const offset = Number(searchParams.get("offset") ?? "0");
  const useLightweight = searchParams.get("lightweight") === "true";

  const result = await listQuestions({
    ...filters,
    limit,
    offset,
    includeTotal: true,
    fullRows: !useLightweight,
  });

  return NextResponse.json({
    questions: result.questions,
    total: result.total ?? 0,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
  });
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
