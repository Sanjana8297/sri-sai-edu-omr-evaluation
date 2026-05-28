"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ActivityFeature = {
  id: string;
  title: string;
  description: string;
};

export type ActivityFeatureActions = {
  openFeature: (id: string) => void;
  backToGrid: () => void;
};

export function FeatureActivityHub({
  features,
  renderFeature,
  resetKey,
}: {
  features: ActivityFeature[];
  renderFeature: (id: string, actions: ActivityFeatureActions) => ReactNode;
  /** Change when parent submodule changes to return to the card grid. */
  resetKey?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(null);
  }, [resetKey]);

  const active = features.find((f) => f.id === activeId);

  if (activeId && active) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to activities
        </button>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
          <h3 className="text-base font-semibold text-[var(--foreground)]">{active.title}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">{active.description}</p>
          <div className="mt-5 border-t border-[var(--border)] pt-5">
            {renderFeature(activeId, {
              openFeature: (id) => setActiveId(id),
              backToGrid: () => setActiveId(null),
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {features.map((feature) => (
        <button
          key={feature.id}
          type="button"
          onClick={() => setActiveId(feature.id)}
          className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--nav-hover-bg)]"
        >
          <h3 className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)]">
            {feature.title}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{feature.description}</p>
          <span className="mt-4 inline-block text-xs font-medium text-[var(--accent)]">Open activity →</span>
        </button>
      ))}
    </div>
  );
}


