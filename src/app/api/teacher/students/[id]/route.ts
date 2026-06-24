import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

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
