"use client";

import Link from "next/link";
import { memo, type ReactNode } from "react";
import { dashCard, dashCardMeta, dashCardTitle } from "@/lib/dashboard-ui";

type StatBlockProps = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  value: string | number;
  detail: string;
  detailTone?: "positive" | "negative" | "neutral";
  viewHref?: string;
  viewLabel?: string;
};

export const StatBlock = memo(function StatBlock({
  icon,
  iconBg,
  title,
  value,
  detail,
  detailTone,
  viewHref,
  viewLabel = "View details",
}: StatBlockProps) {
  const detailClass =
    detailTone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : detailTone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-[var(--muted)]";

  return (
    <article className={`${dashCard} dash-static flex flex-col`}>
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--foreground)]">{value}</p>
      <p className={`mt-2 text-sm leading-relaxed ${detailClass}`}>{detail}</p>
      {viewHref ? (
        <Link
          href={viewHref}
          className="mt-4 inline-flex text-sm font-medium text-[var(--accent)] transition-colors hover:underline"
        >
          {viewLabel} ↗
        </Link>
      ) : null}
    </article>
  );
});
