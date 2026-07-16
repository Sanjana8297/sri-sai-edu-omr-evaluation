import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireRoles } from "@/lib/api-auth";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionLoginLabel } from "@/lib/user-login-id";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { session, response } = await requireRoles(["STUDENT"]);
  if (response) return response;

  let body: { newPassword?: string; confirmPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newPassword = body.newPassword?.trim() ?? "";
  const confirmPassword = body.confirmPassword?.trim() ?? "";

  if (!newPassword || !confirmPassword) {
    return NextResponse.json({ error: "Enter and confirm your new password" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const sameAsOld = student.passwordHash.startsWith("$2")
    ? await bcrypt.compare(newPassword, student.passwordHash)
    : newPassword === student.passwordHash;
  if (sameAsOld) {
    return NextResponse.json(
      { error: "Choose a new password that is different from your temporary password" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.student.update({
    where: { id: student.id },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
    select: { id: true, email: true, username: true, name: true },
  });

  const token = await createSessionToken({
    sub: updated.id,
    email: sessionLoginLabel(updated),
    role: "STUDENT",
    name: updated.name,
    mustChangePassword: false,
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, redirect: "/dashboard/student" });
}
