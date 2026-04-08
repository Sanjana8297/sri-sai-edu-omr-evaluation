import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const COOKIE = SESSION_COOKIE;
const TTL = "7d";

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string;
  email: string;
  role: Role;
  name: string;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const sub = payload.sub as string;
    const email = payload.email as string;
    const role = payload.role as Role;
    const name = payload.name as string;
    if (!sub || !email || !role || !name) return null;
    return { sub, email, role, name };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
