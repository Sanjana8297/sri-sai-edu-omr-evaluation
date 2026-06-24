"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import type { SubjectScoresPayload } from "@/lib/subject-score-breakdown";

type FollowUpStudent = {
  id: string;
  name: string;
  track: string;
  avg: number;
  teacher: string;
};

type InstitutionDashboardData = {
  lowPerformerThreshold: number;
  lowPerformerList: FollowUpStudent[];
};

export default function FollowUpPage() {
  const [institutionData, setInstitutionData] = useState<InstitutionDashboardData | null>(null);
  const [subjectScores, setSubjectScores] = useState<SubjectScoresPayload | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [instRes, subjectRes] = await Promise.all([
        fetch("/api/admin/institution-dashboard"),
        fetch("/api/admin/reports/subject-scores"),
      ]);

      const instJson = await instRes.json();
      const subjectJson = await subjectRes.json();

      if (instJson.lowPerformerList) {
        setInstitutionData(instJson as InstitutionDashboardData);
        const firstId = instJson.lowPerformerList[0]?.id ?? "";
        setSelectedStudentId(firstId);
      }
      if (subjectJson.byStudent) setSubjectScores(subjectJson as SubjectScoresPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedStudent = useMemo(
    () => institutionData?.lowPerformerList.find((s) => s.id === selectedStudentId) ?? null,
    [institutionData, selectedStudentId]
  );

  const selectedBreakdown = selectedStudentId ? subjectScores?.byStudent[selectedStudentId] : null;

  return (
    <DashboardShell
      badge="Administrator"
      title="Students Needing Follow-up"
      subtitle="Low performers with subject-wise score breakdown"
      navItems={adminNavItems}
      fullWidthContent
    >
      <div className="mb-4">
        <Link
          href="/dashboard/admin/reports?section=institution"
          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"
        >
          ← Back to Institution Dashboard
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading follow-up data…</p>
      ) : !institutionData ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
          Could not load follow-up data.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold">Students needing follow-up</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Below {institutionData.lowPerformerThreshold}% overall average
            </p>
            <ul className="mt-3 space-y-2">
              {institutionData.lowPerformerList.length === 0 ? (
                <li className="text-sm text-[var(--muted)]">No students below threshold.</li>
              ) : null}
              {institutionData.lowPerformerList.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentId(s.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      selectedStudentId === s.id
                        ? "border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"
                        : "border-[var(--border)] bg-[var(--background)]"
                    }`}
                  >
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {s.track} · {s.teacher} · {s.avg}%
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h2 className="text-sm font-semibold">Subject-wise score breakdown</h2>
            {selectedStudent && selectedBreakdown ? (
              <>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {selectedStudent.name} · Target {selectedBreakdown.track}
                </p>
                <p className="mt-2 text-sm">
                  Attempts: <strong>{selectedBreakdown.allAttempts}</strong> · Overall average:{" "}
                  <strong>
                    {selectedBreakdown.overallAvg != null ? `${selectedBreakdown.overallAvg}%` : "—"}
                  </strong>
                </p>
                <ul className="mt-3 space-y-2">
                  {selectedBreakdown.subjects.map((subject) => (
                    <li key={subject.subject} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-sm font-medium">{subject.subject}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{
                            width: `${subject.avg != null ? Math.min(100, subject.avg) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-24 text-right text-sm font-medium">
                        {subject.avg != null ? `${subject.avg}%` : "—"}
                      </span>
                      <span className="w-20 text-right text-xs text-[var(--muted)]">
                        {subject.examCount}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Select a student to view subject-wise breakdown.
              </p>
            )}
          </section>
        </div>
      )}
    </DashboardShell>
  );
}
