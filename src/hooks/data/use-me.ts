"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMe } from "@/lib/data/fetchers";
import { dataKeys } from "./keys";

export function useMeQuery() {
  return useQuery({
    queryKey: dataKeys.me,
    queryFn: fetchMe,
    staleTime: 10 * 60_000,
    gcTime: Infinity,
  });
}
