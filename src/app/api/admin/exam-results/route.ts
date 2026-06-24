import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const examId = new URL(request.url).searchParams.get("examId")?.trim();
  if (!examId) {
    return NextResponse.json({ error: "examId is required" }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true },
  });
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  const sessions = await prisma.examSession.findMany({
    where: { examId },
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
      submittedAnswers: sessionRow.submittedAnswers,
      scoreObtained: sessionRow.scoreObtained,
      scoreMax: sessionRow.scoreMax,
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
