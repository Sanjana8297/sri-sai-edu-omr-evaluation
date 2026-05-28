import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { isEmailTaken } from "@/lib/email-taken";

type BulkRow = {
  name?: string;
  email?: string;
  password?: string;
  category?: string;
  teacherEmail?: string;
};

export async function POST(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: { students?: BulkRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows = body.students ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }
  if (rows.length > 200) {
    return NextResponse.json({ error: "Maximum 200 rows per import" }, { status: 400 });
  }

  const teachers = await prisma.teacher.findMany({
    select: { id: true, email: true, category: true },
  });
  const teacherByEmail = new Map(teachers.map((t) => [t.email.toLowerCase(), t]));

  const created: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const name = row.name?.trim();
    const email = row.email?.trim().toLowerCase();
    const password = row.password?.trim() || "ChangeMe123!";
    const category = row.category?.trim().toUpperCase();
    const teacherEmail = row.teacherEmail?.trim().toLowerCase();

    if (!name || !email || (category !== "JEE" && category !== "NEET")) {
      errors.push(`Row ${line}: name, email, and category (JEE/NEET) are required`);
      continue;
    }
    if (!teacherEmail) {
      errors.push(`Row ${line}: teacherEmail is required`);
      continue;
    }
    const teacher = teacherByEmail.get(teacherEmail);
    if (!teacher) {
      errors.push(`Row ${line}: teacher not found (${teacherEmail})`);
      continue;
    }
    if (teacher.category !== category) {
      errors.push(`Row ${line}: category must match teacher track (${teacher.category})`);
      continue;
    }
    if (await isEmailTaken(email)) {
      errors.push(`Row ${line}: email already in use (${email})`);
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.student.create({
      data: { email, passwordHash, name, category, teacherId: teacher.id },
    });
    created.push(email);
  }

  return NextResponse.json({
    created: created.length,
    failed: errors.length,
    errors: errors.slice(0, 20),
  });
}
