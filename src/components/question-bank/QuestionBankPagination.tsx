"use client";

type Props = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

function buildPageTrack(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, current]);
  if (current > 1) pages.add(current - 1);
  if (current < totalPages) pages.add(current + 1);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const track: (number | "ellipsis")[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i]!;
    if (i > 0 && value - sorted[i - 1]! > 1) {
      track.push("ellipsis");
    }
    track.push(value);
  }
  return track;
}

export function QuestionBankPagination({ page, totalPages, onPageChange, disabled }: Props) {
  if (totalPages <= 1) return null;

  const track = buildPageTrack(page, totalPages);
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-center gap-1 border-t border-[var(--border)] pt-4"
      aria-label="Question bank pages"
    >
      <button
        type="button"
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || atStart}
        aria-label="Previous page"
      >
        ←
      </button>

      {track.map((entry, idx) =>
        entry === "ellipsis" ? (
          <span key={`ellipsis-${idx}`} className="px-1 text-sm text-[var(--muted)]" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            className={`min-w-[2.25rem] rounded-lg border px-2 py-1.5 text-sm font-medium ${
              entry === page
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--accent-soft)]"
            }`}
            onClick={() => onPageChange(entry)}
            disabled={disabled || entry === page}
            aria-current={entry === page ? "page" : undefined}
          >
            {entry}
          </button>
        )
      )}

      <button
        type="button"
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || atEnd}
        aria-label="Next page"
      >
        →
      </button>
    </nav>
  );
}
