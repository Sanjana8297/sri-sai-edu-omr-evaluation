import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  const me = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) return NextResponse.json({ error: "Invalid student profile" }, { status: 400 });

  const now = new Date();

  const exams = await prisma.exam.findMany({
    where: {
      category: me.category,
      isPublished: true,
      startTime: { lte: now },
      endTime: { gte: now },
      NOT: {
        examSessions: {
          some: {
            studentId: me.id,
            status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
          },
        },
      },
    },
    orderBy: [{ startTime: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      examSessions: {
        where: { studentId: me.id },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, status: true, violationCount: true, startedAt: true, submittedAt: true },
      },
    },
  });

  return NextResponse.json({
    now: now.toISOString(),
    exams: exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      category: exam.category,
      status: "LIVE" as const,
      startTime: exam.startTime.toISOString(),
      endTime: exam.endTime.toISOString(),
      durationMinutes: exam.durationMinutes,
      examSessions: exam.examSessions.map((s) => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        submittedAt: s.submittedAt?.toISOString() ?? null,
      })),
    })),
  });
}
