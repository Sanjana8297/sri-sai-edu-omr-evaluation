"use client";

import { memo } from "react";
import Link from "next/link";
import {
  dashBadgeAccent,
  dashBtnPrimary,
  dashCard,
  dashCardMeta,
  dashCardTitle,
} from "@/lib/dashboard-ui";
import type { StudentAvailableExam, StudentExamHistoryItem } from "@/lib/data/fetchers";

type AvailableExamCardProps = {
  exam: StudentAvailableExam;
  canTake: boolean;
  inProgress: boolean;
};

function StudentAvailableExamCardInner({ exam, canTake, inProgress }: AvailableExamCardProps) {
  return (
    <article className={dashCard}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className={dashCardTitle}>{exam.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={dashBadgeAccent}>{exam.category}</span>
            <span className={dashCardMeta}>Duration {exam.durationMinutes} minutes</span>
          </div>
          <p className={dashCardMeta}>
            Open until {new Date(exam.endTime).toLocaleString()}
          </p>
          {inProgress ? (
            <p className="mt-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              You have an attempt in progress — resume to continue.
            </p>
          ) : null}
        </div>
        {canTake ? (
          <Link href={`/dashboard/student/exams/${exam.id}/take`} className={dashBtnPrimary}>
            {inProgress ? "Resume" : "Start exam"}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export const StudentAvailableExamCard = memo(StudentAvailableExamCardInner);

function StudentHistoryExamCardInner({ exam }: { exam: StudentExamHistoryItem }) {
  return (
    <article className={dashCard}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className={dashCardTitle}>{exam.title}</h2>
        <span className="text-sm tabular-nums text-[var(--muted)]">
          {new Date(exam.examDate).toLocaleDateString()}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={dashBadgeAccent}>{exam.category}</span>
        <span className={dashCardMeta}>
          {exam.marksObtained} / {exam.maxMarks} · {exam.percentage}%
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">Session status: {exam.status}</p>
    </article>
  );
}

export const StudentHistoryExamCard = memo(StudentHistoryExamCardInner);
