"use client";

import { useQuery } from "@tanstack/react-query";
import { buildQuestionsSearchParams } from "./fetch-questions-page";
import { questionKeys, type QuestionBankQueryFilters } from "./keys";

/** Filtered COUNT(*) for the current filters — refetches whenever filters change. */
export function useQuestionBankFilteredTotal(
  filters: QuestionBankQueryFilters,
  enabled = true
) {
  return useQuery({
    queryKey: questionKeys.listTotal(filters),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const params = buildQuestionsSearchParams(filters, {
        limit: 1,
        offset: 0,
        includeTotal: true,
        fullRows: false,
      });
      const res = await fetch(`/api/questions?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not load question count");
      }
      return typeof json.total === "number" ? json.total : null;
    },
  });
}
