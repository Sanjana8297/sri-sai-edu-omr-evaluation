import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { getTeacherCbtDefaults, setExamCbtSettings } from "@/lib/cbt-settings-db";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const exams = await prisma.exam.findMany({
    orderBy: [{ startTime: "desc" }],
    include: {
      questionPaper: { select: { id: true, title: true, category: true } },
      teacher: { select: { id: true, name: true, category: true } },
      _count: { select: { examSessions: true } },
    },
  });

  return NextResponse.json({
    exams: exams.map((exam) => ({
      ...exam,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: {
    teacherId?: string;
    questionPaperId?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    isPublished?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teacherId = body.teacherId?.trim();
  const questionPaperId = body.questionPaperId?.trim();
  const title = body.title?.trim();
  const startTime = parseDate(body.startTime);
  const endTime = parseDate(body.endTime);
  const durationMinutes = body.durationMinutes;
  const isPublished = Boolean(body.isPublished);

  if (!teacherId || !questionPaperId || !title || !startTime || !endTime || typeof durationMinutes !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    return NextResponse.json({ error: "durationMinutes must be between 1 and 480" }, { status: 400 });
  }

  const [teacher, paper, cbtSettings] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, category: true },
    }),
    prisma.questionPaper.findFirst({
      where: { id: questionPaperId, teacherId },
      select: { id: true, category: true, title: true },
    }),
    getTeacherCbtDefaults(teacherId),
  ]);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!paper) return NextResponse.json({ error: "Question paper not found for this teacher" }, { status: 404 });
  if (paper.category !== teacher.category) {
    return NextResponse.json({ error: "Question paper category must match teacher track" }, { status: 400 });
  }

  const exam = await prisma.exam.create({
    data: {
      teacherId: teacher.id,
      questionPaperId: paper.id,
      category: paper.category,
      title,
      startTime,
      endTime,
      durationMinutes,
      isPublished,
    },
    include: {
      questionPaper: { select: { id: true, title: true, category: true } },
      teacher: { select: { id: true, name: true, category: true } },
    },
  });

  await setExamCbtSettings(exam.id, cbtSettings);

  return NextResponse.json({
    exam: {
      ...exam,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString(),
    },
  });
}
