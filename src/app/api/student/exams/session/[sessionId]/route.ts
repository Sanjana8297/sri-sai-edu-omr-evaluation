import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  const { sessionId } = await context.params;
  const id = sessionId?.trim();
  if (!id) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const examSession = await prisma.examSession.findFirst({
    where: {
      id,
      studentId: session.sub,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
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
          questionPaper: {
            select: {
              questionContent: true,
              keyContent: true,
            },
          },
        },
      },
    },
  });

  if (!examSession) {
    return NextResponse.json({ error: "Exam session not found" }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      id: examSession.id,
      status: examSession.status,
      submittedAt: examSession.submittedAt?.toISOString() ?? null,
      scoreObtained: examSession.scoreObtained ?? 0,
      scoreMax: examSession.scoreMax ?? 0,
      submittedAnswers:
        (examSession.submittedAnswers as Record<string, string> | null) ?? {},
      exam: {
        id: examSession.exam.id,
        title: examSession.exam.title,
        category: examSession.exam.category,
        questionContent: examSession.exam.questionPaper.questionContent,
        keyContent: examSession.exam.questionPaper.keyContent,
      },
    },
  });
}

