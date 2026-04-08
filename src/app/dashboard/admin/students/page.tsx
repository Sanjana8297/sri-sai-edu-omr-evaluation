"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";

type TeacherRow = { id: string; name: string; email: string; category: string | null };
type StudentRow = { id: string; name: string; email: string; category: string | null; teacher: { name: string } | null };

export default function AdminStudentsPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState<"JEE" | "NEET">("JEE");
  const [teacherId, setTeacherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([fetch("/api/admin/teachers").then((r) => r.json()), fetch("/api/admin/overview").then((r) => r.json())]);
    if (t.teachers) setTeachers(t.teachers);
    if (o.students) setStudents(o.students);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!success && !error) return;
    const t = window.setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 4500);
    return () => window.clearTimeout(t);
  }, [success, error]);

  const filteredTeachers = teachers.filter((t) => t.category === category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role: "STUDENT", category, teacherId }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not create student");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setTeacherId("");
    setSuccess(`Student "${j?.user?.name ?? name}" added successfully.`);
    await load();
  }

  const filteredStudents = students.filter((s) =>
    `${s.name} ${s.email} ${s.category ?? ""} ${s.teacher?.name ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardShell
      badge="Administrator"
      title="Students & Mentors"
      subtitle="Manage students and assign them to teachers."
      navItems={[
        { href: "/dashboard/admin/teachers", label: "Teachers" },
        { href: "/dashboard/admin/students", label: "Students & mentors" },
        { href: "/dashboard/admin/performance", label: "Performance overview" },
      ]}
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold">Add student</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submit}>
          <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" type="password" placeholder="Temporary password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <select className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value as "JEE" | "NEET")}>
            <option value="JEE">JEE</option>
            <option value="NEET">NEET</option>
          </select>
          <select className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 md:col-span-2" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
            <option value="">Assign teacher</option>
            {filteredTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.email})
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white md:col-span-2">
            Create student
          </button>
        </form>
        {success ? (
          <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-medium">Success</p>
            <p className="mt-1">{success}</p>
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">Failed</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search students by name, email, track, teacher..."
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
              <th className="px-4 py-3 font-medium">Teacher</th>
            </tr>
          </thead>
          <tbody>
            {pagedStudents.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">{s.email}</td>
                <td className="px-4 py-3">{s.category ?? "-"}</td>
                <td className="px-4 py-3">{s.teacher?.name ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
          <p className="text-[var(--muted)]">
            Showing {pagedStudents.length} of {filteredStudents.length}
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
