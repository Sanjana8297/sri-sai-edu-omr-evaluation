"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTeacherStudents } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useTeacherStudentsQuery(initialData?: Awaited<ReturnType<typeof fetchTeacherStudents>>) {
  return useQuery({
    queryKey: dataKeys.teacherStudents,
    queryFn: fetchTeacherStudents,
    staleTime: 10 * 60_000,
    initialData,
  });
}
