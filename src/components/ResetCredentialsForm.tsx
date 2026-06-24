"use client";

import { useEffect, useMemo, useState } from "react";
import { displayLoginId } from "@/lib/user-login-id";
import { useAutoClearMessage } from "@/hooks/use-auto-clear-message";

export type CredentialRole = "STUDENT" | "TEACHER" | "ADMIN";

export type CredentialAccount = {
  id: string;
  name: string;
  role: CredentialRole;
  email: string | null;
  username?: string | null;
  category?: string | null;
  year?: number | null;
};

export function ResetCredentialsForm({
  accounts,
  fixedAccount,
  credentialsApiPath = "/api/admin/users/credentials",
  onUpdated,
  onCancel,
}: {
  accounts: CredentialAccount[];
  fixedAccount?: CredentialAccount | null;
  credentialsApiPath?: string;
  onUpdated?: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState(
    fixedAccount ? `${fixedAccount.role}:${fixedAccount.id}` : ""
  );
  const [newEmail, setNewEmail] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newYear, setNewYear] = useState("");
  const [clearEmail, setClearEmail] = useState(false);
  const [clearUsername, setClearUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useAutoClearMessage(success, setSuccess);

  const selected = useMemo(() => {
    if (fixedAccount) return fixedAccount;
    if (!selectedKey) return null;
    const [role, id] = selectedKey.split(":");
    return accounts.find((a) => a.role === role && a.id === id) ?? null;
  }, [accounts, fixedAccount, selectedKey]);

  const canClearEmail = Boolean(selected?.username || newUsername.trim());
  const canClearUsername = Boolean(selected?.email || newEmail.trim());
  const showYearField = selected?.role === "STUDENT";

  useEffect(() => {
    if (selected?.role === "STUDENT") {
      setNewYear(selected.year === 1 || selected.year === 2 ? String(selected.year) : "");
    } else {
      setNewYear("");
    }
  }, [selected?.id, selected?.role, selected?.year]);

  function clearInputs() {
    setNewEmail("");
    setNewUsername("");
    setNewPassword("");
    setClearEmail(false);
    setClearUsername(false);
    if (selected?.role === "STUDENT") {
      setNewYear(selected.year === 1 || selected.year === 2 ? String(selected.year) : "");
    } else {
      setNewYear("");
    }
  }

  function resetFormFields() {
    clearInputs();
    setError(null);
    setSuccess(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) {
      setSuccess(null);
      setError("Select an account first.");
      return;
    }

    const payload: {
      role: CredentialRole;
      userId: string;
      email?: string | null;
      username?: string | null;
      password?: string;
      year?: number;
    } = {
      role: selected.role,
      userId: selected.id,
    };

    if (clearEmail) payload.email = null;
    else if (newEmail.trim()) payload.email = newEmail.trim();

    if (clearUsername) payload.username = null;
    else if (newUsername.trim()) payload.username = newUsername.trim();

    if (newPassword.trim()) payload.password = newPassword.trim();

    if (selected.role === "STUDENT" && (newYear === "1" || newYear === "2")) {
      const yearNum = Number(newYear);
      if (yearNum !== selected.year) {
        payload.year = yearNum;
      }
    }

    const hasChange =
      payload.email !== undefined ||
      payload.username !== undefined ||
      Boolean(payload.password) ||
      payload.year !== undefined;

    if (!hasChange) {
      setSuccess(null);
      setError("Enter a new email, username, password, and/or year.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(credentialsApiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Failed to reset credentials. Please try again.");
        return;
      }
      clearInputs();
      const updatedUser = j.user as { email?: string | null; username?: string | null } | undefined;
      const loginHint = updatedUser ? displayLoginId(updatedUser) : displayLoginId(selected);
      setSuccess(`Credentials reset successfully for ${selected.name}. New login ID: ${loginHint}.`);
      await onUpdated?.();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      {success ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {success}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}
      {!fixedAccount ? (
        <select
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            resetFormFields();
          }}
        >
          <option value="">Select account</option>
          {accounts.map((a) => (
            <option key={`${a.role}:${a.id}`} value={`${a.role}:${a.id}`}>
              {a.name}
              {a.category ? ` (${a.category})` : ""} ·{" "}
              {a.role === "ADMIN" ? "Admin" : a.role === "TEACHER" ? "Teacher" : "Student"} ·{" "}
              {displayLoginId(a)}
            </option>
          ))}
        </select>
      ) : null}

      {selected ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)]">
          Current login: <strong className="text-[var(--foreground)]">{displayLoginId(selected)}</strong>
          {selected.email ? (
            <>
              {" "}
              · email: <span className="font-mono">{selected.email}</span>
            </>
          ) : null}
          {selected.username ? (
            <>
              {" "}
              · username: <span className="font-mono">{selected.username}</span>
            </>
          ) : null}
          {selected.role === "STUDENT" ? (
            <>
              {" "}
              · year: <strong className="text-[var(--foreground)]">{selected.year ?? "—"}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      {showYearField ? (
        <label className="block text-sm text-[var(--muted)]">
          Year
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
          >
            <option value="">Select year</option>
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
          </select>
        </label>
      ) : null}

      <input
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        type="email"
        placeholder="New email (leave blank to keep)"
        value={newEmail}
        onChange={(e) => {
          setNewEmail(e.target.value);
          if (e.target.value.trim()) setClearEmail(false);
        }}
        disabled={!selected || clearEmail}
      />

      <input
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        placeholder="New username (leave blank to keep)"
        value={newUsername}
        onChange={(e) => {
          setNewUsername(e.target.value);
          if (e.target.value.trim()) setClearUsername(false);
        }}
        disabled={!selected || clearUsername}
      />
      <div className="flex flex-wrap gap-4 text-xs">
        {selected?.email || newEmail.trim() ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={clearUsername}
              onChange={(e) => {
                setClearUsername(e.target.checked);
                if (e.target.checked) setNewUsername("");
              }}
              disabled={!canClearUsername}
            />
            Remove username
          </label>
        ) : null}
        {selected?.username || newUsername.trim() ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={clearEmail}
              onChange={(e) => {
                setClearEmail(e.target.checked);
                if (e.target.checked) setNewEmail("");
              }}
              disabled={!canClearEmail}
            />
            Remove email
          </label>
        ) : null}
      </div>

      <input
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        type="password"
        placeholder="New password (leave blank to keep)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        disabled={!selected}
        autoComplete="new-password"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!selected || loading}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
