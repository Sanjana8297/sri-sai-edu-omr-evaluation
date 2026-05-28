export type JeeExamType = "mains" | "advanced";
export type QuestionTypeFilter = "mcq" | "numerical";
export type DifficultyFilter = "easy" | "medium" | "hard";

export type QuestionBankFilters = {
  exam: string;
  subject?: string;
  chapter?: string;
  difficulty?: DifficultyFilter;
  year?: number;
  search?: string;
  important?: boolean;
  repeated?: boolean;
  jeeExamType?: JeeExamType;
  questionType?: QuestionTypeFilter;
};

export type QuestionListItem = {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: string | null;
  preview: string;
  has_options: boolean;
  is_important: boolean;
  is_repeated: boolean;
  repetition_count: number;
};

export type QuestionDetail = {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  difficulty: string | null;
  tags: unknown;
  repetition_count: number;
  is_repeated: boolean;
  is_important: boolean;
};

export type ListQuestionsInput = QuestionBankFilters & {
  limit?: number;
  offset?: number;
  includeTotal?: boolean;
  /** When true, returns full rows (legacy API shape). Default false = lightweight list. */
  fullRows?: boolean;
};

export type ListQuestionsResult = {
  questions: QuestionListItem[] | QuestionDetail[];
  total: number | null;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type ExportFormat = "csv" | "pdf";
