"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { ExamSchedulingPanel } from "../exams/exam-scheduling-panel";

export default function TeacherExamSchedulingPage() {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <DashboardShell
      badge="Teacher"
      title="Exam Scheduling"
      subtitle="Schedule exam windows and publish them for students."
      navItems={teacherNavItems}
      fullWidthContent
    >
      <ExamSchedulingPanel err={err} msg={msg} setErr={setErr} setMsg={setMsg} />
    </DashboardShell>
  );
}
