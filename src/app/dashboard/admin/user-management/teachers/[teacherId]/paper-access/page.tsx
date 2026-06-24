"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { displayLoginId } from "@/lib/user-login-id";
import {
  describePaperAccessChanges,
  getPaperAccessForTeacher,
  pushAuditTrail,
  readPaperAccess,
  writePaperAccess,
  type PaperAccess,
} from "@/lib/admin-staff-storage";

type TeacherDetail = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string;
};

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function TeacherPaperAccessContent() {
  const params = useParams<{ teacherId: string }>();
  const teacherId = params.teacherId;
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [access, setAccess] = useState<PaperAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!teacherId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teachers/${encodeURIComponent(teacherId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load teacher");
        return;
      }
      setTeacher(json.teacher);
      setAccess(getPaperAccessForTeacher(teacherId));
    } catch {
      setError("Could not load teacher.");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateAccess(patch: Partial<PaperAccess>) {
    if (!teacherId || !access) return;
    const nextAccess = { ...access, ...patch };
    const changes = describePaperAccessChanges(access, nextAccess, patch);
    if (changes.length === 0) return;
    const store = readPaperAccess();
    store[teacherId] = nextAccess;
    writePaperAccess(store);
    setAccess(nextAccess);
    const staffName = teacher?.name ?? teacherId;
    pushAuditTrail("PERMISSION_UPDATE", `${staffName} — ${changes.join("; ")}`);
  }

  useSetDashboardPage({
    title: "Paper access permission control",
    subtitle: teacher ? teacher.name : "Per-teacher question paper rights",
    fullWidthContent: true,
  });

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/admin/user-management?section=roles"
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to Teacher / Admin Roles
        </Link>
      </div>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {teacher && access ? (
        <div className="max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div>
            <h2 className="text-lg font-semibold">{teacher.name}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {displayLoginId(teacher)} · Track: {teacher.category}
            </p>
          </div>
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <ToggleRow
              label="Create / edit papers"
              checked={access.create}
              onChange={(create) => updateAccess({ create })}
            />
            <ToggleRow
              label="Publish exams"
              checked={access.publish}
              onChange={(publish) => updateAccess({ publish })}
            />
            <ToggleRow
              label="Grade / view results"
              checked={access.grade}
              onChange={(grade) => updateAccess({ grade })}
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            Permissions are stored for this browser session and apply to how this teacher&apos;s access is
            managed in the admin console.
          </p>
        </div>
      ) : null}
    </>
  );
}

export default function TeacherPaperAccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <TeacherPaperAccessContent />
    </Suspense>
  );
}
