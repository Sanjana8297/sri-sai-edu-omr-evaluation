"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

const CbtExamExperience = dynamic(
  () =>
    import("@/components/student-exam/CbtExamExperience").then((mod) => ({
      default: mod.CbtExamExperience,
    })),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted)]">
        Loading exam…
      </div>
    ),
  }
);

export default function StudentTakeExamPage() {
  const params = useParams<{ examId: string }>();
  if (!params.examId) return null;
  return <CbtExamExperience examId={params.examId} />;
}
