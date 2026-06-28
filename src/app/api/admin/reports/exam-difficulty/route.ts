import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { buildExamDifficultyBreakdown } from "@/lib/exam-difficulty-breakdown";

export const maxDuration = 60;

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const exams = await prisma.exam.findMany({
      where: {
        examSessions: {
          some: { status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] } },
        },
      },
      orderBy: { startTime: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        category: true,
        startTime: true,
        questionPaper: {
          select: { questionContent: true, keyContent: true },
        },
        examSessions: {
          where: { status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] } },
          select: { submittedAnswers: true },
        },
      },
    });

    const breakdown = buildExamDifficultyBreakdown(
      exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        category: exam.category,
        startTime: exam.startTime,
        questionPaper: exam.questionPaper
          ? {
              questionContent: exam.questionPaper.questionContent,
              keyContent: exam.questionPaper.keyContent ?? "",
            }
          : null,
        examSessions: exam.examSessions,
      }))
    );

    return NextResponse.json({ exams: breakdown });
  } catch (error) {
    console.error("[admin/reports/exam-difficulty]", error);
    return NextResponse.json({ error: "Failed to load exam difficulty" }, { status: 500 });
  }
}
