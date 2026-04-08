import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import type { Category } from "@/lib/types";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const papers = await prisma.questionPaper.findMany({
    where: { teacherId: session.sub },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ papers });
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({ where: { id: session.sub } });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  let body: { title?: string; questionContent?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = body.title?.trim();
  const questionContent = body.questionContent?.trim();
  const category = body.category as Category | undefined;
  if (!title || !questionContent) {
    return NextResponse.json({ error: "Title and question paper content are required" }, { status: 400 });
  }
  if (category !== "JEE" && category !== "NEET") {
    return NextResponse.json({ error: "Category must be JEE or NEET" }, { status: 400 });
  }
  if (category !== me.category) {
    return NextResponse.json({ error: "Category must match your assigned track" }, { status: 400 });
  }

  const paper = await prisma.questionPaper.create({
    data: {
      teacherId: session.sub,
      category,
      title,
      questionContent,
      keyContent: "",
    },
  });
  return NextResponse.json({ paper });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  let body: { paperId?: string; keyContent?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paperId = body.paperId?.trim();
  const keyContent = body.keyContent?.trim();
  if (!paperId || !keyContent) {
    return NextResponse.json({ error: "paperId and answer key are required" }, { status: 400 });
  }

  const paper = await prisma.questionPaper.findFirst({
    where: { id: paperId, teacherId: session.sub },
    select: { id: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "Question paper not found under your account" }, { status: 404 });
  }

  const updated = await prisma.questionPaper.update({
    where: { id: paperId },
    data: { keyContent },
  });
  return NextResponse.json({ paper: updated });
}
