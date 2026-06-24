"use client";

import { useEffect, useMemo } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { StudentAvailableExamCard } from "@/components/exams/StudentExamCard";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { useStudentExamsAvailableQuery } from "@/hooks/data/use-student-exams-available";
import type { StudentAvailableExam } from "@/lib/data/fetchers";
import { isSessionSubmitted } from "@/lib/proctoring";
import { clearExamSubmittedLocally, wasExamSubmittedLocally } from "@/lib/exam-progress-cache";

type Props = {
  initialData?: { exams: StudentAvailableExam[] };
};

export function StudentExamsClient({ initialData }: Props) {
  useSetDashboardPage({
    title: "Take Exam",
    subtitle: "Exams listed here are open now and ready for you to start or resume.",
  });

  const { data, error, isLoading, refetch } = useStudentExamsAvailableQuery(initialData);

  useEffect(() => {
    const refresh = () => void refetch();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refetch]);

  const exams = useMemo(() => {
    const list = data?.exams ?? [];
    for (const exam of list) {
      const session = exam.examSessions[0];
      if (session && isSessionSubmitted(session.status)) {
        clearExamSubmittedLocally(exam.id);
      }
    }
    return list.filter((exam) => !wasExamSubmittedLocally(exam.id));
  }, [data?.exams]);

  if (isLoading && !data) return <CardListSkeleton count={2} />;

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load exams"}
        </p>
      ) : null}
      {exams.length === 0 ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-center text-2xl font-semibold text-[var(--muted)]">
            No exams are open for you right now.
          </p>
        </div>
      ) : null}
      {exams.map((exam) => {
        const latestSession = exam.examSessions[0];
        const inProgress = latestSession?.status === "IN_PROGRESS";
        const canTake =
          !wasExamSubmittedLocally(exam.id) &&
          (!latestSession || !isSessionSubmitted(latestSession.status));
        return (
          <StudentAvailableExamCard
            key={exam.id}
            exam={exam}
            canTake={canTake}
            inProgress={inProgress}
          />
        );
      })}
    </div>
  );
}
