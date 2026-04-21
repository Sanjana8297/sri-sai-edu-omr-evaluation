"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { studentNavItems } from "@/lib/dashboard-nav";

type StartResponse = {
  exam: {
    id: string;
    title: string;
    category: string;
    durationMinutes: number;
    startTime: string;
    endTime: string;
    questionPaper: {
      id: string;
      title: string;
      questionContent: string;
      questionPaperUrl: string | null;
    };
  };
  session: {
    id: string;
    status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
    startedAt: string;
    submittedAt: string | null;
    violationCount: number;
    cameraGranted: boolean | null;
    micGranted: boolean | null;
    deadline: string;
  };
};

export default function StudentTakeExamPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const [data, setData] = useState<StartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const streamRef = useRef<MediaStream | null>(null);
  const finalizedRef = useRef(false);

  const deadlineMs = useMemo(() => (data ? new Date(data.session.deadline).getTime() : null), [data]);
  const remainingMs = deadlineMs == null ? null : Math.max(0, deadlineMs - now);

  const sendEvent = useCallback(
    async (eventType: string, metadata: Record<string, unknown> = {}) => {
      if (!params.examId || finalizedRef.current) return;
      const res = await fetch(`/api/student/exams/${params.examId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, metadata }),
      });
      const json = await res.json();
      if (res.ok && data) {
        setData({
          ...data,
          session: {
            ...data.session,
            status: json.session.status,
            submittedAt: json.session.submittedAt,
            violationCount: json.session.violationCount,
          },
        });
        if (json.autoSubmitted) {
          finalizedRef.current = true;
          setError("Auto-submitted after repeated tab/window switching.");
        }
      }
    },
    [data, params.examId],
  );

  const submitExam = useCallback(
    async (reason?: string) => {
      if (!params.examId || finalizedRef.current) return;
      setSubmitting(true);
      const res = await fetch(`/api/student/exams/${params.examId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      setSubmitting(false);
      if (!res.ok) {
        setError(json.error ?? "Could not submit exam");
        return;
      }
      finalizedRef.current = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      router.push("/dashboard/student/exams");
    },
    [params.examId, router],
  );

  const startSession = useCallback(async () => {
    if (!params.examId) return;
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

    const res = await fetch(`/api/student/exams/${params.examId}/start`, {
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
    setData(json);

    if (cameraGranted === false || micGranted === false) {
      await sendEvent("PERMISSION_DENIED", { cameraGranted, micGranted });
      if (cameraGranted === false) await sendEvent("CAMERA_MISSING", {});
      if (micGranted === false) await sendEvent("MIC_MISSING", {});
    }
  }, [params.examId, sendEvent]);

  useEffect(() => {
    void startSession();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startSession]);

  useEffect(() => {
    if (!data || finalizedRef.current) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [data]);

  useEffect(() => {
    if (!data || remainingMs == null || remainingMs > 0 || finalizedRef.current) return;
    void submitExam("TIME_WINDOW_EXPIRED");
  }, [data, remainingMs, submitExam]);

  useEffect(() => {
    if (!data || finalizedRef.current) return;
    const onVisibility = () => {
      if (document.hidden) void sendEvent("TAB_HIDDEN", { hiddenAt: new Date().toISOString() });
    };
    const onBlur = () => {
      void sendEvent("WINDOW_BLUR", { blurAt: new Date().toISOString() });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [data, sendEvent]);

  return (
    <DashboardShell badge="Student" title="Exam Runtime" subtitle="Stay in this tab. Violations are tracked." navItems={studentNavItems}>
      {loading ? <p className="text-sm text-[var(--muted)]">Starting your exam session...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {data ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="text-lg font-semibold">{data.exam.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {data.exam.category} · {data.exam.durationMinutes} minutes
            </p>
            <p className="mt-1 text-sm">
              Time left:{" "}
              <strong>
                {remainingMs == null ? "-" : `${Math.floor(remainingMs / 60000)}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")}`}
              </strong>
            </p>
            <p className="text-sm">
              Violations: <strong>{data.session.violationCount}</strong> / 3
            </p>
            <p className="text-sm text-[var(--muted)]">
              Camera: {data.session.cameraGranted ? "On" : "Denied"} · Mic: {data.session.micGranted ? "On" : "Denied"}
            </p>
          </div>

          <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="font-semibold">Question Paper</h3>
            {data.exam.questionPaper.questionPaperUrl ? (
              <a className="mt-2 inline-block text-sm text-[var(--accent)] underline" href={data.exam.questionPaper.questionPaperUrl} target="_blank" rel="noreferrer">
                Open uploaded question paper
              </a>
            ) : null}
            {data.exam.questionPaper.questionContent ? (
              <pre className="mt-3 whitespace-pre-wrap text-sm">{data.exam.questionPaper.questionContent}</pre>
            ) : (
              <p className="mt-3 text-sm text-[var(--muted)]">Question content is in uploaded file only.</p>
            )}
          </article>

          <button
            type="button"
            disabled={submitting || data.session.status !== "IN_PROGRESS"}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => void submitExam()}
          >
            {submitting ? "Submitting..." : "Submit exam"}
          </button>
        </div>
      ) : null}
    </DashboardShell>
  );
}
