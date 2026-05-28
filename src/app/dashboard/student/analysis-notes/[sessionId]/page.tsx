"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";
import { parseAnswerKeyByQuestion, parseQuestionPaperContent } from "@/lib/exam-paper-parser";

type ExamDetail = {
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

function normalizeAnswer(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function optionLabel(optionText: string): string {
  const m = optionText.match(/^([A-H])[\.\)]/i);
  return m?.[1]?.toUpperCase() ?? "";
}

export default function StudentAnalysisNoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = decodeURIComponent(params.sessionId ?? "");

  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!sessionId) {
      setError("Invalid exam session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/student/exams/session/${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load exam analysis");
        return;
      }
      setDetail(json.session as ExamDetail);
    } catch {
      setError("Network error while loading exam analysis.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const parsedSections = useMemo(
    () => (detail ? parseQuestionPaperContent(detail.exam.questionContent).sections : []),
    [detail]
  );
  const answerKey = useMemo(
    () => (detail ? parseAnswerKeyByQuestion(detail.exam.keyContent) : {}),
    [detail]
  );

  return (
    <DashboardShell
      badge="Student"
      title="Analysis Notes"
      subtitle="Question-wise review of your submitted exam"
      navItems={studentNavItems}
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push("/dashboard/student/analysis-notes")}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to analysis notes
        </button>

        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
            Loading paper analysis...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {detail ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="text-base font-semibold">
              {detail.exam.title} · Detailed Analysis
            </h3>
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
                      const selected = normalizeAnswer(detail.submittedAnswers[qKey]);
                      const expected = normalizeAnswer(answerKey[qKey]);
                      const correct = selected && expected && selected === expected;

                      return (
                        <article key={q.id} className="rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
                          <p className="text-sm font-medium">
                            Q{q.indexInSection}. {q.prompt}
                          </p>

                          {q.options.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-sm">
                              {q.options.map((opt) => {
                                const label = optionLabel(opt);
                                const isChosen = selected === label;
                                const isCorrect = expected === label;
                                return (
                                  <li
                                    key={`${q.id}-${opt}`}
                                    className={[
                                      "rounded px-2 py-1",
                                      isCorrect ? "bg-emerald-100 text-emerald-800" : "",
                                      isChosen && !isCorrect ? "bg-red-100 text-red-700" : "",
                                      !isChosen && !isCorrect ? "text-[var(--foreground)]" : "",
                                    ].join(" ")}
                                  >
                                    {opt}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}

                          <p className="mt-2 text-xs text-[var(--muted)]">
                            Your answer:{" "}
                            <strong className={correct ? "text-emerald-700" : "text-red-700"}>
                              {selected || "Not answered"}
                            </strong>
                            {" · "}
                            Correct answer: <strong className="text-emerald-700">{expected || "N/A"}</strong>
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

