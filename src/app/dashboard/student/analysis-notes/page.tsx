"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Exam = { id: string; title: string; analysis: string; examDate: string };

export default function StudentAnalysisNotesPage() {
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
      title="Analysis Notes"
      subtitle="Detailed notes from teacher feedback."
      navItems={[
        { href: "/dashboard/student/performance-summary", label: "Performance summary" },
        { href: "/dashboard/student/exam-history", label: "Exam history" },
        { href: "/dashboard/student/analysis-notes", label: "Analysis notes" },
      ]}
    >
      <div className="space-y-4">
        {exams.map((exam) => (
          <article key={exam.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-semibold">{exam.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{new Date(exam.examDate).toLocaleDateString()}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{exam.analysis}</p>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
