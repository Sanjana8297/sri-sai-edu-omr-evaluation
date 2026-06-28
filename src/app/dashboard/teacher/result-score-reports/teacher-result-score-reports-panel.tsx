"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildRankListFromPerformance,
  useReportsOverview,
  useSubjectScoresApi,
  type AttemptRow,
} from "@/app/dashboard/admin/reports/reports-analytics-panels";
import { RankListTable } from "@/components/reports/RankListTable";

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TeacherResultScoreReportsPanel() {
  const router = useRouter();
  const { data, loading } = useReportsOverview("/api/teacher/reports/overview");
  const { subjectScores } = useSubjectScoresApi("/api/teacher/reports/subject-scores");
  const [trackFilter, setTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");
  const [exportOpen, setExportOpen] = useState(false);
  const [reportCardOpen, setReportCardOpen] = useState(false);
  const [reportStudentId, setReportStudentId] = useState("");
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [exportOpen]);

  const rankList = useMemo(
    () => (data ? buildRankListFromPerformance(data.performance) : []),
    [data],
  );

  const filteredRanks = rankList.filter((r) => trackFilter === "ALL" || r.category === trackFilter);

  const reportStudent = data?.students.find((s) => s.id === reportStudentId);
  const reportStudentStats = reportStudentId ? subjectScores?.byStudent[reportStudentId] : undefined;
  const reportAttempts = useMemo(() => {
    if (!reportStudentId || !data) return [];
    return data.performance.filter((p) => p.studentId === reportStudentId);
  }, [data, reportStudentId]);

  const reportAttemptCount = reportStudentStats?.allAttempts ?? reportAttempts.length;
  const reportAvg =
    reportStudentStats?.overallAvg ??
    (reportAttempts.length > 0
      ? Math.round((reportAttempts.reduce((s, a) => s + a.percentage, 0) / reportAttempts.length) * 10) / 10
      : null);

  const hasPerformance = (data?.performance.length ?? 0) > 0;

  function exportRankExcel() {
    downloadCsv("rank-list.csv", [
      ["Rank", "Student", "Track", "Avg %", "Latest Exam Score", "Latest Exam"],
      ...filteredRanks.map((r) => [
        String(r.rank),
        r.name,
        r.category,
        String(r.avgPct),
        r.latestExamScore,
        r.latestExamTitle,
      ]),
    ]);
    setExportOpen(false);
  }

  function exportAllExcel() {
    if (!data) return;
    downloadCsv("all-attempts.csv", [
      ["Student", "Exam", "Track", "Score", "Max", "Percent"],
      ...data.performance.map((p: AttemptRow) => [
        p.studentName,
        p.title,
        p.category,
        String(p.marksObtained),
        String(p.maxMarks),
        String(p.percentage),
      ]),
    ]);
    setExportOpen(false);
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading analytics…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Rank list</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">Aggregate rankings with each student&apos;s latest exam score</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:bg-[var(--background)] disabled:opacity-50"
              disabled={!hasPerformance}
              onClick={() => setExportOpen((open) => !open)}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              Bulk Excel Export
              <span className="text-[var(--muted)]" aria-hidden>
                ▾
              </span>
            </button>
            {exportOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--background)]"
                  onClick={exportRankExcel}
                >
                  Export rank list
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--background)]"
                  onClick={exportAllExcel}
                >
                  Export all scores
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:bg-[var(--background)]"
            onClick={() => {
              setReportStudentId(data?.students[0]?.id || "");
              setReportCardOpen(true);
            }}
          >
            Individual Student Report card
          </button>
        </div>
      </div>

      {!hasPerformance ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted)]">
          No exam data yet. Schedule exams and record attempts to populate this report.
        </p>
      ) : (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {(["ALL", "JEE", "NEET"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  trackFilter === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"
                }`}
                onClick={() => setTrackFilter(t)}
              >
                {t === "ALL" ? "All tracks" : t}
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Select a student to view their subject-wise breakdown and analysis notes.
          </p>
          <RankListTable
            rows={filteredRanks}
            onSelectStudent={(id) => {
              if (id) router.push(`/dashboard/teacher/result-score-reports/student/${encodeURIComponent(id)}`);
            }}
          />
        </section>
      )}

      {reportCardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-card-title"
          onClick={() => setReportCardOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id="report-card-title" className="text-lg font-semibold">
                Individual student report card
              </h3>
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--background)]"
                onClick={() => setReportCardOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={reportStudentId}
              onChange={(e) => setReportStudentId(e.target.value)}
            >
              <option value="">Select student</option>
              {data?.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.category})
                </option>
              ))}
            </select>
            {reportStudent ? (
              <div id="teacher-student-report-card" className="mt-4 rounded-lg border border-[var(--border)] p-4">
                <h4 className="font-semibold">{reportStudent.name}</h4>
                <p className="text-xs text-[var(--muted)]">
                  {reportStudent.email} · Target {reportStudent.category}
                </p>
                <p className="mt-2 text-sm">
                  Average score: <strong>{reportAvg ?? "—"}%</strong> · Attempts: {reportAttemptCount}
                </p>
                <table className="mt-3 min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="py-1 pr-4">Exam</th>
                      <th className="py-1 pr-4">Date</th>
                      <th className="py-1">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportAttempts.map((a) => (
                      <tr key={a.id} className="border-t border-[var(--border)]">
                        <td className="py-2 pr-4">{a.title}</td>
                        <td className="py-2 pr-4">{new Date(a.examDate).toLocaleDateString()}</td>
                        <td className="py-2">
                          {a.marksObtained}/{a.maxMarks} ({a.percentage}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs print:hidden"
                  onClick={() => {
                    const el = document.getElementById("teacher-student-report-card");
                    if (!el) return;
                    const w = window.open("", "_blank");
                    if (!w) return;
                    w.document.write(
                      `<html><head><title>Report - ${reportStudent.name}</title></head><body>${el.innerHTML}</body></html>`
                    );
                    w.document.close();
                    w.print();
                  }}
                >
                  Print report card (PDF)
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">Select a student to view their report card.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
