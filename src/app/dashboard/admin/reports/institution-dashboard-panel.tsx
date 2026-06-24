"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

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
  lowPerformerList: Array<{
    id: string;
    name: string;
    track: string;
    avg: number;
    teacher: string;
  }>;
  monthlyAttempts: Array<{ month: string; label: string; count: number }>;
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

function MetricCard({
  icon,
  iconBg,
  title,
  value,
  detail,
  detailTone,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  value: string | number;
  detail: string;
  detailTone?: "positive" | "negative" | "neutral";
}) {
  const detailClass =
    detailTone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : detailTone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-[var(--muted)]";

  return (
    <article className="dash-static rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <p className="text-xs font-medium text-[var(--muted)]">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className={`mt-2 text-xs ${detailClass}`}>{detail}</p>
    </article>
  );
}

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  children,
  footer,
  footerClass,
}: {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: { label: string; href: string };
  footerClass?: string;
}) {
  return (
    <article className="dash-static flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
      <div className="flex-1">{children}</div>
      {footer ? (
        <Link
          href={footer.href}
          className={`mt-4 inline-flex text-sm font-medium hover:underline ${footerClass ?? "text-[var(--accent)]"}`}
        >
          {footer.label} ↗
        </Link>
      ) : null}
    </article>
  );
}

function ProgressRow({
  label,
  value,
  max,
  barClass,
  displayValue,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  displayValue?: string;
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--background)] sm:w-32">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-medium">{displayValue ?? value}</span>
    </li>
  );
}

function UsersIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

export function InstitutionDashboardPanel() {
  const [data, setData] = useState<InstitutionDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/institution-dashboard");
      const json = await res.json();
      if (json.summary) setData(json as InstitutionDashboardData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading institution dashboard…</p>;
  }

  if (!data) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
        Could not load dashboard data. Please refresh the page.
      </p>
    );
  }

  const { summary } = data;
  const growthLabel = `${summary.studentGrowthPositive ? "↑" : "↓"} ${Math.abs(summary.studentGrowthPct)}% vs prior month`;
  const examDeltaLabel = `${summary.examsMonthDeltaPositive ? "↑" : "↓"} ${Math.abs(summary.examsMonthDelta)} more than last month`;
  const topJeeBatches = data.allBatches.filter((b) => b.track === "JEE").slice(0, 2);
  const topNeetBatches = data.allBatches.filter((b) => b.track === "NEET").slice(0, 2);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Institution dashboard</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Centre-level overview · {data.academicYear}
          </p>
        </div>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          Updated today
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<UsersIcon />}
          iconBg="bg-violet-600"
          title="Total students"
          value={summary.totalStudents.toLocaleString()}
          detail={growthLabel}
          detailTone={summary.studentGrowthPositive ? "positive" : "negative"}
        />
        <MetricCard
          icon={<FolderIcon />}
          iconBg="bg-teal-600"
          title="Active batches"
          value={summary.activeBatches}
          detail={`JEE: ${summary.jeeBatches} · NEET: ${summary.neetBatches}`}
        />
        <MetricCard
          icon={<AlertIcon />}
          iconBg="bg-amber-500"
          title="Low performers"
          value={summary.lowPerformers}
          detail={
            summary.lowPerformersNewThisWeek > 0
              ? `${summary.lowPerformersNewThisWeek} active this week`
              : `Below ${data.lowPerformerThreshold}% average`
          }
          detailTone={summary.lowPerformersNewThisWeek > 0 ? "negative" : "neutral"}
        />
        <MetricCard
          icon={<DocIcon />}
          iconBg="bg-blue-600"
          title="Exams this month"
          value={summary.examsThisMonth}
          detail={examDeltaLabel}
          detailTone={summary.examsMonthDeltaPositive ? "positive" : "negative"}
        />
      </div>

      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Performance &amp; analytics
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            icon={<GridIcon />}
            iconBg="bg-violet-600"
            title="Batch-wise score heatmap"
            subtitle="Average % by mentor batch and track"
          >
            <p className="mb-3 text-xs font-medium text-[var(--muted)]">Top batches this month</p>
            {data.allBatches.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No batch scores recorded yet.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    JEE
                  </p>
                  {topJeeBatches.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">No JEE attempts yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {topJeeBatches.map((b) => (
                        <ProgressRow
                          key={b.label}
                          label={b.label}
                          value={b.avg}
                          max={100}
                          barClass="bg-violet-500"
                          displayValue={`${b.avg}%`}
                        />
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    NEET
                  </p>
                  {topNeetBatches.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">No NEET attempts yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {topNeetBatches.map((b) => (
                        <ProgressRow
                          key={b.label}
                          label={b.label}
                          value={b.avg}
                          max={100}
                          barClass="bg-violet-500"
                          displayValue={`${b.avg}%`}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={<AlertIcon />}
            iconBg="bg-rose-500"
            title="Low-performer alert & follow-up"
            subtitle={`Students below ${data.lowPerformerThreshold}% score threshold`}
            footer={{ label: "View students & follow up", href: "/dashboard/admin/reports/follow-up" }}
            footerClass="text-rose-600 dark:text-rose-400"
          >
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
              <span aria-hidden>⚠</span>
              {summary.lowPerformers} student{summary.lowPerformers === 1 ? "" : "s"} need attention
            </div>
            {data.lowPerformerSubjects.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No subject breakdown available yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.lowPerformerSubjects.map((s) => (
                  <span
                    key={s.subject}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs font-medium"
                  >
                    {s.subject} – {s.count}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Operations &amp; staffing
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            icon={<ChartIcon />}
            iconBg="bg-teal-600"
            title="Exam frequency & coverage tracker"
            subtitle="Attempts logged per month"
          >
            <p className="mb-3 text-xs font-medium text-[var(--muted)]">Monthly attempts — last 4 months</p>
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
          </SectionCard>

          <SectionCard
            icon={<NetworkIcon />}
            iconBg="bg-amber-500"
            title="Teacher–student ratio insights"
            subtitle="Centre staffing vs enrolment"
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-xs text-[var(--muted)]">Overall ratio</p>
                <p className="mt-1 text-lg font-bold">{data.staffing.overallRatio}</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
                <p className="text-xs text-[var(--muted)]">Understaffed batches</p>
                <p className="mt-1 text-lg font-bold">{data.staffing.understaffedBatches}</p>
              </div>
            </div>
            <div className="max-h-44 overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-[var(--card)] text-[var(--muted)]">
                  <tr>
                    <th className="px-2 py-2">Teacher</th>
                    <th className="px-2 py-2">Track</th>
                    <th className="px-2 py-2">Students</th>
                    <th className="px-2 py-2">Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffing.teachers.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="px-2 py-2">{t.name}</td>
                      <td className="px-2 py-2">{t.track}</td>
                      <td className="px-2 py-2">{t.studentCount}</td>
                      <td className="px-2 py-2">
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
          </SectionCard>
        </div>
      </section>

    </div>
  );
}
