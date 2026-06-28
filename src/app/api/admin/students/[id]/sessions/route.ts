import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, name: true, category: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      studentId: id,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      scoreObtained: true,
      scoreMax: true,
      submittedAnswers: true,
      exam: {
        select: {
          id: true,
          title: true,
          category: true,
          questionPaper: { select: { questionContent: true, keyContent: true } },
        },
      },
    },
  });

  return NextResponse.json({
    student,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      scoreObtained: s.scoreObtained ?? 0,
      scoreMax: s.scoreMax ?? 0,
      submittedAnswers: (s.submittedAnswers as Record<string, string> | null) ?? {},
      exam: {
        id: s.exam.id,
        title: s.exam.title,
        category: s.exam.category,
        questionContent: s.exam.questionPaper.questionContent,
        keyContent: s.exam.questionPaper.keyContent,
      },
    })),
  });
}
