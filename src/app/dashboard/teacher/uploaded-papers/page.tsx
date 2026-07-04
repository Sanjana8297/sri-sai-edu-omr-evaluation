"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  dashBadgeAccent,
  dashBadgeEmerald,
  dashBtnDanger,
  dashBtnSecondary,
  dashCard,
  dashCardTitle,
  dashLabel,
} from "@/lib/dashboard-ui";
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
        <EmptyState
          icon="🗂️"
          title="No archived papers yet"
          description="Schedule an exam under Exam Scheduling to see its question paper here."
          action={{ label: "Go to Exam Scheduling", href: "/dashboard/teacher/exam-scheduling" }}
        />
      ) : null}
      <ul className="space-y-4">
        {papers.map((p) => (
          <li key={p.id} className={dashCard}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className={dashCardTitle}>{p.title}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={dashBadgeAccent}>{p.category}</span>
                  {p.isAiGenerated ? (
                    <span className={dashBadgeEmerald}>
                      AI {p.aiPromptVersion ? `(${p.aiPromptVersion})` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className={dashBtnSecondary} onClick={() => toggleView(p.id)}>
                  {openPaperIds.includes(p.id) ? "Hide" : "View"}
                </button>
                <button
                  type="button"
                  className={dashBtnDanger}
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
              <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
                <div>
                  <p className={dashLabel}>Question paper</p>
                  {p.questionPaperUrl ? (
                    <a
                      className="mt-1.5 inline-block text-sm text-[var(--accent)] underline"
                      href={p.questionPaperUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.questionPaperUrl}
                    </a>
                  ) : null}
                  {p.questionContent ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
                      {p.questionContent}
                    </p>
                  ) : p.questionPaperUrl ? null : (
                    <p className="mt-1.5 text-sm text-[var(--muted)]">No text.</p>
                  )}
                </div>
                <div>
                  <p className={dashLabel}>Answer key</p>
                  {p.answerSheetUrl ? (
                    <a
                      className="mt-1.5 inline-block text-sm text-[var(--accent)] underline"
                      href={p.answerSheetUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.answerSheetUrl}
                    </a>
                  ) : null}
                  {p.keyContent ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{p.keyContent}</p>
                  ) : p.answerSheetUrl ? null : (
                    <p className="mt-1.5 text-sm text-[var(--muted)]">Not uploaded yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">Click View to open question paper and answer key.</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
