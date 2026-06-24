"use client";

import type { ReactNode } from "react";
import { DashboardPageProvider } from "@/components/dashboard/DashboardPageContext";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

export function StudentDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardPageProvider>
      <DashboardShell badge="Student" navItems={studentNavItems}>
        {children}
      </DashboardShell>
    </DashboardPageProvider>
  );
}
