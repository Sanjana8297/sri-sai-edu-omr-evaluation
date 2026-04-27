import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getAiConfigError, generateBlueprint } from "@/lib/ai-paper-config";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    subject?: string;
    durationMinutes?: number;
    totalQuestions?: number;
    difficultyDistribution?: string;
    extraInstructions?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subject = body.subject?.trim();
  const durationMinutes = body.durationMinutes;
  const totalQuestions = body.totalQuestions;
  if (!subject || typeof durationMinutes !== "number" || typeof totalQuestions !== "number") {
    return NextResponse.json({ error: "subject, durationMinutes, and totalQuestions are required" }, { status: 400 });
  }

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });

  try {
    const blueprint = await generateBlueprint({
      category: me.category as "JEE" | "NEET",
      subject,
      durationMinutes,
      totalQuestions,
      difficultyDistribution: body.difficultyDistribution?.trim(),
      extraInstructions: body.extraInstructions?.trim(),
    });

    return NextResponse.json({ blueprint });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not generate blueprint";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
