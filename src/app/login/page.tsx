"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Role } from "@/lib/types";
import { DASHBOARD_SURFACE, dashBtnPrimary, dashBtnSm, dashCard, dashInput, dashSelect } from "@/lib/dashboard-ui";
import { InstituteBrand } from "@/components/InstituteBrand";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LoginPage() {
  const [role, setRole] = useState<Role>("STUDENT");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Login failed");
        return;
      }
      window.location.href = typeof data.redirect === "string" ? data.redirect : "/";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <Image
          src="/images/sri_sai_login_education_v5_2.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />
      </div>
      <header className="relative border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <InstituteBrand compact />
          <ThemeToggle />
        </div>
      </header>
      <div className={`relative flex flex-1 items-center justify-center px-4 py-8 ${DASHBOARD_SURFACE}`}>
      <div className={`${dashCard} w-full max-w-md p-8`}>
        <Link
          href="/"
          className={dashBtnSm + " mb-4 inline-flex"}
        >
          Back to Website
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Sign in</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          JEE & NEET coaching portal. Accounts are created by your administrator.
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="role">
              I am signing in as
            </label>
            <select
              id="role"
              className={`${dashSelect} mt-1 w-full text-[var(--foreground)]`}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
              <option value="ADMIN">Administrator</option>
            </select>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Your account is looked up in the matching table (students, teachers, or admins).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="loginId">
              Email or username
            </label>
            <input
              id="loginId"
              type="text"
              autoComplete="username"
              className={`${dashInput} mt-1 text-[var(--foreground)]`}
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Students and teachers can use either email or username. Admins sign in with email only.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={`${dashInput} mt-1 text-[var(--foreground)]`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className={`${dashBtnPrimary} w-full py-2.5`}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
