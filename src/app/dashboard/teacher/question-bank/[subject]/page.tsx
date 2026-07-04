"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { QuestionBankFilters, type FilterState } from "@/components/question-bank/QuestionBankFilters";
import { QuestionBankPageList } from "@/components/question-bank/QuestionBankPageList";
import { QuestionBankPagination } from "@/components/question-bank/QuestionBankPagination";
import { SUBJECTS_BY_TRACK, type TeacherTrack } from "@/lib/dashboard-nav";
import { parseQuestionBankCsvToObjects } from "@/lib/question-bank-csv";
import { buildFullBankFilters, exportQuestionsFromServer } from "@/lib/questions/export-client";
import type { QuestionBankFilters as QuestionBankQueryFilters } from "@/lib/questions/types";
import { useDebouncedValue } from "@/hooks/questions/use-debounced-value";
import {
  QUESTION_BANK_PAGE_SIZE,
  useQuestionBankPaged,
} from "@/hooks/questions/use-question-bank-paged";
import { hasActiveQuestionFilters, questionKeys } from "@/hooks/questions/keys";
import { useQuestionBankFilteredTotal } from "@/hooks/questions/use-question-bank-total";
import { useMeQuery } from "@/hooks/data/use-me";
import { dashBtnSecondary } from "@/lib/dashboard-ui";

export default function TeacherSubjectQuestionBankPage() {
  const params = useParams<{ subject: string }>();
  const subjectFromUrl = decodeURIComponent(params.subject ?? "");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [track, setTrack] = useState<TeacherTrack>("JEE");
  const [trackLoaded, setTrackLoaded] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({
    search: "",
    difficulty: "All",
    year: "",
    chapter: "",
    importantOnly: false,
    repeatedOnly: false,
    jeeExamType: "All",
  });
  const debouncedSearch = useDebouncedValue(filterState.search, 300);

  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingFullBank, setExportingFullBank] = useState(false);
  const [page, setPage] = useState(1);
  const listTopRef = useRef<HTMLDivElement>(null);

  const allowedSubjects = useMemo(() => SUBJECTS_BY_TRACK[track], [track]);
  const subjectAllowed = allowedSubjects.includes(subjectFromUrl);

  const queryFilters = useMemo(() => {
    const f: QuestionBankQueryFilters = { exam: track, subject: subjectFromUrl };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (filterState.difficulty !== "All") f.difficulty = filterState.difficulty;
    const yearNum = Number(filterState.year);
    if (filterState.year.trim() && !Number.isNaN(yearNum)) f.year = yearNum;
    if (filterState.chapter.trim()) f.chapter = filterState.chapter.trim();
    if (filterState.importantOnly) f.important = true;
    if (filterState.repeatedOnly) f.repeated = true;
    if (track === "JEE" && filterState.jeeExamType !== "All") f.jeeExamType = filterState.jeeExamType;
    return f;
  }, [track, subjectFromUrl, debouncedSearch, filterState]);

  const listEnabled = trackLoaded && subjectAllowed;
  const filtersActive = hasActiveQuestionFilters(queryFilters);

  const {
    data: pageData,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuestionBankPaged(queryFilters, page, listEnabled);

  const { data: filteredTotal, isFetching: isTotalFetching } = useQuestionBankFilteredTotal(
    queryFilters,
    listEnabled
  );

  const items = pageData?.questions ?? [];
  const total = filteredTotal ?? null;
  const totalPending = isTotalFetching && filteredTotal === undefined;
  const totalPages = total != null ? Math.max(1, Math.ceil(total / QUESTION_BANK_PAGE_SIZE)) : 1;

  useEffect(() => {
    setPage(1);
  }, [queryFilters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const goToPage = useCallback((nextPage: number) => {
    setPage(nextPage);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const { data: meData, isLoading: meLoading } = useMeQuery();

  useEffect(() => {
    if (meLoading) return;
    if (meData?.user?.category === "JEE" || meData?.user?.category === "NEET") {
      setTrack(meData.user.category);
    }
    setTrackLoaded(true);
  }, [meData, meLoading]);

  const invalidateList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: questionKeys.lists() });
  }, [queryClient]);

  const exportFilteredCsv = useCallback(async () => {
    setImportErr(null);
    setExporting(true);
    try {
      await exportQuestionsFromServer(queryFilters, "csv", subjectFromUrl, "filtered");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [queryFilters, subjectFromUrl]);

  const exportFilteredPdf = useCallback(async () => {
    setImportErr(null);
    setExporting(true);
    try {
      await exportQuestionsFromServer(queryFilters, "pdf", subjectFromUrl, "filtered");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [queryFilters, subjectFromUrl]);

  const fullBankFilters = useMemo(
    () => buildFullBankFilters(track, subjectFromUrl),
    [track, subjectFromUrl]
  );

  const exportFullBankCsv = useCallback(async () => {
    setImportErr(null);
    setExportingFullBank(true);
    try {
      await exportQuestionsFromServer(fullBankFilters, "csv", subjectFromUrl, "full-bank");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Full bank export failed");
    } finally {
      setExportingFullBank(false);
    }
  }, [fullBankFilters, subjectFromUrl]);

  const exportFullBankPdf = useCallback(async () => {
    setImportErr(null);
    setExportingFullBank(true);
    try {
      await exportQuestionsFromServer(fullBankFilters, "pdf", subjectFromUrl, "full-bank");
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : "Full bank export failed");
    } finally {
      setExportingFullBank(false);
    }
  }, [fullBankFilters, subjectFromUrl]);

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
      setImporting(true);
      try {
        const res = await fetch("/api/teacher/question-bank/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: parsed, defaultSubject: subjectFromUrl }),
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
        invalidateList();
      } catch {
        setImportErr("Network error while importing.");
      } finally {
        setImporting(false);
      }
    },
    [invalidateList, subjectFromUrl]
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

  useSetDashboardPage({
    title: `${subjectFromUrl || "Subject"} Question Bank`,
    subtitle: "Browse questions 25 per page with filters and export.",
  });

  return (
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
                    Filtered export uses your current filters. Full bank export fetches every question for this
                    subject on the server only when you click — the list below shows 25 questions per page.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void exportFilteredCsv()}
                      disabled={exporting || exportingFullBank}
                      className={dashBtnSecondary}
                    >
                      {exporting ? "Exporting…" : "Export filtered CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportFilteredPdf()}
                      disabled={exporting || exportingFullBank}
                      className={dashBtnSecondary}
                    >
                      Export filtered PDF
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void exportFullBankCsv()}
                      disabled={exporting || exportingFullBank}
                      className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
                    >
                      {exportingFullBank ? "Exporting full bank…" : "Export full bank CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportFullBankPdf()}
                      disabled={exporting || exportingFullBank}
                      className="rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent)] disabled:opacity-50"
                    >
                      Export full bank PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importing || exporting || exportingFullBank}
                      className={dashBtnSecondary}
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
              </div>
              {importMsg ? <p className="mt-3 text-sm text-emerald-700">{importMsg}</p> : null}
              {importErr ? <p className="mt-3 text-sm text-red-600">{importErr}</p> : null}
            </div>

            <div ref={listTopRef} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
              <QuestionBankFilters
                track={track}
                filters={filterState}
                onChange={(patch) => setFilterState((prev) => ({ ...prev, ...patch }))}
              />

              {listEnabled && (total != null || totalPending) ? (
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {totalPending ? (
                    <>Updating count…</>
                  ) : total === 0 ? (
                    <>No questions{filtersActive ? " matching your filters" : ""}</>
                  ) : (
                    <>
                      Page {page} of {totalPages} · Showing{" "}
                      {(page - 1) * QUESTION_BANK_PAGE_SIZE + 1}–
                      {Math.min(page * QUESTION_BANK_PAGE_SIZE, total)} of {total} question
                      {total === 1 ? "" : "s"}
                      {filtersActive ? " matching your filters" : ""}
                    </>
                  )}
                </p>
              ) : null}

              <QuestionBankPageList
                items={items}
                page={page}
                pageSize={QUESTION_BANK_PAGE_SIZE}
                isLoading={isLoading}
                isFetching={isFetching}
                error={error}
                onRetry={() => void refetch()}
              />

              {total != null && total > 0 ? (
                <QuestionBankPagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  disabled={isFetching}
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
  );
}
