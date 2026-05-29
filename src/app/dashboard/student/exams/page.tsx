"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";
import { isSessionSubmitted } from "@/lib/proctoring";
import {
  clearExamSubmittedLocally,
  wasExamSubmittedLocally,
} from "@/lib/exam-progress-cache";

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
  const hasLiveExams = exams.some((exam) => exam.status === "LIVE");

  const load = useCallback(async () => {
    const res = await fetch("/api/student/exams/available");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load exams");
      return;
    }
    setError(null);
    const list = (json.exams ?? []) as StudentExam[];
    for (const exam of list) {
      const session = exam.examSessions[0];
      if (session && isSessionSubmitted(session.status)) {
        clearExamSubmittedLocally(exam.id);
      }
    }
    setExams(list);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  function canTakeExam(exam: StudentExam): boolean {
    if (wasExamSubmittedLocally(exam.id)) return false;
    if (exam.status !== "LIVE") return false;
    const session = exam.examSessions[0];
    return !session || !isSessionSubmitted(session.status);
  }

  return (
    <DashboardShell
      badge="Student"
      title="Available Exams"
      subtitle="Start exams only during the scheduled window. Proctoring runs during attempt."
      navItems={studentNavItems}
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {exams.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="text-center text-2xl font-semibold text-[var(--muted)]">
              No exams available for your track yet.
            </p>
          </div>
        ) : null}
        {exams.length > 0 && !hasLiveExams ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <p className="text-center text-2xl font-semibold text-[var(--muted)]">
              No Live Exams to be taken.
            </p>
          </div>
        ) : null}
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
                {canTakeExam(exam) ? (
                  <a
                    href={`/dashboard/student/exams/${exam.id}/take`}
                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
                  >
                    Start / Resume
                  </a>
                ) : (
                  <span className="rounded-lg bg-[var(--muted)] px-3 py-2 text-sm font-medium text-white">
                    Not available
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </DashboardShell>
  );
}
