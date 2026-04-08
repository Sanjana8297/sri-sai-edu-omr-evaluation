"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Overview = {
  counts: { students: number; teachers: number };
  avgPercentageAcrossAttempts: number | null;
  performance: {
    id: string;
    studentName: string;
    category: string;
    title: string;
    examDate: string;
    marksObtained: number;
    maxMarks: number;
    percentage: number;
  }[];
};

export default function AdminPerformancePage() {
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const json = await res.json();
    if (json.counts) setData(json);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      badge="Administrator"
      title="Performance Overview"
      subtitle="All exam records are loaded from Supabase."
      navItems={[
        { href: "/dashboard/admin/teachers", label: "Teachers" },
        { href: "/dashboard/admin/students", label: "Students & mentors" },
        { href: "/dashboard/admin/performance", label: "Performance overview" },
      ]}
    >
      {data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Card label="Students" value={String(data.counts.students)} />
            <Card label="Teachers" value={String(data.counts.teachers)} />
            <Card label="Average score" value={data.avgPercentageAcrossAttempts != null ? `${data.avgPercentageAcrossAttempts}%` : "-"} />
          </section>
          <section className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Exam</th>
                  <th className="px-4 py-3 font-medium">Track</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {data.performance.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3">{p.studentName}</td>
                    <td className="px-4 py-3">{p.title}</td>
                    <td className="px-4 py-3">{p.category}</td>
                    <td className="px-4 py-3">{new Date(p.examDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{p.marksObtained} / {p.maxMarks}</td>
                    <td className="px-4 py-3">{p.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="text-[var(--muted)]">Loading…</p>
      )}
    </DashboardShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
