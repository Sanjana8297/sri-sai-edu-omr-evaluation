"use client";

import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { StatsRowSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { useMeQuery } from "@/hooks/data/use-me";
import { useStudentExamsQuery } from "@/hooks/data/use-student-exams";
import type { StudentExamHistoryItem } from "@/lib/data/fetchers";
import { dashGrid } from "@/lib/dashboard-ui";

export function StudentPerformanceSummaryClient({
  initialData,
}: {
  initialData?: { exams: StudentExamHistoryItem[] };
}) {
  const { data: meData } = useMeQuery();
  const { data: examsData, isLoading } = useStudentExamsQuery(initialData);
  const name = meData?.user?.name ?? "";
  const exams = examsData?.exams ?? [];

  const avg = exams.length
    ? Math.round((exams.reduce((s, x) => s + x.percentage, 0) / exams.length) * 10) / 10
    : null;

  useSetDashboardPage({
    title: name ? `Hi, ${name}` : "Performance Summary",
    subtitle: "Summary from your exam records.",
  });

  if (isLoading && !examsData) return <StatsRowSkeleton />;

  return (
    <section className={dashGrid}>
      <Card label="Exams recorded" value={String(exams.length)} />
      <Card label="Average score" value={avg != null ? `${avg}%` : "-"} />
      <Card label="Latest exam" value={exams[0]?.title ?? "-"} />
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{value}</p>
    </div>
  );
}
