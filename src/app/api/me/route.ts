import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  if (session.role === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { id: session.sub },
      select: { id: true, email: true, name: true },
    });
    if (!admin) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
      user: {
        ...admin,
        role: "ADMIN" as const,
        category: null as string | null,
        teacherId: null as string | null,
      },
    });
  }

  if (session.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { id: session.sub },
      select: { id: true, email: true, name: true, category: true },
    });
    if (!teacher) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    return NextResponse.json({
      user: {
        ...teacher,
        role: "TEACHER" as const,
        teacherId: null as string | null,
      },
    });
  }

  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, category: true, teacherId: true },
  });
  if (!student) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  return NextResponse.json({
    user: {
      ...student,
      role: "STUDENT" as const,
    },
  });
}
