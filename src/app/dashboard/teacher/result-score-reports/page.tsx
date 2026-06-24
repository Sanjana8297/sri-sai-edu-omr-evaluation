"use client";

import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { TeacherResultScoreReportsPanel } from "@/app/dashboard/teacher/result-score-reports/teacher-result-score-reports-panel";

export default function TeacherResultScoreReportsPage() {
  return (
    <DashboardShell
      badge="Teacher"
      title="Result & Score Reports"
      subtitle="Instant and aggregate scores for your students."
      navItems={teacherNavItems}
      fullWidthContent
    >
      <TeacherResultScoreReportsPanel />
    </DashboardShell>
  );
}
