import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline } from "@/lib/proctoring";
import { getExamSessionCbtState, saveExamSessionProgress } from "@/lib/cbt-settings-db";

export async function PATCH(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: {
    answers?: Record<string, string>;
    markedForReview?: string[];
    visited?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionRow = await prisma.examSession.findFirst({
    where: { examId, studentId: session.sub },
    include: { exam: true },
  });
  if (!sessionRow) return NextResponse.json({ error: "Exam session not found" }, { status: 404 });
  if (sessionRow.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Exam session is already finalized" }, { status: 409 });
  }

  const now = new Date();
  const deadline = computeSessionDeadline(
    sessionRow.startedAt,
    sessionRow.exam.endTime,
    sessionRow.exam.durationMinutes,
  );
  if (now > deadline) {
    return NextResponse.json({ error: "Exam session has ended" }, { status: 409 });
  }

  const existingAnswers = (sessionRow.submittedAnswers as Record<string, string> | null) ?? {};
  const existingState = await getExamSessionCbtState(sessionRow.id);

  const nextAnswers = body.answers ? { ...existingAnswers, ...body.answers } : existingAnswers;
  const nextState = {
    markedForReview: body.markedForReview ?? existingState.markedForReview ?? [],
    visited: body.visited ?? existingState.visited ?? [],
  };

  await saveExamSessionProgress(sessionRow.id, nextAnswers, nextState);

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    submittedAnswers: nextAnswers,
    cbtState: nextState,
  });
}
