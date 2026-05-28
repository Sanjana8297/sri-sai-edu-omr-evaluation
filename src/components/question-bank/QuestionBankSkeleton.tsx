export function QuestionBankSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[7.5rem] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--background)]"
        />
      ))}
    </div>
  );
}
