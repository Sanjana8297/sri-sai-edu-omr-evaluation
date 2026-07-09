"use client";

import { useMemo } from "react";
import {
  parseQuestionPaperContentWithOptions,
  normalizeOptionAnswerToLetter,
} from "@/lib/exam-paper-parser";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

export type ExamAnalysisDetail = {
  id: string;
  status: "SUBMITTED" | "AUTO_SUBMITTED";
  submittedAt: string | null;
  scoreObtained: number;
  scoreMax: number;
  submittedAnswers: Record<string, string>;
  exam: {
    id: string;
    title: string;
    category: string;
    questionContent: string;
    keyContent: string;
  };
};

function normalizeAnswer(value: string | undefined, asMcqLetter: boolean): string {
  if (!value?.trim()) return "";
  return asMcqLetter ? normalizeOptionAnswerToLetter(value) : value.trim();
}

function optionLabel(optionText: string): string {
  const m = optionText.match(/^([A-H])[\.\)]/i);
  return m?.[1]?.toUpperCase() ?? "";
}

/**
 * Question-wise review of a submitted exam session. Shared between the student
 * "Analysis Notes" feature and the admin Result & Score Reports student view.
 */
export function ExamPaperAnalysis({
  detail,
  explanations,
  explanationLoadingKeys,
  explanationsError,
}: {
  detail: ExamAnalysisDetail;
  explanations?: Record<string, string>;
  explanationLoadingKeys?: Record<string, boolean>;
  explanationsError?: string | null;
}) {
  const showAiExplanations =
    explanations !== undefined ||
    Boolean(explanationLoadingKeys && Object.keys(explanationLoadingKeys).length > 0) ||
    Boolean(explanationsError);
  const { sections: parsedSections, answerKey } = useMemo(
    () => parseQuestionPaperContentWithOptions(detail.exam.questionContent, detail.exam.keyContent),
    [detail]
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="text-base font-semibold">{detail.exam.title} · Detailed Analysis</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {detail.exam.category} · {detail.status} · Submitted:{" "}
        {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "N/A"}
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Score: {detail.scoreObtained}/{detail.scoreMax}
      </p>

      <div className="mt-4 space-y-4">
        {parsedSections.map((section) => (
          <section
            key={section.name}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
          >
            <h4 className="font-semibold">{section.name}</h4>
            <div className="mt-3 space-y-3">
              {section.questions.map((q) => {
                const qKey = `${section.name}::${q.indexInSection}`;
                const isMcq = q.options.length > 0;
                const selected = normalizeAnswer(detail.submittedAnswers[qKey], isMcq);
                const expected = normalizeAnswer(answerKey[qKey], isMcq);
                const correct = selected && expected && selected === expected;

                return (
                  <article key={q.id} className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
                    <p className="whitespace-pre-wrap text-sm font-medium">
                      Q{q.indexInSection}. {formatQuestionTextForDisplay(q.prompt)}
                    </p>

                    {q.options.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {q.options.map((opt) => {
                          const label = optionLabel(opt);
                          const isChosen = selected === label;
                          const isCorrect = expected === label;
                          const displayOpt = formatQuestionTextForDisplay(opt);
                          return (
                            <li
                              key={`${q.id}-${opt}`}
                              className={[
                                "rounded px-2 py-1 whitespace-pre-wrap",
                                isCorrect ? "bg-emerald-100 text-emerald-800" : "",
                                isChosen && !isCorrect ? "bg-red-100 text-red-700" : "",
                                !isChosen && !isCorrect ? "text-[var(--foreground)]" : "",
                              ].join(" ")}
                            >
                              {displayOpt}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Answer:{" "}
                      <strong className={correct ? "text-emerald-700" : "text-red-700"}>
                        {selected || "Not answered"}
                      </strong>
                      {" · "}
                      Correct answer: <strong className="text-emerald-700">{expected || "N/A"}</strong>
                    </p>

                    {!correct && showAiExplanations ? (
                      <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
                          AI explanation
                        </p>
                        {explanationLoadingKeys?.[qKey] ? (
                          <p className="mt-1 text-sm text-violet-900">Generating explanation…</p>
                        ) : explanationsError && !explanations?.[qKey] ? (
                          <p className="mt-1 text-sm text-red-700">{explanationsError}</p>
                        ) : explanations?.[qKey] ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-violet-950">
                            {explanations[qKey]}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-violet-900">
                            No explanation available for this question.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
