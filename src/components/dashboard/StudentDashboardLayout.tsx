"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardPageProvider } from "@/components/dashboard/DashboardPageContext";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

export function StudentDashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const forcePasswordChange = pathname === "/dashboard/student/change-password";

  return (
    <DashboardPageProvider>
      <DashboardShell badge="Student" navItems={forcePasswordChange ? [] : studentNavItems}>
        {children}
      </DashboardShell>
    </DashboardPageProvider>
  );
}
