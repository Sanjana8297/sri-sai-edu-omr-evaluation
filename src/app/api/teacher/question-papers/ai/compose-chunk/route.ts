import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  composePaperChunk,
  getAiConfigError,
  type ExamSection,
  type PaperBlueprint,
} from "@/lib/ai-paper-config";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const aiConfigError = await getAiConfigError();
  if (aiConfigError) return NextResponse.json({ error: aiConfigError }, { status: 503 });

  let body: {
    title?: string;
    blueprint?: PaperBlueprint;
    additionalConstraints?: string;
    section?: ExamSection;
    questionStart?: number;
    questionCount?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = body.title?.trim();
  const blueprint = body.blueprint;
  const section = body.section;
  const questionStart = body.questionStart;
  const questionCount = body.questionCount;

  if (!title || !blueprint || !section) {
    return NextResponse.json({ error: "title, blueprint, and section are required" }, { status: 400 });
  }
  if (typeof questionStart !== "number" || !Number.isInteger(questionStart) || questionStart < 1) {
    return NextResponse.json({ error: "questionStart must be a positive integer" }, { status: 400 });
  }
  if (typeof questionCount !== "number" || !Number.isInteger(questionCount) || questionCount < 1) {
    return NextResponse.json({ error: "questionCount must be a positive integer" }, { status: 400 });
  }
  if (questionStart + questionCount - 1 > section.questionCount) {
    return NextResponse.json({ error: "Chunk exceeds section question count" }, { status: 400 });
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
    const generated = await composePaperChunk({
      title,
      category: me.category as "JEE" | "NEET",
      blueprint,
      additionalConstraints: body.additionalConstraints?.trim(),
      section,
      questionStart,
      questionCount,
    });
    return NextResponse.json({ generated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not compose paper chunk";
    const isUpstream = msg.startsWith("AI request failed");
    return NextResponse.json({ error: msg }, { status: isUpstream ? 502 : 400 });
  }
}
