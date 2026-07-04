"use client";

import { useCallback, useEffect, useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { useMeQuery } from "@/hooks/data/use-me";
import { formatQuestionTextForDisplay } from "@/lib/question-text";
import {
  dashBlock,
  dashBtnPrimary,
  dashBtnSecondary,
  dashBtnSm,
  dashInput,
  dashPanel,
  dashSelect,
} from "@/lib/dashboard-ui";

type Track = "JEE" | "NEET";

type AiQuestion = {
  questionText: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard";
  sourceName?: string;
  sourceUrl?: string;
};

export default function TeacherFetchNewQuestionUsingAiPage() {
  useSetDashboardPage({
    title: "Fetch New Question Using AI",
    subtitle: "Fetch JEE/NEET-style questions from internet snippets and add them to your question bank.",
  });

  const [track, setTrack] = useState<Track>("JEE");
  const [aiSubject, setAiSubject] = useState("Maths");
  const [aiYear, setAiYear] = useState(new Date().getFullYear());
  const [aiChapter, setAiChapter] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [aiCount, setAiCount] = useState(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQuestions, setAiQuestions] = useState<AiQuestion[]>([]);
  const [selectedAiQuestionIndices, setSelectedAiQuestionIndices] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: meData } = useMeQuery();

  useEffect(() => {
    if (meData?.user?.category === "JEE" || meData?.user?.category === "NEET") {
      setTrack(meData.user.category);
    }
  }, [meData]);

  const streamSubjects: Record<Track, string[]> = {
    JEE: ["Maths", "Physics", "Chemistry"],
    NEET: ["Physics", "Chemistry", "Botany", "Zoology"],
  };

  useEffect(() => {
    const allowed = streamSubjects[track];
    if (!allowed.includes(aiSubject)) setAiSubject(allowed[0]);
  }, [aiSubject, track]);

  async function generateAiQuestions() {
    setErr(null);
    setMsg(null);
    setAiLoading(true);
    try {
      const res = await fetch("/api/teacher/question-bank/ai-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: track,
          subject: aiSubject,
          year: aiYear,
          topic: aiChapter.trim() || undefined,
          difficulty: aiDifficulty,
          count: aiCount,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Could not fetch AI questions");
        return;
      }
      const questions = (j.questions ?? []) as AiQuestion[];
      setAiQuestions(questions);
      setSelectedAiQuestionIndices([]);

      const skippedBank = Number(j.skippedDuplicateInBank ?? 0);
      const skippedBatch = Number(j.skippedDuplicateInBatch ?? 0);
      const fetchedFromAi = Number(j.fetchedFromAi ?? questions.length);
      const searchUnavailable = Boolean(j.searchUnavailable);
      const searchSource = j.searchSource as string | null | undefined;

      if (questions.length === 0) {
        if (skippedBank > 0 || skippedBatch > 0) {
          setErr(
            `All ${fetchedFromAi} fetched question${fetchedFromAi === 1 ? "" : "s"} already exist in the question bank or were duplicates in the batch. Try a different topic or chapter.`
          );
        } else {
          setMsg("No questions were returned. Try a broader topic.");
        }
        return;
      }

      const skipParts: string[] = [];
      if (skippedBank > 0) {
        skipParts.push(`${skippedBank} already in bank`);
      }
      if (skippedBatch > 0) {
        skipParts.push(`${skippedBatch} duplicate in batch`);
      }
      const skipNote = skipParts.length > 0 ? ` (${skipParts.join(", ")} skipped)` : "";
      const searchNote = searchUnavailable
        ? " Web search was unavailable; questions were generated from AI knowledge only."
        : searchSource === "openai"
          ? " Web search via OpenAI was used for reference material."
          : searchSource === "wikipedia"
            ? " Reference material from Wikipedia was used."
            : searchSource === "brave"
              ? " Web search (Brave) was used for reference snippets."
              : searchSource === "duckduckgo"
                ? " Web search was used for reference snippets."
                : "";
      setMsg(
        `Showing ${questions.length} new question${questions.length === 1 ? "" : "s"}${skipNote}.${searchNote}`
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function addGeneratedQuestionToBank(q: AiQuestion) {
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/teacher/question-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: aiSubject,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        chapter: q.chapter,
        difficulty: q.difficulty,
        year: aiYear,
        tags: ["teacher-added", "ai-generated"],
        sourceName: q.sourceName || "Teacher AI Internet Fetch",
        sourceUrl: q.sourceUrl || "dashboard/teacher/fetch-new-question-using-ai",
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setErr(
        res.status === 409
          ? "This question already exists in the question bank."
          : (j.error ?? "Could not add question")
      );
      return;
    }
    setMsg("Question added to question bank.");
  }

  async function addSelectedAiQuestionsToBank() {
    if (selectedAiQuestionIndices.length === 0) {
      setErr("Select at least one fetched question.");
      return;
    }
    setErr(null);
    setMsg(null);

    let added = 0;
    let skipped = 0;
    for (const idx of selectedAiQuestionIndices) {
      const q = aiQuestions[idx];
      if (!q) continue;
      const res = await fetch("/api/teacher/question-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: aiSubject,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          chapter: q.chapter,
          difficulty: q.difficulty,
          year: aiYear,
          tags: ["teacher-added", "ai-internet-fetch"],
          sourceName: q.sourceName || "Teacher AI Internet Fetch",
          sourceUrl: q.sourceUrl || "dashboard/teacher/fetch-new-question-using-ai",
        }),
      });
      if (res.ok) added += 1;
      else if (res.status === 409) skipped += 1;
    }
    const skipNote = skipped > 0 ? ` ${skipped} skipped (already in bank).` : "";
    setMsg(`${added} selected question${added === 1 ? "" : "s"} added to question bank.${skipNote}`);
  }

  return (
      <div className={dashPanel}>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs text-[var(--muted)]">
            Subject
            <select
              className={`${dashSelect} mt-1 w-full`}
              value={aiSubject}
              onChange={(e) => setAiSubject(e.target.value)}
            >
              {streamSubjects[track].map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Year
            <input
              className={`${dashSelect} mt-1 w-full`}
              type="number"
              min={2000}
              max={2100}
              value={aiYear}
              onChange={(e) => setAiYear(Number(e.target.value || new Date().getFullYear()))}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Chapter / Topic
            <input
              className={`${dashSelect} mt-1 w-full`}
              placeholder="Optional"
              value={aiChapter}
              onChange={(e) => setAiChapter(e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Difficulty
            <select
              className={`${dashSelect} mt-1 w-full`}
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as "easy" | "medium" | "hard")}
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
          <label className="text-xs text-[var(--muted)]">
            Question Count
            <input
              className={`${dashInput} mt-1`}
              type="number"
              min={1}
              max={10}
              value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value || 1))}
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={dashBtnPrimary}
            onClick={() => void generateAiQuestions()}
            disabled={aiLoading}
          >
            {aiLoading ? "Fetching..." : "[AI] Fetch Questions"}
          </button>
          <button
            type="button"
            className={dashBtnSecondary}
            disabled={selectedAiQuestionIndices.length === 0}
            onClick={() => void addSelectedAiQuestionsToBank()}
          >
            Add selected to Question Bank
          </button>
        </div>

        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}

        {aiQuestions.length > 0 ? (
          <div className="mt-4 max-h-[65vh] space-y-2 overflow-auto pr-1">
            {aiQuestions.map((q, idx) => (
              <div key={`${q.questionText}-${idx}`} className={dashBlock}>
                <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAiQuestionIndices.includes(idx)}
                      onChange={(e) =>
                        setSelectedAiQuestionIndices((prev) =>
                          e.target.checked ? [...prev, idx] : prev.filter((v) => v !== idx)
                        )
                      }
                    />
                    Select
                  </label>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">
                    {q.difficulty}
                  </span>
                </div>
                <p className="text-sm">{formatQuestionTextForDisplay(q.questionText)}</p>
                <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                  {q.options.map((o, oIdx) => (
                    <li key={`${o}-${oIdx}`}>
                      ({String.fromCharCode(65 + oIdx)}) {formatQuestionTextForDisplay(o)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">
                  Correct: <strong>{q.correctAnswer}</strong>
                </p>
                {q.sourceUrl ? (
                  <a
                    className="mt-1 inline-block text-xs text-[var(--accent)] underline"
                    href={q.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source: {q.sourceName || q.sourceUrl}
                  </a>
                ) : null}
                <div className="mt-2">
                  <button
                    type="button"
                    className={dashBtnSm}
                    onClick={() => void addGeneratedQuestionToBank(q)}
                  >
                    Add this question
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
  );
}
