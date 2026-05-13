import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import type { ParsedBulkCsvRow } from "@/lib/question-bank-csv";
import { insertFlexibleTeacherQuestionRow } from "@/lib/teacher-question-bank-flexible-insert";

const MAX_ROWS = 500;

function parseDifficulty(value: string): "easy" | "medium" | "hard" | null {
  const t = value.trim().toLowerCase();
  if (!t) return null;
  if (t === "easy" || t === "medium" || t === "hard") return t;
  return null;
}

function parseYear(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
  return Math.trunc(n);
}

function parseTagsCell(raw: string): string[] {
  const t = raw.trim();
  if (!t) return ["teacher-added", "csv-import"];
  return t
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

  let body: { rows?: ParsedBulkCsvRow[]; defaultSubject?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows must be a non-empty array" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `At most ${MAX_ROWS} rows per request` }, { status: 400 });
  }

  const allowedSubjects =
    me.category === "JEE"
      ? new Set(["Maths", "Physics", "Chemistry"])
      : new Set(["Physics", "Chemistry", "Botany", "Zoology"]);

  const defaultSubject = body.defaultSubject?.trim() ?? "";
  const examCategory = me.category === "JEE" ? "JEE" : "NEET";

  let inserted = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  const errors: Array<{ index: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const subject = (raw.subject?.trim() || defaultSubject).trim();
    const questionText = (raw.question_text ?? "").trim();

    if (!subject || !questionText) {
      failed += 1;
      errors.push({ index: i, message: "Each row needs subject and question_text (subject may come from defaultSubject)." });
      continue;
    }
    if (!allowedSubjects.has(subject)) {
      failed += 1;
      errors.push({ index: i, message: "Subject does not match your track" });
      continue;
    }

    const options = [raw.option_a, raw.option_b, raw.option_c, raw.option_d]
      .map((o) => String(o ?? "").trim())
      .filter(Boolean);

    const diffRaw = parseDifficulty(raw.difficulty ?? "");
    if ((raw.difficulty ?? "").trim() && !diffRaw) {
      failed += 1;
      errors.push({ index: i, message: "difficulty must be empty or easy/medium/hard" });
      continue;
    }

    const year = parseYear(raw.year ?? "");

    const tags = parseTagsCell(raw.tags ?? "");
    const sourceName = (raw.source_name ?? "").trim() || "CSV import";
    const sourceUrl = (raw.source_url ?? "").trim() || "csv-bulk-import";

    const result = await insertFlexibleTeacherQuestionRow(prisma, examCategory, {
      subject,
      questionText,
      options,
      correctAnswer: (raw.correct_answer ?? "").trim() || null,
      chapter: (raw.chapter ?? "").trim() || null,
      difficulty: diffRaw,
      year,
      tags,
      sourceName,
      sourceUrl,
    });

    if (!result.ok) {
      failed += 1;
      errors.push({ index: i, message: result.error });
      continue;
    }
    if (result.alreadyExisted) {
      skippedDuplicate += 1;
    } else {
      inserted += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skippedDuplicate,
    failed,
    processed: rows.length,
    errors: errors.slice(0, 50),
  });
}
