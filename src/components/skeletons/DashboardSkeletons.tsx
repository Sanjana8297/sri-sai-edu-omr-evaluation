export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--border)] ${className}`}
      aria-hidden
    />
  );
}

export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
        >
          <SkeletonBar className="h-5 w-1/3" />
          <SkeletonBar className="mt-4 h-4 w-2/3" />
          <SkeletonBar className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <SkeletonBar className="h-8 w-full rounded-lg" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBar key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function StatsRowSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
        >
          <SkeletonBar className="h-4 w-1/2" />
          <SkeletonBar className="mt-2 h-7 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function DashboardShellSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-6 py-4 lg:pl-[290px]">
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="mt-2 h-7 w-48" />
        <SkeletonBar className="mt-2 h-4 w-64" />
      </div>
      <div className="px-6 py-8 lg:pl-[290px]">
        <CardListSkeleton count={3} />
      </div>
    </div>
  );
}
