import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE as COOKIE } from "@/lib/session-cookie";

const STUDENT_CHANGE_PASSWORD_PATH = "/dashboard/student/change-password";

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

type TokenInfo = {
  role: string | null;
  mustChangePassword: boolean;
};

async function getTokenInfo(token: string): Promise<TokenInfo> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return {
      role: (payload.role as string) ?? null,
      mustChangePassword: payload.mustChangePassword === true,
    };
  } catch {
    return { role: null, mustChangePassword: false };
  }
}

function studentHome(mustChangePassword: boolean): string {
  return mustChangePassword ? STUDENT_CHANGE_PASSWORD_PATH : "/dashboard/student";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE)?.value;

  if (pathname === "/login") {
    if (token) {
      const { role, mustChangePassword } = await getTokenInfo(token);
      if (role) {
        const dest =
          role === "ADMIN"
            ? "/dashboard/admin"
            : role === "TEACHER"
              ? "/dashboard/teacher"
              : studentHome(mustChangePassword);
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    const { role, mustChangePassword } = await getTokenInfo(token);
    if (!role) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname.startsWith("/dashboard/admin") && role !== "ADMIN") {
      return NextResponse.redirect(
        new URL(role === "TEACHER" ? "/dashboard/teacher" : studentHome(mustChangePassword), request.url),
      );
    }
    if (pathname.startsWith("/dashboard/teacher") && role !== "TEACHER") {
      return NextResponse.redirect(
        new URL(
          role === "ADMIN" ? "/dashboard/admin" : studentHome(mustChangePassword),
          request.url,
        ),
      );
    }
    if (pathname.startsWith("/dashboard/student") && role !== "STUDENT") {
      return NextResponse.redirect(
        new URL(role === "ADMIN" ? "/dashboard/admin" : "/dashboard/teacher", request.url),
      );
    }

    // Students with a temporary password must reset before using any other page.
    if (role === "STUDENT" && mustChangePassword) {
      if (pathname !== STUDENT_CHANGE_PASSWORD_PATH) {
        return NextResponse.redirect(new URL(STUDENT_CHANGE_PASSWORD_PATH, request.url));
      }
    } else if (role === "STUDENT" && pathname === STUDENT_CHANGE_PASSWORD_PATH) {
      return NextResponse.redirect(new URL("/dashboard/student", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
