"use client";

import { memo, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { EmptyState } from "@/components/ui/EmptyState";
import { VirtualList } from "@/components/ui/VirtualList";
import {
  dashBadgeAccent,
  dashBadgeAmber,
  dashBadgeBlue,
  dashBadgeEmerald,
  dashBtnDanger,
  dashBtnSecondary,
  dashCard,
  dashCardMeta,
  dashCardTitle,
  dashLabel,
  dashPageStats,
} from "@/lib/dashboard-ui";
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
    <li className={dashCard}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={dashCardTitle}>{paper.title}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={dashBadgeAccent}>{paper.category}</span>
            <span className={isScheduled ? dashBadgeBlue : dashBadgeAmber}>
              {isScheduled
                ? `Scheduled${paper._count.exams > 1 ? ` (${paper._count.exams} exams)` : ""}`
                : "Not scheduled"}
            </span>
            {paper.isAiGenerated ? (
              <span className={dashBadgeEmerald}>
                AI {paper.aiPromptVersion ? `(${paper.aiPromptVersion})` : ""}
              </span>
            ) : null}
            <span className="text-xs text-[var(--muted)]">
              Created {new Date(paper.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={dashBtnSecondary} onClick={onToggle}>
            {isOpen ? "Hide" : "View"}
          </button>
          <button
            type="button"
            className={dashBtnDanger}
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {isOpen ? (
        <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
          <div>
            <p className={dashLabel}>Question paper</p>
            {paper.questionPaperUrl ? (
              <a
                className="mt-1.5 inline-block text-sm text-[var(--accent)] underline"
                href={paper.questionPaperUrl}
                target="_blank"
                rel="noreferrer"
              >
                {paper.questionPaperUrl}
              </a>
            ) : null}
            {paper.questionContent ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
                {paper.questionContent}
              </p>
            ) : paper.questionPaperUrl ? null : (
              <p className={`${dashCardMeta} mt-1.5`}>No text.</p>
            )}
          </div>
          <div>
            <p className={dashLabel}>Answer key</p>
            {paper.answerSheetUrl ? (
              <a
                className="mt-1.5 inline-block text-sm text-[var(--accent)] underline"
                href={paper.answerSheetUrl}
                target="_blank"
                rel="noreferrer"
              >
                {paper.answerSheetUrl}
              </a>
            ) : null}
            {paper.keyContent ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{paper.keyContent}</p>
            ) : paper.answerSheetUrl ? null : (
              <p className={`${dashCardMeta} mt-1.5`}>Not uploaded yet.</p>
            )}
          </div>
        </div>
      ) : (
        <p className={`${dashCardMeta} mt-3`}>Click View to open question paper and answer key.</p>
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
        <p className={dashPageStats}>
          {papers.length} paper{papers.length === 1 ? "" : "s"} total · {scheduledCount} scheduled ·{" "}
          {unscheduledCount} not scheduled yet
        </p>
      ) : null}
      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}
      {papers.length === 0 ? (
        <EmptyState
          icon="📄"
          title="No question papers yet"
          description="Create one in Manual or AI Question Paper Generator."
          action={{ label: "Open AI Generator", href: "/dashboard/teacher/fetch-new-question-using-ai" }}
        />
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
