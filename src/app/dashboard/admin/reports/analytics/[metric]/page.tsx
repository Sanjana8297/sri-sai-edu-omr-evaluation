"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import {
  CUTOFF_PCT,
  computeCutoffStudents,
  computeCutoffSummary,
  computeDifficultyNotes,
  computeRecentExamAccuracy,
  computeTrendSummary,
  computeWeakSubjectsByTrack,
  severityFor,
  useAdminOverview,
  useSubjectScoresApi,
  type CutoffStudent,
} from "@/app/dashboard/admin/reports/reports-analytics-panels";
import type { DifficultyLabel, ExamDifficultyBreakdown } from "@/lib/exam-difficulty-breakdown";

const DIFFICULTY_COLOR: Record<DifficultyLabel, string> = {
  Easy: "bg-emerald-500",
  Medium: "bg-amber-500",
  Hard: "bg-red-500",
};

const METRIC_TITLES: Record<string, { title: string; subtitle: string }> = {
  "weak-chapters": { title: "Weak chapter identification", subtitle: "Lowest average performance areas" },
  trend: { title: "Improvement trend across attempts", subtitle: "Chronological score progression" },
  cutoff: { title: "NEET / JEE cut-off proximity meter", subtitle: "Latest score vs qualifying benchmark" },
  difficulty: { title: "Question difficulty vs response analysis", subtitle: "Performance by inferred paper difficulty" },
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function CutoffStudentRow({ student, track }: { student: CutoffStudent; track: "JEE" | "NEET" }) {
  const gap = Math.round((student.percentage - CUTOFF_PCT[track]) * 10) / 10;
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{student.studentName}</p>
        <p className="truncate text-xs text-[var(--muted)]">
          {student.examTitle} · {new Date(student.examDate).toLocaleDateString()}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-semibold ${
            student.above ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {student.percentage}%
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          {gap >= 0 ? `+${gap}` : gap} vs cut-off
        </p>
      </div>
    </li>
  );
}

export default function AnalyticsMetricDetailPage() {
  const params = useParams<{ metric: string }>();
  const metric = params.metric;
  const meta = METRIC_TITLES[metric] ?? { title: "Analytics details", subtitle: "Performance analytics" };

  useSetDashboardPage({
    title: meta.title,
    subtitle: meta.subtitle,
    fullWidthContent: true,
  });

  const { data, loading } = useAdminOverview();
  const { subjectScores, subjectScoresLoading } = useSubjectScoresApi(
    "/api/admin/reports/subject-scores"
  );

  const performance = data?.performance ?? [];
  const weakSubjectsByTrack = useMemo(() => computeWeakSubjectsByTrack(subjectScores), [subjectScores]);
  const trendSummary = useMemo(() => computeTrendSummary(performance), [performance]);
  const cutoffSummary = useMemo(() => computeCutoffSummary(performance), [performance]);
  const cutoffStudents = useMemo(() => computeCutoffStudents(performance), [performance]);
  const recentExamAccuracy = useMemo(() => computeRecentExamAccuracy(performance, 4), [performance]);
  const difficultyNotes = useMemo(() => computeDifficultyNotes(subjectScores), [subjectScores]);

  const examDifficultyQuery = useQuery({
    queryKey: ["admin", "reports", "exam-difficulty"],
    queryFn: async (): Promise<{ exams: ExamDifficultyBreakdown[] }> => {
      const res = await fetch("/api/admin/reports/exam-difficulty");
      if (!res.ok) throw new Error("Failed to load exam difficulty");
      return res.json();
    },
    enabled: metric === "difficulty",
    staleTime: 60_000,
  });
  const examDifficulty = examDifficultyQuery.data?.exams ?? [];

  const subjectsPending = subjectScoresLoading || !subjectScores;

  function renderContent() {
    switch (metric) {
      case "weak-chapters":
        return subjectsPending ? (
          <p className="text-sm text-[var(--muted)]">Loading analytics…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {weakSubjectsByTrack.map((bucket) => (
              <Panel key={bucket.track} title={`${bucket.track} — weakest chapters`}>
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
                        <span className="w-20 text-right text-xs text-[var(--muted)]">
                          {w.examCount > 0 ? `${w.examCount} test${w.examCount === 1 ? "" : "s"}` : "No data"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </div>
        );

      case "trend":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {(["JEE", "NEET"] as const).map((track) => {
                const points = trendSummary[track].sparklinePoints;
                return (
                  <Panel key={track} title={`${track} improvement trend`}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-3xl font-semibold">
                          {trendSummary[track].avgImprovement == null
                            ? "—"
                            : `${trendSummary[track].avgImprovement >= 0 ? "+" : ""}${trendSummary[track].avgImprovement}%`}
                        </p>
                        <p className="text-xs text-[var(--muted)]">Avg improvement</p>
                      </div>
                      <div>
                        <p className="text-3xl font-semibold">
                          {trendSummary[track].upwardPct == null ? "—" : `${trendSummary[track].upwardPct}%`}
                        </p>
                        <p className="text-xs text-[var(--muted)]">Upward trend</p>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Based on {trendSummary[track].comparableStudents} student
                      {trendSummary[track].comparableStudents === 1 ? "" : "s"} with 2+ attempts
                    </p>
                    <p className="mt-4 text-xs text-[var(--muted)]">Last 6 attempts (oldest → newest)</p>
                    {points.length === 0 ? (
                      <p className="mt-2 text-sm text-[var(--muted)]">No attempts yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-3">
                        {points.map((p, idx) => (
                          <li key={`${track}-${idx}-${p.examDate}`}>
                            <div className="mb-1 flex items-baseline justify-between gap-3">
                              <span className="text-sm font-medium">{p.examTitle}</span>
                              <span className="shrink-0 text-sm font-semibold">{p.value}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${Math.min(100, p.value)}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {p.studentName} · {new Date(p.examDate).toLocaleDateString()}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                );
              })}
            </div>

            <Panel title="How the trend is calculated">
              <div className="space-y-3 text-sm text-[var(--muted)]">
                <p>
                  Attempts are grouped per student and sorted oldest → newest. For each student we look at
                  their <strong className="text-[var(--foreground)]">last 4 attempts</strong> in the track and
                  measure the change from the first to the most recent of those attempts (only students with at
                  least 2 attempts are counted).
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2">
                    <span className="font-semibold text-[var(--foreground)]">Avg improvement</span>
                    <span>
                      = the average of every counted student&apos;s score change
                      (<code className="rounded bg-[var(--background)] px-1">latest % − earliest %</code>). A
                      positive value means scores are rising on average.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-[var(--foreground)]">Upward trend</span>
                    <span>
                      = the share of counted students whose score change is greater than 0 (i.e. who improved).
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-[var(--foreground)]">Bars</span>
                    <span>
                      = the <strong className="text-[var(--foreground)]">6 most recent attempts</strong> in the
                      track (oldest at the top). Each horizontal bar&apos;s length is that attempt&apos;s score %,
                      labelled with the exam name, student and date.
                    </span>
                  </li>
                </ul>
              </div>
            </Panel>
          </div>
        );

      case "cutoff":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {(["NEET", "JEE"] as const).map((track) => (
                <Panel key={track} title={`${track} cut-off (≥ ${CUTOFF_PCT[track]}%)`}>
                  <p className="text-4xl font-semibold">{cutoffSummary[track].latestAvg ?? "—"}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">Latest average score</p>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Above: {cutoffSummary[track].above}
                    </span>
                    <span className="text-red-600 dark:text-red-400">Below: {cutoffSummary[track].below}</span>
                  </div>
                </Panel>
              ))}
            </div>
            <div className="rounded-lg bg-violet-100 px-4 py-3 text-sm text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              AI predicts {cutoffSummary.aiPrediction} students could cross the JEE cutoff with 3 more full-length tests.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {(["NEET", "JEE"] as const).map((track) => {
                const students = cutoffStudents[track];
                const below = students.filter((s) => !s.above);
                const above = students.filter((s) => s.above);
                return (
                  <Panel key={track} title={`${track} students vs cut-off (≥ ${CUTOFF_PCT[track]}%)`}>
                    {students.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No {track} attempts recorded yet.</p>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                            Below cut-off · {below.length}
                          </p>
                          {below.length === 0 ? (
                            <p className="text-xs text-[var(--muted)]">All students are above the cut-off.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {below.map((s) => (
                                <CutoffStudentRow key={s.studentId} student={s} track={track} />
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Above cut-off · {above.length}
                          </p>
                          {above.length === 0 ? (
                            <p className="text-xs text-[var(--muted)]">No students above the cut-off yet.</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {above.map((s) => (
                                <CutoffStudentRow key={s.studentId} student={s} track={track} />
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </Panel>
                );
              })}
            </div>
          </div>
        );

      case "difficulty":
        return (
          <div className="space-y-4">
            <Panel title="Overall accuracy — recent 4 exams">
              {recentExamAccuracy.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No exam attempts recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {recentExamAccuracy.map((e) => (
                    <li key={`${e.title}-${e.examDate}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{e.title}</span>
                        <span className="shrink-0 text-sm font-semibold">{e.accuracy}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.min(100, e.accuracy)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {new Date(e.examDate).toLocaleDateString()} · {e.attemptCount} attempt
                        {e.attemptCount === 1 ? "" : "s"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Accuracy by question difficulty — recent 4 exams">
              {examDifficultyQuery.isLoading ? (
                <p className="text-sm text-[var(--muted)]">Analysing question-level responses…</p>
              ) : examDifficulty.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No submitted exams with question papers available to analyse yet.
                </p>
              ) : (
                <div className="space-y-5">
                  <p className="text-xs text-[var(--muted)]">
                    Each exam&apos;s questions are sorted into Easy / Medium / Hard tiers from how the class
                    answered them (item analysis), then accuracy is shown for the questions attempted at each
                    level.
                  </p>
                  {examDifficulty.map((exam) => (
                    <div
                      key={exam.examId}
                      className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
                    >
                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{exam.title}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {exam.category} · {new Date(exam.date).toLocaleDateString()} · {exam.sessionCount}{" "}
                            attempt{exam.sessionCount === 1 ? "" : "s"} · {exam.questionCount} questions
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          Overall {exam.overallAccuracy != null ? `${exam.overallAccuracy}%` : "—"}
                        </span>
                      </div>
                      <ul className="space-y-2.5">
                        {exam.levels.map((level) => (
                          <li key={level.label} className="flex items-center gap-3">
                            <span className="w-16 text-sm font-medium">{level.label}</span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--card)]">
                              <div
                                className={`h-full rounded-full ${DIFFICULTY_COLOR[level.label]}`}
                                style={{ width: `${level.accuracy ?? 0}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-sm">
                              {level.accuracy != null ? `${level.accuracy}%` : "—"}
                            </span>
                            <span className="w-24 text-right text-xs text-[var(--muted)]">
                              {level.questionCount} Q · {level.responseCount} resp
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="space-y-2">
              <p className="rounded-full border border-[var(--border)] px-3 py-1 text-sm">
                Most missed: {difficultyNotes.missed}
              </p>
              <p className="rounded-full border border-[var(--border)] px-3 py-1 text-sm">
                Best accuracy: {difficultyNotes.best}
              </p>
            </div>
          </div>
        );

      default:
        return (
          <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
            Unknown metric.
          </p>
        );
    }
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/dashboard/admin/reports?section=analytics"
          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:bg-[var(--background)]"
        >
          ← Back to Performance Analytics
        </Link>
      </div>
      {loading && !data ? (
        <p className="text-sm text-[var(--muted)]">Loading analytics…</p>
      ) : (
        renderContent()
      )}
    </>
  );
}
