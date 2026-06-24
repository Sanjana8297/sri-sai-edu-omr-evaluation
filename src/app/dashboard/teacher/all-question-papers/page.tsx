"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";

type Paper = {
  id: string;
  title: string;
  category: string;
  questionContent: string;
  keyContent: string;
  isAiGenerated?: boolean;
  aiPromptVersion?: string | null;
  questionPaperUrl?: string | null;
  answerSheetUrl?: string | null;
  createdAt: string;
  _count: { exams: number };
};

export default function TeacherAllQuestionPapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/teacher/question-papers");
    const j = await res.json();
    if (j.papers) setPapers(j.papers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduledCount = useMemo(
    () => papers.filter((paper) => paper._count.exams > 0).length,
    [papers]
  );
  const unscheduledCount = papers.length - scheduledCount;

  function toggleView(paperId: string) {
    setOpenPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
  }

  async function removePaper(paperId: string) {
    setErr(null);
    setDeletingPaperId(paperId);
    try {
      const res = await fetch("/api/teacher/question-papers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not delete paper");
        return;
      }
      setPapers((prev) => prev.filter((p) => p.id !== paperId));
      setOpenPaperIds((prev) => prev.filter((id) => id !== paperId));
    } finally {
      setDeletingPaperId(null);
    }
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="All Question Papers"
      subtitle="Every question paper you have created — scheduled for an exam or still awaiting scheduling."
      navItems={teacherNavItems}
    >
      {papers.length > 0 ? (
        <p className="mb-4 text-sm text-[var(--muted)]">
          {papers.length} paper{papers.length === 1 ? "" : "s"} total · {scheduledCount} scheduled ·{" "}
          {unscheduledCount} not scheduled yet
        </p>
      ) : null}
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
      {papers.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No question papers yet. Create one in Manual or AI Question Paper Generator.
        </p>
      ) : null}
      <ul className="space-y-3">
        {papers.map((p) => {
          const isScheduled = p._count.exams > 0;
          return (
            <li key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs">{p.category}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isScheduled
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {isScheduled
                        ? `Scheduled${p._count.exams > 1 ? ` (${p._count.exams} exams)` : ""}`
                        : "Not scheduled"}
                    </span>
                    {p.isAiGenerated ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        AI {p.aiPromptVersion ? `(${p.aiPromptVersion})` : ""}
                      </span>
                    ) : null}
                    <span className="text-xs text-[var(--muted)]">
                      Created {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                    onClick={() => toggleView(p.id)}
                  >
                    {openPaperIds.includes(p.id) ? "Hide" : "View"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
                    onClick={() => {
                      const scheduleNote = isScheduled
                        ? " Linked exams will also be removed."
                        : "";
                      const ok = window.confirm(
                        `Delete "${p.title}"? This action cannot be undone.${scheduleNote}`
                      );
                      if (ok) void removePaper(p.id);
                    }}
                    disabled={deletingPaperId === p.id}
                  >
                    {deletingPaperId === p.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
              {openPaperIds.includes(p.id) ? (
                <>
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
                </>
              ) : (
                <p className="mt-2 text-xs text-[var(--muted)]">Click View to open question paper and answer key.</p>
              )}
            </li>
          );
        })}
      </ul>
    </DashboardShell>
  );
}
