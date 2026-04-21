import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline, toIso } from "@/lib/proctoring";

export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: { cameraGranted?: boolean | null; micGranted?: boolean | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const me = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) return NextResponse.json({ error: "Invalid student profile" }, { status: 400 });

  const exam = await prisma.exam.findFirst({
    where: { id: examId, category: me.category, isPublished: true },
    include: { questionPaper: true },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  const now = new Date();
  if (now < exam.startTime || now > exam.endTime) {
    return NextResponse.json({ error: "Exam is only available within the scheduled window" }, { status: 403 });
  }

  const sessionRow = await prisma.examSession.upsert({
    where: { examId_studentId: { examId: exam.id, studentId: me.id } },
    update: {
      cameraGranted: body.cameraGranted ?? null,
      micGranted: body.micGranted ?? null,
    },
    create: {
      examId: exam.id,
      studentId: me.id,
      cameraGranted: body.cameraGranted ?? null,
      micGranted: body.micGranted ?? null,
    },
    include: { exam: true },
  });

  const deadline = computeSessionDeadline(sessionRow.startedAt, exam.endTime, exam.durationMinutes);

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      category: exam.category,
      durationMinutes: exam.durationMinutes,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      questionPaper: {
        id: exam.questionPaper.id,
        title: exam.questionPaper.title,
        questionContent: exam.questionPaper.questionContent,
        questionPaperUrl: exam.questionPaper.questionPaperUrl,
      },
    },
    session: {
      id: sessionRow.id,
      status: sessionRow.status,
      startedAt: sessionRow.startedAt.toISOString(),
      submittedAt: toIso(sessionRow.submittedAt),
      violationCount: sessionRow.violationCount,
      cameraGranted: sessionRow.cameraGranted,
      micGranted: sessionRow.micGranted,
      deadline: deadline.toISOString(),
    },
  });
}
