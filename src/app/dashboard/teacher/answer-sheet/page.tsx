"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Paper = { id: string; title: string; category: string; keyContent: string };

export default function TeacherAnswerSheetPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [paperId, setPaperId] = useState("");
  const [keyContent, setKeyContent] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await fetch("/api/teacher/question-papers").then((r) => r.json());
    if (p.papers) setPapers(p.papers);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const trimmed = keyContent.trim();
    if (!trimmed && !answerFile) {
      setErr("Enter answer key text and/or upload an answer sheet file.");
      return;
    }

    let res: Response;
    if (answerFile) {
      const fd = new FormData();
      fd.append("paperId", paperId);
      fd.append("keyContent", trimmed);
      fd.append("answerSheetFile", answerFile);
      res = await fetch("/api/teacher/question-papers", { method: "PATCH", body: fd });
    } else {
      res = await fetch("/api/teacher/question-papers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId, keyContent: trimmed }),
      });
    }
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Could not save answer key");
      return;
    }
    setPaperId("");
    setKeyContent("");
    setAnswerFile(null);
    setMsg("Answer key uploaded for selected question paper.");
    await load();
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Upload Answer Key"
      subtitle="Paste the key and/or upload a file. The answer sheet URL is stored on the same question paper row."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Upload answer key" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <form className="space-y-3" onSubmit={submit}>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
            required
          >
            <option value="">Select uploaded question paper</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.category})
              </option>
            ))}
          </select>
          <label className="block text-sm text-[var(--muted)]">
            Answer sheet file 
            <input
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm file:mr-3"
              type="file"
              accept=".pdf,.docx,image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setAnswerFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <textarea
            className="min-h-[180px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            placeholder="Enter/paste answer key (optional if you upload a file)..."
            value={keyContent}
            onChange={(e) => setKeyContent(e.target.value)}
            required={!answerFile}
          />
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">
            Save answer key
          </button>
        </form>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
    </DashboardShell>
  );
}
