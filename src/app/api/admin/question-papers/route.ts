import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const teacherId = new URL(request.url).searchParams.get("teacherId")?.trim();
  if (!teacherId) {
    return NextResponse.json({ error: "teacherId is required" }, { status: 400 });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  const papers = await prisma.questionPaper.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, category: true },
  });

  return NextResponse.json({ papers });
}
