"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      type="button"
      onClick={logout}
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--accent-soft)]"
    >
      Log out
    </button>
  );
}
