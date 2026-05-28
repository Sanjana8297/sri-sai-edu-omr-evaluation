import type { DifficultyFilter, JeeExamType, QuestionBankFilters, QuestionTypeFilter } from "./types";

export function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null || value === "") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function parseJeeExamType(value: string | null): JeeExamType | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "mains") return "mains";
  if (normalized === "advanced") return "advanced";
  return undefined;
}

export function parseQuestionTypeFilter(value: string | null): QuestionTypeFilter | undefined {
  if (!value) return undefined;
  const n = value.trim().toLowerCase();
  if (n === "mcq") return "mcq";
  if (n === "numerical" || n === "numericals") return "numerical";
  return undefined;
}

export function parseFiltersFromSearchParams(
  searchParams: URLSearchParams,
  exam: string
): QuestionBankFilters {
  const difficultyRaw = searchParams.get("difficulty")?.trim().toLowerCase();
  const difficulty =
    difficultyRaw === "easy" || difficultyRaw === "medium" || difficultyRaw === "hard"
      ? (difficultyRaw as DifficultyFilter)
      : undefined;

  const yearText = searchParams.get("year")?.trim();
  const year = yearText ? Number(yearText) : undefined;

  return {
    exam,
    subject: searchParams.get("subject")?.trim() || undefined,
    chapter: searchParams.get("chapter")?.trim() || undefined,
    difficulty,
    year: year != null && !Number.isNaN(year) ? year : undefined,
    search: searchParams.get("search")?.trim() || undefined,
    important: parseBoolParam(searchParams.get("important")),
    repeated: parseBoolParam(searchParams.get("repeated")),
    jeeExamType: parseJeeExamType(searchParams.get("jeeExamType")),
    questionType: parseQuestionTypeFilter(searchParams.get("questionType")),
  };
}

export function parseFiltersFromBody(body: Record<string, unknown>, exam: string): QuestionBankFilters {
  const difficulty = body.difficulty;
  const year = body.year;

  return {
    exam,
    subject: typeof body.subject === "string" ? body.subject.trim() || undefined : undefined,
    chapter: typeof body.chapter === "string" ? body.chapter.trim() || undefined : undefined,
    difficulty:
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
        ? difficulty
        : undefined,
    year: typeof year === "number" && !Number.isNaN(year) ? year : undefined,
    search: typeof body.search === "string" ? body.search.trim() || undefined : undefined,
    important: typeof body.important === "boolean" ? body.important : undefined,
    repeated: typeof body.repeated === "boolean" ? body.repeated : undefined,
    jeeExamType:
      body.jeeExamType === "mains" || body.jeeExamType === "advanced" ? body.jeeExamType : undefined,
    questionType:
      body.questionType === "mcq" || body.questionType === "numerical" ? body.questionType : undefined,
  };
}
