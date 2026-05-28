"use client";

import { useParams } from "next/navigation";
import { CbtExamExperience } from "@/components/student-exam/CbtExamExperience";

export default function StudentTakeExamPage() {
  const params = useParams<{ examId: string }>();
  if (!params.examId) return null;
  return <CbtExamExperience examId={params.examId} />;
}
