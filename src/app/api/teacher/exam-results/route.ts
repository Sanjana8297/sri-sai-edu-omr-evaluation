import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import type { Category } from "@/lib/types";

export async function GET(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get("examId")?.trim();

  const whereClause = examId
    ? { exam: { id: examId, teacherId: session.sub } }
    : { exam: { teacherId: session.sub } };

  const sessions = await prisma.examSession.findMany({
    where: whereClause,
    orderBy: { startedAt: "desc" },
    include: {
      student: { select: { id: true, name: true, email: true } },
      exam: { select: { id: true, title: true, category: true, startTime: true, endTime: true } },
      proctoringEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  return NextResponse.json({
    sessions: sessions.map((sessionRow) => ({
      id: sessionRow.id,
      status: sessionRow.status,
      startedAt: sessionRow.startedAt.toISOString(),
      submittedAt: sessionRow.submittedAt?.toISOString() ?? null,
      violationCount: sessionRow.violationCount,
      cameraGranted: sessionRow.cameraGranted,
      micGranted: sessionRow.micGranted,
      autoSubmittedReason: sessionRow.autoSubmittedReason,
      student: sessionRow.student,
      exam: {
        ...sessionRow.exam,
        startTime: sessionRow.exam.startTime.toISOString(),
        endTime: sessionRow.exam.endTime.toISOString(),
      },
      proctoringEvents: sessionRow.proctoringEvents.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
        createdAt: event.createdAt.toISOString(),
      })),
    })),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({ where: { id: session.sub } });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  let body: {
    studentId?: string;
    title?: string;
    category?: string;
    examDate?: string;
    marksObtained?: number;
    maxMarks?: number;
    analysis?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studentId = body.studentId;
  const title = body.title?.trim();
  const category = body.category as Category | undefined;
  const examDateStr = body.examDate;
  const marksObtained = body.marksObtained;
  const maxMarks = body.maxMarks;
  const analysis = body.analysis?.trim();

  if (!studentId || !title || !examDateStr || marksObtained === undefined || maxMarks === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!analysis) {
    return NextResponse.json({ error: "Analysis is required" }, { status: 400 });
  }
  if (category !== "JEE" && category !== "NEET") {
    return NextResponse.json({ error: "Category must be JEE or NEET" }, { status: 400 });
  }
  if (category !== me.category) {
    return NextResponse.json({ error: "Category must match your track" }, { status: 400 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, teacherId: session.sub },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found under you" }, { status: 404 });
  }

  const examDate = new Date(examDateStr);
  if (Number.isNaN(examDate.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (maxMarks <= 0) {
    return NextResponse.json({ error: "maxMarks must be positive" }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.create({
    data: {
      studentId,
      category,
      title,
      examDate,
      marksObtained,
      maxMarks,
      analysis,
    },
  });

  return NextResponse.json({ attempt });
}
