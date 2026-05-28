"use client";

import { useQuery } from "@tanstack/react-query";
import type { QuestionDetail } from "@/lib/questions/types";
import { questionKeys } from "./keys";

async function fetchQuestionDetail(id: number): Promise<QuestionDetail> {
  const res = await fetch(`/api/questions/${id}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "Could not load question");
  }
  return json.question as QuestionDetail;
}

export function useQuestionDetail(id: number | null) {
  return useQuery({
    queryKey: questionKeys.detail(id ?? 0),
    queryFn: () => fetchQuestionDetail(id!),
    enabled: id != null && id > 0,
    staleTime: 5 * 60_000,
  });
}
