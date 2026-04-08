import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/types";

export async function requireRoles(roles: Role[]) {
  const session = await getSession();
  if (!session) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!roles.includes(session.role)) {
    return { session: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, response: null };
}
