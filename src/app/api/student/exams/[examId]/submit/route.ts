import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline, toIso } from "@/lib/proctoring";
import { getCachedAnswerKeyForPaper, scoreExamAnswers } from "@/lib/exam-paper-parser";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: { reason?: string; answers?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const sessionRow = await prisma.examSession.findFirst({
    where: { examId, studentId: session.sub },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      violationCount: true,
      autoSubmittedReason: true,
      studentId: true,
      exam: {
        select: {
          title: true,
          category: true,
          endTime: true,
          durationMinutes: true,
          questionPaper: {
            select: {
              id: true,
              keyContent: true,
            },
          },
        },
      },
    },
  });
  if (!sessionRow) return NextResponse.json({ error: "Exam session not found" }, { status: 404 });

  if (sessionRow.status !== "IN_PROGRESS") {
    return NextResponse.json({
      session: {
        id: sessionRow.id,
        status: sessionRow.status,
        startedAt: sessionRow.startedAt.toISOString(),
        submittedAt: toIso(sessionRow.submittedAt),
        violationCount: sessionRow.violationCount,
        autoSubmittedReason: sessionRow.autoSubmittedReason,
      },
    });
  }

  const now = new Date();
  const deadline = computeSessionDeadline(
    sessionRow.startedAt,
    sessionRow.exam.endTime,
    sessionRow.exam.durationMinutes
  );
  const timedOut = now > deadline;
  const status = timedOut ? "AUTO_SUBMITTED" : "SUBMITTED";
  const autoSubmittedReason = timedOut ? "TIME_WINDOW_EXPIRED" : (body.reason ?? null);
  const submittedAnswers = body.answers ?? {};

  const paper = sessionRow.exam.questionPaper;
  const answerKey = getCachedAnswerKeyForPaper(paper.id, "", paper.keyContent);
  const { obtained, scoreMax } = scoreExamAnswers(submittedAnswers, answerKey);

  const updated = await prisma.$transaction(async (tx) => {
    const finalized = await tx.examSession.update({
      where: { id: sessionRow.id },
      data: {
        status,
        submittedAt: now,
        autoSubmittedReason,
        submittedAnswers: submittedAnswers as Prisma.InputJsonValue,
        scoreObtained: obtained,
        scoreMax,
      },
    });

    await tx.examAttempt.create({
      data: {
        studentId: sessionRow.studentId,
        category: sessionRow.exam.category,
        title: sessionRow.exam.title,
        examDate: now,
        marksObtained: obtained,
        maxMarks: scoreMax,
        analysis: `Recorded from ${status === "AUTO_SUBMITTED" ? "auto-submitted" : "submitted"} exam session ${finalized.id}.`,
      },
    });

    return finalized;
  });

  return NextResponse.json({
    session: {
      id: updated.id,
      status: updated.status,
      startedAt: updated.startedAt.toISOString(),
      submittedAt: toIso(updated.submittedAt),
      violationCount: updated.violationCount,
      autoSubmittedReason: updated.autoSubmittedReason,
      scoreObtained: updated.scoreObtained,
      scoreMax: updated.scoreMax,
    },
  });
}
