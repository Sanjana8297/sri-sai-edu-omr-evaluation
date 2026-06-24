"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  ResetCredentialsForm,
  type CredentialAccount,
} from "@/components/ResetCredentialsForm";
import { displayLoginId } from "@/lib/user-login-id";
import { pushAuditTrail } from "@/lib/admin-staff-storage";
import { useAutoClearMessage } from "@/hooks/use-auto-clear-message";
import {
  useAdminAdminsQuery,
  useAdminOverviewQuery,
  useAdminTeachersQuery,
} from "@/hooks/data/use-admin-queries";
import { dataKeys } from "@/hooks/data/keys";

type TeacherRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
};
type StudentRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
  year: number | null;
  createdAt: string;
  teacher: { name: string } | null;
};

function DeleteIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4h8v2" strokeLinecap="round" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" strokeLinecap="round" />
      <path d="M10 11v6" strokeLinecap="round" />
      <path d="M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="admin-modal-title" className="text-lg font-semibold">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function rollNumberFor(student: StudentRow, index: number): string {
  const track = student.category === "NEET" ? "NEET" : "JEE";
  return `${track}-${String(index + 1).padStart(4, "0")}`;
}

export function StudentProfilesPanel({ resetKey: _resetKey }: { resetKey?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: teachersData } = useAdminTeachersQuery();
  const { data: overviewData, refetch: refetchOverview } = useAdminOverviewQuery();
  const teachers = teachersData?.teachers ?? [];
  const students = overviewData?.students ?? [];
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<"ALL" | "JEE" | "NEET">("ALL");
  const [yearFilter, setYearFilter] = useState<"ALL" | "1" | "2">("ALL");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState<"JEE" | "NEET">("JEE");
  const [year, setYear] = useState<"1" | "2">("1");
  const [teacherId, setTeacherId] = useState("");
  const [autoRoll, setAutoRoll] = useState(true);
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modal, setModal] = useState<"bulk" | "single" | "edit" | null>(null);
  const [editStudent, setEditStudent] = useState<StudentRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useAutoClearMessage(success, setSuccess);

  const load = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dataKeys.adminTeachers }),
      queryClient.invalidateQueries({ queryKey: dataKeys.adminOverview }),
    ]);
    await refetchOverview();
  }, [queryClient, refetchOverview]);

  const filteredTeachers = teachers.filter((t) => t.category === category);

  function closeModal() {
    setModal(null);
    setEditStudent(null);
    setError(null);
    setSuccess(null);
    setCsvStatus(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() && !username.trim()) {
      setError("Enter an email or username for the student.");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        password,
        role: "STUDENT",
        category,
        teacherId,
        year: Number(year),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not create student");
      return;
    }
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setTeacherId("");
    setYear("1");
    const roll = autoRoll
      ? rollNumberFor(
          {
            id: j.user.id,
            category,
            name: j.user.name,
            email: j.user.email,
            username: j.user.username,
            year: Number(year),
            createdAt: new Date().toISOString(),
            teacher: null,
          },
          students.length
        )
      : "";
    setSuccess(`Student "${j?.user?.name ?? name}" enrolled.${roll ? ` Roll no: ${roll}` : ""}`);
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
      username: header.indexOf("username"),
      category: header.indexOf("category"),
      teacherEmail: header.indexOf("teacheremail"),
      teacherUsername: header.indexOf("teacherusername"),
      password: header.indexOf("password"),
    };
    if (idx.name < 0 || idx.category < 0) {
      setError("CSV headers required: name, category, and email or username");
      return;
    }
    if (idx.email < 0 && idx.username < 0) {
      setError("CSV must include an email or username column");
      return;
    }
    if (idx.teacherEmail < 0 && idx.teacherUsername < 0) {
      setError("CSV must include teacherEmail or teacherUsername");
      return;
    }
    const studentsPayload = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        name: cols[idx.name],
        email: idx.email >= 0 ? cols[idx.email] : undefined,
        username: idx.username >= 0 ? cols[idx.username] : undefined,
        category: cols[idx.category],
        teacherEmail: idx.teacherEmail >= 0 ? cols[idx.teacherEmail] : undefined,
        teacherUsername: idx.teacherUsername >= 0 ? cols[idx.teacherUsername] : undefined,
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

  async function deleteStudent(student: StudentRow) {
    const ok = window.confirm(
      `Delete student "${student.name}"? This removes their account and exam sessions. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(student.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(student.id)}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not delete student");
        return;
      }
      setSuccess(`Student "${student.name}" deleted.`);
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const filteredStudents = students.filter((s) => {
    const matchesQuery = `${s.name} ${s.email ?? ""} ${s.username ?? ""} ${s.category ?? ""} ${s.teacher?.name ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesTrack = trackFilter === "ALL" || s.category === trackFilter;
    const matchesYear =
      yearFilter === "ALL" ||
      (yearFilter === "1" && s.year === 1) ||
      (yearFilter === "2" && s.year === 2);
    return matchesQuery && matchesTrack && matchesYear;
  });

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const pagedStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

  function formatStudentYear(student: StudentRow): string {
    if (student.year === 1 || student.year === 2) return String(student.year);
    const calendarYear = new Date(student.createdAt).getFullYear();
    return Number.isNaN(calendarYear) ? "—" : String(calendarYear);
  }

  function openAttemptHistory(studentId: string) {
    router.push(`/dashboard/admin/user-management/students/${encodeURIComponent(studentId)}`);
  }

  const editCredentialAccount = useMemo<CredentialAccount | null>(
    () =>
      editStudent
        ? {
            id: editStudent.id,
            name: editStudent.name,
            role: "STUDENT",
            email: editStudent.email,
            username: editStudent.username,
            category: editStudent.category,
            year: editStudent.year,
          }
        : null,
    [editStudent]
  );

  return (
    <div className="space-y-4">
      {success && !modal ? <p className="text-sm text-green-700">{success}</p> : null}
      {error && !modal ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            Track
            <select
              className="min-w-[8rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              value={trackFilter}
              onChange={(e) => {
                setTrackFilter(e.target.value as "ALL" | "JEE" | "NEET");
                setPage(1);
              }}
            >
              <option value="ALL">All tracks</option>
              <option value="JEE">JEE</option>
              <option value="NEET">NEET</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-[var(--muted)]">
            Year
            <select
              className="min-w-[8rem] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value as "ALL" | "1" | "2");
                setPage(1);
              }}
            >
              <option value="ALL">All years</option>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
            </select>
          </label>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              closeModal();
              setModal("bulk");
            }}
          >
            Bulk enrolment
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium"
            onClick={() => {
              closeModal();
              setModal("single");
            }}
          >
            Add Single Student
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search by name, email, username, track, teacher..."
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
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium">Login ID</th>
              <th className="px-4 py-3 font-medium">Target exam</th>
              <th className="px-4 py-3 font-medium">Teacher</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedStudents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--muted)]">
                  No students match your filters.
                </td>
              </tr>
            ) : null}
            {pagedStudents.map((s, i) => (
              <tr
                key={s.id}
                className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--background)]"
                onClick={() => openAttemptHistory(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAttemptHistory(s.id);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`View attempt history for ${s.name}`}
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {autoRoll ? rollNumberFor(s, (page - 1) * pageSize + i) : "—"}
                </td>
                <td className="px-4 py-3 font-medium text-[var(--accent)]">{s.name}</td>
                <td className="px-4 py-3">{formatStudentYear(s)}</td>
                <td className="px-4 py-3">{displayLoginId(s)}</td>
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
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--card)]"
                      aria-label={`Edit credentials for ${s.name}`}
                      title="Edit credentials"
                      onClick={() => {
                        setEditStudent(s);
                        setError(null);
                        setSuccess(null);
                        setModal("edit");
                      }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Delete ${s.name}`}
                      title="Delete student"
                      disabled={deletingId === s.id}
                      onClick={() => void deleteStudent(s)}
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </td>
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

      {modal === "bulk" ? (
        <Modal title="Bulk enrolment" onClose={closeModal}>
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              <span className="font-medium text-[var(--foreground)]">Upload CSV</span>
              <span className="mt-1 text-xs">
                name, category, email or username, teacherEmail or teacherUsername, password (optional)
              </span>
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
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </Modal>
      ) : null}

      {modal === "single" ? (
        <Modal title="Add Single Student" onClose={closeModal}>
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
              placeholder="Email (optional if username set)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Username (optional if email set)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={year}
              onChange={(e) => setYear(e.target.value as "1" | "2")}
              required
            >
              <option value="1">Year: 1</option>
              <option value="2">Year: 2</option>
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
                  {t.name} ({displayLoginId(t)})
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
        </Modal>
      ) : null}

      {modal === "edit" && editCredentialAccount ? (
        <Modal title={`Edit credentials — ${editCredentialAccount.name}`} onClose={closeModal}>
          <ResetCredentialsForm
            accounts={[]}
            fixedAccount={editCredentialAccount}
            onUpdated={async () => {
              await load();
              closeModal();
              setSuccess(`Credentials updated for ${editCredentialAccount.name}.`);
            }}
            onCancel={closeModal}
          />
        </Modal>
      ) : null}
    </div>
  );
}

type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
  category?: string | null;
  role: "TEACHER" | "ADMIN";
};

export function TeacherRolesPanel({ resetKey: _resetKey }: { resetKey?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: teachersData } = useAdminTeachersQuery();
  const { data: adminsData } = useAdminAdminsQuery();
  const teachers = teachersData?.teachers ?? [];
  const admins = adminsData?.admins ?? [];

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState<"JEE" | "NEET">("JEE");
  const [createRole, setCreateRole] = useState<"TEACHER" | "ADMIN">("TEACHER");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useAutoClearMessage(success, setSuccess);

  const load = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dataKeys.adminTeachers }),
      queryClient.invalidateQueries({ queryKey: dataKeys.adminAdmins }),
    ]);
  }, [queryClient]);

  function closeModal() {
    setModal(null);
    setEditStaff(null);
    setError(null);
  }

  const staff = useMemo<StaffRow[]>(() => {
    const rows: StaffRow[] = [
      ...teachers.map((t) => ({ ...t, role: "TEACHER" as const })),
      ...admins.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        username: a.username,
        role: "ADMIN" as const,
      })),
    ];
    return rows.sort((x, y) => x.name.localeCompare(y.name));
  }, [teachers, admins]);

  const filteredStaff = staff.filter((s) =>
    `${s.name} ${s.email ?? ""} ${s.username ?? ""} ${s.category ?? ""} ${s.role}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const pagedStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize);

  function openStaffDetail(row: StaffRow) {
    if (row.role === "TEACHER") {
      router.push(
        `/dashboard/admin/user-management/teachers/${encodeURIComponent(row.id)}/paper-access`
      );
    } else {
      setEditStaff(row);
      setError(null);
      setSuccess(null);
      setModal("edit");
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() && !username.trim()) {
      setError("Enter an email or username.");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        password,
        role: createRole,
        ...(createRole === "TEACHER" ? { category } : {}),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not create account");
      return;
    }
    setName("");
    setEmail("");
    setUsername("");
    setPassword("");
    setCreateRole("TEACHER");
    const roleLabel = createRole === "ADMIN" ? "Admin" : "Teacher";
    setSuccess(`${roleLabel} "${j?.user?.name ?? name}" created.`);
    pushAuditTrail(
      "USER_CREATED",
      createRole === "ADMIN"
        ? `Admin ${displayLoginId(j.user ?? { email, username })}`
        : `Teacher ${displayLoginId(j.user ?? { email, username })}`
    );
    closeModal();
    await load();
  }

  async function deleteStaff(row: StaffRow) {
    const label = row.role === "TEACHER" ? "teacher" : "admin";
    const extra =
      row.role === "TEACHER"
        ? " This also removes their students and related data."
        : "";
    const ok = window.confirm(
      `Delete ${label} "${row.name}"?${extra} This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const endpoint =
        row.role === "TEACHER"
          ? `/api/admin/teachers/${encodeURIComponent(row.id)}`
          : `/api/admin/admins/${encodeURIComponent(row.id)}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Could not delete ${label}`);
        return;
      }
      setSuccess(`${row.role === "TEACHER" ? "Teacher" : "Admin"} "${row.name}" deleted.`);
      pushAuditTrail("USER_DELETED", `${row.role} ${row.name} removed`);
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const editCredentialAccount = useMemo<CredentialAccount | null>(
    () =>
      editStaff
        ? {
            id: editStaff.id,
            name: editStaff.name,
            role: editStaff.role,
            email: editStaff.email,
            username: editStaff.username,
            category: editStaff.category,
          }
        : null,
    [editStaff]
  );

  return (
    <div className="space-y-4">
      {success && !modal ? <p className="text-sm text-green-700">{success}</p> : null}
      {error && !modal ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          onClick={() => {
            closeModal();
            setSuccess(null);
            setModal("create");
          }}
        >
          Create new Teacher/Admin
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search staff by name, login, track, or role..."
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
              <th className="px-4 py-3 font-medium">Login ID</th>
              <th className="px-4 py-3 font-medium">Track</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedStaff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                  No staff match your search.
                </td>
              </tr>
            ) : null}
            {pagedStaff.map((s) => (
              <tr
                key={`${s.role}-${s.id}`}
                className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--background)]"
                onClick={() => openStaffDetail(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openStaffDetail(s);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={
                  s.role === "TEACHER"
                    ? `Configure paper access for ${s.name}`
                    : `Edit credentials for ${s.name}`
                }
              >
                <td className="px-4 py-3 font-medium text-[var(--accent)]">{s.name}</td>
                <td className="px-4 py-3">{displayLoginId(s)}</td>
                <td className="px-4 py-3">
                  {s.category ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.category === "NEET"
                          ? "bg-violet-100 text-violet-800"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {s.category}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">{s.role === "TEACHER" ? "Teacher" : "Admin"}</td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--card)]"
                      aria-label={`Edit credentials for ${s.name}`}
                      title="Edit credentials"
                      onClick={() => {
                        setEditStaff(s);
                        setError(null);
                        setSuccess(null);
                        setModal("edit");
                      }}
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Delete ${s.name}`}
                      title={`Delete ${s.role === "TEACHER" ? "teacher" : "admin"}`}
                      disabled={deletingId === s.id}
                      onClick={() => void deleteStaff(s)}
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm">
          <p className="text-[var(--muted)]">
            Showing {pagedStaff.length} of {filteredStaff.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="px-2 py-1 text-[var(--muted)]">
              Page {page} of {pageCount}
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

      {modal === "create" ? (
        <Modal title="Create new Teacher/Admin" onClose={closeModal}>
          <form className="grid gap-3" onSubmit={submitCreate}>
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as "TEACHER" | "ADMIN")}
            >
              <option value="TEACHER">Role: Teacher</option>
              <option value="ADMIN">Role: Admin</option>
            </select>
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
              placeholder="Email (optional if username set)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Username (optional if email set)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {createRole === "TEACHER" ? (
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as "JEE" | "NEET")}
              >
                <option value="JEE">Track: JEE</option>
                <option value="NEET">Track: NEET</option>
              </select>
            ) : null}
            <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
              Create account
            </button>
          </form>
          {success ? <p className="mt-3 text-sm text-green-700">{success}</p> : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </Modal>
      ) : null}

      {modal === "edit" && editCredentialAccount ? (
        <Modal title={`Edit credentials — ${editCredentialAccount.name}`} onClose={closeModal}>
          <ResetCredentialsForm
            accounts={[]}
            fixedAccount={editCredentialAccount}
            onUpdated={async () => {
              pushAuditTrail("CREDENTIALS_RESET", `${editCredentialAccount.role} ${editCredentialAccount.name} login updated`);
              await load();
              closeModal();
              setSuccess(`Credentials updated for ${editCredentialAccount.name}.`);
            }}
            onCancel={closeModal}
          />
        </Modal>
      ) : null}
    </div>
  );
}
