import type { QuestionBankFilters } from "./types";
import { downloadQuestionBankFilteredPdf } from "@/lib/question-bank-pdf";
import type { QuestionBankExportRow } from "@/lib/question-bank-csv";

export type QuestionExportVariant = "filtered" | "full-bank";

export function buildFullBankFilters(exam: string, subject: string): QuestionBankFilters {
  return { exam, subject };
}

export async function exportQuestionsFromServer(
  filters: QuestionBankFilters,
  format: "csv" | "pdf",
  subjectLabel: string,
  variant: QuestionExportVariant = "filtered"
): Promise<void> {
  const res = await fetch("/api/questions/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...filters, format, subjectLabel }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: string }).error ?? "Export failed");
  }

  const slug = subjectLabel.replace(/\s+/g, "-");
  const isFullBank = variant === "full-bank";

  if (format === "csv") {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isFullBank
      ? `question-bank-${slug}-full-bank.csv`
      : `question-bank-${slug}-filtered-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const json = (await res.json()) as { rows: QuestionBankExportRow[]; subjectLabel: string };
  downloadQuestionBankFilteredPdf(
    json.rows,
    {
      track: filters.exam,
      subject: json.subjectLabel || subjectLabel,
      search: isFullBank ? "" : (filters.search ?? ""),
      difficulty: isFullBank ? "All" : (filters.difficulty ?? "All"),
      year: isFullBank ? "" : filters.year != null ? String(filters.year) : "",
      chapter: isFullBank ? "" : (filters.chapter ?? ""),
      importantOnly: isFullBank ? false : filters.important === true,
      repeatedOnly: isFullBank ? false : filters.repeated === true,
      jeeExamType: isFullBank ? "All" : (filters.jeeExamType ?? "All"),
    },
    isFullBank
      ? `question-bank-${slug}-full-bank.pdf`
      : `question-bank-${slug}-filtered-export.pdf`
  );
}
