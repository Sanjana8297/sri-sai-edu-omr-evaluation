import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { isLoginIdTaken, resolveAccountIdentifiers } from "@/lib/user-login-id";
import { parseStudentYear } from "@/lib/student-year";
import type { Category, Role } from "@/lib/types";

export async function POST(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: {
    email?: string;
    username?: string;
    password?: string;
    name?: string;
    role?: string;
    category?: string;
    teacherId?: string | null;
    year?: number | string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ids, error: idError } = resolveAccountIdentifiers({
    email: body.email,
    username: body.username,
  });
  if (idError) {
    return NextResponse.json({ error: idError }, { status: 400 });
  }

  const password = body.password;
  const name = body.name?.trim();
  const role = body.role as Role | undefined;
  const category = body.category as Category | undefined;
  const teacherId = body.teacherId ?? null;
  const { value: studentYear, error: yearError } = parseStudentYear(body.year);
  if (yearError) {
    return NextResponse.json({ error: yearError }, { status: 400 });
  }

  if (!password || !name || !role) {
    return NextResponse.json({ error: "Name, password, and role are required" }, { status: 400 });
  }
  if (role !== "STUDENT" && role !== "TEACHER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Role must be STUDENT, TEACHER, or ADMIN" }, { status: 400 });
  }

  if (role === "ADMIN") {
    if (!ids.email && !ids.username) {
      return NextResponse.json({ error: "Admin accounts require an email or username" }, { status: 400 });
    }
    if (await isLoginIdTaken(ids)) {
      return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: {
        email: ids.email,
        username: ids.username,
        passwordHash,
        name,
      },
      select: { id: true, email: true, username: true, name: true },
    });
    return NextResponse.json({ user: { ...admin, role: "ADMIN" as const } });
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

  if (await isLoginIdTaken(ids)) {
    return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (role === "TEACHER") {
    const teacher = await prisma.teacher.create({
      data: {
        email: ids.email,
        username: ids.username,
        passwordHash,
        name,
        category,
      },
      select: { id: true, email: true, username: true, name: true, category: true },
    });
    return NextResponse.json({ user: { ...teacher, role: "TEACHER" as const } });
  }

  const student = await prisma.student.create({
    data: {
      email: ids.email,
      username: ids.username,
      passwordHash,
      name,
      category,
      year: studentYear,
      teacherId: teacherId!,
    },
    select: { id: true, email: true, username: true, name: true, category: true, year: true },
  });
  return NextResponse.json({ user: { ...student, role: "STUDENT" as const } });
}
