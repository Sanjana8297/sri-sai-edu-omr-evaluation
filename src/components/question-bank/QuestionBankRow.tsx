"use client";

import { memo, useState } from "react";
import type { QuestionListItem } from "@/lib/questions/types";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import { useQuestionDetail } from "@/hooks/questions/use-question-detail";

type Props = {
  item: QuestionListItem;
  index: number;
};

function QuestionBankRowInner({ item, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail, isLoading, isError } = useQuestionDetail(expanded ? item.id : null);

  const previewText = formatQuestionTextForDisplay(item.preview);
  const stemText =
    expanded && detail ? formatQuestionTextForDisplay(detail.question_text) : previewText;

  return (
    <article className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">#{index + 1}</span>
        {item.year ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.year}</span> : null}
        {item.chapter ? <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.chapter}</span> : null}
        {item.difficulty ? (
          <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">{item.difficulty}</span>
        ) : null}
        {item.is_important ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">important</span>
        ) : null}
        {item.is_repeated ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
            repeated x{item.repetition_count}
          </span>
        ) : null}
        {item.has_options ? (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--muted)]">MCQ</span>
        ) : null}
      </div>
      <p className={`mt-2 text-sm ${expanded ? "whitespace-pre-wrap" : "line-clamp-3"}`}>{stemText}</p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide details" : "View full question"}
      </button>
      {expanded ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          {isLoading ? <p className="text-xs text-[var(--muted)]">Loading…</p> : null}
          {isError ? <p className="text-xs text-red-600">Could not load details.</p> : null}
          {detail ? (
            <>
              {detail.options && detail.options.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                  {detail.options.map((opt, optIdx) => (
                    <li key={`${detail.id}-opt-${optIdx}`}>
                      ({String.fromCharCode(65 + optIdx)}) {formatQuestionTextForDisplay(opt)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {detail.correct_answer ? (
                <p className="mt-2 text-xs">
                  Correct answer: <strong>{detail.correct_answer}</strong>
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const QuestionBankRow = memo(QuestionBankRowInner);
