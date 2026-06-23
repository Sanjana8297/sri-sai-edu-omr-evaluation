"use client";

import type { QuestionListItem } from "@/lib/questions/types";
import { QuestionBankRow } from "./QuestionBankRow";
import { QuestionBankSkeleton } from "./QuestionBankSkeleton";

type Props = {
  items: QuestionListItem[];
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRetry: () => void;
};

export function QuestionBankPageList({
  items,
  page,
  pageSize,
  isLoading,
  isFetching,
  error,
  onRetry,
}: Props) {
  const rowOffset = (page - 1) * pageSize;

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{error.message}</p>
        <button type="button" className="mt-2 font-medium underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    return <QuestionBankSkeleton />;
  }

  if (!isLoading && items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No questions found for this subject with current filters.</p>;
  }

  return (
    <div className={`mt-3 space-y-2 ${isFetching ? "opacity-70" : ""}`}>
      {items.map((item, index) => (
        <QuestionBankRow key={item.id} item={item} index={rowOffset + index} />
      ))}
    </div>
  );
}
