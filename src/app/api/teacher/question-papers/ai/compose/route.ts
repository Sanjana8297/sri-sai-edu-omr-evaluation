import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { composeQuestionPaper, getAiConfigError, type PaperBlueprint } from "@/lib/ai-paper-config";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    title?: string;
    blueprint?: PaperBlueprint;
    additionalConstraints?: string;
    saveAsPaper?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = body.title?.trim();
  const blueprint = body.blueprint;
  if (!title || !blueprint) {
    return NextResponse.json({ error: "title and blueprint are required" }, { status: 400 });
  }

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { category: true },
  });
  if (!me) return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  if (blueprint.category !== me.category) {
    return NextResponse.json({ error: "Blueprint category must match your assigned track" }, { status: 400 });
  }

  try {
    const generated = await composeQuestionPaper({
      title,
      category: me.category as "JEE" | "NEET",
      blueprint,
      additionalConstraints: body.additionalConstraints?.trim(),
    });

    if (!body.saveAsPaper) {
      return NextResponse.json({ generated });
    }

    const paper = await prisma.questionPaper.create({
      data: {
        teacherId: session.sub,
        category: me.category,
        title,
        questionContent: generated.questionContent,
        keyContent: generated.keyContent,
        isAiGenerated: true,
        aiPromptVersion: "v1",
        aiConfig: blueprint,
        generationMeta: {
          warnings: generated.warnings,
          model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ generated, paper });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not compose paper";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
