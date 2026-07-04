"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityFeature } from "@/components/FeatureActivityHub";
import { SUBJECTS_BY_TRACK } from "@/lib/dashboard-nav";
import type { SubjectScoresPayload } from "@/lib/subject-score-breakdown";
import { useReportsOverviewQuery } from "@/hooks/data/use-admin-queries";
import { fetchSubjectScores } from "@/lib/data/fetchers";
import { RankListTable } from "@/components/reports/RankListTable";
import type { RankListRowData } from "@/components/reports/RankListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/skeletons/DashboardSkeletons";
import {
  dashBadgeAccent,
  dashBlock,
  dashBtnPrimary,
  dashBtnSecondary,
  dashCard,
  dashCardMeta,
  dashCardTitle,
  dashDropdown,
  dashDropdownItem,
  dashFilterPill,
  dashFilterPillActive,
  dashInput,
  dashLabel,
  dashPageStats,
  dashPanel,
  dashSectionTitle,
  dashSelect,
  dashTable,
  dashTableHead,
} from "@/lib/dashboard-ui";

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

export type OverviewData = {
  counts: { students: number; teachers: number; exams: number };
  avgPercentageAcrossAttempts: number | null;
  students: StudentRow[];
  teachers: TeacherRow[];
  exams: Array<{ id: string; title: string; category: string; startTime: string; isPublished: boolean }>;
  performance: AttemptRow[];
};

export const CUTOFF_PCT: Record<string, number> = { NEET: 50, JEE: 90 };

export type TrendPoint = {
  value: number;
  examTitle: string;
  examDate: string;
  studentName: string;
};

export type TrendTrackSummary = {
  avgImprovement: number | null;
  upwardPct: number | null;
  sparkline: number[];
  sparklinePoints: TrendPoint[];
  comparableStudents: number;
};

export type CutoffTrackSummary = { latestAvg: number | null; above: number; below: number };

export type CutoffStudent = {
  studentId: string;
  studentName: string;
  examTitle: string;
  examDate: string;
  percentage: number;
  above: boolean;
};

export type WeakSubjectRow = {
  subject: string;
  track: "JEE" | "NEET";
  label: string;
  avg: number | null;
  examCount: number;
};

export type DifficultyRow = {
  label: string;
  avg: number;
  responseRate: number;
  count: number;
  color: string;
};

export type RecentExamAccuracy = {
  title: string;
  examDate: string;
  accuracy: number;
  attemptCount: number;
};

export function severityFor(value: number | null) {
  if (value == null)
    return { label: "No data", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };
  if (value < 35) return { label: "Critical", tone: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" };
  if (value < 50) return { label: "Weak", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
  return { label: "Fair", tone: "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300" };
}

export function computeWeakSubjectsByTrack(
  subjectScores: SubjectScoresPayload | null
): Array<{ track: "JEE" | "NEET"; subjects: WeakSubjectRow[] }> {
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
}

export function computeTrendSummary(
  performance: AttemptRow[]
): { JEE: TrendTrackSummary; NEET: TrendTrackSummary } {
  const buildTrack = (track: "JEE" | "NEET"): TrendTrackSummary => {
    const rows = performance.filter((p) => (track === "NEET" ? p.category === "NEET" : p.category !== "NEET"));
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
    const sparklinePoints = allSorted.slice(-6).map((a) => ({
      value: Math.round(a.percentage),
      examTitle: a.title,
      examDate: a.examDate,
      studentName: a.studentName,
    }));

    return {
      avgImprovement:
        deltas.length > 0
          ? Math.round((deltas.reduce((sum, d) => sum + d, 0) / deltas.length) * 10) / 10
          : null,
      upwardPct: totalComparable > 0 ? Math.round((upward / totalComparable) * 100) : null,
      sparkline: sparklinePoints.map((p) => p.value),
      sparklinePoints,
      comparableStudents: totalComparable,
    };
  };

  return { JEE: buildTrack("JEE"), NEET: buildTrack("NEET") };
}

export function computeCutoffSummary(performance: AttemptRow[]): {
  NEET: CutoffTrackSummary;
  JEE: CutoffTrackSummary;
  aiPrediction: number;
} {
  const latestByStudent = new Map<string, AttemptRow>();
  for (const row of performance) {
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

  const build = (track: "JEE" | "NEET"): CutoffTrackSummary => {
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
}

/** Latest attempt per student, grouped by track, classified above/below the cut-off. */
export function computeCutoffStudents(
  performance: AttemptRow[]
): { JEE: CutoffStudent[]; NEET: CutoffStudent[] } {
  const latestByStudent = new Map<string, AttemptRow>();
  for (const row of performance) {
    const prev = latestByStudent.get(row.studentId);
    if (!prev || new Date(row.examDate).getTime() > new Date(prev.examDate).getTime()) {
      latestByStudent.set(row.studentId, row);
    }
  }

  const byTrack: { JEE: CutoffStudent[]; NEET: CutoffStudent[] } = { JEE: [], NEET: [] };
  for (const row of latestByStudent.values()) {
    const track = row.category === "NEET" ? "NEET" : "JEE";
    byTrack[track].push({
      studentId: row.studentId,
      studentName: row.studentName,
      examTitle: row.title,
      examDate: row.examDate,
      percentage: row.percentage,
      above: row.percentage >= CUTOFF_PCT[track],
    });
  }

  byTrack.JEE.sort((a, b) => b.percentage - a.percentage);
  byTrack.NEET.sort((a, b) => b.percentage - a.percentage);
  return byTrack;
}

export function computeDifficultyAnalysis(performance: AttemptRow[]): DifficultyRow[] {
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
    const rows = performance.filter((p) => b.match(p.title));
    const avg = rows.length > 0 ? rows.reduce((s, r) => s + r.percentage, 0) / rows.length : 0;
    return {
      label: b.label,
      avg: Math.round(avg * 10) / 10,
      responseRate: rows.length > 0 ? Math.min(100, Math.round(avg)) : 0,
      count: rows.length,
      color: b.color,
    };
  });
}

/** Average accuracy (score %) per exam for the most recent exams, newest first. */
export function computeRecentExamAccuracy(
  performance: AttemptRow[],
  limit = 4
): RecentExamAccuracy[] {
  const byExam = new Map<string, { title: string; examDate: string; sum: number; count: number }>();
  for (const row of performance) {
    const key = `${row.title}__${row.examDate}`;
    const entry = byExam.get(key) ?? { title: row.title, examDate: row.examDate, sum: 0, count: 0 };
    entry.sum += row.percentage;
    entry.count += 1;
    byExam.set(key, entry);
  }

  return [...byExam.values()]
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
    .slice(0, limit)
    .map((e) => ({
      title: e.title,
      examDate: e.examDate,
      accuracy: Math.round((e.sum / e.count) * 10) / 10,
      attemptCount: e.count,
    }));
}

export function computeDifficultyNotes(
  subjectScores: SubjectScoresPayload | null
): { missed: string; best: string } {
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
}

export const ANALYTICS_DETAIL_BASE = "/dashboard/admin/reports/analytics";

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
    <EmptyState
      icon="📊"
      title="No exam data yet"
      description="Schedule exams and record attempts to populate this report."
    />
  );
}

export function SubjectBreakdownList({
  title,
  subtitle,
  allAttempts,
  overallAvg,
  scores,
}: {
  title: string;
  subtitle: string;
  allAttempts: number;
  overallAvg: number | null;
  scores: Array<{ subject: string; avg: number | null; examCount: number }>;
}) {
  return (
    <div className={`${dashBlock} space-y-4`}>
      <p className={dashCardMeta}>
        {title} · {subtitle}
      </p>
      <p className="text-sm leading-relaxed">
        Total attempts: <strong>{allAttempts}</strong>
        {" · "}
        Total average: <strong>{overallAvg != null ? `${overallAvg}%` : "—"}</strong>
      </p>
      <ul className="space-y-3">
        {scores.map((s) => (
          <li key={s.subject} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-medium">{s.subject}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--background)_70%,transparent)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${s.avg != null ? Math.min(100, s.avg) : 0}%` }}
              />
            </div>
            <span className="w-24 text-right text-sm font-medium tabular-nums">
              {s.avg != null ? `${s.avg}%` : "—"}
            </span>
            <span className="w-28 text-right text-xs text-[var(--muted)]">
              {s.examCount > 0 ? `${s.examCount} test${s.examCount === 1 ? "" : "s"}` : "No data"}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
          <span className="w-28 shrink-0 text-sm font-semibold">Total Average</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--background)_70%,transparent)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${overallAvg != null ? Math.min(100, overallAvg) : 0}%` }}
            />
          </div>
          <span className="w-24 text-right text-sm font-semibold tabular-nums">
            {overallAvg != null ? `${overallAvg}%` : "—"}
          </span>
          <span className="w-28 text-right text-xs text-[var(--muted)]">Combined</span>
        </li>
      </ul>
    </div>
  );
}

export type ResultScoreReportsConfig = {
  overviewPath: string;
  subjectScoresPath: string;
  studentReportHref: (studentId: string) => string;
  reportCardElementId: string;
  reportCardTitleId: string;
  reportStudentSelectId: string;
  showMentorInReportCard?: boolean;
};

export const ADMIN_RESULT_SCORE_CONFIG: ResultScoreReportsConfig = {
  overviewPath: "/api/admin/overview",
  subjectScoresPath: "/api/admin/reports/subject-scores",
  studentReportHref: (id) => `/dashboard/admin/reports/student/${encodeURIComponent(id)}`,
  reportCardElementId: "admin-student-report-card",
  reportCardTitleId: "admin-report-card-title",
  reportStudentSelectId: "admin-report-student",
  showMentorInReportCard: true,
};

export const TEACHER_RESULT_SCORE_CONFIG: ResultScoreReportsConfig = {
  overviewPath: "/api/teacher/reports/overview",
  subjectScoresPath: "/api/teacher/reports/subject-scores",
  studentReportHref: (id) =>
    `/dashboard/teacher/result-score-reports/student/${encodeURIComponent(id)}`,
  reportCardElementId: "teacher-student-report-card",
  reportCardTitleId: "teacher-report-card-title",
  reportStudentSelectId: "teacher-report-student",
  showMentorInReportCard: true,
};

export function ResultScoreReportsPanel({
  resetKey,
  initialOverview,
  config = ADMIN_RESULT_SCORE_CONFIG,
}: {
  resetKey?: string;
  initialOverview?: Awaited<ReturnType<typeof import("@/lib/data/fetchers").fetchReportsOverview>>;
  config?: ResultScoreReportsConfig;
}) {
  const router = useRouter();
  const { data, loading } = useReportsOverview(config.overviewPath, initialOverview);
  const { subjectScores } = useSubjectScoresApi(config.subjectScoresPath);
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
      ...data.performance.map((p) => [
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

  if (loading && !data) {
    return <TableSkeleton rows={8} />;
  }

  const attemptCount = data?.performance.length ?? 0;

  return (
    <div key={resetKey} className="space-y-6">
      {hasPerformance ? (
        <p className={dashPageStats}>
          {filteredRanks.length} student{filteredRanks.length === 1 ? "" : "s"} ranked · {attemptCount}{" "}
          exam attempt{attemptCount === 1 ? "" : "s"} recorded
        </p>
      ) : null}

      <section className={`${dashPanel} dash-static space-y-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className={dashSectionTitle}>Rank list</h3>
            <p className={dashCardMeta}>
              Aggregate rankings with each student&apos;s latest exam score
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                className={`${dashBtnSecondary} inline-flex items-center gap-1.5`}
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
                <div role="menu" className={dashDropdown}>
                  <button type="button" role="menuitem" className={dashDropdownItem} onClick={exportRankExcel}>
                    Export rank list
                  </button>
                  <button type="button" role="menuitem" className={dashDropdownItem} onClick={exportAllExcel}>
                    Export all scores
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={dashBtnSecondary}
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
          <NoExamDataNote />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <div className="flex flex-wrap gap-2">
                {(["ALL", "JEE", "NEET"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={trackFilter === t ? dashFilterPillActive : dashFilterPill}
                    onClick={() => setTrackFilter(t)}
                  >
                    {t === "ALL" ? "All tracks" : t}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Click a student row to open their full report
              </p>
            </div>
            <RankListTable
              embedded
              maxHeightClass="max-h-[28rem]"
              rows={filteredRanks}
              onSelectStudent={(id) => {
                if (id) router.push(config.studentReportHref(id));
              }}
            />
          </>
        )}
      </section>

      {reportCardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={config.reportCardTitleId}
          onClick={() => setReportCardOpen(false)}
        >
          <div
            className={`${dashPanel} max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 id={config.reportCardTitleId} className={dashSectionTitle}>
                  Individual student report card
                </h3>
                <p className={dashCardMeta}>Preview and print a summary for one student</p>
              </div>
              <button
                type="button"
                className={dashBtnSecondary}
                onClick={() => setReportCardOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <label
              className={`${dashLabel} mb-1.5 block normal-case`}
              htmlFor={config.reportStudentSelectId}
            >
              Student
            </label>
            <select
              id={config.reportStudentSelectId}
              className={`${dashSelect} w-full`}
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
              <div id={config.reportCardElementId} className={`${dashBlock} mt-5 print:border-black`}>
                <h4 className={dashCardTitle}>{reportStudent.name}</h4>
                <p className={`${dashCardMeta} text-xs`}>
                  {reportStudent.email} · Target {reportStudent.category}
                  {config.showMentorInReportCard ? (
                    <> · Mentor: {reportStudent.teacher?.name ?? "—"}</>
                  ) : null}
                </p>
                <p className="mt-3 text-sm leading-relaxed">
                  Average score: <strong>{reportAvg ?? "—"}%</strong> · Attempts: {reportAttemptCount}
                </p>
                <table className={`${dashTable} mt-4`}>
                  <thead className={dashTableHead}>
                    <tr>
                      <th className="text-left">Exam</th>
                      <th className="text-left">Date</th>
                      <th className="text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportAttempts.map((a) => (
                      <tr key={a.id} className="border-t border-[var(--border)]">
                        <td className="py-2">{a.title}</td>
                        <td className="py-2">{new Date(a.examDate).toLocaleDateString()}</td>
                        <td className="py-2 text-right tabular-nums">
                          {a.marksObtained}/{a.maxMarks} ({a.percentage}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className={`${dashBtnSecondary} mt-4 text-xs print:hidden`}
                  onClick={() => {
                    const el = document.getElementById(config.reportCardElementId);
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
              <p className={`${dashCardMeta} mt-4`}>Select a student to view their report card.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PerformanceAnalyticsPanel({ resetKey }: { resetKey?: string }) {
  const { data, loading } = useAdminOverview();
  const { subjectScores, subjectScoresLoading } = useSubjectScores();
  const hasPerformance = (data?.performance.length ?? 0) > 0;

  const weakSubjectsByTrack = useMemo(() => computeWeakSubjectsByTrack(subjectScores), [subjectScores]);

  const trendSummary = useMemo(
    () =>
      data
        ? computeTrendSummary(data.performance)
        : {
            JEE: { avgImprovement: null, upwardPct: null, sparkline: [], sparklinePoints: [], comparableStudents: 0 },
            NEET: { avgImprovement: null, upwardPct: null, sparkline: [], sparklinePoints: [], comparableStudents: 0 },
          },
    [data]
  );

  const cutoffSummary = useMemo(
    () =>
      data
        ? computeCutoffSummary(data.performance)
        : {
            NEET: { latestAvg: null, above: 0, below: 0 },
            JEE: { latestAvg: null, above: 0, below: 0 },
            aiPrediction: 0,
          },
    [data]
  );

  const difficultyAnalysis = useMemo(
    () => (data ? computeDifficultyAnalysis(data.performance) : []),
    [data]
  );

  const difficultyNotes = useMemo(() => computeDifficultyNotes(subjectScores), [subjectScores]);

  if (loading) return <PanelLoading />;
  if (!hasPerformance) return <NoExamDataNote />;

  const subjectScoresPending = subjectScoresLoading || !subjectScores;

  const maxSpark = (sparkline: number[]) => Math.max(...sparkline, 1);

  return (
    <div key={resetKey} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={dashSectionTitle}>Performance analytics</h3>
          <p className={dashCardMeta}>AI-driven insights · Updated today</p>
        </div>
        <span className={dashBadgeAccent}>
          Powered by AI
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className={dashCard}>
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
          <Link
            href={`${ANALYTICS_DETAIL_BASE}/weak-chapters`}
            className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View weak chapters ↗
          </Link>
        </article>

        <article className={dashCard}>
          <h4 className="text-xl font-semibold">Improvement trend across attempts</h4>
          <p className="text-sm text-[var(--muted)]">Chronological score progression</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(["JEE", "NEET"] as const).map((track) => (
              <div key={track} className={`${dashBlock} p-3`}>
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
          <Link
            href={`${ANALYTICS_DETAIL_BASE}/trend`}
            className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View improvement trend ↗
          </Link>
        </article>

        <article className={dashCard}>
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
          <Link
            href={`${ANALYTICS_DETAIL_BASE}/cutoff`}
            className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View cut-off proximity ↗
          </Link>
        </article>

        <article className={dashCard}>
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
          <Link
            href={`${ANALYTICS_DETAIL_BASE}/difficulty`}
            className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View difficulty analysis ↗
          </Link>
        </article>
      </div>
    </div>
  );
}
