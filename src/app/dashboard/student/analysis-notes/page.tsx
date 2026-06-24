"use client";

import Link from "next/link";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { useStudentExamsQuery } from "@/hooks/data/use-student-exams";

export default function StudentAnalysisNotesPage() {
  useSetDashboardPage({
    title: "Analysis Notes",
    subtitle: "Detailed notes from teacher feedback.",
  });

  const { data, isLoading } = useStudentExamsQuery();
  const exams = data?.exams ?? [];

  if (isLoading && !data) return <CardListSkeleton count={3} />;

  return (
      <div className="space-y-4">
        {exams.map((exam) => {
          return (
            <article key={exam.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <Link
                href={`/dashboard/student/analysis-notes/${encodeURIComponent(exam.id)}`}
                className="block w-full text-left"
              >
                <h2 className="font-semibold">{exam.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {new Date(exam.examDate).toLocaleDateString()} · {exam.category} · {exam.status}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Score: {exam.marksObtained}/{exam.maxMarks} ({exam.percentage}%)
                </p>
                <p className="mt-2 text-xs text-[var(--accent)]">Open full paper analysis</p>
              </Link>
            </article>
          );
        })}
      </div>
  );
}
