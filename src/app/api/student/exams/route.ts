import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  const sessions = await prisma.examSession.findMany({
    where: {
      studentId: session.sub,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    orderBy: { submittedAt: "desc" },
    include: {
      exam: {
        select: { id: true, title: true, category: true },
      },
    },
  });

  const exams = sessions.map((s) => ({
    id: s.id,
    examId: s.exam.id,
    title: s.exam.title,
    category: s.exam.category,
    examDate: (s.submittedAt ?? s.startedAt).toISOString(),
    marksObtained: s.scoreObtained ?? 0,
    maxMarks: s.scoreMax ?? 0,
    percentage:
      s.scoreMax && s.scoreMax > 0
        ? Math.round(((s.scoreObtained ?? 0) / s.scoreMax) * 1000) / 10
        : 0,
    status: s.status,
  }));

  return NextResponse.json({ exams });
}
