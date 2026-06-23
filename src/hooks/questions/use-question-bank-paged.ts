"use client";

import { useQuery } from "@tanstack/react-query";
import { questionKeys, type QuestionBankQueryFilters } from "./keys";
import { fetchQuestionsPage } from "./fetch-questions-page";

export const QUESTION_BANK_PAGE_SIZE = 25;

export function useQuestionBankPaged(
  filters: QuestionBankQueryFilters,
  page: number,
  enabled = true
) {
  const safePage = Math.max(1, page);

  return useQuery({
    queryKey: questionKeys.listPage(filters, safePage),
    enabled,
    queryFn: () =>
      fetchQuestionsPage(filters, (safePage - 1) * QUESTION_BANK_PAGE_SIZE, {
        limit: QUESTION_BANK_PAGE_SIZE,
      }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (previous) => previous,
  });
}
