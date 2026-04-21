"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

type StudentExam = {
  id: string;
  title: string;
  category: string;
  status: "UPCOMING" | "LIVE" | "ENDED";
  startTime: string;
  endTime: string;
  durationMinutes: number;
  examSessions: Array<{
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    startedAt: string;
    submittedAt: string | null;
    violationCount: number;
  }>;
};

export default function StudentExamsPage() {
  const [exams, setExams] = useState<StudentExam[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/student/exams/available");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load exams");
      return;
    }
    setError(null);
    setExams(json.exams ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      badge="Student"
      title="Available Exams"
      subtitle="Start exams only during the scheduled window. Proctoring runs during attempt."
      navItems={studentNavItems}
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {exams.length === 0 ? <p className="text-sm text-[var(--muted)]">No exams available for your track yet.</p> : null}
        {exams.map((exam) => {
          const latestSession = exam.examSessions[0];
          return (
            <article key={exam.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{exam.title}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {exam.category} · Duration {exam.durationMinutes} minutes
                  </p>
                  <p className="text-sm text-[var(--muted)]">
                    Window: {new Date(exam.startTime).toLocaleString()} to {new Date(exam.endTime).toLocaleString()}
                  </p>
                  <p className="mt-1 text-sm">
                    Status: <strong>{exam.status}</strong>
                    {latestSession ? ` · Last attempt: ${latestSession.status}` : ""}
                  </p>
                </div>
                <Link
                  href={`/dashboard/student/exams/${exam.id}/take`}
                  className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                    exam.status === "LIVE" ? "bg-[var(--accent)]" : "bg-[var(--muted)]"
                  }`}
                >
                  {exam.status === "LIVE" ? "Start / Resume" : "View"}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
