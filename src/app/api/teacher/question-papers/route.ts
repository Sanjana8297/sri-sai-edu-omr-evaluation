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

  let body: { title?: string; keyContent?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = body.title?.trim();
  const keyContent = body.keyContent?.trim();
  const category = body.category as Category | undefined;
  if (!title || !keyContent) {
    return NextResponse.json({ error: "Title and answer key are required" }, { status: 400 });
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
      keyContent,
    },
  });
  return NextResponse.json({ paper });
}
