"use client";

import { useEffect, useState, type ReactNode } from "react";
import { dashActivityCard, dashActivityRow, dashBtnPrimary, dashCard, dashCardMeta, dashCardTitle, dashPanel } from "@/lib/dashboard-ui";

export type ActivityFeature = {
  id: string;
  title: string;
  description: string;
};

export type ActivityFeatureActions = {
  openFeature: (id: string) => void;
  backToGrid: () => void;
  nextFeature: ActivityFeature | null;
  openNextFeature: () => void;
};

export function FeatureActivityHub({
  features,
  renderFeature,
  resetKey,
  validateNext,
}: {
  features: ActivityFeature[];
  renderFeature: (id: string, actions: ActivityFeatureActions) => ReactNode;
  /** Change when parent submodule changes to return to the card grid. */
  resetKey?: string;
  /** Return an error message to block moving to the next activity. */
  validateNext?: (activeId: string) => string | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(null);
    setNextError(null);
  }, [resetKey]);

  const activeIndex = activeId == null ? -1 : features.findIndex((f) => f.id === activeId);
  const active = activeIndex >= 0 ? features[activeIndex] : undefined;
  const nextFeature = activeIndex >= 0 && activeIndex < features.length - 1 ? features[activeIndex + 1] : null;

  const actions: ActivityFeatureActions = {
    openFeature: (id) => {
      setNextError(null);
      setActiveId(id);
    },
    backToGrid: () => {
      setNextError(null);
      setActiveId(null);
    },
    nextFeature,
    openNextFeature: () => {
      if (!nextFeature) return;
      const err = validateNext?.(activeId ?? "");
      if (err) {
        setNextError(err);
        return;
      }
      setNextError(null);
      setActiveId(nextFeature.id);
    },
  };

  if (activeId && active) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={actions.backToGrid}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to activities
        </button>
        <section className={dashPanel}>
          <h3 className={dashCardTitle}>{active.title}</h3>
          <p className={dashCardMeta}>{active.description}</p>
          <div className="mt-6 border-t border-[var(--border)] pt-6">{renderFeature(activeId, actions)}</div>
          {nextFeature ? (
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border)] pt-6">
              {nextError ? <p className="mr-auto text-xs text-red-600">{nextError}</p> : null}
              <button type="button" className={dashBtnPrimary} onClick={actions.openNextFeature}>
                Next: {nextFeature.title} →
              </button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className={dashActivityRow}>
      {features.map((feature) => (
        <button
          key={feature.id}
          type="button"
          onClick={() => setActiveId(feature.id)}
          className={`${dashActivityCard} ${dashCard} group text-left transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:shadow-[0_8px_24px_-6px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5`}
        >
          <h3 className={`${dashCardTitle} text-sm group-hover:text-[var(--accent)]`}>
            {feature.title}
          </h3>
          <p className={`${dashCardMeta} mt-2 flex-1 text-xs`}>{feature.description}</p>
          <span className="mt-4 inline-block text-xs font-medium text-[var(--accent)]">Open activity →</span>
        </button>
      ))}
    </div>
  );
}


