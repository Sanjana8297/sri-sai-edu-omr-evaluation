"use client";

import Link from "next/link";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";

export default function TeacherAnswerSheetPage() {
  useSetDashboardPage({
    title: "Upload Answer Key",
    subtitle: "This workflow is turned off.",
  });

  return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <p className="text-sm text-[var(--muted)]">
          Uploading answer keys from this page is disabled. Add the answer key when you create or save a question paper (for example in the{" "}
          <Link href="/dashboard/teacher/manual-builder" className="font-medium text-[var(--accent)] underline">
            Manual Question Paper Generator
          </Link>
          ), or use the AI paper generator where the key is included with the paper.
        </p>
      </div>
  );
}
