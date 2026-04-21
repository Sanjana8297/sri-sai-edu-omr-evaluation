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

  const exams = await prisma.exam.findMany({
    where: { category: me.category, isPublished: true },
    orderBy: [{ startTime: "asc" }],
    include: {
      questionPaper: {
        select: { id: true, title: true, questionPaperUrl: true, questionContent: true },
      },
      examSessions: {
        where: { studentId: me.id },
        select: { id: true, status: true, violationCount: true, startedAt: true, submittedAt: true },
      },
    },
  });

  const now = Date.now();
  return NextResponse.json({
    now: new Date(now).toISOString(),
    exams: exams.map((exam) => {
      const status =
        now < exam.startTime.getTime() ? "UPCOMING" : now > exam.endTime.getTime() ? "ENDED" : "LIVE";
      return {
        ...exam,
        status,
        startTime: exam.startTime.toISOString(),
        endTime: exam.endTime.toISOString(),
        createdAt: exam.createdAt.toISOString(),
        updatedAt: exam.updatedAt.toISOString(),
        examSessions: exam.examSessions.map((s) => ({
          ...s,
          startedAt: s.startedAt.toISOString(),
          submittedAt: s.submittedAt?.toISOString() ?? null,
        })),
      };
    }),
  });
}
