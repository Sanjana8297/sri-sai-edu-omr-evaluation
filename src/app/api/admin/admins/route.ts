import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  const admins = await prisma.admin.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ admins });
}
