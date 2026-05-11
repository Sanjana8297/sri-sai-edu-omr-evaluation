"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

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

  const loadMe = useCallback(async () => {
    const u = await fetch("/api/me").then((r) => r.json());
    if (u.user?.category === "JEE" || u.user?.category === "NEET") {
      setTrack(u.user.category);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

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
      setAiQuestions(j.questions ?? []);
      setSelectedAiQuestionIndices([]);
      setMsg(`Fetched ${j.questions?.length ?? 0} questions.`);
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
      setErr(j.error ?? "Could not add question");
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
    }
    setMsg(`${added} selected questions added to question bank.`);
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Fetch New Question Using AI"
      subtitle="Fetch JEE/NEET-style questions from internet snippets and add them to your question bank."
      navItems={teacherNavItems}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs text-[var(--muted)]">
            Subject
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Optional"
              value={aiChapter}
              onChange={(e) => setAiChapter(e.target.value)}
            />
          </label>
          <label className="text-xs text-[var(--muted)]">
            Difficulty
            <select
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
            onClick={() => void generateAiQuestions()}
            disabled={aiLoading}
          >
            {aiLoading ? "Fetching..." : "[AI] Fetch Questions"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
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
              <div key={`${q.questionText}-${idx}`} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
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
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
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
    </DashboardShell>
  );
}
