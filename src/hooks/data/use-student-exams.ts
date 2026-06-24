"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStudentExams } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useStudentExamsQuery(initialData?: Awaited<ReturnType<typeof fetchStudentExams>>) {
  return useQuery({
    queryKey: dataKeys.studentExams,
    queryFn: fetchStudentExams,
    staleTime: 5 * 60_000,
    initialData,
  });
}
