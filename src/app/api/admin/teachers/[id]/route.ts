import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import {
  extractPaperAccessFromCbtDefaults,
  mergePaperAccessIntoCbtDefaults,
  parsePaperAccess,
} from "@/lib/admin-staff-storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, username: true, category: true, cbtDefaults: true },
  });
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  const paperAccess = extractPaperAccessFromCbtDefaults(teacher.cbtDefaults);
  return NextResponse.json({
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      username: teacher.username,
      category: teacher.category,
    },
    paperAccess,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("paperAccess" in body)) {
    return NextResponse.json({ error: "paperAccess is required" }, { status: 400 });
  }

  const access = parsePaperAccess((body as { paperAccess: unknown }).paperAccess);
  const existingRows = await prisma.$queryRawUnsafe<Array<{ cbtDefaults: unknown }>>(
    `SELECT "cbtDefaults" FROM "Teacher" WHERE id = $1 LIMIT 1`,
    id,
  );
  if (existingRows.length === 0) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  const mergedDefaults = mergePaperAccessIntoCbtDefaults(existingRows[0]?.cbtDefaults ?? null, access);
  await prisma.$executeRawUnsafe(
    `UPDATE "Teacher" SET "cbtDefaults" = $1::jsonb WHERE id = $2`,
    JSON.stringify(mergedDefaults),
    id,
  );

  return NextResponse.json({ ok: true, paperAccess: access });
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
