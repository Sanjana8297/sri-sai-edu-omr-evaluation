import type { QuestionBankFilters } from "@/lib/questions/types";

export type QuestionBankQueryFilters = Omit<QuestionBankFilters, "exam"> & {
  exam?: string;
};

/** Stable serialization so filter changes always invalidate list + count queries. */
export function serializeQuestionFilters(filters: QuestionBankQueryFilters): string {
  return JSON.stringify({
    exam: filters.exam ?? "",
    subject: filters.subject ?? "",
    chapter: filters.chapter ?? "",
    difficulty: filters.difficulty ?? "",
    year: filters.year ?? "",
    search: filters.search ?? "",
    important: filters.important ?? "",
    repeated: filters.repeated ?? "",
    jeeExamType: filters.jeeExamType ?? "",
    questionType: filters.questionType ?? "",
  });
}

export function hasActiveQuestionFilters(filters: QuestionBankQueryFilters): boolean {
  return Boolean(
    filters.search ||
      filters.chapter ||
      filters.difficulty ||
      filters.year != null ||
      filters.important === true ||
      filters.repeated === true ||
      filters.jeeExamType ||
      filters.questionType
  );
}

export const questionKeys = {
  all: ["questions"] as const,
  lists: () => [...questionKeys.all, "list"] as const,
  list: (filters: QuestionBankQueryFilters) =>
    [...questionKeys.lists(), serializeQuestionFilters(filters)] as const,
  listPage: (filters: QuestionBankQueryFilters, page: number) =>
    [...questionKeys.list(filters), "page", page] as const,
  listTotal: (filters: QuestionBankQueryFilters) =>
    [...questionKeys.list(filters), "total"] as const,
  detail: (id: number) => [...questionKeys.all, "detail", id] as const,
};
