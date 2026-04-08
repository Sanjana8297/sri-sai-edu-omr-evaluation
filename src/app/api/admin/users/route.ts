import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { isEmailTaken } from "@/lib/email-taken";
import type { Category, Role } from "@/lib/types";

export async function POST(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    category?: string;
    teacherId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim();
  const role = body.role as Role | undefined;
  const category = body.category as Category | undefined;
  const teacherId = body.teacherId ?? null;

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (role !== "STUDENT" && role !== "TEACHER") {
    return NextResponse.json({ error: "Role must be STUDENT or TEACHER" }, { status: 400 });
  }
  if (!category || (category !== "JEE" && category !== "NEET")) {
    return NextResponse.json({ error: "Category must be JEE or NEET" }, { status: 400 });
  }
  if (role === "STUDENT") {
    if (!teacherId) {
      return NextResponse.json({ error: "Students must be assigned to a teacher" }, { status: 400 });
    }
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId },
    });
    if (!teacher) {
      return NextResponse.json({ error: "Invalid teacher" }, { status: 400 });
    }
    if (teacher.category !== category) {
      return NextResponse.json({ error: "Student category must match teacher category" }, { status: 400 });
    }
  }

  if (await isEmailTaken(email)) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (role === "TEACHER") {
    const teacher = await prisma.teacher.create({
      data: { email, passwordHash, name, category },
      select: { id: true, email: true, name: true, category: true },
    });
    return NextResponse.json({ user: { ...teacher, role: "TEACHER" as const } });
  }

  const student = await prisma.student.create({
    data: {
      email,
      passwordHash,
      name,
      category,
      teacherId: teacherId!,
    },
    select: { id: true, email: true, name: true, category: true },
  });
  return NextResponse.json({ user: { ...student, role: "STUDENT" as const } });
}
