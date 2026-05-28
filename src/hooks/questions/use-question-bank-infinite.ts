"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { questionKeys, type QuestionBankQueryFilters } from "./keys";
import { fetchQuestionsPage } from "./fetch-questions-page";

const PAGE_SIZE = 40;

export function useQuestionBankInfinite(filters: QuestionBankQueryFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: questionKeys.list(filters),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchQuestionsPage(filters, pageParam as number),
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.offset + lastPage.limit;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function flattenQuestionPages(
  data: ReturnType<typeof useQuestionBankInfinite>["data"]
) {
  if (!data) return [];
  return data.pages.flatMap((p) => p.questions);
}

export function getQuestionBankTotal(
  data: ReturnType<typeof useQuestionBankInfinite>["data"]
): number | null {
  const first = data?.pages[0];
  return first?.total ?? null;
}

export { PAGE_SIZE };
