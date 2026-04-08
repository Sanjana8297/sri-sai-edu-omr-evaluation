"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

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
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  navItems?: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 lg:pl-[290px]">
          <div>
            {navItems.length > 0 ? (
              <button
                type="button"
                className="mb-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-medium lg:hidden"
                onClick={() => setMenuOpen(true)}
              >
                Menu
              </button>
            ) : null}
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{badge}</p>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="px-6 py-8 lg:pl-[290px]">
        <div>
          {navItems.length > 0 ? (
            <>
              <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${
                  menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={() => setMenuOpen(false)}
              />
              <aside
                className={`fixed inset-y-0 left-0 z-50 w-[260px] border-r border-[var(--border)] bg-[var(--card)] p-4 transition-transform lg:z-30 ${
                  menuOpen ? "translate-x-0" : "-translate-x-full"
                } lg:translate-x-0`}
              >
                <div className="mb-3 flex items-center justify-between lg:hidden">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Tasks</p>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs"
                    onClick={() => setMenuOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hidden text-xs font-semibold uppercase tracking-wide text-[var(--muted)] lg:block">
                  Tasks
                </p>
                <nav className="mt-3 space-y-1">
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
          <section className="max-w-6xl">{children}</section>
        </div>
      </main>
    </div>
  );
}
