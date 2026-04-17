import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import type { Role } from "@/lib/types";

async function verifyPasswordOrLegacyPlainText(
  inputPassword: string,
  storedPasswordHash: string,
): Promise<boolean> {
  const looksHashed = storedPasswordHash.startsWith("$2a$") || storedPasswordHash.startsWith("$2b$");
  if (looksHashed) {
    return bcrypt.compare(inputPassword, storedPasswordHash);
  }
  // Backward-compatibility for legacy rows saved with plain-text passwords.
  return inputPassword === storedPasswordHash;
}

function roleRedirect(role: Role): string {
  return role === "ADMIN" ? "/dashboard/admin" : role === "TEACHER" ? "/dashboard/teacher" : "/dashboard/student";
}

export async function POST(request: Request) {
  try {
    let body: { email?: string; password?: string; role?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    const role = body.role as Role | undefined;
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (role !== "ADMIN" && role !== "TEACHER" && role !== "STUDENT") {
      return NextResponse.json({ error: "Role must be ADMIN, TEACHER, or STUDENT" }, { status: 400 });
    }

    if (role === "ADMIN") {
      const admin = await prisma.admin.findUnique({ where: { email } });
      if (!admin) {
        const [teacher, student] = await Promise.all([
          prisma.teacher.findUnique({ where: { email } }),
          prisma.student.findUnique({ where: { email } }),
        ]);
        if (teacher || student) {
          const actualRole: Role = teacher ? "TEACHER" : "STUDENT";
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
        email: admin.email,
        role: "ADMIN",
        name: admin.name,
      });
      await setSessionCookie(token);
      return NextResponse.json({ ok: true, redirect: roleRedirect("ADMIN") });
    }

    if (role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({ where: { email } });
      if (!teacher) {
        const [admin, student] = await Promise.all([
          prisma.admin.findUnique({ where: { email } }),
          prisma.student.findUnique({ where: { email } }),
        ]);
        if (admin || student) {
          const actualRole: Role = admin ? "ADMIN" : "STUDENT";
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
        email: teacher.email,
        role: "TEACHER",
        name: teacher.name,
      });
      await setSessionCookie(token);
      return NextResponse.json({ ok: true, redirect: roleRedirect("TEACHER") });
    }

    const student = await prisma.student.findUnique({ where: { email } });
    if (!student) {
      const [admin, teacher] = await Promise.all([
        prisma.admin.findUnique({ where: { email } }),
        prisma.teacher.findUnique({ where: { email } }),
      ]);
      if (admin || teacher) {
        const actualRole: Role = admin ? "ADMIN" : "TEACHER";
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
      email: student.email,
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
