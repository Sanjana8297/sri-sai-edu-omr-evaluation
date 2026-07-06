import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline } from "@/lib/proctoring";
import { saveExamSessionProgress } from "@/lib/cbt-settings-db";
import type { ExamSessionCbtState } from "@/lib/cbt-settings-db";

export async function PATCH(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: {
    answers?: Record<string, string>;
    markedForReview?: string[];
    visited?: string[];
    activeQuestionIndex?: number;
    instructionsAcknowledged?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionRow = await prisma.examSession.findFirst({
    where: { examId, studentId: session.sub },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAnswers: true,
      cbtState: true,
      exam: { select: { endTime: true, durationMinutes: true } },
    },
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
  const existingState = (sessionRow.cbtState as ExamSessionCbtState | null) ?? {};

  const nextAnswers = body.answers ? { ...existingAnswers, ...body.answers } : existingAnswers;
  const nextState: ExamSessionCbtState = {
    markedForReview: body.markedForReview ?? existingState.markedForReview ?? [],
    visited: body.visited ?? existingState.visited ?? [],
    activeQuestionIndex:
      body.activeQuestionIndex !== undefined
        ? body.activeQuestionIndex
        : existingState.activeQuestionIndex,
    instructionsAcknowledged:
      body.instructionsAcknowledged !== undefined
        ? body.instructionsAcknowledged
        : existingState.instructionsAcknowledged,
  };

  await saveExamSessionProgress(sessionRow.id, nextAnswers, nextState);

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    submittedAnswers: nextAnswers,
    cbtState: nextState,
  });
}
