"use client";

import { useState } from "react";
import Link from "next/link";
import type { Role } from "@/lib/types";
import { DASHBOARD_SURFACE } from "@/lib/dashboard-ui";
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
    <div className="relative flex min-h-screen flex-col bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <InstituteBrand compact />
          <ThemeToggle />
        </div>
      </header>
      <div className={`flex flex-1 items-center justify-center px-4 py-8 ${DASHBOARD_SURFACE}`}>
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--background)]"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
