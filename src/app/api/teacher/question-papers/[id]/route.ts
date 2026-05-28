import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Paper id is required" }, { status: 400 });
  }

  const paper = await prisma.questionPaper.findFirst({
    where: { id: id.trim(), teacherId: session.sub },
    select: {
      id: true,
      title: true,
      category: true,
      questionContent: true,
      keyContent: true,
      questionPaperUrl: true,
    },
  });

  if (!paper) {
    return NextResponse.json({ error: "Question paper not found" }, { status: 404 });
  }

  return NextResponse.json({ paper });
}
