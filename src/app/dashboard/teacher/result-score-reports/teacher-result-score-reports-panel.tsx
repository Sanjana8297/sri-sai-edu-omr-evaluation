"use client";

import {
  ResultScoreReportsPanel,
  TEACHER_RESULT_SCORE_CONFIG,
} from "@/app/dashboard/admin/reports/reports-analytics-panels";

export function TeacherResultScoreReportsPanel() {
  return <ResultScoreReportsPanel config={TEACHER_RESULT_SCORE_CONFIG} />;
}
