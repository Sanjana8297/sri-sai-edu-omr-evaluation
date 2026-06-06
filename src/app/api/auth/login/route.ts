import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { parseLoginIdentifier, sessionLoginLabel } from "@/lib/user-login-id";
import type { Role } from "@/lib/types";

async function verifyPasswordOrLegacyPlainText(
  inputPassword: string,
  storedPasswordHash: string,
): Promise<boolean> {
  const looksHashed = storedPasswordHash.startsWith("$2a$") || storedPasswordHash.startsWith("$2b$");
  if (looksHashed) {
    return bcrypt.compare(inputPassword, storedPasswordHash);
  }
  return inputPassword === storedPasswordHash;
}

function roleRedirect(role: Role): string {
  return role === "ADMIN"
    ? "/dashboard/admin"
    : role === "TEACHER"
      ? "/dashboard/teacher"
      : "/dashboard/student/performance-summary";
}

type LoginLookup =
  | { kind: "email"; value: string }
  | { kind: "username"; value: string };

async function findAdmin(lookup: LoginLookup) {
  if (lookup.kind === "username") return null;
  return prisma.admin.findUnique({ where: { email: lookup.value } });
}

async function findTeacher(lookup: LoginLookup) {
  return lookup.kind === "email"
    ? prisma.teacher.findUnique({ where: { email: lookup.value } })
    : prisma.teacher.findUnique({ where: { username: lookup.value } });
}

async function findStudent(lookup: LoginLookup) {
  return lookup.kind === "email"
    ? prisma.student.findUnique({ where: { email: lookup.value } })
    : prisma.student.findUnique({ where: { username: lookup.value } });
}

async function findOtherRoleAccount(lookup: LoginLookup, exclude: Role) {
  const [admin, teacher, student] = await Promise.all([
    exclude === "ADMIN" ? null : findAdmin(lookup),
    exclude === "TEACHER" ? null : findTeacher(lookup),
    exclude === "STUDENT" ? null : findStudent(lookup),
  ]);
  if (admin) return "ADMIN" as const;
  if (teacher) return "TEACHER" as const;
  if (student) return "STUDENT" as const;
  return null;
}

export async function POST(request: Request) {
  try {
    let body: { email?: string; loginId?: string; password?: string; role?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawLogin = (body.loginId ?? body.email)?.trim() ?? "";
    const password = body.password;
    const role = body.role as Role | undefined;
    const lookup = parseLoginIdentifier(rawLogin);

    if (!lookup || !password) {
      return NextResponse.json({ error: "Email or username and password are required" }, { status: 400 });
    }
    if (role !== "ADMIN" && role !== "TEACHER" && role !== "STUDENT") {
      return NextResponse.json({ error: "Role must be ADMIN, TEACHER, or STUDENT" }, { status: 400 });
    }
    if (role === "ADMIN" && lookup.kind === "username") {
      return NextResponse.json({ error: "Administrators must sign in with email" }, { status: 400 });
    }

    if (role === "ADMIN") {
      const admin = await findAdmin(lookup);
      if (!admin) {
        const actualRole = await findOtherRoleAccount(lookup, "ADMIN");
        if (actualRole) {
          return NextResponse.json(
            { error: `This account is registered as ${actualRole}. Please select ${actualRole} and try again.` },
            { status: 401 },
          );
        }
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      const ok = await verifyPasswordOrLegacyPlainText(password, admin.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (!admin.passwordHash.startsWith("$2")) {
        const upgradedHash = await bcrypt.hash(password, 10);
        await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash: upgradedHash } });
      }
      const token = await createSessionToken({
        sub: admin.id,
        email: sessionLoginLabel(admin),
        role: "ADMIN",
        name: admin.name,
      });
      await setSessionCookie(token);
      return NextResponse.json({ ok: true, redirect: roleRedirect("ADMIN") });
    }

    if (role === "TEACHER") {
      const teacher = await findTeacher(lookup);
      if (!teacher) {
        const actualRole = await findOtherRoleAccount(lookup, "TEACHER");
        if (actualRole) {
          return NextResponse.json(
            { error: `This account is registered as ${actualRole}. Please select ${actualRole} and try again.` },
            { status: 401 },
          );
        }
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      const ok = await verifyPasswordOrLegacyPlainText(password, teacher.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (!teacher.passwordHash.startsWith("$2")) {
        const upgradedHash = await bcrypt.hash(password, 10);
        await prisma.teacher.update({ where: { id: teacher.id }, data: { passwordHash: upgradedHash } });
      }
      const token = await createSessionToken({
        sub: teacher.id,
        email: sessionLoginLabel(teacher),
        role: "TEACHER",
        name: teacher.name,
      });
      await setSessionCookie(token);
      return NextResponse.json({ ok: true, redirect: roleRedirect("TEACHER") });
    }

    const student = await findStudent(lookup);
    if (!student) {
      const actualRole = await findOtherRoleAccount(lookup, "STUDENT");
      if (actualRole) {
        return NextResponse.json(
          { error: `This account is registered as ${actualRole}. Please select ${actualRole} and try again.` },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const ok = await verifyPasswordOrLegacyPlainText(password, student.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    if (!student.passwordHash.startsWith("$2")) {
      const upgradedHash = await bcrypt.hash(password, 10);
      await prisma.student.update({ where: { id: student.id }, data: { passwordHash: upgradedHash } });
    }
    const token = await createSessionToken({
      sub: student.id,
      email: sessionLoginLabel(student),
      role: "STUDENT",
      name: student.name,
    });
    await setSessionCookie(token);
    return NextResponse.json({ ok: true, redirect: roleRedirect("STUDENT") });
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ error: "Unable to sign in right now. Please try again." }, { status: 500 });
  }
}
