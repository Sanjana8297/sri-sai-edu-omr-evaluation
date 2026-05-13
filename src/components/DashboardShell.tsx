"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const SIDEBAR_COLLAPSED_KEY = "dashboard-sidebar-collapsed";

type NavItem = {
  href: string;
  label: string;
};

export function DashboardShell({
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
  /** Use full main width and extra vertical space (e.g. multi-step tools). */
  fullWidthContent?: boolean;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setSidebarCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  function persistSidebarCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const hasNav = navItems.length > 0;
  const mainOffsetLg = hasNav && !sidebarCollapsed;

  return (
    <div
      className={`min-h-screen bg-[var(--background)] text-[var(--foreground)] ${fullWidthContent ? "flex flex-col" : ""}`}
    >
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--card)]">
        <div
          className={`flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-[padding] duration-200 ${mainOffsetLg ? "lg:pl-[290px]" : ""}`}
        >
          <div>
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
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`block rounded-lg px-3 py-2 text-sm hover:bg-[var(--accent-soft)] ${
                        pathname === item.href ? "bg-[var(--accent-soft)] font-medium" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
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
