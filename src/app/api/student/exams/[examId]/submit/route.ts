import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline, toIso } from "@/lib/proctoring";
import { parseAnswerKeyByQuestion } from "@/lib/exam-paper-parser";
import { Prisma } from "@prisma/client";

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
    include: { exam: { include: { questionPaper: true } } },
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
  const deadline = computeSessionDeadline(sessionRow.startedAt, sessionRow.exam.endTime, sessionRow.exam.durationMinutes);
  const timedOut = now > deadline;
  const status = timedOut ? "AUTO_SUBMITTED" : "SUBMITTED";
  const autoSubmittedReason = timedOut ? "TIME_WINDOW_EXPIRED" : (body.reason ?? null);
  const submittedAnswers = body.answers ?? {};

  const answerKey = parseAnswerKeyByQuestion(sessionRow.exam.questionPaper.keyContent ?? "");
  const keyEntries = Object.entries(answerKey);
  let obtained = 0;
  for (const [questionId, expected] of keyEntries) {
    const selectedRaw = submittedAnswers[questionId];
    if (!selectedRaw) continue;
    const selected = selectedRaw.trim().toUpperCase();
    const normalizedExpected = expected.trim().toUpperCase();
    if (selected === normalizedExpected) {
      obtained += 4;
    } else {
      obtained -= 1;
    }
  }
  const scoreMax = keyEntries.length * 4;

  const updated = await prisma.examSession.update({
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
