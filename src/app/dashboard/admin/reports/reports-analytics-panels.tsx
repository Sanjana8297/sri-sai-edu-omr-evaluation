"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";
import type { TeacherTrack } from "@/lib/dashboard-nav";
import { SUBJECTS_BY_TRACK } from "@/lib/dashboard-nav";
import type { SubjectScoresPayload } from "@/lib/subject-score-breakdown";

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

const RESULT_ACTIVITIES: ActivityFeature[] = [
  { id: "rank", title: "Rank list with percentile", description: "Instant aggregate across attempts" },
  { id: "subject", title: "Subject-wise score breakdown", description: "Per-student subject averages from exam paper scoring" },
  { id: "report-card", title: "Individual student report card", description: "Per-student exam history and summary" },
  { id: "export-bulk", title: "Bulk Excel export", description: "Download rank list or all scores" },
];

const ANALYTICS_ACTIVITIES: ActivityFeature[] = [
  { id: "weak-chapters", title: "Weak chapter identification (AI)", description: "Lowest average performance areas" },
  { id: "trend", title: "Improvement trend across attempts", description: "Chronological score progression" },
  { id: "cutoff", title: "NEET/JEE cut-off proximity meter", description: "Latest score vs qualifying benchmark" },
  { id: "difficulty", title: "Question difficulty vs response analysis", description: "Performance by inferred paper difficulty" },
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

const ALL_STUDENTS_SUBJECT_VALUE = "__all__";

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

function useSubjectScores() {
  const [subjectScores, setSubjectScores] = useState<SubjectScoresPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reports/subject-scores");
      const json = await res.json();
      if (json.byStudent) setSubjectScores(json as SubjectScoresPayload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { subjectScores, subjectScoresLoading: loading };
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
  const { subjectScores, subjectScoresLoading } = useSubjectScores();
  const [reportStudentId, setReportStudentId] = useState("");
  const [subjectStudentId, setSubjectStudentId] = useState("");
  const [subjectTrackFilter, setSubjectTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");
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

  const filteredSubjectStudents = useMemo(() => {
    if (!data) return [];
    if (subjectTrackFilter === "ALL") return data.students;
    return data.students.filter((s) => s.category === subjectTrackFilter);
  }, [data, subjectTrackFilter]);

  const subjectBreakdown = useMemo(() => {
    if (!subjectScores || !subjectStudentId) return null;

    if (subjectStudentId === ALL_STUDENTS_SUBJECT_VALUE && subjectTrackFilter !== "ALL") {
      const track = subjectTrackFilter as TeacherTrack;
      const aggregate = subjectScores.trackAggregates[track];
      return {
        title: `All students · Target ${track}`,
        subtitle: "Average % per subject across all exam attempts on the report card",
        allAttempts: aggregate.allAttempts,
        overallAvg: aggregate.overallAvg,
        scores: aggregate.subjects,
      };
    }

    const student = data?.students.find((s) => s.id === subjectStudentId);
    const entry = subjectScores.byStudent[subjectStudentId];
    if (!student || !entry) return null;
    return {
      title: `${student.name} · Target ${entry.track}`,
      subtitle: "Average % per subject across all exam attempts on the report card",
      allAttempts: entry.allAttempts,
      overallAvg: entry.overallAvg,
      scores: entry.subjects,
    };
  }, [data, subjectStudentId, subjectTrackFilter, subjectScores]);

  const reportStudent = data?.students.find((s) => s.id === reportStudentId);
  const reportStudentStats = reportStudentId ? subjectScores?.byStudent[reportStudentId] : undefined;
  const reportAttempts = useMemo(() => {
    if (!reportStudentId || !data) return [];
    return data.performance.filter((p) => p.studentId === reportStudentId);
  }, [data, reportStudentId]);

  const reportAttemptCount = reportStudentStats?.allAttempts ?? reportAttempts.length;
  const reportAvg = reportStudentStats?.overallAvg ??
    (reportAttempts.length > 0
      ? Math.round(
          (reportAttempts.reduce((s, a) => s + a.percentage, 0) / reportAttempts.length) * 10,
        ) / 10
      : null);

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
              ) : subjectScoresLoading ? (
                <PanelLoading />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {(["ALL", "JEE", "NEET"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          subjectTrackFilter === t
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--border)] text-[var(--muted)]"
                        }`}
                        onClick={() => {
                          setSubjectTrackFilter(t);
                          setSubjectStudentId("");
                        }}
                      >
                        {t === "ALL" ? "All tracks" : `Track: ${t}`}
                      </button>
                    ))}
                  </div>
                  <select
                    className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    value={subjectStudentId}
                    onChange={(e) => setSubjectStudentId(e.target.value)}
                  >
                    <option value="">Select student</option>
                    {subjectTrackFilter !== "ALL" ? (
                      <option value={ALL_STUDENTS_SUBJECT_VALUE}>All students</option>
                    ) : null}
                    {filteredSubjectStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.category})
                      </option>
                    ))}
                  </select>
                  {subjectBreakdown ? (
                    <div className="space-y-3">
                      <p className="text-sm text-[var(--muted)]">
                        {subjectBreakdown.title} · {subjectBreakdown.subtitle}
                      </p>
                      <p className="text-sm">
                        Total attempts: <strong>{subjectBreakdown.allAttempts}</strong>
                        {" · "}
                        Total average:{" "}
                        <strong>
                          {subjectBreakdown.overallAvg != null
                            ? `${subjectBreakdown.overallAvg}%`
                            : "—"}
                        </strong>
                      </p>
                      <ul className="space-y-2">
                        {subjectBreakdown.scores.map((s) => (
                          <li key={s.subject} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 text-sm font-medium">{s.subject}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                              <div
                                className="h-full rounded-full bg-[var(--accent)]"
                                style={{ width: `${s.avg != null ? Math.min(100, s.avg) : 0}%` }}
                              />
                            </div>
                            <span className="w-24 text-right text-sm font-medium">
                              {s.avg != null ? `${s.avg}%` : "—"}
                            </span>
                            <span className="w-28 text-right text-xs text-[var(--muted)]">
                              {s.examCount > 0
                                ? `${s.examCount} test${s.examCount === 1 ? "" : "s"}`
                                : "No data"}
                            </span>
                          </li>
                        ))}
                        <li className="flex items-center gap-3 border-t border-[var(--border)] pt-3">
                          <span className="w-28 shrink-0 text-sm font-semibold">Total Average</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{
                                width: `${
                                  subjectBreakdown.overallAvg != null
                                    ? Math.min(100, subjectBreakdown.overallAvg)
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="w-24 text-right text-sm font-semibold">
                            {subjectBreakdown.overallAvg != null
                              ? `${subjectBreakdown.overallAvg}%`
                              : "—"}
                          </span>
                          <span className="w-28 text-right text-xs text-[var(--muted)]">Combined</span>
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      {subjectTrackFilter === "ALL"
                        ? "Select a student to view subject-wise scores, or choose a track to include all students."
                        : "Select a student or All students to view subject-wise scores for this track."}
                    </p>
                  )}
                </div>
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
  const { subjectScores, subjectScoresLoading } = useSubjectScores();
  const [weakTrackFilter, setWeakTrackFilter] = useState<TeacherTrack>("JEE");
  const [trendStudentId, setTrendStudentId] = useState("");
  const [proximityStudentId, setProximityStudentId] = useState("");

  const weakSubjects = useMemo(() => {
    if (!subjectScores) return [];
    const aggregate = subjectScores.trackAggregates[weakTrackFilter];
    return SUBJECTS_BY_TRACK[weakTrackFilter]
      .map((subject) => {
        const row = aggregate.subjects.find((s) => s.subject === subject);
        return {
          subject,
          avg: row?.avg ?? null,
          examCount: row?.examCount ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.avg == null && b.avg == null) return 0;
        if (a.avg == null) return 1;
        if (b.avg == null) return -1;
        return a.avg - b.avg;
      });
  }, [subjectScores, weakTrackFilter]);

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
  const hasSubjectScores =
    subjectScores != null &&
    (subjectScores.trackAggregates.JEE.allAttempts > 0 ||
      subjectScores.trackAggregates.NEET.allAttempts > 0);

  if (loading) return <PanelLoading />;

  return (
    <FeatureActivityHub
      features={ANALYTICS_ACTIVITIES}
      resetKey={resetKey}
      renderFeature={(id) => {
        switch (id) {
          case "weak-chapters":
            return subjectScoresLoading ? (
              <PanelLoading />
            ) : !hasSubjectScores ? (
              <NoExamDataNote />
            ) : (
          <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["JEE", "NEET"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  weakTrackFilter === t ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"
                }`}
                onClick={() => setWeakTrackFilter(t)}
              >
                Track: {t}
              </button>
            ))}
          </div>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Target {weakTrackFilter} · All subjects ranked weakest first ·{" "}
            {subjectScores?.trackAggregates[weakTrackFilter].allAttempts ?? 0} exam attempts considered
          </p>
          <ul className="space-y-2">
            {weakSubjects.map((w, index) => (
              <li
                key={w.subject}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  index === 0 && w.avg != null
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-[var(--border)]"
                }`}
              >
                <span className="font-medium">{w.subject}</span>
                <span>
                  <span className="font-semibold">{w.avg != null ? `${w.avg}%` : "—"}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {w.examCount > 0
                      ? `${w.examCount} test${w.examCount === 1 ? "" : "s"}`
                      : "No attempts"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Uses the same subject scoring as the report card (paper sections, single-subject tests, and overall
            scores for full mocks).
          </p>
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
