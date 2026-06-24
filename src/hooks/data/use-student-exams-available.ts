"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStudentExamsAvailable } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useStudentExamsAvailableQuery(
  initialData?: Awaited<ReturnType<typeof fetchStudentExamsAvailable>>
) {
  return useQuery({
    queryKey: dataKeys.studentExamsAvailable,
    queryFn: fetchStudentExamsAvailable,
    staleTime: 60_000,
    initialData,
  });
}
