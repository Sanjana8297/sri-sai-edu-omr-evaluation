"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";
import type { TeacherTrack } from "@/lib/dashboard-nav";
import { SUBJECTS_BY_TRACK } from "@/lib/dashboard-nav";
import type { SubjectScoresPayload } from "@/lib/subject-score-breakdown";
import { useReportsOverviewQuery } from "@/hooks/data/use-admin-queries";
import { fetchSubjectScores } from "@/lib/data/fetchers";
import { RankListTable } from "@/components/reports/RankListTable";
import type { RankListRowData } from "@/components/reports/RankListRow";

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

export type RankListRow = RankListRowData;

export function buildRankListFromPerformance(performance: AttemptRow[]): RankListRowData[] {
  if (performance.length === 0) return [];

  const byStudent = new Map<
    string,
    { name: string; category: string; scores: number[]; latest: AttemptRow }
  >();

  for (const row of performance) {
    const entry = byStudent.get(row.studentId) ?? {
      name: row.studentName,
      category: row.category,
      scores: [],
      latest: row,
    };
    entry.scores.push(row.percentage);
    if (new Date(row.examDate).getTime() > new Date(entry.latest.examDate).getTime()) {
      entry.latest = row;
    }
    byStudent.set(row.studentId, entry);
  }

  const ranked = [...byStudent.entries()].map(([id, v]) => ({
    studentId: id,
    name: v.name,
    category: v.category,
    avgPct: Math.round((v.scores.reduce((a, b) => a + b, 0) / v.scores.length) * 10) / 10,
    latest: v.latest,
  }));

  ranked.sort((a, b) => b.avgPct - a.avgPct);

  return ranked.map((r, i) => ({
    studentId: r.studentId,
    name: r.name,
    category: r.category,
    avgPct: r.avgPct,
    rank: i + 1,
    latestExamTitle: r.latest.title,
    latestExamScore: `${r.latest.marksObtained}/${r.latest.maxMarks}`,
  }));
}

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
  { id: "rank", title: "Rank list", description: "Instant aggregate across attempts with latest exam scores" },
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

export function useReportsOverview(
  overviewPath: string,
  initialData?: Awaited<ReturnType<typeof import("@/lib/data/fetchers").fetchReportsOverview>>
) {
  const q = useReportsOverviewQuery(overviewPath, initialData);
  return { data: q.data ?? null, loading: q.isLoading, reload: () => void q.refetch() };
}

export function useSubjectScoresApi(subjectScoresPath: string, enabled = true) {
  const q = useQuery({
    queryKey: ["subject-scores", subjectScoresPath] as const,
    queryFn: () => fetchSubjectScores(subjectScoresPath),
    staleTime: 5 * 60_000,
    enabled,
  });
  return {
    subjectScores: q.data?.byStudent ? q.data : null,
    subjectScoresLoading: q.isLoading,
  };
}

export function useAdminOverview() {
  return useReportsOverview("/api/admin/overview");
}

function useSubjectScores() {
  return useSubjectScoresApi("/api/admin/reports/subject-scores");
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

function AdminSubjectBreakdownFeature({ data }: { data: OverviewData }) {
  const { subjectScores, subjectScoresLoading } = useSubjectScoresApi(
    "/api/admin/reports/subject-scores",
    true
  );
  const [subjectStudentId, setSubjectStudentId] = useState("");
  const [subjectTrackFilter, setSubjectTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");

  const filteredSubjectStudents = useMemo(() => {
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

    const student = data.students.find((s) => s.id === subjectStudentId);
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

  if (subjectScoresLoading) return <PanelLoading />;

  return (
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
            <strong className="text-[var(--foreground)]">{subjectBreakdown.title}</strong>
            <br />
            {subjectBreakdown.subtitle}
            <br />
            Attempts on report card: <strong>{subjectBreakdown.allAttempts}</strong>
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
                  {s.examCount > 0 ? `${s.examCount} test${s.examCount === 1 ? "" : "s"}` : "No data"}
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
                {subjectBreakdown.overallAvg != null ? `${subjectBreakdown.overallAvg}%` : "—"}
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
}

export function ResultScoreReportsPanel({
  resetKey,
  initialOverview,
}: {
  resetKey?: string;
  initialOverview?: Awaited<ReturnType<typeof import("@/lib/data/fetchers").fetchReportsOverview>>;
}) {
  const { data, loading } = useReportsOverview("/api/admin/overview", initialOverview);
  const [reportStudentId, setReportStudentId] = useState("");
  const [trackFilter, setTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");

  const rankList = useMemo(
    () => (data ? buildRankListFromPerformance(data.performance) : []),
    [data],
  );

  const filteredRanks = rankList.filter((r) => trackFilter === "ALL" || r.category === trackFilter);

  const reportStudent = data?.students.find((s) => s.id === reportStudentId);
  const reportAttempts = useMemo(() => {
    if (!reportStudentId || !data) return [];
    return data.performance.filter((p) => p.studentId === reportStudentId);
  }, [data, reportStudentId]);

  const reportAttemptCount = reportAttempts.length;
  const reportAvg =
    reportAttempts.length > 0
      ? Math.round(
          (reportAttempts.reduce((s, a) => s + a.percentage, 0) / reportAttempts.length) * 10,
        ) / 10
      : null;

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
  }

  function exportAllExcel() {
    if (!data) return;
    downloadCsv("all-attempts.csv", [
      ["Student", "Exam", "Track", "Score", "Max", "Percent"],
      ...data.performance.map((p) => [
        p.studentName,
        p.title,
        p.category,
        String(p.marksObtained),
        String(p.maxMarks),
        String(p.percentage),
      ]),
    ]);
  }

  const hasPerformance = (data?.performance.length ?? 0) > 0;

  return (
    <FeatureActivityHub
        features={RESULT_ACTIVITIES}
        resetKey={resetKey}
        renderFeature={(id) => {
          if (loading && !data) return <PanelLoading />;

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
                  <RankListTable rows={filteredRanks} />
                </>
              );
            case "subject":
              return !hasPerformance ? (
                <NoExamDataNote />
              ) : data ? (
                <AdminSubjectBreakdownFeature data={data} />
              ) : null;
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
  const hasPerformance = (data?.performance.length ?? 0) > 0;

  const weakSubjectsByTrack = useMemo(() => {
    if (!subjectScores) return [];
    return (["JEE", "NEET"] as const).map((track) => {
      const subjects = SUBJECTS_BY_TRACK[track].map((subject) => {
        const row = subjectScores.trackAggregates[track].subjects.find((s) => s.subject === subject);
        return {
          subject,
          track,
          label: `${subject} (${track})`,
          avg: row?.avg ?? null,
          examCount: row?.examCount ?? 0,
        };
      });
      return {
        track,
        subjects: subjects.sort((a, b) => (a.avg ?? 100) - (b.avg ?? 100)),
      };
    });
  }, [subjectScores]);

  const trendSummary = useMemo(() => {
    const empty = { avgImprovement: null as number | null, upwardPct: null as number | null, sparkline: [] as number[] };
    if (!data) return { JEE: empty, NEET: empty };

    const buildTrack = (track: "JEE" | "NEET") => {
      const rows = data.performance.filter((p) => (track === "NEET" ? p.category === "NEET" : p.category !== "NEET"));
      const byStudent = new Map<string, AttemptRow[]>();
      for (const row of rows) {
        const list = byStudent.get(row.studentId) ?? [];
        list.push(row);
        byStudent.set(row.studentId, list);
      }

      const deltas: number[] = [];
      let upward = 0;
      let totalComparable = 0;

      for (const attempts of byStudent.values()) {
        const sorted = [...attempts].sort(
          (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
        );
        const recent = sorted.slice(-4);
        if (recent.length >= 2) {
          const delta = recent[recent.length - 1]!.percentage - recent[0]!.percentage;
          deltas.push(delta);
          totalComparable += 1;
          if (delta > 0) upward += 1;
        }
      }

      const allSorted = [...rows].sort(
        (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
      );
      const sparkline = allSorted.slice(-6).map((a) => Math.round(a.percentage));

      return {
        avgImprovement:
          deltas.length > 0
            ? Math.round((deltas.reduce((sum, d) => sum + d, 0) / deltas.length) * 10) / 10
            : null,
        upwardPct:
          totalComparable > 0 ? Math.round((upward / totalComparable) * 100) : null,
        sparkline,
      };
    };

    return { JEE: buildTrack("JEE"), NEET: buildTrack("NEET") };
  }, [data]);

  const cutoffSummary = useMemo(() => {
    if (!data) {
      return {
        NEET: { latestAvg: null as number | null, above: 0, below: 0 },
        JEE: { latestAvg: null as number | null, above: 0, below: 0 },
        aiPrediction: 0,
      };
    }

    const latestByStudent = new Map<string, AttemptRow>();
    for (const row of data.performance) {
      const prev = latestByStudent.get(row.studentId);
      if (!prev || new Date(row.examDate).getTime() > new Date(prev.examDate).getTime()) {
        latestByStudent.set(row.studentId, row);
      }
    }

    const byTrack: Record<"JEE" | "NEET", AttemptRow[]> = { JEE: [], NEET: [] };
    for (const row of latestByStudent.values()) {
      const track = row.category === "NEET" ? "NEET" : "JEE";
      byTrack[track].push(row);
    }

    const build = (track: "JEE" | "NEET") => {
      const rows = byTrack[track];
      const cutoff = CUTOFF_PCT[track];
      const above = rows.filter((r) => r.percentage >= cutoff).length;
      const below = rows.length - above;
      const latestAvg =
        rows.length > 0
          ? Math.round((rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length) * 10) / 10
          : null;
      return { latestAvg, above, below };
    };

    const aiPrediction = byTrack.JEE.filter(
      (r) => r.percentage < CUTOFF_PCT.JEE && r.percentage >= CUTOFF_PCT.JEE - 12
    ).length;

    return { NEET: build("NEET"), JEE: build("JEE"), aiPrediction };
  }, [data]);

  const difficultyAnalysis = useMemo(() => {
    if (!data) return [];
    const buckets = [
      { label: "Easy", match: (t: string) => /mock|practice|easy/i.test(t), color: "bg-lime-500" },
      {
        label: "Medium",
        match: (t: string) => !/mock|practice|easy|full|grand/i.test(t),
        color: "bg-amber-500",
      },
      { label: "Hard", match: (t: string) => /full|grand|final/i.test(t), color: "bg-orange-500" },
    ];
    return buckets.map((b) => {
      const rows = data.performance.filter((p) => b.match(p.title));
      const avg = rows.length > 0 ? rows.reduce((s, r) => s + r.percentage, 0) / rows.length : 0;
      return {
        label: b.label,
        avg: Math.round(avg * 10) / 10,
        responseRate: rows.length > 0 ? Math.min(100, Math.round(avg)) : 0,
        count: rows.length,
        color: b.color,
      };
    });
  }, [data]);

  const difficultyNotes = useMemo(() => {
    if (!subjectScores) return { missed: "—", best: "—" };
    const allSubjects = (["JEE", "NEET"] as const).flatMap((track) =>
      subjectScores.trackAggregates[track].subjects.map((s) => ({ ...s, track }))
    );
    const withData = allSubjects.filter((s) => s.avg != null);
    if (withData.length === 0) return { missed: "—", best: "—" };
    const worst = withData.reduce((a, b) => ((a.avg ?? 100) < (b.avg ?? 100) ? a : b));
    const best = withData.reduce((a, b) => ((a.avg ?? 0) > (b.avg ?? 0) ? a : b));
    return {
      missed: `${worst.subject} (${worst.track})`,
      best: `${best.subject} (${best.track})`,
    };
  }, [subjectScores]);

  if (loading) return <PanelLoading />;
  if (!hasPerformance) return <NoExamDataNote />;

  const subjectScoresPending = subjectScoresLoading || !subjectScores;

  const severityFor = (value: number | null) => {
    if (value == null) return { label: "No data", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
    if (value < 35) return { label: "Critical", tone: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" };
    if (value < 50) return { label: "Weak", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
    return { label: "Fair", tone: "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300" };
  };

  const maxSpark = (sparkline: number[]) => Math.max(...sparkline, 1);

  return (
    <div key={resetKey} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">Performance analytics</h3>
          <p className="text-sm text-[var(--muted)]">AI-driven insights · Updated today</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
          Powered by AI
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h4 className="text-xl font-semibold">Weak chapter identification</h4>
              <p className="text-sm text-[var(--muted)]">Lowest average performance areas</p>
            </div>
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              AI
            </span>
          </div>
          <p className="mb-3 text-sm text-[var(--muted)]">Weakest chapters across JEE and NEET batches</p>
          {subjectScoresPending ? (
            <PanelLoading />
          ) : (
          <div className="space-y-3">
            {weakSubjectsByTrack.map((bucket) => (
              <div key={bucket.track}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {bucket.track}
                </p>
                <ul className="space-y-2">
                  {bucket.subjects.map((w) => {
                    const severity = severityFor(w.avg);
                    return (
                      <li key={w.label} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.subject}</span>
                        <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--background)]">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${Math.min(100, w.avg ?? 0)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-sm">{w.avg != null ? `${w.avg}%` : "—"}</span>
                        <span
                          className={`w-16 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${severity.tone}`}
                        >
                          {severity.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          )}
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h4 className="text-xl font-semibold">Improvement trend across attempts</h4>
          <p className="text-sm text-[var(--muted)]">Chronological score progression</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(["JEE", "NEET"] as const).map((track) => (
              <div key={track} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{track}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-2xl font-semibold">
                      {trendSummary[track].avgImprovement == null
                        ? "—"
                        : `${trendSummary[track].avgImprovement >= 0 ? "+" : ""}${trendSummary[track].avgImprovement}%`}
                    </p>
                    <p className="text-xs text-[var(--muted)]">Avg improvement</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">
                      {trendSummary[track].upwardPct == null ? "—" : `${trendSummary[track].upwardPct}%`}
                    </p>
                    <p className="text-xs text-[var(--muted)]">Upward trend</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">Last 6 attempts</p>
                <div className="mt-1 flex h-16 items-end gap-1.5">
                  {trendSummary[track].sparkline.map((value, idx) => (
                    <div
                      key={`${track}-${idx}-${value}`}
                      className="flex-1 rounded-t bg-emerald-500/80"
                      style={{ height: `${Math.max(10, (value / maxSpark(trendSummary[track].sparkline)) * 100)}%` }}
                      title={`${value}%`}
                    />
                  ))}
                </div>
                <div className="mt-1 flex gap-1.5">
                  {trendSummary[track].sparkline.map((value, idx) => (
                    <span
                      key={`${track}-label-${idx}-${value}`}
                      className="flex-1 text-center text-[10px] text-[var(--muted)]"
                    >
                      {value}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h4 className="text-xl font-semibold">NEET / JEE cut-off proximity meter</h4>
          <p className="text-sm text-[var(--muted)]">Latest score vs qualifying benchmark</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[var(--background)] p-3">
              <p className="text-xs text-[var(--muted)]">NEET cut-off</p>
              <p className="text-3xl font-semibold">{cutoffSummary.NEET.latestAvg ?? "—"}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Above cutoff: {cutoffSummary.NEET.above}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Below cutoff: {cutoffSummary.NEET.below}</p>
            </div>
            <div className="rounded-lg bg-[var(--background)] p-3">
              <p className="text-xs text-[var(--muted)]">JEE Mains cut-off</p>
              <p className="text-3xl font-semibold">{cutoffSummary.JEE.latestAvg ?? "—"}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Above cutoff: {cutoffSummary.JEE.above}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Below cutoff: {cutoffSummary.JEE.below}</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-violet-100 px-3 py-2 text-sm text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            AI predicts {cutoffSummary.aiPrediction} students could cross JEE cutoff with 3 more full-length tests.
          </div>
        </article>

        <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h4 className="text-xl font-semibold">Question difficulty vs response analysis</h4>
          <p className="text-sm text-[var(--muted)]">Performance by inferred paper difficulty</p>
          <p className="mt-4 text-sm text-[var(--muted)]">Accuracy rate by difficulty tier</p>
          <ul className="mt-2 space-y-2">
            {difficultyAnalysis.map((d) => (
              <li key={d.label} className="flex items-center gap-3">
                <span className="w-16 text-sm font-medium">{d.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--background)]">
                  <div className={`h-full rounded-full ${d.color}`} style={{ width: `${d.responseRate}%` }} />
                </div>
                <span className="w-12 text-right text-sm">{d.avg}%</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2">
            <p className="rounded-full border border-[var(--border)] px-3 py-1 text-sm">
              Most missed: {difficultyNotes.missed}
            </p>
            <p className="rounded-full border border-[var(--border)] px-3 py-1 text-sm">
              Best accuracy: {difficultyNotes.best}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
