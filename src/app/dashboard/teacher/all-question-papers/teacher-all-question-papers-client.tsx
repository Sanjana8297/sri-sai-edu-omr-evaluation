"use client";

import { memo, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { VirtualList } from "@/components/ui/VirtualList";
import { useTeacherQuestionPapersQuery } from "@/hooks/data/use-teacher-question-papers";
import { dataKeys } from "@/hooks/data/keys";
import type { QuestionPaperListItem } from "@/lib/data/fetchers";

const QuestionPaperCard = memo(function QuestionPaperCard({
  paper,
  isOpen,
  isDeleting,
  onToggle,
  onDelete,
}: {
  paper: QuestionPaperListItem;
  isOpen: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isScheduled = paper._count.exams > 0;
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{paper.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs">{paper.category}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                isScheduled ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isScheduled
                ? `Scheduled${paper._count.exams > 1 ? ` (${paper._count.exams} exams)` : ""}`
                : "Not scheduled"}
            </span>
            {paper.isAiGenerated ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                AI {paper.aiPromptVersion ? `(${paper.aiPromptVersion})` : ""}
              </span>
            ) : null}
            <span className="text-xs text-[var(--muted)]">
              Created {new Date(paper.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
            onClick={onToggle}
          >
            {isOpen ? "Hide" : "View"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-60"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {isOpen ? (
        <>
          <p className="mt-2 text-xs uppercase tracking-wide text-[var(--muted)]">Question paper</p>
          {paper.questionPaperUrl ? (
            <a
              className="mt-1 inline-block text-sm text-[var(--accent)] underline"
              href={paper.questionPaperUrl}
              target="_blank"
              rel="noreferrer"
            >
              {paper.questionPaperUrl}
            </a>
          ) : null}
          {paper.questionContent ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted)]">{paper.questionContent}</p>
          ) : paper.questionPaperUrl ? null : (
            <p className="mt-1 text-sm text-[var(--muted)]">No text.</p>
          )}
          <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Answer key</p>
          {paper.answerSheetUrl ? (
            <a
              className="mt-1 inline-block text-sm text-[var(--accent)] underline"
              href={paper.answerSheetUrl}
              target="_blank"
              rel="noreferrer"
            >
              {paper.answerSheetUrl}
            </a>
          ) : null}
          {paper.keyContent ? (
            <p className="mt-1 whitespace-pre-wrap text-sm">{paper.keyContent}</p>
          ) : paper.answerSheetUrl ? null : (
            <p className="mt-1 text-sm text-[var(--muted)]">Not uploaded yet.</p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">Click View to open question paper and answer key.</p>
      )}
    </li>
  );
});

type Props = {
  initialData?: { papers: QuestionPaperListItem[] };
};

export function TeacherAllQuestionPapersClient({ initialData }: Props) {
  useSetDashboardPage({
    title: "All Question Papers",
    subtitle: "Every question paper you have created — scheduled for an exam or still awaiting scheduling.",
  });

  const queryClient = useQueryClient();
  const { data, isLoading } = useTeacherQuestionPapersQuery(false, initialData);
  const papers = data?.papers ?? [];
  const [openPaperIds, setOpenPaperIds] = useState<string[]>([]);
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: dataKeys.teacherQuestionPapers });
    } finally {
      setDeletingPaperId(null);
    }
  }

  if (isLoading && !data) return <CardListSkeleton count={4} />;

  return (
    <>
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
      ) : (
        <VirtualList
          items={papers}
          estimateSize={140}
          threshold={30}
          getKey={(p) => p.id}
          renderItem={(p) => (
            <QuestionPaperCard
              paper={p}
              isOpen={openPaperIds.includes(p.id)}
              isDeleting={deletingPaperId === p.id}
              onToggle={() => toggleView(p.id)}
              onDelete={() => {
                const isScheduled = p._count.exams > 0;
                const scheduleNote = isScheduled ? " Linked exams will also be removed." : "";
                const ok = window.confirm(
                  `Delete "${p.title}"? This action cannot be undone.${scheduleNote}`
                );
                if (ok) void removePaper(p.id);
              }}
            />
          )}
        />
      )}
    </>
  );
}
