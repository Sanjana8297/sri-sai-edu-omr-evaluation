"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import {
  buildFilteredQuestionBankExportCsv,
  buildQuestionBankTemplateCsv,
  downloadTextFile,
  parseQuestionBankCsvToObjects,
  type QuestionBankExportRow,
} from "@/lib/question-bank-csv";
import { downloadQuestionBankFilteredPdf } from "@/lib/question-bank-pdf";
import { formatQuestionTextForDisplay } from "@/lib/question-text";

type Track = "JEE" | "NEET";

type QuestionBankItem = {
  id: number;
  exam: string;
  subject: string;
  year: number | null;
  chapter: string | null;
  difficulty: "easy" | "medium" | "hard" | null;
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  source_name: string;
  source_url: string;
  tags: unknown;
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
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const downloadTemplate = useCallback(() => {
    setImportErr(null);
    const csv = buildQuestionBankTemplateCsv(subjectFromUrl || "Physics");
    downloadTextFile(
      `question-bank-import-template-${(subjectFromUrl || "subject").replace(/\s+/g, "-")}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  }, [subjectFromUrl]);

  const exportFilteredCsv = useCallback(() => {
    setImportErr(null);
    if (questions.length === 0) {
      setImportErr("Nothing to export for the current filters.");
      return;
    }
    const rows: QuestionBankExportRow[] = questions.map((q) => ({
      id: q.id,
      exam: q.exam ?? "",
      subject: q.subject,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      chapter: q.chapter,
      difficulty: q.difficulty,
      year: q.year,
      tags: q.tags ?? null,
      source_name: q.source_name ?? "",
      source_url: q.source_url ?? "",
      is_important: q.is_important,
      is_repeated: q.is_repeated,
      repetition_count: q.repetition_count,
    }));
    const csv = buildFilteredQuestionBankExportCsv(rows);
    downloadTextFile(
      `question-bank-${(subjectFromUrl || "export").replace(/\s+/g, "-")}-filtered-export.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  }, [questions, subjectFromUrl]);

  const exportFilteredPdf = useCallback(() => {
    setImportErr(null);
    if (questions.length === 0) {
      setImportErr("Nothing to export for the current filters.");
      return;
    }
    const rows: QuestionBankExportRow[] = questions.map((q) => ({
      id: q.id,
      exam: q.exam ?? "",
      subject: q.subject,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      chapter: q.chapter,
      difficulty: q.difficulty,
      year: q.year,
      tags: q.tags ?? null,
      source_name: q.source_name ?? "",
      source_url: q.source_url ?? "",
      is_important: q.is_important,
      is_repeated: q.is_repeated,
      repetition_count: q.repetition_count,
    }));
    try {
      downloadQuestionBankFilteredPdf(
        rows,
        {
          track,
          subject: subjectFromUrl,
          search,
          difficulty,
          year,
          chapter,
          importantOnly,
          repeatedOnly,
          jeeExamType,
        },
        `question-bank-${(subjectFromUrl || "export").replace(/\s+/g, "-")}-filtered-export.pdf`
      );
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Could not build PDF.");
    }
  }, [
    chapter,
    difficulty,
    importantOnly,
    jeeExamType,
    questions,
    repeatedOnly,
    search,
    subjectFromUrl,
    track,
    year,
  ]);

  const runBulkImport = useCallback(
    async (file: File) => {
      setImportMsg(null);
      setImportErr(null);
      const text = await file.text();
      let parsed;
      try {
        parsed = parseQuestionBankCsvToObjects(text);
      } catch (e) {
        setImportErr(e instanceof Error ? e.message : "Could not parse CSV.");
        return;
      }
      if (parsed.length === 0) {
        setImportErr("No data rows found after the header.");
        return;
      }

      setImporting(true);
      try {
        const res = await fetch("/api/teacher/question-bank/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            defaultSubject: subjectFromUrl,
            rows: parsed,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setImportErr(json.error ?? "Bulk import failed.");
          return;
        }
        const errTail =
          Array.isArray(json.errors) && json.errors.length > 0
            ? ` First issues: ${json.errors
                .slice(0, 3)
                .map((e: { index: number; message: string }) => `row ${e.index + 1}: ${e.message}`)
                .join("; ")}.`
            : "";
        setImportMsg(
          `Done. Inserted ${json.inserted}, skipped duplicates ${json.skippedDuplicate}, failed ${json.failed}.${errTail}`
        );
        await loadQuestions();
      } catch {
        setImportErr("Network error while importing.");
      } finally {
        setImporting(false);
      }
    },
    [loadQuestions, subjectFromUrl]
  );

  const onCsvFileSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setImportErr("Please choose a .csv file.");
        return;
      }
      void runBulkImport(file);
    },
    [runBulkImport]
  );

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
          <>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Bulk import & export (CSV / PDF)</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Download the CSV template, fill rows, then import. Export the current filter view as CSV or a
                    printable PDF. Duplicates are skipped via content hash. Subject column can be left blank when
                    importing from this page — it defaults to <strong>{subjectFromUrl}</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    Download CSV template
                  </button>
                  <button
                    type="button"
                    onClick={exportFilteredCsv}
                    disabled={loading || questions.length === 0}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export filtered CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportFilteredPdf}
                    disabled={loading || questions.length === 0}
                    className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export filtered PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {importing ? "Importing…" : "Import CSV"}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={onCsvFileSelected}
                  />
                </div>
              </div>
              {importMsg ? <p className="mt-3 text-sm text-emerald-700">{importMsg}</p> : null}
              {importErr ? <p className="mt-3 text-sm text-red-600">{importErr}</p> : null}
            </div>

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
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
