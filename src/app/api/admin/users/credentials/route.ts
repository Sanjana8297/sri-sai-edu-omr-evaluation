import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRoles } from "@/lib/api-auth";
import {
  isLoginIdTakenExcept,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  type AccountIdentifiers,
} from "@/lib/user-login-id";

type CredentialRole = "STUDENT" | "TEACHER" | "ADMIN";

function parseOptionalEmail(raw: unknown): { value: string | null | undefined; error: string | null } {
  if (raw === undefined) return { value: undefined, error: null };
  if (raw === null || (typeof raw === "string" && !raw.trim())) return { value: null, error: null };
  if (typeof raw !== "string") return { value: undefined, error: "Invalid email" };
  const normalized = normalizeEmail(raw);
  if (!isValidEmail(normalized)) return { value: undefined, error: "Invalid email format" };
  return { value: normalized, error: null };
}

function parseOptionalUsername(raw: unknown): { value: string | null | undefined; error: string | null } {
  if (raw === undefined) return { value: undefined, error: null };
  if (raw === null || (typeof raw === "string" && !raw.trim())) return { value: null, error: null };
  if (typeof raw !== "string") return { value: undefined, error: "Invalid username" };
  const normalized = normalizeUsername(raw);
  if (!isValidUsername(normalized)) {
    return {
      value: undefined,
      error: "Username must be 3–32 characters and use only letters, numbers, dots, hyphens, or underscores",
    };
  }
  return { value: normalized, error: null };
}

export async function PATCH(request: Request) {
  const { response } = await requireRoles(["ADMIN"]);
  if (response) return response;

  let body: {
    role?: string;
    userId?: string;
    email?: string | null;
    username?: string | null;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = body.role as CredentialRole | undefined;
  const userId = body.userId?.trim();
  const password = body.password?.trim();

  if (!role || (role !== "STUDENT" && role !== "TEACHER" && role !== "ADMIN")) {
    return NextResponse.json({ error: "Role must be STUDENT, TEACHER, or ADMIN" }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const emailParsed = parseOptionalEmail(body.email);
  if (emailParsed.error) return NextResponse.json({ error: emailParsed.error }, { status: 400 });

  const usernameParsed = parseOptionalUsername(body.username);
  if (usernameParsed.error) return NextResponse.json({ error: usernameParsed.error }, { status: 400 });

  if (
    emailParsed.value === undefined &&
    usernameParsed.value === undefined &&
    !password
  ) {
    return NextResponse.json(
      { error: "Provide a new email, username, and/or password to update" },
      { status: 400 }
    );
  }

  if (role === "ADMIN") {
    const admin = await prisma.admin.findUnique({ where: { id: userId } });
    if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

    const nextEmail = emailParsed.value === undefined ? admin.email : emailParsed.value;
    const nextUsername = usernameParsed.value === undefined ? admin.username : usernameParsed.value;

    if (!nextEmail && !nextUsername) {
      return NextResponse.json({ error: "Admin must have an email or username" }, { status: 400 });
    }

    const ids: AccountIdentifiers = { email: nextEmail, username: nextUsername };
    if (await isLoginIdTakenExcept(ids, { role: "ADMIN", id: admin.id })) {
      return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
    }

    const data: { email?: string | null; username?: string | null; passwordHash?: string } = {};
    if (emailParsed.value !== undefined && emailParsed.value !== admin.email) {
      data.email = nextEmail;
    }
    if (usernameParsed.value !== undefined && usernameParsed.value !== admin.username) {
      data.username = nextUsername;
    }
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });
    }

    const updated = await prisma.admin.update({
      where: { id: admin.id },
      data,
      select: { id: true, name: true, email: true, username: true },
    });
    return NextResponse.json({ user: { ...updated, role: "ADMIN" as const } });
  }

  if (role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

    const nextEmail = emailParsed.value === undefined ? teacher.email : emailParsed.value;
    const nextUsername = usernameParsed.value === undefined ? teacher.username : usernameParsed.value;

    if (!nextEmail && !nextUsername) {
      return NextResponse.json({ error: "Teacher must have an email or username" }, { status: 400 });
    }

    const ids: AccountIdentifiers = { email: nextEmail, username: nextUsername };
    if (await isLoginIdTakenExcept(ids, { role: "TEACHER", id: teacher.id })) {
      return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
    }

    const data: { email?: string | null; username?: string | null; passwordHash?: string } = {};
    if (emailParsed.value !== undefined && emailParsed.value !== teacher.email) {
      data.email = nextEmail;
    }
    if (usernameParsed.value !== undefined && usernameParsed.value !== teacher.username) {
      data.username = nextUsername;
    }
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });
    }

    const updated = await prisma.teacher.update({
      where: { id: teacher.id },
      data,
      select: { id: true, name: true, email: true, username: true, category: true },
    });
    return NextResponse.json({ user: { ...updated, role: "TEACHER" as const } });
  }

  const student = await prisma.student.findUnique({ where: { id: userId } });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const nextEmail = emailParsed.value === undefined ? student.email : emailParsed.value;
  const nextUsername = usernameParsed.value === undefined ? student.username : usernameParsed.value;

  if (!nextEmail && !nextUsername) {
    return NextResponse.json({ error: "Student must have an email or username" }, { status: 400 });
  }

  const ids: AccountIdentifiers = { email: nextEmail, username: nextUsername };
  if (await isLoginIdTakenExcept(ids, { role: "STUDENT", id: student.id })) {
    return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
  }

  const data: { email?: string | null; username?: string | null; passwordHash?: string } = {};
  if (emailParsed.value !== undefined && emailParsed.value !== student.email) {
    data.email = nextEmail;
  }
  if (usernameParsed.value !== undefined && usernameParsed.value !== student.username) {
    data.username = nextUsername;
  }
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes to save" }, { status: 400 });
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data,
    select: { id: true, name: true, email: true, username: true, category: true },
  });
  return NextResponse.json({ user: { ...updated, role: "STUDENT" as const } });
}
