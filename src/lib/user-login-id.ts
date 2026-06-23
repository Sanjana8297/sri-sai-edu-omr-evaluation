import { prisma } from "@/lib/prisma";

export type AccountIdentifiers = {
  email: string | null;
  username: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim().toLowerCase());
}

export function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value.trim().toLowerCase());
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function parseLoginIdentifier(raw: string): { kind: "email"; value: string } | { kind: "username"; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const email = normalizeEmail(trimmed);
    return isValidEmail(email) ? { kind: "email", value: email } : null;
  }
  const username = normalizeUsername(trimmed);
  return isValidUsername(username) ? { kind: "username", value: username } : null;
}

export function resolveAccountIdentifiers(input: {
  email?: string | null;
  username?: string | null;
}): { ids: AccountIdentifiers; error: string | null } {
  const rawEmail = input.email?.trim() ?? "";
  const rawUsername = input.username?.trim() ?? "";

  let email: string | null = null;
  let username: string | null = null;

  if (rawEmail) {
    const normalized = normalizeEmail(rawEmail);
    if (!isValidEmail(normalized)) {
      return { ids: { email: null, username: null }, error: "Invalid email format" };
    }
    email = normalized;
  }

  if (rawUsername) {
    const normalized = normalizeUsername(rawUsername);
    if (!isValidUsername(normalized)) {
      return {
        ids: { email: null, username: null },
        error: "Username must be 3–32 characters and use only letters, numbers, dots, hyphens, or underscores",
      };
    }
    username = normalized;
  }

  if (!email && !username) {
    return { ids: { email: null, username: null }, error: "Email or username is required" };
  }

  return { ids: { email, username }, error: null };
}

export function displayLoginId(user: { email?: string | null; username?: string | null }): string {
  return user.email ?? user.username ?? "—";
}

/** True if email or username is already used on any account type that stores it. */
export async function isLoginIdTaken(ids: AccountIdentifiers): Promise<boolean> {
  return isLoginIdTakenExcept(ids, null);
}

type AccountRole = "ADMIN" | "TEACHER" | "STUDENT";

/** Like isLoginIdTaken but ignores the given account (for credential updates). */
export async function isLoginIdTakenExcept(
  ids: AccountIdentifiers,
  exclude: { role: AccountRole; id: string } | null
): Promise<boolean> {
  if (ids.email) {
    const email = ids.email;
    const [admin, teacher, student] = await Promise.all([
      prisma.admin.findUnique({ where: { email }, select: { id: true } }),
      prisma.teacher.findUnique({ where: { email }, select: { id: true } }),
      prisma.student.findUnique({ where: { email }, select: { id: true } }),
    ]);
    for (const [role, row] of [
      ["ADMIN", admin],
      ["TEACHER", teacher],
      ["STUDENT", student],
    ] as const) {
      if (!row) continue;
      if (exclude?.role === role && exclude.id === row.id) continue;
      return true;
    }
  }

  if (ids.username) {
    const username = ids.username;
    const [admin, teacher, student] = await Promise.all([
      prisma.admin.findUnique({ where: { username }, select: { id: true } }),
      prisma.teacher.findUnique({ where: { username }, select: { id: true } }),
      prisma.student.findUnique({ where: { username }, select: { id: true } }),
    ]);
    for (const [role, row] of [
      ["ADMIN", admin],
      ["TEACHER", teacher],
      ["STUDENT", student],
    ] as const) {
      if (!row) continue;
      if (exclude?.role === role && exclude.id === row.id) continue;
      return true;
    }
  }

  return false;
}

export function sessionLoginLabel(user: { email?: string | null; username?: string | null }): string {
  return user.email ?? user.username ?? "";
}
