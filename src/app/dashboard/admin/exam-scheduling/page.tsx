"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { ExamSchedulingPanel } from "@/app/dashboard/teacher/exams/exam-scheduling-panel";

export default function AdminExamSchedulingPage() {
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <DashboardShell
      badge="Admin"
      title="Exam Scheduling"
      subtitle="Schedule exam windows across teachers and publish them for students."
      navItems={adminNavItems}
      fullWidthContent
    >
      <ExamSchedulingPanel variant="admin" err={err} msg={msg} setErr={setErr} setMsg={setMsg} />
    </DashboardShell>
  );
}
