"use client";

import { useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { LogoutButton } from "@/components/LogoutButton";
import { dashBtnPrimary, dashCard, dashInput, dashPanel } from "@/lib/dashboard-ui";

export default function StudentChangePasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useSetDashboardPage({
    title: "Set a new password",
    subtitle: "For security, you must choose your own password before continuing.",
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/student/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not update password");
        return;
      }
      window.location.href =
        typeof data.redirect === "string" ? data.redirect : "/dashboard/student";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className={dashPanel}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">Reset your password</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This is your first login. Choose a new password to continue. You cannot use the rest of the
          portal until this is done.
        </p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">New password</span>
            <input
              type="password"
              className={dashInput}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="At least 6 characters"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Confirm new password</span>
            <input
              type="password"
              className={dashInput}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
              placeholder="Re-enter new password"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button type="submit" className={dashBtnPrimary} disabled={loading}>
            {loading ? "Saving…" : "Save password & continue"}
          </button>
        </form>
      </div>

      <div className={`${dashCard} flex items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-[var(--muted)]">Need to use a different account?</p>
        <LogoutButton />
      </div>
    </div>
  );
}
