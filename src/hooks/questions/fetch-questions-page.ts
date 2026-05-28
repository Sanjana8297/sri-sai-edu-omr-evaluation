import type { ListQuestionsResult, QuestionListItem } from "@/lib/questions/types";
import type { QuestionBankQueryFilters } from "./keys";

export function buildQuestionsSearchParams(
  filters: QuestionBankQueryFilters,
  options: {
    limit: number;
    offset: number;
    includeTotal?: boolean;
    fullRows?: boolean;
  }
): URLSearchParams {
  const params = new URLSearchParams();
  if (options.fullRows) params.set("fullRows", "true");
  else params.set("fullRows", "false");
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.chapter) params.set("chapter", filters.chapter);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.year != null) params.set("year", String(filters.year));
  if (filters.search) params.set("search", filters.search);
  if (filters.important === true) params.set("important", "true");
  if (filters.important === false) params.set("important", "false");
  if (filters.repeated === true) params.set("repeated", "true");
  if (filters.repeated === false) params.set("repeated", "false");
  if (filters.jeeExamType) params.set("jeeExamType", filters.jeeExamType);
  if (filters.questionType) params.set("questionType", filters.questionType);
  params.set("limit", String(options.limit));
  params.set("offset", String(options.offset));
  if (options.includeTotal) params.set("includeTotal", "true");
  return params;
}

export async function fetchQuestionsPage(
  filters: QuestionBankQueryFilters,
  pageParam: number,
  options?: { fullRows?: boolean; limit?: number }
): Promise<ListQuestionsResult & { questions: QuestionListItem[] }> {
  const limit = options?.limit ?? 40;
  const params = buildQuestionsSearchParams(filters, {
    limit,
    offset: pageParam,
    includeTotal: pageParam === 0,
    fullRows: options?.fullRows,
  });

  const res = await fetch(`/api/questions?${params.toString()}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? "Could not load questions");
  }

  return json as ListQuestionsResult & { questions: QuestionListItem[] };
}
