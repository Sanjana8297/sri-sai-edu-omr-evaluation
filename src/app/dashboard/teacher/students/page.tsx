"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type Student = { id: string; name: string; email: string; category: string | null };

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const res = await fetch("/api/teacher/students");
    const j = await res.json();
    if (j.students) setStudents(j.students);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = students.filter((s) =>
    `${s.name} ${s.email} ${s.category ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardShell
      badge="Teacher"
      title="Students"
      subtitle="Students assigned to your profile."
      navItems={[
        { href: "/dashboard/teacher/upload-question-paper", label: "Upload question paper" },
        { href: "/dashboard/teacher/answer-sheet", label: "Answer sheet" },
        { href: "/dashboard/teacher/students", label: "Students" },
        { href: "/dashboard/teacher/uploaded-papers", label: "Uploaded papers" },
      ]}
    >
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search students by name, email, track..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Track</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">{s.email}</td>
                <td className="px-4 py-3">{s.category ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
          <p className="text-[var(--muted)]">
            Showing {paged.length} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="px-2 py-1">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-50"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
