"use client";

import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { TeacherResultScoreReportsPanel } from "@/app/dashboard/teacher/result-score-reports/teacher-result-score-reports-panel";

export default function TeacherResultScoreReportsPage() {
  useSetDashboardPage({
    title: "Result & Score Reports",
    subtitle: "Instant and aggregate scores for your students.",
    fullWidthContent: true,
  });

  return <TeacherResultScoreReportsPanel />;
}
