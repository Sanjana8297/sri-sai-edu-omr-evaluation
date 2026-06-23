import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, username: true, category: true },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  return NextResponse.json({ teacher });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const existing = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  await prisma.teacher.delete({ where: { id } });

  return NextResponse.json({
    ok: true,
    name: existing.name,
    deletedStudents: existing._count.students,
  });
}
