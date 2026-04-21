"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

type Exam = { id: string; title: string; percentage: number };

export default function StudentPerformanceSummaryPage() {
  const [name, setName] = useState("");
  const [exams, setExams] = useState<Exam[]>([]);

  const load = useCallback(async () => {
    const [u, e] = await Promise.all([fetch("/api/me").then((r) => r.json()), fetch("/api/student/exams").then((r) => r.json())]);
    if (u.user?.name) setName(u.user.name);
    if (e.exams) setExams(e.exams);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const avg = exams.length ? Math.round((exams.reduce((s, x) => s + x.percentage, 0) / exams.length) * 10) / 10 : null;

  return (
    <DashboardShell
      badge="Student"
      title={name ? `Hi, ${name}` : "Performance Summary"}
      subtitle="Summary from your exam records."
      navItems={studentNavItems}
    >
      <section className="grid gap-4 sm:grid-cols-3">
        <Card label="Exams recorded" value={String(exams.length)} />
        <Card label="Average score" value={avg != null ? `${avg}%` : "-"} />
        <Card label="Latest exam" value={exams[0]?.title ?? "-"} />
      </section>
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
