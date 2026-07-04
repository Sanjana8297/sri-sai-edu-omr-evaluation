"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { StatsRowSkeleton, TableSkeleton } from "@/components/skeletons/DashboardSkeletons";
import {
  useAdminStudentsQuery,
  useInstitutionDashboardQuery,
} from "@/hooks/data/use-admin-queries";
import {
  dashBadgeMuted,
  dashBlock,
  dashBtnSecondary,
  dashBtnSm,
  dashCard,
  dashInput,
  dashPanel,
  dashSelect,
  dashTable,
  dashTableHead,
  dashTableRow,
  dashTableWrap,
} from "@/lib/dashboard-ui";

type InstitutionDashboardData = {
  academicYear: string;
  updatedAt: string;
  summary: {
    totalStudents: number;
    studentGrowthPct: number;
    studentGrowthPositive: boolean;
    activeBatches: number;
    jeeBatches: number;
    neetBatches: number;
    lowPerformers: number;
    lowPerformersNewThisWeek: number;
    examsThisMonth: number;
    examsScheduledThisMonth: number;
    examsMonthDelta: number;
    examsMonthDeltaPositive: boolean;
  };
  topBatches: Array<{ label: string; track: string; avg: number; attemptCount: number }>;
  allBatches: Array<{ label: string; track: string; avg: number; attemptCount: number }>;
  lowPerformerThreshold: number;
  lowPerformerSubjects: Array<{ subject: string; count: number }>;
  lowPerformerList: Array<{ id: string; name: string; track: string; avg: number; teacher: string }>;
  monthlyAttempts: Array<{ month: string; label: string; count: number }>;
  monthlyExamBreakdown: Array<{
    month: string;
    label: string;
    exams: Array<{ title: string; category: string; studentCount: number }>;
  }>;
  maxMonthlyAttempts: number;
  staffing: {
    overallRatio: string;
    overallWithinLimit: boolean;
    understaffedBatches: number;
    staffingLimit: number;
    teachers: Array<{
      id: string;
      name: string;
      track: string;
      studentCount: number;
      ratio: string;
      isUnderstaffed: boolean;
    }>;
  };
};

const METRIC_TITLES: Record<string, { title: string; subtitle: string }> = {
  "total-students": { title: "Total students", subtitle: "Enrolled students by track and year" },
  "active-batches": { title: "Active batches", subtitle: "All batches by track with average scores" },
  "low-performers": { title: "Low performers", subtitle: "Students below the score threshold" },
  "exams-this-month": { title: "Exams this month", subtitle: "Scheduled exams and monthly attempts" },
  "batch-heatmap": { title: "Batch-wise score heatmap", subtitle: "Average % by mentor batch and track" },
  "exam-frequency": { title: "Exam frequency & coverage", subtitle: "Attempts logged per month" },
  staffing: { title: "Teacher–student ratio insights", subtitle: "Centre staffing vs enrolment" },
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={dashPanel}>
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: "positive" | "negative" }) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "";
  return (
    <div className={dashBlock}>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${toneClass}`}>{value}</p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  max,
  displayValue,
  barClass = "bg-[var(--accent)]",
}: {
  label: string;
  value: number;
  max: number;
  displayValue?: string;
  barClass?: string;
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <div className="h-2 w-32 shrink-0 overflow-hidden rounded-full bg-[var(--background)] sm:w-48">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right font-medium">{displayValue ?? value}</span>
    </li>
  );
}

function BatchList({ batches }: { batches: InstitutionDashboardData["allBatches"] }) {
  const jee = batches.filter((b) => b.track === "JEE");
  const neet = batches.filter((b) => b.track === "NEET");
  return (
    <div className="space-y-5">
      {(["JEE", "NEET"] as const).map((track) => {
        const list = track === "JEE" ? jee : neet;
        return (
          <div key={track}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{track}</p>
            {list.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No {track} attempts yet.</p>
            ) : (
              <ul className="space-y-2">
                {list.map((b) => (
                  <ProgressRow
                    key={b.label}
                    label={`${b.label} · ${b.attemptCount} attempt${b.attemptCount === 1 ? "" : "s"}`}
                    value={b.avg}
                    max={100}
                    displayValue={`${b.avg}%`}
                    barClass="bg-violet-500"
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

type TrackFilter = "ALL" | "JEE" | "NEET";
type YearFilter = "ALL" | "1" | "2";

const STUDENTS_PER_PAGE = 10;

function TotalStudentsPanel() {
  const { data, isLoading, isError } = useAdminStudentsQuery();
  const students = useMemo(() => data?.students ?? [], [data]);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("ALL");
  const [yearFilter, setYearFilter] = useState<YearFilter>("ALL");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const track = s.category === "NEET" ? "NEET" : "JEE";
      if (trackFilter !== "ALL" && track !== trackFilter) return false;
      if (yearFilter !== "ALL" && String(s.year ?? "") !== yearFilter) return false;
      return true;
    });
  }, [students, trackFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / STUDENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * STUDENTS_PER_PAGE;
  const pageItems = filtered.slice(pageStart, pageStart + STUDENTS_PER_PAGE);

  function changeTrack(value: TrackFilter) {
    setTrackFilter(value);
    setPage(1);
  }
  function changeYear(value: YearFilter) {
    setYearFilter(value);
    setPage(1);
  }

  if (isLoading) return <TableSkeleton />;
  if (isError) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
        Could not load students. Please refresh the page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total students" value={students.length.toLocaleString()} />
        <StatTile label="JEE" value={students.filter((s) => s.category !== "NEET").length} />
        <StatTile label="NEET" value={students.filter((s) => s.category === "NEET").length} />
      </div>

      <Panel title="Enrolled students">
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Track</span>
            <select
              value={trackFilter}
              onChange={(e) => changeTrack(e.target.value as TrackFilter)}
              className={dashSelect}
            >
              <option value="ALL">All tracks</option>
              <option value="JEE">JEE</option>
              <option value="NEET">NEET</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Year</span>
            <select
              value={yearFilter}
              onChange={(e) => changeYear(e.target.value as YearFilter)}
              className={dashSelect}
            >
              <option value="ALL">All years</option>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
            </select>
          </label>
          <span className="ml-auto self-center text-xs text-[var(--muted)]">
            Showing {filtered.length} of {students.length}
          </span>
        </div>

        <div className={dashTableWrap}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--card)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Track</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Mentor</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[var(--muted)]">
                    No students match the selected filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">{s.category === "NEET" ? "NEET" : "JEE"}</td>
                    <td className="px-3 py-2">{s.year != null ? `Year ${s.year}` : "—"}</td>
                    <td className="px-3 py-2">{s.teacher?.name ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted)]">
              Showing {pageStart + 1}–{Math.min(pageStart + STUDENTS_PER_PAGE, filtered.length)} of{" "}
              {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className={dashBtnSm}
              >
                ← Previous
              </button>
              <span className="text-sm text-[var(--muted)]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className={dashBtnSm}
              >
                Next →
              </button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function ExamFrequencyPanel({ data }: { data: InstitutionDashboardData }) {
  const breakdownByMonth = useMemo(() => {
    const map = new Map<string, InstitutionDashboardData["monthlyExamBreakdown"][number]>();
    for (const row of data.monthlyExamBreakdown ?? []) map.set(row.month, row);
    return map;
  }, [data.monthlyExamBreakdown]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const withExams = (data.monthlyExamBreakdown ?? []).filter((m) => m.exams.length > 0);
    const latest = withExams[withExams.length - 1];
    return new Set(latest ? [latest.month] : []);
  });

  function toggle(month: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  if (data.monthlyAttempts.every((m) => m.count === 0)) {
    return (
      <Panel title="Attempts logged per month">
        <p className="text-sm text-[var(--muted)]">No attempts logged yet.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Attempts logged per month">
      <p className="mb-3 text-xs text-[var(--muted)]">Select a month to see the exams attempted that month.</p>
      <ul className="space-y-2">
        {data.monthlyAttempts.map((m) => {
          const isOpen = expanded.has(m.month);
          const exams = breakdownByMonth.get(m.month)?.exams ?? [];
          const width =
            data.maxMonthlyAttempts > 0 ? Math.min(100, (m.count / data.maxMonthlyAttempts) * 100) : 0;
          return (
            <li
              key={m.month}
              className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              <button
                type="button"
                onClick={() => toggle(m.month)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--card)]"
              >
                <span
                  className={`shrink-0 text-[var(--muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden
                >
                  ▶
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-[var(--card)] sm:block sm:w-48">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${width}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs text-[var(--muted)]">
                  {m.count} attempt{m.count === 1 ? "" : "s"}
                </span>
              </button>

              {isOpen ? (
                <div className="border-t border-[var(--border)] px-3 py-3">
                  {exams.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No exams attempted in {m.label}.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {exams.map((exam) => (
                        <li
                          key={`${exam.category}-${exam.title}`}
                          className="flex items-center justify-between gap-3 rounded-md bg-[var(--card)] px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                              {exam.category}
                            </span>
                            <span className="truncate text-sm font-medium">{exam.title}</span>
                          </div>
                          <span className="shrink-0 text-xs text-[var(--muted)]">
                            {exam.studentCount} student{exam.studentCount === 1 ? "" : "s"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MetricContent({ metric, data }: { metric: string; data: InstitutionDashboardData }) {
  const { summary } = data;

  switch (metric) {
    case "active-batches":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Active batches" value={summary.activeBatches} />
            <StatTile label="JEE batches" value={summary.jeeBatches} />
            <StatTile label="NEET batches" value={summary.neetBatches} />
          </div>
          <Panel title="All batches by track">
            <BatchList batches={data.allBatches} />
          </Panel>
        </div>
      );

    case "low-performers":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Low performers" value={summary.lowPerformers} tone="negative" />
            <StatTile label="New this week" value={summary.lowPerformersNewThisWeek} />
            <StatTile label="Threshold" value={`${data.lowPerformerThreshold}%`} />
          </div>
          {data.lowPerformerSubjects.length > 0 ? (
            <Panel title="Weak subjects across low performers">
              <div className="flex flex-wrap gap-2">
                {data.lowPerformerSubjects.map((s) => (
                  <span
                    key={s.subject}
                    className={dashBtnSm}
                  >
                    {s.subject} – {s.count}
                  </span>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel title="Students needing attention">
            {data.lowPerformerList.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No students below threshold.</p>
            ) : (
              <ul className="space-y-2">
                {data.lowPerformerList.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {s.track} · {s.teacher} · {s.avg}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      );

    case "exams-this-month":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Exams this month" value={summary.examsThisMonth} />
            <StatTile label="Scheduled this month" value={summary.examsScheduledThisMonth} />
            <StatTile
              label="vs last month"
              value={`${summary.examsMonthDeltaPositive ? "↑" : "↓"} ${Math.abs(summary.examsMonthDelta)}`}
              tone={summary.examsMonthDeltaPositive ? "positive" : "negative"}
            />
          </div>
          <Panel title="Monthly attempts">
            {data.monthlyAttempts.every((m) => m.count === 0) ? (
              <p className="text-sm text-[var(--muted)]">No attempts logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.monthlyAttempts.map((m) => (
                  <ProgressRow
                    key={m.month}
                    label={m.label}
                    value={m.count}
                    max={data.maxMonthlyAttempts}
                    barClass="bg-teal-500"
                  />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      );

    case "batch-heatmap":
      return (
        <Panel title="Average % by batch and track">
          {data.allBatches.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No batch scores recorded yet.</p>
          ) : (
            <BatchList batches={data.allBatches} />
          )}
        </Panel>
      );

    case "exam-frequency":
      return <ExamFrequencyPanel data={data} />;

    case "staffing":
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Overall ratio" value={data.staffing.overallRatio} />
            <StatTile label="Understaffed batches" value={data.staffing.understaffedBatches} />
            <StatTile label="Staffing limit" value={data.staffing.staffingLimit} />
          </div>
          <Panel title="Teacher staffing">
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">Teacher</th>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">Students</th>
                    <th className="px-3 py-2">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffing.teachers.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">{t.name}</td>
                      <td className="px-3 py-2">{t.track}</td>
                      <td className="px-3 py-2">{t.studentCount}</td>
                      <td className="px-3 py-2">
                        {t.ratio}
                        {t.isUnderstaffed ? (
                          <span className="ml-1 text-[10px] text-red-600 dark:text-red-400">High</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
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

export default function InstitutionMetricDetailPage() {
  const params = useParams<{ metric: string }>();
  const router = useRouter();
  const metric = params.metric;
  const meta = METRIC_TITLES[metric] ?? { title: "Metric details", subtitle: "Institution dashboard" };

  useSetDashboardPage({
    title: meta.title,
    subtitle: meta.subtitle,
    fullWidthContent: true,
  });

  const { data: rawData, isLoading: loading, isError } = useInstitutionDashboardQuery();
  const data = rawData?.summary ? (rawData as InstitutionDashboardData) : null;

  return (
    <>
      <div className="mb-4">
        <Link
          href="/dashboard/admin/reports?section=institution"
          onClick={(e) => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              e.preventDefault();
              router.back();
            }
          }}
          className={`${dashBtnSecondary} inline-flex items-center`}
        >
          ← Back to Institution Dashboard
        </Link>
      </div>
      {metric === "total-students" ? (
        <TotalStudentsPanel />
      ) : loading ? (
        <StatsRowSkeleton />
      ) : isError || !data ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
          Could not load dashboard data. Please refresh the page.
        </p>
      ) : (
        <MetricContent metric={metric} data={data} />
      )}
    </>
  );
}
