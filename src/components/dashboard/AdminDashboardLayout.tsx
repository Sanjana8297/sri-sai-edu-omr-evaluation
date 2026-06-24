"use client";

import type { ReactNode } from "react";
import { DashboardPageProvider } from "@/components/dashboard/DashboardPageContext";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";

export function AdminDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardPageProvider>
      <DashboardShell badge="Administrator" navItems={adminNavItems}>
        {children}
      </DashboardShell>
    </DashboardPageProvider>
  );
}
