"use client";

import type { ReactNode } from "react";
import { DashboardPageProvider } from "@/components/dashboard/DashboardPageContext";
import { DashboardShell } from "@/components/DashboardShell";

export function TeacherDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardPageProvider>
      <DashboardShell badge="Teacher">{children}</DashboardShell>
    </DashboardPageProvider>
  );
}
