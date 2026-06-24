"use client";

import { memo } from "react";
import Link from "next/link";
import type { StudentAvailableExam, StudentExamHistoryItem } from "@/lib/data/fetchers";

type AvailableExamCardProps = {
  exam: StudentAvailableExam;
  canTake: boolean;
  inProgress: boolean;
};

function StudentAvailableExamCardInner({ exam, canTake, inProgress }: AvailableExamCardProps) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{exam.title}</h2>
          <p className="text-sm text-[var(--muted)]">
            {exam.category} · Duration {exam.durationMinutes} minutes
          </p>
          <p className="text-sm text-[var(--muted)]">
            Open until {new Date(exam.endTime).toLocaleString()}
          </p>
          {inProgress ? (
            <p className="mt-1 text-sm text-blue-700">
              You have an attempt in progress — resume to continue.
            </p>
          ) : null}
        </div>
        {canTake ? (
          <Link
            href={`/dashboard/student/exams/${exam.id}/take`}
            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white"
          >
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
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{exam.title}</h2>
        <span className="text-sm text-[var(--muted)]">
          {new Date(exam.examDate).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {exam.category} · {exam.marksObtained} / {exam.maxMarks} · {exam.percentage}%
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">Session status: {exam.status}</p>
    </article>
  );
}

export const StudentHistoryExamCard = memo(StudentHistoryExamCardInner);
