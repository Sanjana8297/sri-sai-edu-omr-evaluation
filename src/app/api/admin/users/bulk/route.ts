import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import { isLoginIdTaken, normalizeEmail, normalizeUsername, resolveAccountIdentifiers } from "@/lib/user-login-id";

type BulkRow = {
  name?: string;
  email?: string;
  username?: string;
  password?: string;
  category?: string;
  teacherEmail?: string;
  teacherUsername?: string;
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
    select: { id: true, email: true, username: true, category: true },
  });
  const teacherByEmail = new Map(
    teachers.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t])
  );
  const teacherByUsername = new Map(
    teachers.filter((t) => t.username).map((t) => [t.username!, t])
  );

  const created: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const name = row.name?.trim();
    const password = row.password?.trim() || "ChangeMe123!";
    const category = row.category?.trim().toUpperCase();
    const teacherEmail = row.teacherEmail?.trim().toLowerCase();
    const teacherUsername = row.teacherUsername?.trim().toLowerCase();

    const { ids, error: idError } = resolveAccountIdentifiers({
      email: row.email,
      username: row.username,
    });
    if (idError) {
      errors.push(`Row ${line}: ${idError}`);
      continue;
    }

    if (!name || (category !== "JEE" && category !== "NEET")) {
      errors.push(`Row ${line}: name and category (JEE/NEET) are required`);
      continue;
    }
    if (!teacherEmail && !teacherUsername) {
      errors.push(`Row ${line}: teacherEmail or teacherUsername is required`);
      continue;
    }

    const teacher =
      (teacherEmail ? teacherByEmail.get(normalizeEmail(teacherEmail)) : undefined) ??
      (teacherUsername ? teacherByUsername.get(normalizeUsername(teacherUsername)) : undefined);

    if (!teacher) {
      errors.push(`Row ${line}: teacher not found (${teacherEmail ?? teacherUsername})`);
      continue;
    }
    if (teacher.category !== category) {
      errors.push(`Row ${line}: category must match teacher track (${teacher.category})`);
      continue;
    }
    if (await isLoginIdTaken(ids)) {
      errors.push(
        `Row ${line}: login id already in use (${ids.email ?? ids.username})`
      );
      continue;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.student.create({
      data: {
        email: ids.email,
        username: ids.username,
        passwordHash,
        name,
        category,
        teacherId: teacher.id,
      },
    });
    created.push(ids.email ?? ids.username ?? name);
  }

  return NextResponse.json({
    created: created.length,
    failed: errors.length,
    errors: errors.slice(0, 20),
  });
}
