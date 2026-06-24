"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { useTeacherQuestionPapersQuery } from "@/hooks/data/use-teacher-question-papers";
import { dataKeys } from "@/hooks/data/keys";

export default function TeacherUploadedPapersPage() {
  useSetDashboardPage({
    title: "Archived Question Papers",
    subtitle: "Question papers and answer keys for exams you have already scheduled.",
  });

  const queryClient = useQueryClient();
  const { data, isLoading } = useTeacherQuestionPapersQuery(true);
  const papers = data?.papers ?? [];
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: dataKeys.teacherQuestionPapersArchived });
      setOpenPaperIds((prev) => prev.filter((id) => id !== paperId));
    } finally {
      setDeletingPaperId(null);
    }
  }

  if (isLoading && !data) return <CardListSkeleton count={3} />;

  return (
    <>
      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
      {papers.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No papers yet. Schedule an exam under Exam Scheduling to see its question paper here.
        </p>
      ) : null}
      <ul className="space-y-3">
        {papers.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{p.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs">{p.category}</span>
                  {p.isAiGenerated ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      AI {p.aiPromptVersion ? `(${p.aiPromptVersion})` : ""}
                    </span>
                  ) : null}
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
                    const ok = window.confirm(
                      `Delete "${p.title}"? This action cannot be undone.`
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
        ))}
      </ul>
    </>
  );
}
