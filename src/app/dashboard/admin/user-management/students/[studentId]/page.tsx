"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { displayLoginId } from "@/lib/user-login-id";

type AttemptRow = {
  id: string;
  category: string;
  title: string;
  examDate: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
};

type StudentDetail = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string;
  teacher: { id: string; name: string } | null;
};

function StudentAttemptHistoryContent() {
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(studentId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load student");
        return;
      }
      setStudent(json.student);
      setAttempts(json.attempts ?? []);
    } catch {
      setError("Could not load attempt history.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      badge="Administrator"
      title="Attempt history timeline"
      subtitle={student ? student.name : "Student exam attempts"}
      navItems={adminNavItems}
      fullWidthContent
    >
      <div className="mb-6">
        <Link
          href="/dashboard/admin/user-management?section=profiles"
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to Profiles
        </Link>
      </div>

      {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {student ? (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-semibold">{student.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {displayLoginId(student)} · Target: {student.category}
            {student.teacher ? ` · Teacher: ${student.teacher.name}` : ""}
          </p>
        </div>
      ) : null}

      {!loading && !error ? (
        attempts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No exam attempts recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="relative rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 pl-6 before:absolute before:left-3 before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-[var(--accent)]"
              >
                <p className="text-sm font-medium">{a.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {new Date(a.examDate).toLocaleString()} · {a.category} · {a.marksObtained}/{a.maxMarks} (
                  {a.percentage}%)
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </DashboardShell>
  );
}

export default function StudentAttemptHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <StudentAttemptHistoryContent />
    </Suspense>
  );
}
