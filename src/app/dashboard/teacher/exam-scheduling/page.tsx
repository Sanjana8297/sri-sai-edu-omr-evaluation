"use client";

import { useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { ExamSchedulingPanel } from "../exams/exam-scheduling-panel";

export default function TeacherExamSchedulingPage() {
  useSetDashboardPage({
    title: "Exam Scheduling",
    subtitle: "Schedule exam windows and publish them for students.",
    fullWidthContent: true,
  });

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <ExamSchedulingPanel err={err} msg={msg} setErr={setErr} setMsg={setMsg} />
  );
}
