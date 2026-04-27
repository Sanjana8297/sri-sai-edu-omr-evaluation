import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { getAiConfigError, type PaperBlueprint, validateQuestionPaper } from "@/lib/ai-paper-config";

export async function POST(request: Request) {
  const { response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    blueprint?: PaperBlueprint;
    questionContent?: string;
    keyContent?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const blueprint = body.blueprint;
  const questionContent = body.questionContent?.trim();
  const keyContent = body.keyContent?.trim();
  if (!blueprint || !questionContent) {
    return NextResponse.json({ error: "blueprint and questionContent are required" }, { status: 400 });
  }

  try {
    const result = await validateQuestionPaper({ blueprint, questionContent, keyContent });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not validate paper";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
