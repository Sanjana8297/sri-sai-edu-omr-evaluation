import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function parseBool(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
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
