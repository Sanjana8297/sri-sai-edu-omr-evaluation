/** Root wrapper — enables global interactive block styles from globals.css */
export const DASHBOARD_SURFACE = "dashboard-surface";

/** Opt out of automatic hover/lift on a specific block */
export const DASH_STATIC = "dash-static";

export const dashPanel =
  "rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 lg:p-6";

export const dashBlock =
  "rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 sm:p-4";

export const dashGrid = "dash-grid";

export const dashGridWide = "dash-grid-wide";

/** Horizontal activity card strip — fixed card width, scroll on narrow viewports */
export const dashActivityRow = "dash-activity-row";

export const dashActivityCard = "dash-static dash-activity-card";

export const dashGridFour = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

/** Bordered blocks that should respond to hover / touch (explicit use) */
export const dashInteractive =
  "transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-within:shadow-md motion-safe:focus-within:-translate-y-0.5";
