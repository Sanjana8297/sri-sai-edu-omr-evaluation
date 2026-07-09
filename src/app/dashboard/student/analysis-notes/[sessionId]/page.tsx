"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { ExamPaperAnalysis, type ExamAnalysisDetail } from "@/components/reports/ExamPaperAnalysis";
import { collectIncorrectQuestions } from "@/lib/analysis-notes-utils";

const EXPLANATIONS_CACHE_PREFIX = "analysis-notes-explanations:v6:";

type ExamDetail = ExamAnalysisDetail;

function readExplanationCache(sessionId: string): Record<string, string> {
  try {
    const cached = sessionStorage.getItem(`${EXPLANATIONS_CACHE_PREFIX}${sessionId}`);
    if (!cached) return {};
    const parsed = JSON.parse(cached) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeExplanationCache(sessionId: string, explanations: Record<string, string>) {
  try {
    sessionStorage.setItem(`${EXPLANATIONS_CACHE_PREFIX}${sessionId}`, JSON.stringify(explanations));
  } catch {
    // ignore quota errors
  }
}

export default function StudentAnalysisNoteDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = decodeURIComponent(params.sessionId ?? "");

  const [detail, setDetail] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explanationLoadingKeys, setExplanationLoadingKeys] = useState<Record<string, boolean>>({});
  const [explanationsError, setExplanationsError] = useState<string | null>(null);
  const generationRunRef = useRef(0);

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

  const loadExplanationsProgressively = useCallback(
    async (examDetail: ExamDetail) => {
      if (!sessionId) return;

      const runId = ++generationRunRef.current;
      const wrongQuestions = collectIncorrectQuestions({
        questionContent: examDetail.exam.questionContent,
        keyContent: examDetail.exam.keyContent,
        submittedAnswers: examDetail.submittedAnswers,
      });

      if (wrongQuestions.length === 0) {
        setExplanations({});
        setExplanationLoadingKeys({});
        return;
      }

      const cached = readExplanationCache(sessionId);
      const pending = wrongQuestions.filter((q) => !cached[q.key]);

      setExplanations(cached);
      setExplanationsError(null);
      setExplanationLoadingKeys(
        Object.fromEntries(pending.map((q) => [q.key, true]))
      );

      if (pending.length === 0) return;

      const accumulated = { ...cached };

      for (const question of pending) {
        if (generationRunRef.current !== runId) return;

        try {
          const res = await fetch(
            `/api/student/exams/session/${encodeURIComponent(sessionId)}/explanations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionKey: question.key }),
            }
          );
          const json = await res.json();

          if (generationRunRef.current !== runId) return;

          if (!res.ok) {
            setExplanationsError(json.error ?? "Could not generate AI explanation");
            setExplanationLoadingKeys((prev) => {
              const next = { ...prev };
              delete next[question.key];
              return next;
            });
            continue;
          }

          const text = json.explanations?.[question.key] as string | undefined;
          if (text) {
            accumulated[question.key] = text;
            setExplanations((prev) => ({ ...prev, [question.key]: text }));
            writeExplanationCache(sessionId, accumulated);
          }
        } catch {
          if (generationRunRef.current !== runId) return;
          setExplanationsError("Network error while generating explanations.");
        } finally {
          if (generationRunRef.current !== runId) return;
          setExplanationLoadingKeys((prev) => {
            const next = { ...prev };
            delete next[question.key];
            return next;
          });
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (detail) {
      void loadExplanationsProgressively(detail);
    }
    return () => {
      generationRunRef.current += 1;
    };
  }, [detail, loadExplanationsProgressively]);

  useSetDashboardPage({
    title: "Analysis Notes",
    subtitle: "Question-wise review with AI explanations for incorrect answers",
  });

  return (
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      ) : null}

      {detail ? (
        <ExamPaperAnalysis
          detail={detail}
          explanations={explanations}
          explanationLoadingKeys={explanationLoadingKeys}
          explanationsError={explanationsError}
        />
      ) : null}
    </div>
  );
}
