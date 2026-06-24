"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { ResultScoreReportsPanel } from "@/app/dashboard/admin/reports/reports-analytics-panels";

export default function TeacherResultScoreReportsPage() {
  return (
    <DashboardShell
      badge="Teacher"
      title="Result & Score Reports"
      subtitle="Instant and aggregate scores for your students."
      navItems={teacherNavItems}
      fullWidthContent
    >
      <ResultScoreReportsPanel variant="teacher" />
    </DashboardShell>
  );
}
