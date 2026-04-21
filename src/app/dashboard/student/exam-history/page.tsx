"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

type Exam = {
  id: string;
  title: string;
  category: string;
  examDate: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
};

export default function StudentExamHistoryPage() {
  const [exams, setExams] = useState<Exam[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/student/exams");
    const j = await res.json();
    if (j.exams) setExams(j.exams);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      badge="Student"
      title="Exam History"
      subtitle="All exam records from the database."
      navItems={studentNavItems}
    >
      <div className="space-y-4">
        {exams.map((exam) => (
          <article key={exam.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{exam.title}</h2>
              <span className="text-sm text-[var(--muted)]">{new Date(exam.examDate).toLocaleDateString()}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {exam.category} · {exam.marksObtained} / {exam.maxMarks} · {exam.percentage}%
            </p>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
