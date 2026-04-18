"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function TeacherUploadPaperPage() {
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [title, setTitle] = useState("");
  const [questionContent, setQuestionContent] = useState("");
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const u = await fetch("/api/me").then((r) => r.json());
    if (u.user?.category) setTrack(u.user.category);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const trimmed = questionContent.trim();
    if (!trimmed && !questionFile) {
      setErr("Add question text and/or upload a question paper file.");
      return;
    }

    let res: Response;
    if (questionFile) {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("category", track);
      fd.append("questionContent", trimmed);
      fd.append("questionPaperFile", questionFile);
      res = await fetch("/api/teacher/question-papers", { method: "POST", body: fd });
    } else {
      res = await fetch("/api/teacher/question-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), questionContent: trimmed, category: track }),
      });
    }
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Could not save paper");
      return;
    }
    setTitle("");
    setQuestionContent("");
    setQuestionFile(null);
    setMsg("Question paper saved.");
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Upload Question Paper"
      subtitle="Paste question text and/or upload a file (PDF, DOCX, or image). URLs are stored in your database."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Upload answer key" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <form className="space-y-3" onSubmit={submit}>
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={track} disabled />
          <label className="block text-sm text-[var(--muted)]">
            Question paper file 
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm file:mr-3"
              type="file"
              accept=".pdf,.docx,image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setQuestionFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <textarea
            className="min-h-[220px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            placeholder="Paste/type the complete question paper here (optional if you upload a file)..."
            value={questionContent}
            onChange={(e) => setQuestionContent(e.target.value)}
            required={!questionFile}
          />
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Save paper
          </button>
        </form>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
    </DashboardShell>
  );
}
