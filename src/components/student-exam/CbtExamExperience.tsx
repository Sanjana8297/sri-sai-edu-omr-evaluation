"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseQuestionPaperContent, type ParsedQuestion } from "@/lib/exam-paper-parser";
import { type CbtSettings, type BilingualMode } from "@/lib/cbt-settings";
import { displayPrompt, splitBilingualPrompt } from "@/lib/bilingual-prompt";
import {
  clearCachedProgress,
  readCachedProgress,
  writeCachedProgress,
} from "@/lib/exam-progress-cache";
import { VIOLATION_LIMIT } from "@/lib/proctoring";

type StartResponse = {
  exam: {
    id: string;
    title: string;
    category: string;
    durationMinutes: number;
    cbtSettings: CbtSettings;
    questionPaper: { questionContent: string };
  };
  session: {
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    violationCount: number;
    autoSubmittedReason?: string | null;
    cameraGranted: boolean | null;
    micGranted: boolean | null;
    submittedAnswers?: Record<string, string> | null;
    cbtState?: { markedForReview?: string[]; visited?: string[] } | null;
    deadline: string;
  };
};

type PaletteStatus = "not-visited" | "not-answered" | "answered" | "marked";

function paletteClass(status: PaletteStatus, isCurrent: boolean): string {
  const base = "relative flex h-9 min-w-9 items-center justify-center rounded text-xs font-semibold transition-colors";
  if (isCurrent) return `${base} ring-2 ring-[var(--accent)] ring-offset-1`;
  switch (status) {
    case "answered":
      return `${base} bg-emerald-600 text-white`;
    case "not-answered":
      return `${base} bg-red-500 text-white`;
    case "marked":
      return `${base} bg-violet-600 text-white`;
    default:
      return `${base} border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]`;
  }
}

function formatTimer(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CbtExamExperience({ examId }: { examId: string }) {
  const router = useRouter();
  const [data, setData] = useState<StartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(() => new Set());
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [activeGlobalIndex, setActiveGlobalIndex] = useState(0);
  const [questionLang, setQuestionLang] = useState<"en" | "hi">("en");
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline" | "error">("synced");
  const [fullscreenOk, setFullscreenOk] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const finalizedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  const markedRef = useRef(markedForReview);
  const visitedRef = useRef(visited);

  answersRef.current = answers;
  markedRef.current = markedForReview;
  visitedRef.current = visited;

  const settings = data?.exam.cbtSettings;
  const parsedPaper = useMemo(() => {
    const content = data?.exam.questionPaper.questionContent ?? "";
    return parseQuestionPaperContent(content);
  }, [data?.exam.questionPaper.questionContent]);

  const flatQuestions: ParsedQuestion[] = parsedPaper.flatQuestions;
  const activeQuestion = flatQuestions[activeGlobalIndex] ?? null;

  const deadlineMs = useMemo(() => (data ? new Date(data.session.deadline).getTime() : null), [data]);
  const remainingMs = deadlineMs == null ? null : Math.max(0, deadlineMs - now);
  const timerUrgent = remainingMs != null && remainingMs < 5 * 60_000;

  const bilingualMode: BilingualMode = settings?.bilingualMode ?? "both";
  const showLangToggle = bilingualMode === "both";

  const stopMediaAccess = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const syncProgress = useCallback(
    async (force = false) => {
      if (!examId || finalizedRef.current || !settings?.offlineSyncEnabled) return;
      if (!navigator.onLine) {
        setSyncStatus("offline");
        writeCachedProgress(examId, {
          answers: answersRef.current,
          markedForReview: [...markedRef.current],
          visited: [...visitedRef.current],
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      setSyncStatus("syncing");
      try {
        const res = await fetch(`/api/student/exams/${examId}/progress`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: answersRef.current,
            markedForReview: [...markedRef.current],
            visited: [...visitedRef.current],
          }),
        });
        if (!res.ok) throw new Error("sync failed");
        setSyncStatus("synced");
        if (force) clearCachedProgress(examId);
      } catch {
        setSyncStatus("error");
        writeCachedProgress(examId, {
          answers: answersRef.current,
          markedForReview: [...markedRef.current],
          visited: [...visitedRef.current],
          updatedAt: new Date().toISOString(),
        });
      }
    },
    [examId, settings?.offlineSyncEnabled],
  );

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => void syncProgress(), 800);
  }, [syncProgress]);

  const sendEvent = useCallback(
    async (eventType: string, metadata: Record<string, unknown> = {}) => {
      if (finalizedRef.current) return;
      const res = await fetch(`/api/student/exams/${examId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, metadata }),
      });
      const json = await res.json();
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            session: {
              ...prev.session,
              status: json.session.status,
              violationCount: json.session.violationCount,
            },
          };
        });
        if (json.autoSubmitted) {
          finalizedRef.current = true;
          stopMediaAccess();
          clearCachedProgress(examId);
          setError("Exam auto-submitted due to a proctoring violation.");
        }
      }
    },
    [examId, stopMediaAccess],
  );

  const submitExam = useCallback(
    async (reason?: string) => {
      if (finalizedRef.current) return;
      setSubmitting(true);
      await syncProgress(true);
      const res = await fetch(`/api/student/exams/${examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, answers: answersRef.current }),
      });
      const json = await res.json();
      setSubmitting(false);
      if (!res.ok) {
        setError(json.error ?? "Could not submit exam");
        return;
      }
      finalizedRef.current = true;
      stopMediaAccess();
      clearCachedProgress(examId);
      router.push("/dashboard/student/exams");
    },
    [examId, router, stopMediaAccess, syncProgress],
  );

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreenOk(true);
    } catch {
      setFullscreenOk(false);
    }
  }, []);

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    let cameraGranted: boolean | null = null;
    let micGranted: boolean | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      cameraGranted = stream.getVideoTracks().length > 0;
      micGranted = stream.getAudioTracks().length > 0;
    } catch {
      cameraGranted = false;
      micGranted = false;
    }

    const res = await fetch(`/api/student/exams/${examId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cameraGranted, micGranted }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not start exam");
      return;
    }

    const serverAnswers = (json.session.submittedAnswers as Record<string, string> | null) ?? {};
    const serverState = (json.session.cbtState as { markedForReview?: string[]; visited?: string[] } | null) ?? {};
    const cached = readCachedProgress(examId);

    const mergedAnswers = { ...serverAnswers, ...(cached?.answers ?? {}) };
    const mergedMarked = new Set([...(serverState.markedForReview ?? []), ...(cached?.markedForReview ?? [])]);
    const mergedVisited = new Set([...(serverState.visited ?? []), ...(cached?.visited ?? [])]);

    setData(json);
    setAnswers(mergedAnswers);
    setMarkedForReview(mergedMarked);
    setVisited(mergedVisited);
    if (json.exam.cbtSettings.bilingualMode === "hi") setQuestionLang("hi");

    if (json.session.status !== "IN_PROGRESS") {
      finalizedRef.current = true;
      stopMediaAccess();
      if (json.session.autoSubmittedReason === "VIOLATION_LIMIT_REACHED") {
        setError("Exam was auto-submitted due to a proctoring violation.");
      }
      return;
    }

    if (cameraGranted === false || micGranted === false) {
      await sendEvent("PERMISSION_DENIED", { cameraGranted, micGranted });
    }

    if (json.exam.cbtSettings.requireFullscreen) {
      await enterFullscreen();
    }
  }, [enterFullscreen, examId, sendEvent, stopMediaAccess]);

  function getPaletteStatus(questionId: string): PaletteStatus {
    if (markedForReview.has(questionId)) return "marked";
    if (answers[questionId]) return "answered";
    if (visited.has(questionId)) return "not-answered";
    return "not-visited";
  }

  function goToQuestion(globalIndex: number) {
    const q = flatQuestions[globalIndex];
    if (!q) return;
    setActiveGlobalIndex(globalIndex);
    setVisited((prev) => new Set(prev).add(q.id));
    scheduleSync();
  }

  function toggleMarkForReview() {
    if (!activeQuestion) return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(activeQuestion.id)) next.delete(activeQuestion.id);
      else next.add(activeQuestion.id);
      return next;
    });
    scheduleSync();
  }

  function selectAnswer(label: string) {
    if (!activeQuestion) return;
    setAnswers((prev) => {
      const next = { ...prev };
      if (prev[activeQuestion.id] === label) delete next[activeQuestion.id];
      else next[activeQuestion.id] = label;
      return next;
    });
    setVisited((prev) => new Set(prev).add(activeQuestion.id));
    scheduleSync();
  }

  function goPrevious() {
    if (activeGlobalIndex > 0) goToQuestion(activeGlobalIndex - 1);
  }

  function saveAndNext() {
    if (activeGlobalIndex < flatQuestions.length - 1) goToQuestion(activeGlobalIndex + 1);
  }

  useEffect(() => {
    void startSession();
    return () => stopMediaAccess();
  }, [startSession, stopMediaAccess]);

  useEffect(() => {
    if (!data || finalizedRef.current) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [data]);

  useEffect(() => {
    if (!data || !settings?.autoSubmitOnTimerEnd) return;
    if (remainingMs == null || remainingMs > 0 || finalizedRef.current) return;
    void submitExam("TIME_WINDOW_EXPIRED");
  }, [data, remainingMs, settings?.autoSubmitOnTimerEnd, submitExam]);

  useEffect(() => {
    if (!data || finalizedRef.current || !settings) return;

    const onVisibility = () => {
      if (document.hidden && settings.blockTabSwitch) {
        void sendEvent("TAB_HIDDEN", { hiddenAt: new Date().toISOString() });
      }
    };
    const onBlur = () => {
      if (settings.blockTabSwitch) void sendEvent("WINDOW_BLUR", { blurAt: new Date().toISOString() });
    };
    const onFullscreen = () => {
      if (settings.requireFullscreen && !document.fullscreenElement) {
        setFullscreenOk(false);
        void sendEvent("FULLSCREEN_EXIT", { at: new Date().toISOString() });
      } else if (document.fullscreenElement) {
        setFullscreenOk(true);
      }
    };
    const onClipboard = (e: ClipboardEvent) => {
      if (!settings.blockClipboard) return;
      e.preventDefault();
      void sendEvent("CLIPBOARD_ATTEMPT", { type: e.type });
    };
    const onOnline = () => void syncProgress(true);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("copy", onClipboard);
    document.addEventListener("cut", onClipboard);
    document.addEventListener("paste", onClipboard);
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("copy", onClipboard);
      document.removeEventListener("cut", onClipboard);
      document.removeEventListener("paste", onClipboard);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [data, sendEvent, settings, syncProgress]);

  useEffect(() => {
    if (activeQuestion) {
      setVisited((prev) => new Set(prev).add(activeQuestion.id));
    }
  }, [activeQuestion?.id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Starting secure exam session…</p>
      </div>
    );
  }

  if (!data || flatQuestions.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--background)] p-6">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <p className="text-sm text-[var(--muted)]">Could not load exam questions.</p>
        <button
          type="button"
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          onClick={() => router.push("/dashboard/student/exams")}
        >
          Back to exams
        </button>
      </div>
    );
  }

  const promptParts = activeQuestion ? splitBilingualPrompt(activeQuestion.prompt) : null;
  const displayMode = bilingualMode === "both" ? questionLang : bilingualMode;
  const promptText =
    promptParts && activeQuestion
      ? displayPrompt(promptParts, bilingualMode, displayMode as "en" | "hi")
      : "";

  const answeredCount = flatQuestions.filter((q) => Boolean(answers[q.id])).length;
  const markedCount = markedForReview.size;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">{data.exam.title}</h1>
          <p className="text-xs text-[var(--muted)]">{data.exam.category} · CBT mode</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className={timerUrgent ? "text-red-600" : ""}>
            <span className="text-xs text-[var(--muted)]">Time left </span>
            <strong className="tabular-nums text-lg">{remainingMs == null ? "—" : formatTimer(remainingMs)}</strong>
          </div>
          {settings?.offlineSyncEnabled ? (
            <span className="text-xs text-[var(--muted)]">
              Sync:{" "}
              <strong>
                {syncStatus === "synced"
                  ? "Online"
                  : syncStatus === "syncing"
                    ? "Saving…"
                    : syncStatus === "offline"
                      ? "Offline (cached)"
                      : "Retry pending"}
              </strong>
            </span>
          ) : null}
          <span className="text-xs">
            Answered <strong>{answeredCount}</strong> / {flatQuestions.length}
            {markedCount > 0 ? (
              <>
                {" "}
                · Marked <strong>{markedCount}</strong>
              </>
            ) : null}
          </span>
          <span className="text-xs text-[var(--muted)]">
            Violations {data.session.violationCount}/{VIOLATION_LIMIT}
          </span>
        </div>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {!fullscreenOk && settings?.requireFullscreen ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>Fullscreen is required during this exam.</span>
          <button
            type="button"
            className="rounded border border-amber-400 px-3 py-1 text-xs font-medium"
            onClick={() => void enterFullscreen()}
          >
            Enter fullscreen
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-full max-w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Question palette</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded border border-[var(--border)]" /> Not visited
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-red-500" /> Not answered
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-emerald-600" /> Answered
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded bg-violet-600" /> Marked
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {parsedPaper.sections.map((section) => (
              <div key={section.name} className="mb-4">
                <p className="mb-2 text-xs font-semibold text-[var(--muted)]">{section.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {section.questions.map((q) => {
                    const globalIndex = flatQuestions.findIndex((fq) => fq.id === q.id);
                    const status = getPaletteStatus(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={paletteClass(status, globalIndex === activeGlobalIndex)}
                        onClick={() => goToQuestion(globalIndex)}
                        title={`Question ${q.indexInSection}`}
                      >
                        {q.indexInSection}
                        {status === "marked" ? (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeQuestion && promptParts ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-3">
                <p className="text-sm font-medium">
                  Question {activeGlobalIndex + 1} of {flatQuestions.length}
                  <span className="ml-2 text-[var(--muted)]">({activeQuestion.section})</span>
                </p>
                {showLangToggle ? (
                  <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
                    {(["en", "hi"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        className={`rounded-md px-3 py-1 ${questionLang === lang ? "bg-[var(--accent)] text-white" : ""}`}
                        onClick={() => setQuestionLang(lang)}
                      >
                        {lang === "en" ? "English" : "हिंदी"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  <strong>Q{activeQuestion.indexInSection}.</strong> {promptText}
                </p>
                <div className="mt-5 space-y-2">
                  {activeQuestion.options.map((option) => {
                    const label = option.split(".")[0].trim();
                    const isChecked = (answers[activeQuestion.id] ?? "") === label;
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm ${
                          isChecked ? "border-[var(--accent)] bg-[var(--accent)]/5" : "border-[var(--border)]"
                        }`}
                        onClick={() => selectAnswer(label)}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                            isChecked
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {label}
                        </span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-3">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40"
                  disabled={activeGlobalIndex === 0}
                  onClick={goPrevious}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  disabled={activeGlobalIndex >= flatQuestions.length - 1}
                  onClick={saveAndNext}
                >
                  Save &amp; Next
                </button>
                <button
                  type="button"
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    markedForReview.has(activeQuestion.id)
                      ? "border-violet-500 bg-violet-50 text-violet-800"
                      : "border-[var(--border)]"
                  }`}
                  onClick={toggleMarkForReview}
                >
                  {markedForReview.has(activeQuestion.id) ? "Unmark review" : "Mark for review"}
                </button>
                <button
                  type="button"
                  className="ml-auto rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
                  onClick={() => setShowSubmitConfirm(true)}
                >
                  Submit exam
                </button>
              </footer>
            </>
          ) : (
            <p className="p-6 text-sm text-[var(--muted)]">No questions available.</p>
          )}
        </main>
      </div>

      {showSubmitConfirm ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Submit exam?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              You answered {answeredCount} of {flatQuestions.length} questions.
              {markedCount > 0 ? ` ${markedCount} marked for review.` : ""} This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => void submitExam()}
              >
                {submitting ? "Submitting…" : "Confirm submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
