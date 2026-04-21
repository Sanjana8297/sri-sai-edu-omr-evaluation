import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const exams = await prisma.exam.findMany({
    where: { teacherId: session.sub },
    orderBy: [{ startTime: "desc" }],
    include: {
      questionPaper: { select: { id: true, title: true, category: true } },
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
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  let body: {
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

  const questionPaperId = body.questionPaperId?.trim();
  const title = body.title?.trim();
  const startTime = parseDate(body.startTime);
  const endTime = parseDate(body.endTime);
  const durationMinutes = body.durationMinutes;
  const isPublished = Boolean(body.isPublished);

  if (!questionPaperId || !title || !startTime || !endTime || typeof durationMinutes !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    return NextResponse.json({ error: "durationMinutes must be between 1 and 480" }, { status: 400 });
  }

  const [me, paper] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: session.sub }, select: { id: true, category: true } }),
    prisma.questionPaper.findFirst({
      where: { id: questionPaperId, teacherId: session.sub },
      select: { id: true, category: true, title: true },
    }),
  ]);
  if (!me) return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  if (!paper) return NextResponse.json({ error: "Question paper not found" }, { status: 404 });
  if (paper.category !== me.category) {
    return NextResponse.json({ error: "Question paper category must match your track" }, { status: 400 });
  }

  const exam = await prisma.exam.create({
    data: {
      teacherId: session.sub,
      questionPaperId: paper.id,
      category: paper.category,
      title,
      startTime,
      endTime,
      durationMinutes,
      isPublished,
    },
    include: { questionPaper: { select: { title: true } } },
  });

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
