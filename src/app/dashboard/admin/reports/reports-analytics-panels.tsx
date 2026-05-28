"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";

export type AttemptRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  category: string;
  title: string;
  examDate: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
};

type StudentRow = {
  id: string;
  name: string;
  email: string;
  category: string;
  teacher: { id: string; name: string; email: string } | null;
};

type TeacherRow = {
  id: string;
  name: string;
  email: string;
  category: string;
  studentCount: number;
};

type OverviewData = {
  counts: { students: number; teachers: number; exams: number };
  avgPercentageAcrossAttempts: number | null;
  students: StudentRow[];
  teachers: TeacherRow[];
  exams: Array<{ id: string; title: string; category: string; startTime: string; isPublished: boolean }>;
  performance: AttemptRow[];
};

const CUTOFF_PCT: Record<string, number> = { NEET: 50, JEE: 90 };
const SUBJECT_KEYWORDS = ["Physics", "Chemistry", "Maths", "Mathematics", "Botany", "Zoology", "Biology"];

const RESULT_ACTIVITIES: ActivityFeature[] = [
  { id: "rank", title: "Rank list with percentile", description: "Instant aggregate across attempts" },
  { id: "subject", title: "Subject-wise score breakdown", description: "Average % by track and subject area" },
  { id: "report-card", title: "Individual student report card", description: "Per-student exam history and summary" },
  { id: "export-bulk", title: "Bulk PDF / Excel export", description: "Download rank list, all scores, or print bulk reports" },
];

const ANALYTICS_ACTIVITIES: ActivityFeature[] = [
  { id: "weak-chapters", title: "Weak chapter identification (AI)", description: "Lowest average performance areas" },
  { id: "trend", title: "Improvement trend across attempts", description: "Chronological score progression" },
  { id: "cutoff", title: "NEET/JEE cut-off proximity meter", description: "Latest score vs qualifying benchmark" },
  { id: "difficulty", title: "Question difficulty vs response analysis", description: "Performance by inferred paper difficulty" },
];

const INSTITUTION_ACTIVITIES: ActivityFeature[] = [
  { id: "heatmap", title: "Batch-wise score heatmap", description: "Average % by mentor batch and track" },
  { id: "alerts", title: "Low-performer alert and follow-up", description: "Students below score threshold" },
  { id: "frequency", title: "Exam frequency and coverage tracker", description: "Attempts logged per month" },
  { id: "ratio", title: "Teacher-student ratio insights", description: "Centre staffing vs enrolment" },
];

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

function subjectFromTitle(title: string): string {
  const found = SUBJECT_KEYWORDS.find((kw) => title.toLowerCase().includes(kw.toLowerCase()));
  return found ?? "General";
}

export function useAdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/overview");
    const json = await res.json();
    if (json.counts) setData(json as OverviewData);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, reload: load };
}

function PanelLoading() {
  return <p className="text-sm text-[var(--muted)]">Loading analytics…</p>;
}

function NoExamDataNote() {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted)]">
      No exam data yet. Schedule exams and record attempts to populate this report.
    </p>
  );
}

export function ResultScoreReportsPanel({ resetKey }: { resetKey?: string }) {
  const { data, loading } = useAdminOverview();
  const [reportStudentId, setReportStudentId] = useState("");
  const [trackFilter, setTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");

  const rankList = useMemo(() => {
    if (!data) return [];
    const byStudent = new Map<string, { name: string; category: string; scores: number[] }>();
    for (const row of data.performance) {
      const entry = byStudent.get(row.studentId) ?? {
        name: row.studentName,
        category: row.category,
        scores: [],
      };
      entry.scores.push(row.percentage);
      byStudent.set(row.studentId, entry);
    }
    const ranked = [...byStudent.entries()].map(([id, v]) => ({
      studentId: id,
      name: v.name,
      category: v.category,
      avgPct: Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10,
    }));
    ranked.sort((a, b) => b.avgPct - a.avgPct);
    const n = ranked.length;
    return ranked.map((r, i) => ({
      ...r,
      rank: i + 1,
      percentile: n <= 1 ? 100 : Math.round(((n - i - 1) / (n - 1)) * 1000) / 10,
    }));
  }, [data]);

  const filteredRanks = rankList.filter((r) => trackFilter === "ALL" || r.category === trackFilter);

  const subjectBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { total: number; count: number }>();
    for (const row of data.performance) {
      const key = `${row.category} · ${subjectFromTitle(row.title)}`;
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += row.percentage;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, avg: Math.round((v.total / v.count) * 10) / 10 }))
      .sort((a, b) => b.avg - a.avg);
  }, [data]);

  const reportStudent = data?.students.find((s) => s.id === reportStudentId);
  const reportAttempts = useMemo(() => {
    if (!reportStudentId || !data) return [];
    return data.performance.filter((p) => p.studentId === reportStudentId);
  }, [data, reportStudentId]);

  const reportAvg =
    reportAttempts.length > 0
      ? Math.round(
          (reportAttempts.reduce((s, a) => s + a.percentage, 0) / reportAttempts.length) * 10,
        ) / 10
      : null;

  function exportRankExcel() {
    downloadCsv("rank-list.csv", [
      ["Rank", "Student", "Track", "Avg %", "Percentile"],
      ...filteredRanks.map((r) => [String(r.rank), r.name, r.category, String(r.avgPct), String(r.percentile)]),
    ]);
  }

  function exportAllExcel() {
    if (!data) return;
    downloadCsv("all-attempts.csv", [
      ["Student", "Exam", "Track", "Date", "Score", "Max", "Percent"],
      ...data.performance.map((p) => [
        p.studentName,
        p.title,
        p.category,
        new Date(p.examDate).toLocaleDateString(),
        String(p.marksObtained),
        String(p.maxMarks),
        String(p.percentage),
      ]),
    ]);
  }

  const hasPerformance = (data?.performance.length ?? 0) > 0;

  if (loading) return <PanelLoading />;

  return (
    <FeatureActivityHub
        features={RESULT_ACTIVITIES}
        resetKey={resetKey}
        renderFeature={(id) => {
          switch (id) {
            case "rank":
              return !hasPerformance ? (
                <NoExamDataNote />
              ) : (
                <>
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
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2">Rank</th>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Avg %</th>
                          <th className="px-3 py-2">Percentile</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRanks.map((r) => (
                          <tr key={r.studentId} className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 font-medium">#{r.rank}</td>
                            <td className="px-3 py-2">
                              {r.name}
                              <span className="ml-1 text-xs text-[var(--muted)]">({r.category})</span>
                            </td>
                            <td className="px-3 py-2">{r.avgPct}%</td>
                            <td className="px-3 py-2">{r.percentile}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            case "subject":
              return !hasPerformance ? (
                <NoExamDataNote />
              ) : (
          <ul className="space-y-2">
            {subjectBreakdown.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-[var(--muted)]">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, s.avg)}%` }} />
                </div>
                <span className="w-10 text-right text-sm font-medium">{s.avg}%</span>
              </li>
            ))}
          </ul>
              );
            case "export-bulk":
              return (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--background)] disabled:opacity-50"
                    disabled={!hasPerformance}
                    onClick={exportRankExcel}
                  >
                    Export rank list (Excel)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--background)] disabled:opacity-50"
                    disabled={!hasPerformance}
                    onClick={exportAllExcel}
                  >
                    Export all scores (Excel)
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={!hasPerformance}
                    onClick={() => window.print()}
                  >
                    Bulk PDF (print)
                  </button>
                </div>
              );
            case "report-card":
              return (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <select
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
            <div id="student-report-card" className="rounded-lg border border-[var(--border)] p-4 print:border-black">
              <h4 className="font-semibold">{reportStudent.name}</h4>
              <p className="text-xs text-[var(--muted)]">
                {reportStudent.email} · Target {reportStudent.category} · Mentor:{" "}
                {reportStudent.teacher?.name ?? "—"}
              </p>
              <p className="mt-2 text-sm">
                Average score: <strong>{reportAvg ?? "—"}%</strong> · Attempts: {reportAttempts.length}
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
                  const el = document.getElementById("student-report-card");
                  if (!el) return;
                  const w = window.open("", "_blank");
                  if (!w) return;
                  w.document.write(`<html><head><title>Report - ${reportStudent.name}</title></head><body>${el.innerHTML}</body></html>`);
                  w.document.close();
                  w.print();
                }}
              >
                Print report card (PDF)
              </button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a student to view their report card.</p>
          )}
        </div>
              );
            default:
              return null;
          }
        }}
      />
  );
}

export function PerformanceAnalyticsPanel({ resetKey }: { resetKey?: string }) {
  const { data, loading } = useAdminOverview();
  const [trendStudentId, setTrendStudentId] = useState("");
  const [proximityStudentId, setProximityStudentId] = useState("");

  const weakChapters = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { total: number; count: number }>();
    for (const row of data.performance) {
      const ch = subjectFromTitle(row.title);
      const cur = map.get(`${row.category} · ${ch}`) ?? { total: 0, count: 0 };
      cur.total += row.percentage;
      cur.count += 1;
      map.set(`${row.category} · ${ch}`, cur);
    }
    return [...map.entries()]
      .map(([label, v]) => ({ label, avg: v.total / v.count }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);
  }, [data]);

  const trendAttempts = useMemo(() => {
    if (!trendStudentId || !data) return [];
    return data.performance
      .filter((p) => p.studentId === trendStudentId)
      .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());
  }, [data, trendStudentId]);

  const trendDelta =
    trendAttempts.length >= 2
      ? trendAttempts[trendAttempts.length - 1].percentage - trendAttempts[0].percentage
      : null;

  const proximityStudent = data?.students.find((s) => s.id === proximityStudentId);
  const latestPct = useMemo(() => {
    if (!proximityStudentId || !data) return null;
    const rows = data.performance.filter((p) => p.studentId === proximityStudentId);
    if (rows.length === 0) return null;
    return rows.sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())[0].percentage;
  }, [data, proximityStudentId]);

  const cutoff = proximityStudent ? CUTOFF_PCT[proximityStudent.category] ?? 50 : 50;

  const difficultyAnalysis = useMemo(() => {
    if (!data) return [];
    const buckets = [
      { label: "Easy", match: (t: string) => /mock|practice|easy/i.test(t) },
      { label: "Medium", match: (t: string) => !/mock|practice|easy|full|grand/i.test(t) },
      { label: "Hard", match: (t: string) => /full|grand|final/i.test(t) },
    ];
    return buckets.map((b) => {
      const rows = data.performance.filter((p) => b.match(p.title));
      const avg =
        rows.length > 0 ? rows.reduce((s, r) => s + r.percentage, 0) / rows.length : 0;
      return {
        label: b.label,
        avg: Math.round(avg * 10) / 10,
        responseRate: rows.length > 0 ? Math.min(100, Math.round(avg)) : 0,
        count: rows.length,
      };
    });
  }, [data]);

  const hasPerformance = (data?.performance.length ?? 0) > 0;

  if (loading) return <PanelLoading />;

  return (
    <FeatureActivityHub
      features={ANALYTICS_ACTIVITIES}
      resetKey={resetKey}
      renderFeature={(id) => {
        switch (id) {
          case "weak-chapters":
            return !hasPerformance ? (
              <NoExamDataNote />
            ) : (
          <>
          <ul className="space-y-2">
            {weakChapters.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No chapter data available yet.</li>
            ) : null}
            {weakChapters.map((w) => (
              <li
                key={w.label}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <span>{w.label}</span>
                <span className="font-semibold">{Math.round(w.avg * 10) / 10}% avg</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">Heuristic ranking from exam titles and scores; connect AI tagging for finer chapters.</p>
          </>
            );
          case "trend":
            return (
          <>
          <select
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={trendStudentId}
            onChange={(e) => setTrendStudentId(e.target.value)}
          >
            <option value="">Select student</option>
            {data?.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {trendAttempts.length > 0 ? (
            <>
              <div className="flex items-end gap-1 h-24">
                {trendAttempts.map((a) => (
                  <div
                    key={a.id}
                    className="flex-1 rounded-t bg-[var(--accent)]"
                    style={{ height: `${Math.max(8, a.percentage)}%` }}
                    title={`${a.title}: ${a.percentage}%`}
                  />
                ))}
              </div>
              <p className="mt-2 text-sm">
                Trend:{" "}
                <strong className={trendDelta != null && trendDelta >= 0 ? "text-green-700" : "text-red-600"}>
                  {trendDelta == null ? "—" : `${trendDelta >= 0 ? "+" : ""}${Math.round(trendDelta * 10) / 10}%`}
                </strong>{" "}
                from first to latest attempt
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a student with multiple attempts.</p>
          )}
          </>
            );
          case "cutoff":
            return (
          <>
          <select
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={proximityStudentId}
            onChange={(e) => setProximityStudentId(e.target.value)}
          >
            <option value="">Select student</option>
            {data?.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.category})
              </option>
            ))}
          </select>
          {latestPct != null && proximityStudent ? (
            <div>
              <p className="text-sm">
                {proximityStudent.name} · Target {proximityStudent.category} · Cut-off reference {cutoff}%
              </p>
              <div className="mt-3 h-4 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className={`h-full rounded-full ${latestPct >= cutoff ? "bg-emerald-600" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(100, latestPct)}%` }}
                />
              </div>
              <p className="mt-2 text-lg font-semibold">
                {latestPct}% {latestPct >= cutoff ? "— above cut-off zone" : "— below cut-off zone"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Select a student with at least one attempt.</p>
          )}
          </>
            );
          case "difficulty":
            return !hasPerformance ? (
              <NoExamDataNote />
            ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="text-[var(--muted)]">
              <tr>
                <th className="py-2">Difficulty</th>
                <th className="py-2">Attempts</th>
                <th className="py-2">Avg score</th>
                <th className="py-2">Response strength</th>
              </tr>
            </thead>
            <tbody>
              {difficultyAnalysis.map((d) => (
                <tr key={d.label} className="border-t border-[var(--border)]">
                  <td className="py-2 font-medium">{d.label}</td>
                  <td className="py-2">{d.count}</td>
                  <td className="py-2">{d.avg}%</td>
                  <td className="py-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--background)]">
                      <div className="h-full bg-[var(--accent)]" style={{ width: `${d.responseRate}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            );
          default:
            return null;
        }
      }}
    />
  );
}

export function InstitutionDashboardPanel({ resetKey }: { resetKey?: string }) {
  const { data, loading } = useAdminOverview();
  const [alertThreshold, setAlertThreshold] = useState(40);

  const batchHeatmap = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { total: number; count: number; teacher: string; category: string }>();
    for (const row of data.performance) {
      const student = data.students.find((s) => s.id === row.studentId);
      const batchKey = `${student?.teacher?.name ?? "Unassigned"} · ${row.category}`;
      const cur = map.get(batchKey) ?? {
        total: 0,
        count: 0,
        teacher: student?.teacher?.name ?? "Unassigned",
        category: row.category,
      };
      cur.total += row.percentage;
      cur.count += 1;
      map.set(batchKey, cur);
    }
    return [...map.entries()].map(([key, v]) => ({
      key,
      avg: Math.round((v.total / v.count) * 10) / 10,
      teacher: v.teacher,
      category: v.category,
    }));
  }, [data]);

  const lowPerformers = useMemo(() => {
    if (!data) return [];
    const byStudent = new Map<string, { name: string; category: string; avg: number }>();
    for (const row of data.performance) {
      const cur = byStudent.get(row.studentId);
      if (!cur) {
        byStudent.set(row.studentId, {
          name: row.studentName,
          category: row.category,
          avg: row.percentage,
        });
      } else {
        cur.avg = (cur.avg + row.percentage) / 2;
      }
    }
    return [...byStudent.values()]
      .filter((s) => s.avg < alertThreshold)
      .sort((a, b) => a.avg - b.avg);
  }, [data, alertThreshold]);

  const examFrequency = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const row of data.performance) {
      const d = new Date(row.examDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const teacherRatios = data?.teachers ?? [];
  const totalStudents = data?.counts.students ?? 0;

  const hasPerformance = (data?.performance.length ?? 0) > 0;

  if (loading) return <PanelLoading />;

  return (
    <FeatureActivityHub
      features={INSTITUTION_ACTIVITIES}
      resetKey={resetKey}
      renderFeature={(id) => {
        switch (id) {
          case "heatmap":
            return !hasPerformance ? (
              <NoExamDataNote />
            ) : batchHeatmap.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No batch scores to display yet.</p>
            ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {batchHeatmap.map((b) => {
            const intensity =
              b.avg >= 70 ? "bg-emerald-600 text-white" : b.avg >= 50 ? "bg-amber-400 text-amber-950" : "bg-red-500 text-white";
            return (
              <div key={b.key} className={`rounded-lg px-3 py-4 text-center ${intensity}`}>
                <p className="text-xs font-medium opacity-90">{b.key}</p>
                <p className="mt-1 text-2xl font-bold">{b.avg}%</p>
              </div>
            );
          })}
        </div>
            );
          case "alerts":
            return (
          <>
          <label className="mb-3 block text-xs text-[var(--muted)]">
            Alert below (%)
            <input
              type="number"
              min={0}
              max={100}
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            />
          </label>
          {lowPerformers.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No students below {alertThreshold}% average.</p>
          ) : (
            <ul className="space-y-2">
              {lowPerformers.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
                >
                  <span>
                    {s.name} <span className="text-[var(--muted)]">({s.category})</span>
                  </span>
                  <span className="font-semibold text-red-700">{Math.round(s.avg * 10) / 10}%</span>
                </li>
              ))}
            </ul>
          )}
          </>
            );
          case "frequency":
            return !hasPerformance ? (
              <NoExamDataNote />
            ) : (
          <>
          <ul className="space-y-2">
            {examFrequency.length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No attempts logged yet.</li>
            ) : null}
            {examFrequency.map(([month, count]) => (
              <li key={month} className="flex items-center gap-3 text-sm">
                <span className="w-20 text-[var(--muted)]">{month}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{
                      width: `${Math.min(100, (count / Math.max(...examFrequency.map(([, c]) => c), 1)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-8 font-medium">{count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Published exams on platform: {data?.counts.exams ?? 0}
          </p>
          </>
            );
          case "ratio":
            return (
          <>
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="py-2">Teacher</th>
              <th className="py-2">Track</th>
              <th className="py-2">Students</th>
              <th className="py-2">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {teacherRatios.map((t) => (
              <tr key={t.id} className="border-t border-[var(--border)]">
                <td className="py-2">{t.name}</td>
                <td className="py-2">{t.category}</td>
                <td className="py-2">{t.studentCount}</td>
                <td className="py-2">
                  {t.studentCount > 0
                    ? `1 : ${t.studentCount}`
                    : "—"}
                  {t.studentCount > 25 ? (
                    <span className="ml-2 text-xs text-amber-600">High load</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Institute total: {totalStudents} students · {teacherRatios.length} teachers · overall{" "}
          {teacherRatios.length > 0
            ? `1 : ${Math.round(totalStudents / teacherRatios.length)}`
            : "—"}
        </p>
          </>
            );
          default:
            return null;
        }
      }}
    />
  );
}
