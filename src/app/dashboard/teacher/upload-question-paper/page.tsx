"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

export default function TeacherUploadPaperPage() {
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [title, setTitle] = useState("");
  const [keyContent, setKeyContent] = useState("");
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
    const res = await fetch("/api/teacher/question-papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, keyContent, category: track }),
    });
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Could not save paper");
      return;
    }
    setTitle("");
    setKeyContent("");
    setMsg("Question paper saved.");
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Upload Question Paper"
      subtitle="Upload paper title and answer key. Data is saved to Supabase."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Answer sheet" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <form className="space-y-3" onSubmit={submit}>
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Paper title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={track} disabled />
          <textarea className="min-h-[160px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Answer key..." value={keyContent} onChange={(e) => setKeyContent(e.target.value)} required />
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
