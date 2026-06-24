"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTeacherQuestionPapers } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useTeacherQuestionPapersQuery(
  scheduledOnly = false,
  initialData?: Awaited<ReturnType<typeof fetchTeacherQuestionPapers>>
) {
  const key = scheduledOnly ? dataKeys.teacherQuestionPapersArchived : dataKeys.teacherQuestionPapers;
  return useQuery({
    queryKey: key,
    queryFn: () => fetchTeacherQuestionPapers(scheduledOnly),
    staleTime: 10 * 60_000,
    initialData,
  });
}
