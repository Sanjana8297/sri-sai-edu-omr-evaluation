import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { generateWrongAnswerExplanations } from "@/lib/analysis-notes-ai";
import { getAiConfigError } from "@/lib/openai-runtime";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

type SessionPaper = {
  submittedAnswers: Record<string, string>;
  category: string;
  questionContent: string;
  keyContent: string;
};

async function loadSessionPaper(sessionId: string, studentId: string): Promise<SessionPaper | null> {
  const examSession = await prisma.examSession.findFirst({
    where: {
      id: sessionId,
      studentId,
      status: { in: ["SUBMITTED", "AUTO_SUBMITTED"] },
    },
    select: {
      submittedAnswers: true,
      exam: {
        select: {
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

  if (!examSession) return null;

  return {
    submittedAnswers:
      (examSession.submittedAnswers as Record<string, string> | null) ?? {},
    category: examSession.exam.category,
    questionContent: examSession.exam.questionPaper.questionContent,
    keyContent: examSession.exam.questionPaper.keyContent,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  const aiConfigError = await getAiConfigError();
  if (aiConfigError) {
    return NextResponse.json({ error: aiConfigError }, { status: 503 });
  }

  const { sessionId } = await context.params;
  const id = sessionId?.trim();
  if (!id) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  let questionKey: string | undefined;
  try {
    const body = (await request.json()) as { questionKey?: string };
    questionKey = body.questionKey?.trim() || undefined;
  } catch {
    questionKey = undefined;
  }

  const paper = await loadSessionPaper(id, session.sub);
  if (!paper) {
    return NextResponse.json({ error: "Exam session not found" }, { status: 404 });
  }

  if (!questionKey) {
    return NextResponse.json({ error: "questionKey is required" }, { status: 400 });
  }

  try {
    const explanations = await generateWrongAnswerExplanations({
      category: paper.category,
      questionContent: paper.questionContent,
      keyContent: paper.keyContent,
      submittedAnswers: paper.submittedAnswers,
      questionKey,
    });

    return NextResponse.json({ explanations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate explanation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
