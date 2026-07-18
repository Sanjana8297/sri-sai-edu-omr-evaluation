"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import {
  ResetCredentialsForm,
  type CredentialAccount,
} from "@/components/ResetCredentialsForm";
import { TableSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { StudentTable } from "@/components/students/StudentTable";
import {
  dashBtnDanger,
  dashBtnPrimary,
  dashBtnSecondary,
  dashInput,
  dashPanel,
  dashTableWrap,
} from "@/lib/dashboard-ui";
import { useTeacherStudentsQuery } from "@/hooks/data/use-teacher-students";
import { dataKeys } from "@/hooks/data/keys";
import { useAutoClearMessage } from "@/hooks/use-auto-clear-message";
import type { TeacherStudent } from "@/lib/data/fetchers";

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
        className={`${dashPanel} max-h-[90vh] w-full max-w-lg overflow-y-auto shadow-xl`}
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
            className={dashBtnSecondary}
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

type TeacherStudentsClientProps = {
  initialData?: Awaited<ReturnType<typeof import("@/lib/data/fetchers").fetchTeacherStudents>>;
};

export function TeacherStudentsClient({ initialData }: TeacherStudentsClientProps) {
  useSetDashboardPage({
    title: "Student Management",
    subtitle: "Manage students assigned to your profile.",
  });

  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useTeacherStudentsQuery(initialData);
  const students = data?.students ?? [];
  const teacherCategory =
    data?.teacher?.category === "JEE" || data?.teacher?.category === "NEET"
      ? data.teacher.category
      : null;

  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<TeacherStudent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [password, setPassword] = useState("");
  const [year, setYear] = useState<"1" | "2">("1");
  const [rollEdit, setRollEdit] = useState("");
  const [rollSaving, setRollSaving] = useState(false);

  useAutoClearMessage(success, setSuccess);

  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: dataKeys.teacherStudents });
    await refetch();
  }, [queryClient, refetch]);

  const filtered = students.filter((s) =>
    `${s.name} ${s.email ?? ""} ${s.username ?? ""} ${s.rollNumber ?? ""} ${s.year ?? ""} ${s.createdAt}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

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

  function closeCreateModal() {
    setCreateOpen(false);
    setError(null);
    setName("");
    setEmail("");
    setUsername("");
    setRollNumber("");
    setPassword("");
    setYear("1");
  }

  async function createStudent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!email.trim() && !username.trim()) {
      setError("Enter an email or username for the student.");
      return;
    }
    const res = await fetch("/api/teacher/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: email.trim() || undefined,
        username: username.trim() || undefined,
        rollNumber: rollNumber.trim() || undefined,
        password,
        year: Number(year),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Could not create student");
      return;
    }
    closeCreateModal();
    setSuccess(`Student "${j?.user?.name ?? name}" created.`);
    await load();
  }

  async function saveRollNumber() {
    if (!editStudent) return;
    setRollSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/students/${encodeURIComponent(editStudent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber: rollEdit.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Could not update roll number");
        return;
      }
      await load();
      setEditStudent((prev) => (prev ? { ...prev, rollNumber: j?.student?.rollNumber ?? null } : prev));
      setSuccess(`Roll number updated for ${editStudent.name}.`);
    } finally {
      setRollSaving(false);
    }
  }

  async function deleteStudent(student: TeacherStudent) {
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

  if (isLoading && !data) return <TableSkeleton rows={8} />;

  return (
    <>
      {success && !editStudent && !createOpen ? <p className="mb-3 text-sm text-green-700">{success}</p> : null}
      {error && !editStudent && !createOpen ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          className={dashBtnSecondary}
          onClick={() => {
            setError(null);
            setSuccess(null);
            setCreateOpen(true);
          }}
        >
          Create a new Student
        </button>
      </div>

      <div className={dashTableWrap}>
        <div className="border-b border-[var(--border)] p-3">
          <input
            className={dashInput}
            placeholder="Search students by name, email, username, year..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <StudentTable
          students={filtered}
          embedded
          renderActions={(s) => (
            <>
              <button
                type="button"
                className={`${dashBtnSecondary} !p-2`}
                aria-label={`Edit credentials for ${s.name}`}
                title="Edit credentials"
                onClick={() => {
                  setEditStudent(s);
                  setRollEdit(s.rollNumber ?? "");
                  setError(null);
                  setSuccess(null);
                }}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                className={`${dashBtnDanger} !p-2`}
                aria-label={`Delete ${s.name}`}
                title="Delete student"
                disabled={deletingId === s.id}
                onClick={() => void deleteStudent(s)}
              >
                <DeleteIcon />
              </button>
            </>
          )}
        />
        <div className="border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
          Showing {filtered.length} student{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      {createOpen ? (
        <Modal title="Create a new Student" onClose={closeCreateModal}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createStudent} autoComplete="off">
            <input
              className={`${dashInput} sm:col-span-2`}
              name="student-display-name"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
            <input
              className={dashInput}
              type="text"
              inputMode="email"
              name="student-email"
              placeholder="Email (optional if username set)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
            <input
              className={dashInput}
              type="text"
              name="student-username"
              placeholder="Username (optional if email set)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <input
              className={`${dashInput} sm:col-span-2`}
              type="text"
              name="student-roll-number"
              placeholder="Roll number (used to match scanned OMR sheets)"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <input
              className={`${dashInput} sm:col-span-2`}
              type="password"
              name="student-temp-password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--muted)]">
              Target: <span className="font-medium text-[var(--foreground)]">{teacherCategory ?? "—"}</span>
            </div>
            <select
              className={dashInput}
              value={year}
              onChange={(e) => setYear(e.target.value as "1" | "2")}
              required
            >
              <option value="1">Year: 1</option>
              <option value="2">Year: 2</option>
            </select>
            <button
              type="submit"
              className={`${dashBtnPrimary} sm:col-span-2`}
            >
              Enrol student
            </button>
          </form>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </Modal>
      ) : null}

      {editStudent && editCredentialAccount ? (
        <Modal title={`Edit credentials — ${editCredentialAccount.name}`} onClose={closeEditModal}>
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
            <label className="block text-sm font-medium">Roll number</label>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Used to auto-match scanned OMR sheets to this student.
            </p>
            <div className="flex gap-2">
              <input
                className={dashInput}
                type="text"
                value={rollEdit}
                placeholder="e.g. NEET-0001"
                onChange={(e) => setRollEdit(e.target.value)}
                spellCheck={false}
              />
              <button
                type="button"
                className={dashBtnPrimary}
                disabled={rollSaving || rollEdit.trim() === (editStudent.rollNumber ?? "").trim()}
                onClick={() => void saveRollNumber()}
              >
                {rollSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
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
    </>
  );
}
