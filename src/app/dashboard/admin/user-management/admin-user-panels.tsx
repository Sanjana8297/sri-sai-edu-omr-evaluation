"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureActivityHub, type ActivityFeature } from "@/components/FeatureActivityHub";

type TeacherRow = { id: string; name: string; email: string; category: string | null };
type StudentRow = {
  id: string;
  name: string;
  email: string;
  category: string | null;
  teacher: { name: string } | null;
};
type AttemptRow = {
  id: string;
  studentId: string;
  studentName: string;
  category: string;
  title: string;
  examDate: string;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
};

type PaperAccess = { create: boolean; publish: boolean; grade: boolean };

const PAPER_ACCESS_KEY = "admin-teacher-paper-access";

const STUDENT_PROFILE_ACTIVITIES: ActivityFeature[] = [
  { id: "bulk", title: "Bulk enrolment (CSV / API)", description: "Import many students at once" },
  { id: "single", title: "Single enrolment", description: "Add one student with mentor assignment" },
  { id: "track-tag", title: "Target exam: NEET / JEE tag", description: "Filter and view student records by track" },
  { id: "attempt-history", title: "Attempt history timeline", description: "Exam attempts for a selected student" },
];

const TEACHER_ROLE_ACTIVITIES: ActivityFeature[] = [
  { id: "create-staff", title: "Create staff account", description: "Institute / batch segmentation on enrolment" },
  { id: "paper-access", title: "Paper access permission control", description: "Per-teacher question paper rights" },
  { id: "staff-directory", title: "Staff directory", description: "Teachers on the platform" },
  { id: "audit", title: "Activity / audit trail per role", description: "Recent admin actions in this session" },
];

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function rollNumberFor(student: StudentRow, index: number): string {
  const track = student.category === "NEET" ? "NEET" : "JEE";
  return `${track}-${String(index + 1).padStart(4, "0")}`;
}

function readPaperAccess(): Record<string, PaperAccess> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PAPER_ACCESS_KEY) ?? "{}") as Record<string, PaperAccess>;
  } catch {
    return {};
  }
}

function writePaperAccess(map: Record<string, PaperAccess>) {
  localStorage.setItem(PAPER_ACCESS_KEY, JSON.stringify(map));
}

export function StudentProfilesPanel({ resetKey }: { resetKey?: string }) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState<"JEE" | "NEET">("JEE");
  const [teacherId, setTeacherId] = useState("");
  const [autoRoll, setAutoRoll] = useState(true);
  const [historyStudentId, setHistoryStudentId] = useState("");
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([
      fetch("/api/admin/teachers").then((r) => r.json()),
      fetch("/api/admin/overview").then((r) => r.json()),
    ]);
    if (t.teachers) setTeachers(t.teachers);
    if (o.students) setStudents(o.students);
    if (o.performance) setAttempts(o.performance);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
    const roll = autoRoll ? rollNumberFor({ id: j.user.id, category, name: j.user.name, email: j.user.email, teacher: null }, students.length) : "";
    setSuccess(
      `Student "${j?.user?.name ?? name}" enrolled.${roll ? ` Roll no: ${roll}` : ""}`,
    );
    await load();
  }

  async function importCsv(file: File) {
    setCsvStatus(null);
    setError(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setError("CSV must include a header row and at least one student row.");
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = {
      name: header.indexOf("name"),
      email: header.indexOf("email"),
      category: header.indexOf("category"),
      teacherEmail: header.indexOf("teacheremail"),
      password: header.indexOf("password"),
    };
    if (idx.name < 0 || idx.email < 0 || idx.category < 0 || idx.teacherEmail < 0) {
      setError("CSV headers required: name, email, category, teacherEmail (optional: password)");
      return;
    }
    const studentsPayload = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        name: cols[idx.name],
        email: cols[idx.email],
        category: cols[idx.category],
        teacherEmail: cols[idx.teacherEmail],
        password: idx.password >= 0 ? cols[idx.password] : undefined,
      };
    });
    const res = await fetch("/api/admin/users/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: studentsPayload }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(j.error ?? "Bulk import failed");
      return;
    }
    setCsvStatus(`Imported ${j.created} students. ${j.failed} failed.`);
    if (j.errors?.length) setError(j.errors.join(" · "));
    await load();
  }

  const filteredStudents = students.filter((s) => {
    const matchesQuery = `${s.name} ${s.email} ${s.category ?? ""} ${s.teacher?.name ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesTrack = trackFilter === "ALL" || s.category === trackFilter;
    return matchesQuery && matchesTrack;
  });

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  const studentAttempts = useMemo(() => {
    if (!historyStudentId) return [];
    return attempts
      .filter((a) => a.studentId === historyStudentId)
      .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime());
  }, [attempts, historyStudentId]);

  function renderFeature(id: string) {
    switch (id) {
      case "bulk":
        return (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">Upload CSV</span>
              <span className="mt-1 text-xs">name, email, category, teacherEmail, password (optional)</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importCsv(file);
                }}
              />
            </label>
            {csvStatus ? <p className="text-xs text-green-700">{csvStatus}</p> : null}
          </div>
        );
      case "single":
        return (
          <>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as "JEE" | "NEET")}
            >
              <option value="JEE">Target: JEE</option>
              <option value="NEET">Target: NEET</option>
            </select>
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm sm:col-span-2"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              required
            >
              <option value="">Assign teacher</option>
              {filteredTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.email})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={autoRoll} onChange={(e) => setAutoRoll(e.target.checked)} />
              Roll number auto-generation
            </label>
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white sm:col-span-2"
            >
              Enrol student
            </button>
          </form>
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </>
        );
      case "track-tag":
        return (
        <>
        <div className="mb-4 flex flex-wrap gap-2">
          {(["ALL", "JEE", "NEET"] as const).map((track) => (
            <button
              key={track}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                trackFilter === track
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--muted)]"
              }`}
              onClick={() => {
                setTrackFilter(track);
                setPage(1);
              }}
            >
              {track === "ALL" ? "All tracks" : track}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <div className="border-b border-[var(--border)] p-3">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Search by name, email, track, teacher..."
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
                <th className="px-4 py-3 font-medium">Roll no.</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Target exam</th>
                <th className="px-4 py-3 font-medium">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {pagedStudents.map((s, i) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">
                    {autoRoll ? rollNumberFor(s, (page - 1) * pageSize + i) : "—"}
                  </td>
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.category === "NEET"
                          ? "bg-violet-100 text-violet-800"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {s.category ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.teacher?.name ?? "—"}</td>
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
        </>
        );
      case "attempt-history":
        return (
          <div className="space-y-3">
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={historyStudentId}
            onChange={(e) => setHistoryStudentId(e.target.value)}
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.category})
              </option>
            ))}
          </select>
          {historyStudentId && studentAttempts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No exam attempts recorded yet.</p>
          ) : null}
          <ul className="space-y-2">
            {studentAttempts.map((a) => (
              <li
                key={a.id}
                className="relative border-l-2 border-[var(--accent)] pl-4 before:absolute before:-left-[5px] before:top-2 before:h-2 before:w-2 before:rounded-full before:bg-[var(--accent)]"
              >
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(a.examDate).toLocaleString()} · {a.category} · {a.marksObtained}/{a.maxMarks} (
                  {a.percentage}%)
                </p>
              </li>
            ))}
          </ul>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <FeatureActivityHub
      features={STUDENT_PROFILE_ACTIVITIES}
      renderFeature={renderFeature}
      resetKey={resetKey}
    />
  );
}

type AuditEntry = { at: string; action: string; detail: string };

export function TeacherRolesPanel({ resetKey }: { resetKey?: string }) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState<"JEE" | "NEET">("JEE");
  const [institute, setInstitute] = useState("");
  const [batchScope, setBatchScope] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [paperAccess, setPaperAccess] = useState<Record<string, PaperAccess>>({});
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/teachers");
    const data = await res.json();
    if (data.teachers) setTeachers(data.teachers);
    setPaperAccess(readPaperAccess());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function pushAudit(action: string, detail: string) {
    setAuditLog((prev) => [{ at: new Date().toISOString(), action, detail }, ...prev].slice(0, 12));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role: "TEACHER", category }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not create account");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setSuccess(`Teacher "${j?.user?.name ?? name}" created.`);
    pushAudit(
      "USER_CREATED",
      `Teacher ${email} · ${institute || "Default institute"} · batch ${batchScope || "All"}`,
    );
    await load();
  }

  const filtered = teachers.filter((t) =>
    `${t.name} ${t.email} ${t.category ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const selectedAccess =
    paperAccess[selectedTeacherId] ?? { create: true, publish: false, grade: true };

  function updatePaperAccess(patch: Partial<PaperAccess>) {
    if (!selectedTeacherId) return;
    const next = {
      ...paperAccess,
      [selectedTeacherId]: { ...selectedAccess, ...patch },
    };
    setPaperAccess(next);
    writePaperAccess(next);
    pushAudit("PERMISSION_UPDATE", `Paper access updated for teacher id ${selectedTeacherId}`);
  }

  function renderFeature(id: string) {
    switch (id) {
      case "create-staff":
        return (
          <>
          <form className="grid gap-3" onSubmit={submit}>
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value as "JEE" | "NEET")}
            >
              <option value="JEE">Track: JEE</option>
              <option value="NEET">Track: NEET</option>
            </select>
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Institute name"
              value={institute}
              onChange={(e) => setInstitute(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Batch scope (e.g. Batch A 2026)"
              value={batchScope}
              onChange={(e) => setBatchScope(e.target.value)}
            />
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
              Create account
            </button>
          </form>
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </>
        );
      case "paper-access":
        return (
          <div className="space-y-3">
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
            >
              <option value="">Select teacher</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
            <ToggleRow
              label="Create / edit papers"
              checked={selectedAccess.create}
              onChange={(create) => updatePaperAccess({ create })}
            />
            <ToggleRow
              label="Publish exams"
              checked={selectedAccess.publish}
              onChange={(publish) => updatePaperAccess({ publish })}
            />
            <ToggleRow
              label="Grade / view results"
              checked={selectedAccess.grade}
              onChange={(grade) => updatePaperAccess({ grade })}
            />
            {!selectedTeacherId ? (
              <p className="text-xs text-[var(--muted)]">Select a teacher to configure permissions.</p>
            ) : null}
          </div>
        );
      case "staff-directory":
        return (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <div className="border-b border-[var(--border)] p-3">
            <input
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Search staff..."
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
              {paged.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3">{t.email}</td>
                  <td className="px-4 py-3">{t.category ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      case "audit":
        return auditLog.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Actions you take here will appear in this trail.</p>
        ) : (
          <ul className="space-y-2">
            {auditLog.map((entry) => (
              <li key={entry.at + entry.action} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <p className="font-medium">{entry.action}</p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(entry.at).toLocaleString()} · {entry.detail}
                </p>
              </li>
            ))}
          </ul>
        );
      default:
        return null;
    }
  }

  return (
    <FeatureActivityHub
      features={TEACHER_ROLE_ACTIVITIES}
      renderFeature={renderFeature}
      resetKey={resetKey}
    />
  );
}
