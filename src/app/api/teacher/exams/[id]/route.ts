import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const { id } = await context.params;

  let body: {
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

  const existing = await prisma.exam.findFirst({
    where: { id, teacherId: session.sub },
    select: { id: true, startTime: true, endTime: true, durationMinutes: true, isPublished: true },
  });
  if (!existing) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  const title = body.title?.trim();
  const startTime = body.startTime ? parseDate(body.startTime) : existing.startTime;
  const endTime = body.endTime ? parseDate(body.endTime) : existing.endTime;
  const durationMinutes = body.durationMinutes ?? existing.durationMinutes;
  const isPublished = body.isPublished ?? existing.isPublished;

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "Invalid startTime/endTime" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    return NextResponse.json({ error: "durationMinutes must be between 1 and 480" }, { status: 400 });
  }

  const updated = await prisma.exam.update({
    where: { id },
    data: {
      ...(title ? { title } : {}),
      startTime,
      endTime,
      durationMinutes,
      isPublished,
    },
    include: {
      questionPaper: { select: { id: true, title: true, category: true } },
      _count: { select: { examSessions: true } },
    },
  });

  return NextResponse.json({
    exam: {
      ...updated,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
