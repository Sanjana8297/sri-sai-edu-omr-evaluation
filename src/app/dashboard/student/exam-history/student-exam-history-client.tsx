"use client";

import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { StudentHistoryExamCard } from "@/components/exams/StudentExamCard";
import { CardListSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { VirtualList } from "@/components/ui/VirtualList";
import { useStudentExamsQuery } from "@/hooks/data/use-student-exams";
import type { StudentExamHistoryItem } from "@/lib/data/fetchers";

type Props = {
  initialData?: { exams: StudentExamHistoryItem[] };
};

export function StudentExamHistoryClient({ initialData }: Props) {
  useSetDashboardPage({
    title: "Exam History",
    subtitle: "Exams taken by you.",
  });

  const { data, isLoading } = useStudentExamsQuery(initialData);
  const exams = data?.exams ?? [];

  if (isLoading && !data) return <CardListSkeleton count={4} />;

  if (exams.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-center text-2xl font-semibold text-[var(--muted)]">
          No exams taken yet.
        </p>
      </div>
    );
  }

  return (
    <VirtualList
      items={exams}
      estimateSize={120}
      threshold={30}
      getKey={(exam) => exam.id}
      renderItem={(exam) => <StudentHistoryExamCard exam={exam} />}
    />
  );
}
