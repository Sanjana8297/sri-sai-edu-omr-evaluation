"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

type Track = "JEE" | "NEET";

type QuestionBankItem = {
  id: number;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  repetition_count: number;
  is_repeated: boolean;
  is_important: boolean;
};

const SUBJECTS_BY_TRACK: Record<Track, string[]> = {
  JEE: ["Maths", "Physics", "Chemistry"],
  NEET: ["Physics", "Chemistry", "Botany", "Zoology"],
};

export default function TeacherSubjectQuestionBankPage() {
  const params = useParams<{ subject: string }>();
  const subjectFromUrl = decodeURIComponent(params.subject ?? "");

  const [track, setTrack] = useState<Track>("JEE");
  const [trackLoaded, setTrackLoaded] = useState(false);
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"All" | "easy" | "medium" | "hard">("All");
  const [year, setYear] = useState("");
  const [chapter, setChapter] = useState("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [repeatedOnly, setRepeatedOnly] = useState(false);
  const [jeeExamType, setJeeExamType] = useState<"All" | "mains" | "advanced">("All");

  const allowedSubjects = useMemo(() => SUBJECTS_BY_TRACK[track], [track]);
  const subjectAllowed = allowedSubjects.includes(subjectFromUrl);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      const json = await res.json();
      if (res.ok && (json.user?.category === "JEE" || json.user?.category === "NEET")) {
        setTrack(json.user.category);
      }
    } finally {
      setTrackLoaded(true);
    }
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!subjectFromUrl) return;
    setLoading(true);
    setError(null);
    setQuestions([]);

    try {
      const pageSize = 200;
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      const all: QuestionBankItem[] = [];

      while (offset < total) {
        const paramsObj = new URLSearchParams({
          subject: subjectFromUrl,
          limit: String(pageSize),
          offset: String(offset),
        });
        if (search.trim()) paramsObj.set("search", search.trim());
        if (difficulty !== "All") paramsObj.set("difficulty", difficulty);
        if (year.trim()) paramsObj.set("year", year.trim());
        if (chapter.trim()) paramsObj.set("chapter", chapter.trim());
        if (importantOnly) paramsObj.set("important", "true");
        if (repeatedOnly) paramsObj.set("repeated", "true");
        if (track === "JEE" && jeeExamType !== "All") paramsObj.set("jeeExamType", jeeExamType);

        const res = await fetch(`/api/teacher/question-bank?${paramsObj.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? "Could not load questions");
        }

        const batch = (json.questions ?? []) as QuestionBankItem[];
        total = Number(json.total ?? batch.length);
        all.push(...batch);
        offset += batch.length;

        if (batch.length === 0) break;
      }

      setQuestions(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load questions");
    } finally {
      setLoading(false);
    }
  }, [chapter, difficulty, importantOnly, repeatedOnly, search, subjectFromUrl, track, year, jeeExamType]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!trackLoaded || !subjectAllowed) return;
    void loadQuestions();
  }, [
    trackLoaded,
    subjectAllowed,
    loadQuestions,
    search,
    difficulty,
    year,
    chapter,
    importantOnly,
    repeatedOnly,
    jeeExamType,
  ]);

  return (
    <DashboardShell
      badge="Teacher"
      title={`${subjectFromUrl || "Subject"} Question Bank`}
      subtitle="Questions stored in the database for this subject."
      navItems={teacherNavItems}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--muted)]">
              Track: {track} · Allowed subjects: {allowedSubjects.join(", ")}
            </p>
            <Link className="text-sm text-[var(--accent)] underline" href="/dashboard/teacher/question-bank">
              Back to subjects
            </Link>
          </div>
        </div>

        {!trackLoaded ? <p className="text-sm text-[var(--muted)]">Loading your track...</p> : null}

        {trackLoaded && !subjectAllowed ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm text-red-700">
              This subject is not available for your track. Please choose one from the Question Bank subject cards.
            </p>
          </div>
        ) : null}

        {trackLoaded && subjectAllowed ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="grid gap-2 md:grid-cols-5">
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Search keywords"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "All" | "easy" | "medium" | "hard")}
              >
                <option value="All">All difficulties</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Year (e.g. 2024)"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <input
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                placeholder="Chapter"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              />
              {track === "JEE" ? (
                <select
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={jeeExamType}
                  onChange={(e) => setJeeExamType(e.target.value as "All" | "mains" | "advanced")}
                >
                  <option value="All">All exam types</option>
                  <option value="mains">JEE Mains</option>
                  <option value="advanced">JEE Advanced</option>
                </select>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={importantOnly}
                  onChange={(e) => setImportantOnly(e.target.checked)}
                />
                Important only
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={repeatedOnly}
                  onChange={(e) => setRepeatedOnly(e.target.checked)}
                />
                Repeated only
              </label>
            </div>

            {loading ? <p className="mt-3 text-sm text-[var(--muted)]">Loading questions...</p> : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {!loading && !error && questions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No questions found for this subject with current filters.</p>
            ) : null}

            {!loading && questions.length > 0 ? (
              <>
                <p className="mt-3 text-sm text-[var(--muted)]">Total: {questions.length} questions</p>
                <div className="mt-3 max-h-[65vh] space-y-2 overflow-auto pr-1">
                  {questions.map((item, idx) => (
                    <article key={item.id} className="rounded-lg border border-[var(--border)] p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5">#{idx + 1}</span>
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
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">
                        {formatQuestionTextForDisplay(item.question_text)}
                      </p>
                      {item.options && item.options.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                          {item.options.map((opt, optIdx) => (
                            <li key={`${item.id}-opt-${optIdx}`}>
                              <span className="whitespace-pre-wrap">
                                ({String.fromCharCode(65 + optIdx)}) {formatQuestionTextForDisplay(opt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {item.correct_answer ? (
                        <p className="mt-2 text-xs">
                          Correct answer: <strong>{item.correct_answer}</strong>
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
