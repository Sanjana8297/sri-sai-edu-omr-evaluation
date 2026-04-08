import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE as COOKIE } from "@/lib/session-cookie";

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

async function getRoleFromToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE)?.value;

  if (pathname === "/login") {
    if (token) {
      const role = await getRoleFromToken(token);
      if (role) {
        const dest =
          role === "ADMIN"
            ? "/dashboard/admin"
            : role === "TEACHER"
              ? "/dashboard/teacher"
              : "/dashboard/student";
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const role = await getRoleFromToken(token);
    if (!role) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/dashboard/admin") && role !== "ADMIN") {
      return NextResponse.redirect(
        new URL(role === "TEACHER" ? "/dashboard/teacher" : "/dashboard/student", request.url),
      );
    }
    if (pathname.startsWith("/dashboard/teacher") && role !== "TEACHER") {
      return NextResponse.redirect(
        new URL(role === "ADMIN" ? "/dashboard/admin" : "/dashboard/student", request.url),
      );
    }
    if (pathname.startsWith("/dashboard/student") && role !== "STUDENT") {
      return NextResponse.redirect(
        new URL(role === "ADMIN" ? "/dashboard/admin" : "/dashboard/teacher", request.url),
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
