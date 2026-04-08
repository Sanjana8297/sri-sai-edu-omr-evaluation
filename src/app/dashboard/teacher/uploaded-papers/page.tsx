"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Paper = { id: string; title: string; category: string; questionContent: string; keyContent: string };

export default function TeacherUploadedPapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/teacher/question-papers");
    const j = await res.json();
    if (j.papers) setPapers(j.papers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell
      badge="Teacher"
      title="Uploaded Papers"
      subtitle="Question papers loaded from Supabase."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Upload answer key" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <ul className="space-y-3">
        {papers.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{p.title}</p>
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs">{p.category}</span>
            </div>
            <p className="mt-2 text-xs uppercase tracking-wide text-[var(--muted)]">Question paper</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{p.questionContent}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Answer key</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{p.keyContent || "Not uploaded yet."}</p>
          </li>
        ))}
      </ul>
    </DashboardShell>
  );
}
