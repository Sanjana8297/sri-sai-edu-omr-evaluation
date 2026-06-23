import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      category: true,
      teacher: { select: { id: true, name: true } },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const attempts = await prisma.examAttempt.findMany({
    where: { studentId: id },
    orderBy: { examDate: "desc" },
    select: {
      id: true,
      category: true,
      title: true,
      examDate: true,
      marksObtained: true,
      maxMarks: true,
    },
  });

  return NextResponse.json({
    student,
    attempts: attempts.map((a) => ({
      ...a,
      examDate: a.examDate.toISOString(),
      percentage:
        a.maxMarks > 0 ? Math.round((a.marksObtained / a.maxMarks) * 1000) / 10 : 0,
    })),
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const existing = await prisma.student.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  await prisma.student.delete({ where: { id } });

  return NextResponse.json({ ok: true, name: existing.name });
}
