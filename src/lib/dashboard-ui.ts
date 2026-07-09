/** Root wrapper — enables global interactive block styles from globals.css */
export const DASHBOARD_SURFACE = "dashboard-surface";

/** Opt out of automatic hover/lift on a specific block */
export const DASH_STATIC = "dash-static";

const cardShadow =
  "shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_1px_2px_rgba(0,0,0,0.12)]";

export const dashPanel = `dash-panel dash-static rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 lg:p-6 ${cardShadow}`;

export const dashBlock =
  "dash-block rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 sm:p-5";

export const dashCard = `dash-card rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 ${cardShadow}`;

export const dashInteractiveCard = `${dashCard} transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:shadow-[0_8px_24px_-6px_rgba(15,23,42,0.12)] dark:hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)]`;

export const dashGrid = "dash-grid";

export const dashGridWide = "dash-grid-wide";

/** Horizontal activity card strip — fixed card width, scroll on narrow viewports */
export const dashActivityRow = "dash-activity-row";

export const dashActivityCard = "dash-static dash-activity-card";

export const dashGridFour = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

/** Bordered blocks that should respond to hover / touch (explicit use) */
export const dashInteractive =
  "transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-within:shadow-md motion-safe:focus-within:-translate-y-0.5";

/* ── Typography ─────────────────────────────────────────────── */

export const dashPageStats =
  "mb-6 border-b border-[var(--border)] pb-5 text-sm leading-relaxed text-[var(--muted)]";

export const dashSectionTitle = "text-lg font-semibold leading-snug tracking-tight text-[var(--foreground)]";

export const dashCardTitle = "text-base font-semibold leading-snug text-[var(--foreground)]";

export const dashCardMeta = "mt-1 text-sm leading-relaxed text-[var(--muted)]";

export const dashLabel = "text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

/* ── Buttons ────────────────────────────────────────────────── */

export const dashBtnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium leading-none transition-all duration-200 disabled:pointer-events-none disabled:opacity-60";

export const dashBtnPrimary = `${dashBtnBase} bg-[var(--accent)] text-white shadow-sm hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2`;

const btnSecondaryColors =
  "border border-[var(--btn-secondary-border)] bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] shadow-sm hover:border-[var(--accent)] hover:bg-[var(--btn-secondary-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";

export const dashBtnSecondary = `${dashBtnBase} ${btnSecondaryColors}`;

export const dashBtnDanger = `${dashBtnBase} border border-[var(--btn-danger-border)] bg-[var(--btn-danger-bg)] text-[var(--btn-danger-text)] shadow-sm hover:border-red-500 hover:bg-[var(--btn-danger-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2`;

export const dashBtnGhost = `${dashBtnBase} bg-[color-mix(in_srgb,var(--accent-soft)_65%,transparent)] text-[var(--btn-secondary-text)] hover:bg-[var(--btn-secondary-hover-bg)]`;

export const dashBtnSm = `${dashBtnBase} ${btnSecondaryColors} px-2.5 py-1.5 text-xs`;

/* ── Form controls ──────────────────────────────────────────── */

export const dashInput =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors duration-200 focus:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_15%,transparent)]";

export const dashSelect =
  "min-w-[8rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors duration-200 focus:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_15%,transparent)]";

export const dashFilterPill =
  "rounded-full border border-[var(--btn-secondary-border)] bg-[var(--btn-secondary-bg)] px-3 py-1 text-xs font-medium text-[var(--btn-secondary-text)] transition-all duration-200 hover:border-[var(--accent)] hover:bg-[var(--btn-secondary-hover-bg)]";

export const dashFilterPillActive =
  "rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white shadow-sm";

/** Pagination / page track — inactive page */
export const dashPaginationBtn = dashBtnSm;

/** Pagination / page track — active page */
export const dashPaginationBtnActive = dashFilterPillActive;

export const dashDropdown =
  "absolute right-0 z-20 mt-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--btn-secondary-border)] bg-[var(--btn-secondary-bg)] py-1 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)]";

export const dashDropdownItem =
  "block w-full px-4 py-2.5 text-left text-sm text-[var(--btn-secondary-text)] transition-colors duration-150 hover:bg-[var(--btn-secondary-hover-bg)]";

/* ── Badges ─────────────────────────────────────────────────── */

export const dashBadge =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none";

export const dashBadgeAccent = `${dashBadge} border-indigo-200 bg-[var(--accent-soft)] text-indigo-800 dark:border-indigo-700 dark:text-indigo-200`;

export const dashBadgeBlue = `${dashBadge} border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200`;

export const dashBadgeAmber = `${dashBadge} border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200`;

export const dashBadgeEmerald = `${dashBadge} border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200`;

export const dashBadgeMuted = `${dashBadge} border-[var(--border)] bg-[var(--background)] text-[var(--muted)]`;

/* ── Tables ─────────────────────────────────────────────────── */

export const dashTableWrap = `dash-static overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] ${cardShadow}`;

export const dashTable = "dash-table min-w-full text-left text-sm";

export const dashTableHead =
  "border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-soft)_55%,var(--card))] text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

export const dashTableRow =
  "border-b border-[var(--border)] transition-colors duration-150 last:border-0 even:bg-[color-mix(in_srgb,var(--background)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-soft)_35%,var(--card))]";
