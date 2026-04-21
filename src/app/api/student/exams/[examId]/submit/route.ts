import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { computeSessionDeadline, toIso } from "@/lib/proctoring";

export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const sessionRow = await prisma.examSession.findFirst({
    where: { examId, studentId: session.sub },
    include: { exam: true },
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

  const updated = await prisma.examSession.update({
    where: { id: sessionRow.id },
    data: {
      status,
      submittedAt: now,
      autoSubmittedReason,
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
    },
  });
}
