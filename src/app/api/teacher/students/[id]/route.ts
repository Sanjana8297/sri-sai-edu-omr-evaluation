import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const { id } = await context.params;

  const existing = await prisma.student.findFirst({
    where: { id, teacherId: session.sub },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Student not found under your account" }, { status: 404 });
  }

  let body: { rollNumber?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rollNumber =
    body.rollNumber == null ? null : String(body.rollNumber).trim() || null;

  if (rollNumber) {
    const clash = await prisma.student.findFirst({
      where: { teacherId: session.sub, rollNumber, id: { not: existing.id } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json(
        { error: "Another of your students already uses this roll number" },
        { status: 409 }
      );
    }
  }

  const student = await prisma.student.update({
    where: { id: existing.id },
    data: { rollNumber },
    select: { id: true, name: true, rollNumber: true },
  });

  return NextResponse.json({ student });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const { id } = await context.params;

  const existing = await prisma.student.findFirst({
    where: { id, teacherId: session.sub },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Student not found under your account" }, { status: 404 });
  }

  await prisma.student.delete({ where: { id: existing.id } });

  return NextResponse.json({ ok: true, name: existing.name });
}
