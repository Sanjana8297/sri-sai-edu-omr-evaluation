import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";

export const maxDuration = 30;

export async function GET() {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  try {
    const students = await prisma.student.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        category: true,
        year: true,
        createdAt: true,
        teacher: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      students: students.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[admin/students]", error);
    return NextResponse.json({ error: "Failed to load students" }, { status: 500 });
  }
}
