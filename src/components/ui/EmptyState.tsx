import type { ReactNode } from "react";
import Link from "next/link";
import { dashBtnPrimary, dashCard, dashCardMeta, dashCardTitle } from "@/lib/dashboard-ui";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
};

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`${dashCard} dash-static flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      {icon ? (
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xl text-[var(--accent)]"
          aria-hidden
        >
          {icon}
        </div>
      ) : (
        <div
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xl text-[var(--accent)]"
          aria-hidden
        >
          ∅
        </div>
      )}
      <h3 className={dashCardTitle}>{title}</h3>
      {description ? <p className={`${dashCardMeta} mt-2 max-w-md`}>{description}</p> : null}
      {action ? (
        <div className="mt-5">
          {action.href ? (
            <Link href={action.href} className={dashBtnPrimary}>
              {action.label}
            </Link>
          ) : (
            <button type="button" className={dashBtnPrimary} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
