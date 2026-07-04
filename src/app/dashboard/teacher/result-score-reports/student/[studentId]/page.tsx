"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { useSubjectScoresApi, SubjectBreakdownList } from "@/app/dashboard/admin/reports/reports-analytics-panels";
import { ExamPaperAnalysis, type ExamAnalysisDetail } from "@/components/reports/ExamPaperAnalysis";
import {
  dashBtnSecondary,
  dashCard,
  dashFilterPill,
  dashFilterPillActive,
  dashPanel,
} from "@/lib/dashboard-ui";

type TabId = "breakdown" | "notes";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "breakdown", label: "Subject-wise score breakdown" },
  { id: "notes", label: "Analysis Notes" },
];

type SessionsResponse = {
  student: { id: string; name: string; category: string };
  sessions: ExamAnalysisDetail[];
};

function BreakdownTab({ studentId }: { studentId: string }) {
  const { subjectScores, subjectScoresLoading } = useSubjectScoresApi("/api/teacher/reports/subject-scores");

  const breakdown = useMemo(() => {
    if (!subjectScores) return null;
    const entry = subjectScores.byStudent[studentId];
    if (!entry) return null;
    return {
      title: `Target ${entry.track}`,
      subtitle: "Average % per subject across all exam attempts on the report card",
      allAttempts: entry.allAttempts,
      overallAvg: entry.overallAvg,
      scores: entry.subjects,
    };
  }, [subjectScores, studentId]);

  if (subjectScoresLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading subject scores…</p>;
  }
  if (!breakdown) {
    return <p className="text-sm text-[var(--muted)]">No subject breakdown available for this student yet.</p>;
  }
  return (
    <section className={dashPanel}>
      <SubjectBreakdownList {...breakdown} />
    </section>
  );
}

function NotesTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher", "student-sessions", studentId],
    queryFn: async (): Promise<SessionsResponse> => {
      const res = await fetch(`/api/teacher/students/${encodeURIComponent(studentId)}/sessions`);
      if (!res.ok) throw new Error("Failed to load analysis notes");
      return res.json();
    },
    staleTime: 60_000,
  });
  const sessions = data?.sessions ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading analysis notes…</p>;
  }
  if (sessions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--muted)]">
        No submitted exams to analyse for this student yet.
      </p>
    );
  }

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to all exams
        </button>
        <ExamPaperAnalysis detail={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const pct = s.scoreMax > 0 ? Math.round((s.scoreObtained / s.scoreMax) * 1000) / 10 : 0;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedId(s.id)}
            className={`${dashCard} block w-full text-left transition-colors hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))]`}
          >
            <h2 className="font-semibold">{s.exam.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : "—"} · {s.exam.category} ·{" "}
              {s.status}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Score: {s.scoreObtained}/{s.scoreMax} ({pct}%)
            </p>
            <p className="mt-2 text-xs text-[var(--accent)]">Open full paper analysis →</p>
          </button>
        );
      })}
    </div>
  );
}

export default function TeacherStudentReportPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const studentId = params.studentId;
  const [tab, setTab] = useState<TabId>("breakdown");

  const { data } = useQuery({
    queryKey: ["teacher", "student-sessions", studentId],
    queryFn: async (): Promise<SessionsResponse> => {
      const res = await fetch(`/api/teacher/students/${encodeURIComponent(studentId)}/sessions`);
      if (!res.ok) throw new Error("Failed to load student");
      return res.json();
    },
    staleTime: 60_000,
  });

  useSetDashboardPage({
    title: data?.student?.name ? `${data.student.name} · Report` : "Student report",
    subtitle: "Subject-wise breakdown and exam analysis notes",
    fullWidthContent: true,
  });

  return (
    <>
      <div className="mb-4">
        <Link
          href="/dashboard/teacher/result-score-reports"
          onClick={(e) => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              e.preventDefault();
              router.back();
            }
          }}
          className={`${dashBtnSecondary} inline-flex items-center`}
        >
          ← Back to Result &amp; Score Reports
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={tab === t.id ? dashFilterPillActive : `${dashFilterPill} px-3.5 py-1.5 text-sm`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "breakdown" ? <BreakdownTab studentId={studentId} /> : <NotesTab studentId={studentId} />}
    </>
  );
}
