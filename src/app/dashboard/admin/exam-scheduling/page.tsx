"use client";

import { useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { ExamSchedulingPanel } from "@/app/dashboard/teacher/exams/exam-scheduling-panel";

export default function AdminExamSchedulingPage() {
  useSetDashboardPage({
    title: "Exam Scheduling",
    subtitle: "Schedule exam windows across teachers and publish them for students.",
    fullWidthContent: true,
  });

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <ExamSchedulingPanel variant="admin" err={err} msg={msg} setErr={setErr} setMsg={setMsg} />
  );
}
