import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { isLoginIdTaken, resolveAccountIdentifiers } from "@/lib/user-login-id";
import { parseStudentYear } from "@/lib/student-year";

export async function GET() {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  const students = await prisma.student.findMany({
    where: { teacherId: session.sub },
    select: { id: true, name: true, email: true, username: true, category: true, year: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ students, teacher: { category: me.category } });
}

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["TEACHER"]);
  if (response) return response;

  const me = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { id: true, category: true },
  });
  if (!me) {
    return NextResponse.json({ error: "Invalid teacher profile" }, { status: 400 });
  }

  let body: {
    email?: string;
    username?: string;
    password?: string;
    name?: string;
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
  const { value: studentYear, error: yearError } = parseStudentYear(body.year);
  if (yearError) {
    return NextResponse.json({ error: yearError }, { status: 400 });
  }

  if (!password || !name) {
    return NextResponse.json({ error: "Name and password are required" }, { status: 400 });
  }
  if (!ids.email && !ids.username) {
    return NextResponse.json({ error: "Enter an email or username for the student" }, { status: 400 });
  }
  if (await isLoginIdTaken(ids)) {
    return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const student = await prisma.student.create({
    data: {
      email: ids.email,
      username: ids.username,
      passwordHash,
      name,
      category: me.category,
      year: studentYear,
      teacherId: me.id,
    },
    select: { id: true, email: true, username: true, name: true, category: true, year: true },
  });

  return NextResponse.json({ user: { ...student, role: "STUDENT" as const } });
}
