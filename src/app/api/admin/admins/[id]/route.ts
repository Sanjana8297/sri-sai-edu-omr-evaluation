import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const { id } = await context.params;

  if (session.sub === id) {
    return NextResponse.json({ error: "You cannot delete your own admin account" }, { status: 400 });
  }

  const existing = await prisma.admin.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const adminCount = await prisma.admin.count();
  if (adminCount <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin account" }, { status: 400 });
  }

  await prisma.admin.delete({ where: { id } });

  return NextResponse.json({ ok: true, name: existing.name });
}
