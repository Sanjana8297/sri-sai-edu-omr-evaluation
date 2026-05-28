"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QuestionListItem } from "@/lib/questions/types";
import { QuestionBankRow } from "./QuestionBankRow";
import { QuestionBankSkeleton } from "./QuestionBankSkeleton";

const ROW_HEIGHT = 132;

type Props = {
  items: QuestionListItem[];
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: Error | null;
  onRetry: () => void;
};

export function QuestionBankVirtualList({
  items,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error,
  onRetry,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const root = parentRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root, rootMargin: "200px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

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
    <div className="mt-3">
      <div ref={parentRef} className="max-h-[65vh] overflow-auto pr-1">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            if (!item) return null;
            return (
              <div
                key={item.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="pb-2"
              >
                <QuestionBankRow item={item} index={virtualRow.index} />
              </div>
            );
          })}
        </div>
        <div ref={sentinelRef} className="h-4" aria-hidden />
      </div>
      {isFetchingNextPage ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Loading more…</p>
      ) : null}
    </div>
  );
}
