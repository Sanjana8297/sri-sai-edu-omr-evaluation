"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Student = { id: string; name: string };

export default function TeacherAnswerSheetPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [track, setTrack] = useState<"JEE" | "NEET">("JEE");
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [marks, setMarks] = useState("");
  const [maxMarks, setMaxMarks] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, me] = await Promise.all([fetch("/api/teacher/students").then((r) => r.json()), fetch("/api/me").then((r) => r.json())]);
    if (s.students) setStudents(s.students);
    if (me.user?.category) setTrack(me.user.category);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/teacher/exam-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId,
        title,
        examDate,
        category: track,
        marksObtained: Number(marks),
        maxMarks: Number(maxMarks),
        analysis,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setErr(j.error ?? "Could not save answer sheet");
      return;
    }
    setStudentId("");
    setTitle("");
    setExamDate("");
    setMarks("");
    setMaxMarks("");
    setAnalysis("");
    setMsg("Answer sheet analysis saved.");
  }

  return (
    <DashboardShell
      badge="Teacher"
      title="Answer Sheet"
      subtitle="Record physical exam marks and analysis for students."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Answer sheet" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <form className="space-y-3" onSubmit={submit}>
          <select className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Exam title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="date" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={examDate} onChange={(e) => setExamDate(e.target.value)} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="number" step="0.01" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Marks obtained" value={marks} onChange={(e) => setMarks(e.target.value)} required />
            <input type="number" step="0.01" className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Max marks" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required />
          </div>
          <textarea className="min-h-[140px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Analysis..." value={analysis} onChange={(e) => setAnalysis(e.target.value)} required />
          <button className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white" type="submit">Save analysis</button>
        </form>
        {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="mt-2 text-sm text-green-700">{msg}</p> : null}
      </div>
    </DashboardShell>
  );
}
