"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminTeachersQuery } from "@/hooks/data/use-admin-queries";

type Paper = { id: string; title: string; category: string };
type TeacherOption = { id: string; name: string; category: string };
type Exam = {
  id: string;
  title: string;
  category: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isPublished: boolean;
  questionPaper: { id: string; title: string; category: string };
  teacher?: { id: string; name: string; category?: string };
  _count: { examSessions: number };
};
type SessionReview = {
  id: string;
  status: string;
  violationCount: number;
  autoSubmittedReason: string | null;
  student: { id: string; name: string; email: string };
  proctoringEvents: Array<{ id: string; eventType: string; occurredAt: string }>;
};

export type ExamSchedulingVariant = "teacher" | "admin";

function DeleteExamIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function ExamSchedulingPanel({
  variant = "teacher",
  err,
  msg,
  setErr,
  setMsg,
}: {
  variant?: ExamSchedulingVariant;
  err: string | null;
  msg: string | null;
  setErr: (v: string | null) => void;
  setMsg: (v: string | null) => void;
}) {
  const isAdmin = variant === "admin";
  const apiPrefix = isAdmin ? "/api/admin" : "/api/teacher";

  const { data: teachersData } = useAdminTeachersQuery(isAdmin);
  const teachers = isAdmin ? (teachersData?.teachers ?? []) : [];
  const [teacherId, setTeacherId] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [paperId, setPaperId] = useState("");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isPublished, setIsPublished] = useState(true);
  const [reviewExamId, setReviewExamId] = useState("");
  const [reviews, setReviews] = useState<SessionReview[]>([]);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    const examsRes = await fetch(`${apiPrefix}/exams`);
    const examsJson = await examsRes.json();
    if (examsJson.exams) setExams(examsJson.exams);
  }, [apiPrefix]);

  const loadPapers = useCallback(async () => {
    if (isAdmin) {
      if (!teacherId) {
        setPapers([]);
        return;
      }
      const papersRes = await fetch(
        `${apiPrefix}/question-papers?teacherId=${encodeURIComponent(teacherId)}`
      );
      const papersJson = await papersRes.json();
      if (papersJson.papers) setPapers(papersJson.papers);
      return;
    }
    const papersRes = await fetch(`${apiPrefix}/question-papers`);
    const papersJson = await papersRes.json();
    if (papersJson.papers) setPapers(papersJson.papers);
  }, [apiPrefix, isAdmin, teacherId]);

  const load = useCallback(async () => {
    await Promise.all([loadPapers(), loadExams()]);
  }, [loadPapers, loadExams]);

  const loadReview = useCallback(
    async (examId: string) => {
      if (!examId) {
        setReviews([]);
        return;
      }
      const res = await fetch(`${apiPrefix}/exam-results?examId=${encodeURIComponent(examId)}`);
      const json = await res.json();
      if (res.ok) setReviews(json.sessions ?? []);
    },
    [apiPrefix]
  );

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    setPaperId("");
  }, [teacherId]);

  const selectedPaper = useMemo(() => papers.find((paper) => paper.id === paperId) ?? null, [paperId, papers]);
  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === teacherId) ?? null,
    [teacherId, teachers]
  );

  async function createExam(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (isAdmin && !teacherId) {
      setErr("Select a teacher.");
      return;
    }
    if (!paperId) {
      setErr("Select a question paper.");
      return;
    }

    const res = await fetch(`${apiPrefix}/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isAdmin ? { teacherId } : {}),
        questionPaperId: paperId,
        title: title.trim(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationMinutes,
        isPublished,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Could not create exam");
      return;
    }
    setMsg("Exam scheduled.");
    setTitle("");
    setStartTime("");
    setEndTime("");
    setDurationMinutes(60);
    await load();
  }

  async function togglePublish(exam: Exam) {
    const res = await fetch(`${apiPrefix}/exams/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !exam.isPublished }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Could not update exam");
      return;
    }
    setErr(null);
    setMsg(`Exam ${json.exam.isPublished ? "published" : "unpublished"}.`);
    await load();
  }

  async function deleteExam(exam: Exam) {
    const sessionNote =
      exam._count.examSessions > 0
        ? ` This will also remove ${exam._count.examSessions} student session(s) linked to this exam.`
        : "";
    const ok = window.confirm(
      `Delete scheduled exam "${exam.title}"? This cannot be undone.${sessionNote}`
    );
    if (!ok) return;

    setDeletingExamId(exam.id);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${apiPrefix}/exams/${exam.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Could not delete exam");
        return;
      }
      if (reviewExamId === exam.id) {
        setReviewExamId("");
        setReviews([]);
      }
      setMsg(`Exam "${exam.title}" deleted.`);
      await load();
    } finally {
      setDeletingExamId(null);
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">Schedule Exam</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {isAdmin
              ? "Assign exams to any teacher — select staff, paper, window, and publish."
              : "Centre and slot management — assign papers, windows, and publish."}
          </p>
          <form className="mt-4 space-y-3" onSubmit={createExam}>
            {isAdmin ? (
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                required
              >
                <option value="">Select teacher</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name} ({teacher.category})
                  </option>
                ))}
              </select>
            ) : null}
            <select
              value={paperId}
              onChange={(e) => {
                setPaperId(e.target.value);
                const paper = papers.find((p) => p.id === e.target.value);
                if (paper && !title) setTitle(paper.title);
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              required
              disabled={isAdmin && !teacherId}
            >
              <option value="">
                {isAdmin && !teacherId ? "Select a teacher first" : "Select question paper"}
              </option>
              {papers.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.title} ({paper.category})
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exam title"
              required
            />
            <label className="block text-sm text-[var(--muted)]">
              Starts at
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-[var(--muted)]">
              Ends at
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-[var(--muted)]">
              Duration (minutes)
              <input
                type="number"
                min={1}
                max={480}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
              Publish immediately
            </label>
            {selectedPaper ? (
              <p className="text-xs text-[var(--muted)]">
                Selected paper track: <strong>{selectedPaper.category}</strong>
                {selectedTeacher ? (
                  <>
                    {" "}
                    · Teacher track: <strong>{selectedTeacher.category}</strong>
                  </>
                ) : null}
              </p>
            ) : null}
            <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
              Create exam
            </button>
          </form>
          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
          {msg ? <p className="mt-3 text-sm text-green-700">{msg}</p> : null}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">Scheduled Exams</h2>
          <div className="mt-4 space-y-3">
            {exams.length === 0 ? <p className="text-sm text-[var(--muted)]">No exams scheduled yet.</p> : null}
            {exams.map((exam) => (
              <article key={exam.id} className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{exam.title}</h3>
                    <p className="text-sm text-[var(--muted)]">
                      {exam.questionPaper.title} · {exam.category}
                    </p>
                    {exam.teacher ? (
                      <p className="text-sm text-[var(--muted)]">Teacher: {exam.teacher.name}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {new Date(exam.startTime).toLocaleString()} to {new Date(exam.endTime).toLocaleString()}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      Duration: {exam.durationMinutes} min · Sessions: {exam._count.examSessions}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded border border-[var(--border)] px-3 py-1 text-sm"
                      onClick={() => void togglePublish(exam)}
                    >
                      {exam.isPublished ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void deleteExam(exam)}
                      disabled={deletingExamId === exam.id}
                      aria-label={`Delete ${exam.title}`}
                      title="Delete exam"
                    >
                      <DeleteExamIcon />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Proctoring Review</h2>
          <select
            value={reviewExamId}
            onChange={(e) => {
              setReviewExamId(e.target.value);
              void loadReview(e.target.value);
            }}
            className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">Select exam</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {isAdmin && exam.teacher ? `${exam.title} — ${exam.teacher.name}` : exam.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 space-y-3">
          {reviewExamId && reviews.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No student sessions logged for this exam yet.</p>
          ) : null}
          {reviews.map((row) => (
            <article key={row.id} className="rounded-lg border border-[var(--border)] p-4">
              <p className="font-medium">{row.student.name}</p>
              <p className="text-sm text-[var(--muted)]">
                {row.student.email} · Status: {row.status} · Violations: {row.violationCount}
              </p>
              {row.autoSubmittedReason ? (
                <p className="text-sm text-red-600">Auto-submit reason: {row.autoSubmittedReason}</p>
              ) : null}
              <p className="mt-2 text-xs uppercase tracking-wide text-[var(--muted)]">Events</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {row.proctoringEvents.slice(-6).map((event) => (
                  <li key={event.id}>
                    {event.eventType} at {new Date(event.occurredAt).toLocaleTimeString()}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
