"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { InstituteBrand } from "@/components/InstituteBrand";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  buildTeacherNavItems,
  navHrefIsActive,
  navItemIsActive,
  type NavItem,
  type TeacherTrack,
} from "@/lib/dashboard-nav";

const SIDEBAR_COLLAPSED_KEY = "dashboard-sidebar-collapsed";

/** Top-level nav items — accent text when active; no filled background. */
function navMainClass(active: boolean) {
  const base = "block rounded-lg px-3 py-2 text-sm transition-colors duration-150 bg-transparent";
  if (active) {
    return `${base} font-semibold text-[var(--nav-active-text)]`;
  }
  return `${base} text-[var(--nav-inactive-text)] hover:text-[var(--nav-hover-text)]`;
}

/** Expandable parent row — accent text when a child is active; no filled background. */
function navParentClass(active: boolean, expanded: boolean) {
  const base =
    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 bg-transparent";
  if (active) {
    return `${base} font-semibold text-[var(--nav-active-text)]`;
  }
  if (expanded) {
    return `${base} font-medium text-[var(--nav-hover-text)]`;
  }
  return `${base} text-[var(--nav-inactive-text)] hover:text-[var(--nav-hover-text)]`;
}

/** Sub-module links — hover-style background only (including when selected). */
function navChildClass(active: boolean) {
  const base = "block rounded-lg px-2.5 py-1.5 text-xs transition-colors duration-150";
  if (active) {
    return `${base} bg-[var(--nav-hover-bg)] font-semibold text-[var(--nav-active-text)]`;
  }
  return `${base} bg-transparent text-[var(--nav-inactive-text)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--nav-hover-text)]`;
}

function DashboardShellInner({
  title,
  subtitle,
  badge,
  navItems = [],
  children,
  fullWidthContent = false,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  navItems?: NavItem[];
  children: ReactNode;
  fullWidthContent?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedHrefs, setExpandedHrefs] = useState<Set<string>>(() => new Set());
  const [teacherTrack, setTeacherTrack] = useState<TeacherTrack | null>(null);

  const resolvedNavItems = useMemo(() => {
    if (badge === "Teacher") {
      return buildTeacherNavItems(teacherTrack ?? "JEE");
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
    if (badge !== "Teacher") return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me");
        const json = await res.json();
        if (cancelled) return;
        if (json.user?.category === "JEE" || json.user?.category === "NEET") {
          setTeacherTrack(json.user.category);
        } else {
          setTeacherTrack("JEE");
        }
      } catch {
        if (!cancelled) setTeacherTrack("JEE");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [badge]);

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
            <InstituteBrand
              compact
              className={`shrink-0 ${hasNav ? "lg:hidden" : ""}`}
            />
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
              <Link
                href="/dashboard/teacher/fetch-new-question-using-ai"
                className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                title="AI Question Fetch"
              >
                <span aria-hidden>✨</span>
                <span>AI</span>
              </Link>
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
            : "px-6 py-8"
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
                className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-[var(--border)] bg-[var(--card)] p-4 transition-transform duration-200 ease-out lg:z-30 ${
                  menuOpen ? "translate-x-0" : "-translate-x-full"
                } ${sidebarCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
              >
                <div className="mb-3 shrink-0 border-b border-[var(--border)] pb-3">
                  <InstituteBrand compact />
                </div>
                <div className="mb-3 flex shrink-0 items-center justify-between lg:hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Tasks</p>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                    onClick={() => setMenuOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="mb-1 hidden shrink-0 items-center justify-between lg:flex">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Tasks</p>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]"
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
                            <ul className="ml-2 space-y-0.5 border-l border-[var(--border)] pl-2">
                              {item.children!.map((child) => {
                                const childActive = navHrefIsActive(pathname, search, child.href);
                                return (
                                  <li key={child.href}>
                                    <Link
                                      href={child.href}
                                      onClick={() => setMenuOpen(false)}
                                      className={navChildClass(childActive)}
                                    >
                                      {child.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={navMainClass(navHrefIsActive(pathname, search, item.href))}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </aside>
            </>
          ) : null}
          <section
            className={
              fullWidthContent
                ? "flex min-h-0 w-full max-w-none flex-1 flex-col"
                : "max-w-6xl"
            }
          >
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}

export function DashboardShell(props: {
  title: string;
  subtitle?: string;
  badge?: string;
  navItems?: NavItem[];
  children: ReactNode;
  fullWidthContent?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <DashboardShellInner {...props} />
    </Suspense>
  );
}
