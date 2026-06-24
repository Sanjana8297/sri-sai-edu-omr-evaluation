"use client";

import { memo, type ReactNode } from "react";

type StatBlockProps = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  value: string | number;
  detail: string;
  detailTone?: "positive" | "negative" | "neutral";
};

export const StatBlock = memo(function StatBlock({
  icon,
  iconBg,
  title,
  value,
  detail,
  detailTone,
}: StatBlockProps) {
  const detailClass =
    detailTone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : detailTone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-[var(--muted)]";

  return (
    <article className="dash-static rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </div>
      <p className="text-xs font-medium text-[var(--muted)]">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className={`mt-2 text-xs ${detailClass}`}>{detail}</p>
    </article>
  );
});
