"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import {
  ResetCredentialsForm,
  type CredentialAccount,
} from "@/components/ResetCredentialsForm";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { displayLoginId } from "@/lib/user-login-id";
import { useAutoClearMessage } from "@/hooks/use-auto-clear-message";

type Student = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  category: string | null;
  year: number | null;
  createdAt: string;
};

function formatStudentYear(student: Student): string {
  if (student.year === 1 || student.year === 2) return String(student.year);
  const calendarYear = new Date(student.createdAt).getFullYear();
  return Number.isNaN(calendarYear) ? "—" : String(calendarYear);
}

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
        aria-labelledby="teacher-student-modal-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="teacher-student-modal-title" className="text-lg font-semibold">
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

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useAutoClearMessage(success, setSuccess);

  const load = useCallback(async () => {
    const res = await fetch("/api/teacher/students");
    const j = await res.json();
    if (j.students) setStudents(j.students);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = students.filter((s) =>
    `${s.name} ${s.email ?? ""} ${s.username ?? ""} ${formatStudentYear(s)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

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

  function closeEditModal() {
    setEditStudent(null);
    setError(null);
  }

  async function deleteStudent(student: Student) {
    const ok = window.confirm(
      `Delete student "${student.name}"? This removes their account and exam sessions. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(student.id);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/students/${encodeURIComponent(student.id)}`, {
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

  return (
    <DashboardShell
      badge="Teacher"
      title="Student Management"
      subtitle="Manage students assigned to your profile."
      navItems={teacherNavItems}
    >
      {success && !editStudent ? <p className="mb-3 text-sm text-green-700">{success}</p> : null}
      {error && !editStudent ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] p-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search students by name, email, username, year..."
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
              <th className="px-4 py-3 font-medium">Year</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted)]">
                  No students match your search.
                </td>
              </tr>
            ) : null}
            {paged.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{displayLoginId(s)}</td>
                <td className="px-4 py-3">{formatStudentYear(s)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="rounded border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--background)]"
                      aria-label={`Edit credentials for ${s.name}`}
                      title="Edit credentials"
                      onClick={() => {
                        setEditStudent(s);
                        setError(null);
                        setSuccess(null);
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

      {editStudent && editCredentialAccount ? (
        <Modal title={`Edit credentials — ${editCredentialAccount.name}`} onClose={closeEditModal}>
          <ResetCredentialsForm
            accounts={[]}
            fixedAccount={editCredentialAccount}
            credentialsApiPath="/api/teacher/students/credentials"
            onUpdated={async () => {
              await load();
              closeEditModal();
              setSuccess(`Credentials updated for ${editCredentialAccount.name}.`);
            }}
            onCancel={closeEditModal}
          />
        </Modal>
      ) : null}
    </DashboardShell>
  );
}
