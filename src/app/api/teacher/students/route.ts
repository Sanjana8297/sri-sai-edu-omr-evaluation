import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const students = await prisma.student.findMany({
    where: { teacherId: session.sub },
    select: { id: true, name: true, email: true, category: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ students });
}
