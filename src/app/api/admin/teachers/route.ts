import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true, email: true, category: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ teachers });
}
