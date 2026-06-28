"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { InstituteBrand } from "@/components/InstituteBrand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PrefetchNavLink } from "@/components/dashboard/PrefetchNavLink";
import { useDashboardPageMeta } from "@/components/dashboard/DashboardPageContext";
import { useMeQuery } from "@/hooks/data/use-me";
import {
  buildTeacherNavItems,
  navHrefIsActive,
  navItemIsActive,
  type NavItem,
  type TeacherTrack,
} from "@/lib/dashboard-nav";
import { DASHBOARD_SURFACE } from "@/lib/dashboard-ui";

const SIDEBAR_COLLAPSED_KEY = "dashboard-sidebar-collapsed";

// 3–4px left accent bar shown on the active item (rounded on its right edge).
const ACTIVE_BAR =
  "before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-[var(--nav-active-bar)] before:content-['']";

function navMainClass(active: boolean) {
  const base =
    "relative block rounded-lg px-3 py-2 text-sm transition-colors duration-150 bg-transparent";
  if (active) {
    return `${base} ${ACTIVE_BAR} bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-text)] shadow-sm`;
  }
  return `${base} text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]`;
}

function navParentClass(active: boolean, expanded: boolean) {
  const base =
    "relative flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 bg-transparent";
  if (active) {
    return `${base} ${ACTIVE_BAR} bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-text)] shadow-sm`;
  }
  if (expanded) {
    return `${base} font-medium text-[var(--nav-hover-text)] hover:bg-[var(--nav-hover-bg)]`;
  }
  return `${base} text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]`;
}

function navChildClass(active: boolean) {
  const base = "relative block rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150";
  if (active) {
    return `${base} ${ACTIVE_BAR} bg-[var(--nav-active-bg)] font-semibold text-[var(--nav-active-text)]`;
  }
  return `${base} bg-transparent text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]`;
}

function DashboardShellInner({
  badge,
  navItems = [],
  children,
}: {
  badge: string;
  navItems?: NavItem[];
  children: ReactNode;
}) {
  const { title, subtitle, fullWidthContent = false } = useDashboardPageMeta();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedHrefs, setExpandedHrefs] = useState<Set<string>>(() => new Set());

  const { data: meData } = useMeQuery();
  const teacherTrack: TeacherTrack =
    badge === "Teacher" &&
    (meData?.user?.category === "JEE" || meData?.user?.category === "NEET")
      ? meData.user.category
      : "JEE";

  const resolvedNavItems = useMemo(() => {
    if (badge === "Teacher") {
      return buildTeacherNavItems(teacherTrack);
    }
    return navItems;
  }, [badge, teacherTrack, navItems]);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setExpandedHrefs((prev) => {
      const next = new Set(prev);
      for (const item of resolvedNavItems) {
        if (item.children?.some((child) => navHrefIsActive(pathname, search, child.href))) {
          next.add(item.href);
        }
      }
      return next;
    });
  }, [pathname, search, resolvedNavItems]);

  function persistSidebarCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function toggleExpanded(href: string) {
    setExpandedHrefs((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  const hasNav = resolvedNavItems.length > 0;
  const mainOffsetLg = hasNav && !sidebarCollapsed;

  return (
    <div
      className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] ${fullWidthContent ? "flex flex-col" : ""}`}
    >
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--card)]">
        <div
          className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition-[padding] duration-200 sm:px-6 sm:py-4 ${mainOffsetLg ? "lg:pl-[290px]" : ""}`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <InstituteBrand compact className={`shrink-0 ${hasNav ? "lg:hidden" : ""}`} />
            <div className="min-w-0">
              {hasNav ? (
                <button
                  type="button"
                  className="mb-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium lg:hidden"
                  onClick={() => setMenuOpen(true)}
                >
                  Menu
                </button>
              ) : null}
              {hasNav && sidebarCollapsed ? (
                <button
                  type="button"
                  className="mb-2 hidden items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent-soft)] lg:inline-flex"
                  onClick={() => persistSidebarCollapsed(false)}
                  aria-controls="dashboard-nav-sidebar"
                  aria-expanded={false}
                  title="Open sidebar"
                >
                  <span aria-hidden className="select-none">
                    »
                  </span>
                  Open sidebar
                </button>
              ) : null}
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{badge}</p>
              <h1 className="text-xl font-semibold">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {badge === "Teacher" ? (
              <PrefetchNavLink
                href="/dashboard/teacher/fetch-new-question-using-ai"
                className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                title="AI Question Fetch"
              >
                <span aria-hidden>✨</span>
                <span>AI</span>
              </PrefetchNavLink>
            ) : null}
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main
        className={`transition-[padding] duration-200 ${mainOffsetLg ? "lg:pl-[290px]" : ""} ${
          fullWidthContent
            ? "flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-10"
            : "px-4 py-6 sm:px-6 sm:py-8"
        }`}
      >
        <div className={fullWidthContent ? "flex min-h-0 flex-1 flex-col" : ""}>
          {hasNav ? (
            <>
              <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
                  menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={() => setMenuOpen(false)}
              />
              <aside
                id="dashboard-nav-sidebar"
                className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-4 transition-transform duration-200 ease-out lg:z-30 ${
                  menuOpen ? "translate-x-0" : "-translate-x-full"
                } ${sidebarCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
              >
                <div className="mb-3 shrink-0 border-b border-[var(--sidebar-border)] pb-3">
                  <InstituteBrand compact onDark />
                </div>
                <div className="mb-3 flex shrink-0 items-center justify-between lg:hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sidebar-muted)]">Tasks</p>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--sidebar-border)] px-2 py-1 text-xs text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mb-1 hidden shrink-0 items-center justify-between lg:flex">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sidebar-muted)]">Tasks</p>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--sidebar-border)] px-2 py-1 text-xs font-medium text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]"
                    onClick={() => persistSidebarCollapsed(true)}
                    aria-controls="dashboard-nav-sidebar"
                    aria-expanded={!sidebarCollapsed}
                    title="Collapse sidebar"
                  >
                    <span className="sr-only">Collapse sidebar</span>
                    <span aria-hidden className="select-none">
                      «
                    </span>
                  </button>
                </div>
                <nav className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {resolvedNavItems.map((item) => {
                    const parentActive = navItemIsActive(pathname, search, item);
                    const hasChildren = (item.children?.length ?? 0) > 0;
                    const isExpanded = expandedHrefs.has(item.href);

                    if (hasChildren) {
                      return (
                        <div key={item.href} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(item.href)}
                            aria-expanded={isExpanded}
                            className={navParentClass(parentActive, isExpanded)}
                          >
                            <span>{item.label}</span>
                            <span
                              aria-hidden
                              className={`shrink-0 text-[10px] transition-transform ${
                                parentActive || isExpanded
                                  ? "text-[var(--nav-active-text)]"
                                  : "text-[var(--nav-inactive-text)]"
                              } ${isExpanded ? "rotate-90" : ""}`}
                            >
                              ▸
                            </span>
                          </button>
                          {isExpanded ? (
                            <ul className="ml-2 space-y-0.5 border-l border-[var(--sidebar-border)] pl-2">
                              {item.children!.map((child) => {
                                const childActive = navHrefIsActive(pathname, search, child.href);
                                return (
                                  <li key={child.href}>
                                    <PrefetchNavLink
                                      href={child.href}
                                      onClick={() => setMenuOpen(false)}
                                      className={navChildClass(childActive)}
                                    >
                                      {child.label}
                                    </PrefetchNavLink>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <PrefetchNavLink
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={navMainClass(navHrefIsActive(pathname, search, item.href))}
                      >
                        {item.label}
                      </PrefetchNavLink>
                    );
                  })}
                </nav>
              </aside>
            </>
          ) : null}
          <section
            className={
              fullWidthContent
                ? `flex min-h-0 w-full max-w-none flex-1 flex-col ${DASHBOARD_SURFACE}`
                : `max-w-6xl ${DASHBOARD_SURFACE}`
            }
          >
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}

export function DashboardShell({
  badge,
  navItems = [],
  children,
}: {
  badge: string;
  navItems?: NavItem[];
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <DashboardShellInner badge={badge} navItems={navItems}>
        {children}
      </DashboardShellInner>
    </Suspense>
  );
}
