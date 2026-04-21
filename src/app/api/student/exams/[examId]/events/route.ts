import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { VIOLATION_LIMIT, computeSessionDeadline, toIso } from "@/lib/proctoring";
import { Prisma } from "@prisma/client";
import type { ProctoringEventType } from "@prisma/client";

const strikeEvents: ProctoringEventType[] = ["TAB_HIDDEN", "WINDOW_BLUR"];

export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;
  const { examId } = await context.params;

  let body: { eventType?: ProctoringEventType; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.eventType) {
    return NextResponse.json({ error: "eventType is required" }, { status: 400 });
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
  const deadline = computeSessionDeadline(sessionRow.startedAt, sessionRow.exam.endTime, sessionRow.exam.durationMinutes);
  if (now > deadline) {
    return NextResponse.json({ error: "Exam session has ended" }, { status: 409 });
  }

  const shouldStrike = strikeEvents.includes(body.eventType);
  let nextViolationCount = sessionRow.violationCount;
  if (shouldStrike) nextViolationCount += 1;

  const result = await prisma.$transaction(async (tx) => {
    await tx.proctoringEvent.create({
      data: {
        sessionId: sessionRow.id,
        eventType: body.eventType!,
        ...(body.metadata !== undefined ? { metadata: body.metadata as Prisma.InputJsonValue } : {}),
      },
    });

    if (nextViolationCount >= VIOLATION_LIMIT) {
      const autoSubmitted = await tx.examSession.update({
        where: { id: sessionRow.id },
        data: {
          violationCount: nextViolationCount,
          status: "AUTO_SUBMITTED",
          submittedAt: new Date(),
          autoSubmittedReason: "VIOLATION_LIMIT_REACHED",
        },
      });
      return { session: autoSubmitted, autoSubmitted: true };
    }

    const updated = await tx.examSession.update({
      where: { id: sessionRow.id },
      data: {
        ...(shouldStrike ? { violationCount: nextViolationCount } : {}),
      },
    });
    return { session: updated, autoSubmitted: false };
  });

  return NextResponse.json({
    session: {
      id: result.session.id,
      status: result.session.status,
      startedAt: result.session.startedAt.toISOString(),
      submittedAt: toIso(result.session.submittedAt),
      violationCount: result.session.violationCount,
      cameraGranted: result.session.cameraGranted,
      micGranted: result.session.micGranted,
      autoSubmittedReason: result.session.autoSubmittedReason,
    },
    autoSubmitted: result.autoSubmitted,
    violationLimit: VIOLATION_LIMIT,
  });
}
