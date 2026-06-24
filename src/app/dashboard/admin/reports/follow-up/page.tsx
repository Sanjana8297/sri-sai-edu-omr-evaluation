"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { StatsRowSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { useInstitutionDashboardQuery } from "@/hooks/data/use-admin-queries";
import { useSubjectScoresApi } from "@/app/dashboard/admin/reports/reports-analytics-panels";
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
  useSetDashboardPage({
    title: "Students Needing Follow-up",
    subtitle: "Low performers with subject-wise score breakdown",
    fullWidthContent: true,
  });

  const { data: instRaw, isLoading: instLoading } = useInstitutionDashboardQuery();
  const { subjectScores, subjectScoresLoading } = useSubjectScoresApi(
    "/api/admin/reports/subject-scores"
  );
  const institutionData = instRaw?.lowPerformerList
    ? (instRaw as InstitutionDashboardData)
    : null;
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const loading = instLoading || subjectScoresLoading;

  useEffect(() => {
    if (institutionData?.lowPerformerList[0]?.id && !selectedStudentId) {
      setSelectedStudentId(institutionData.lowPerformerList[0].id);
    }
  }, [institutionData, selectedStudentId]);

  const selectedStudent = useMemo(
    () => institutionData?.lowPerformerList.find((s) => s.id === selectedStudentId) ?? null,
    [institutionData, selectedStudentId]
  );

  const selectedBreakdown = selectedStudentId ? subjectScores?.byStudent[selectedStudentId] : null;

  return (
    <>
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
    </>
  );
}
