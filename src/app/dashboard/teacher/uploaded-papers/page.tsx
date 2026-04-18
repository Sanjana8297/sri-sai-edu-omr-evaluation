"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Paper = {
  id: string;
  title: string;
  category: string;
  questionContent: string;
  keyContent: string;
  questionPaperUrl?: string | null;
  answerSheetUrl?: string | null;
};

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
      subtitle="Question papers and answer keys stored in your database (text and file URLs)."
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
            {p.questionPaperUrl ? (
              <a
                className="mt-1 inline-block text-sm text-[var(--accent)] underline"
                href={p.questionPaperUrl}
                target="_blank"
                rel="noreferrer"
              >
                {p.questionPaperUrl}
              </a>
            ) : null}
            {p.questionContent ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{p.questionContent}</p>
            ) : p.questionPaperUrl ? null : (
              <p className="mt-1 text-sm text-[var(--muted)]">No text.</p>
            )}
            <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Answer key</p>
            {p.answerSheetUrl ? (
              <a
                className="mt-1 inline-block text-sm text-[var(--accent)] underline"
                href={p.answerSheetUrl}
                target="_blank"
                rel="noreferrer"
              >
                {p.answerSheetUrl}
              </a>
            ) : null}
            {p.keyContent ? (
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.keyContent}</p>
            ) : p.answerSheetUrl ? null : (
              <p className="mt-1 text-sm text-[var(--muted)]">Not uploaded yet.</p>
            )}
          </li>
        ))}
      </ul>
    </DashboardShell>
  );
}
