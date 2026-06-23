export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-600"
          aria-hidden
        />
        <p className="text-sm text-[var(--muted)]">Loading dashboard…</p>
      </div>
    </div>
  );
}
