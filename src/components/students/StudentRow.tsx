"use client";

import { memo, type ReactNode } from "react";
import { displayLoginId } from "@/lib/user-login-id";
import type { TeacherStudent } from "@/lib/data/fetchers";

function formatStudentYear(student: TeacherStudent): string {
  if (student.year === 1 || student.year === 2) return String(student.year);
  const calendarYear = new Date(student.createdAt).getFullYear();
  return Number.isNaN(calendarYear) ? "—" : String(calendarYear);
}

type StudentRowProps = {
  student: TeacherStudent;
  actions: ReactNode;
};

export const StudentRow = memo(function StudentRow({ student, actions }: StudentRowProps) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="px-4 py-3 font-medium">{student.name}</td>
      <td className="px-4 py-3">{displayLoginId(student)}</td>
      <td className="px-4 py-3">{formatStudentYear(student)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">{actions}</div>
      </td>
    </tr>
  );
});

export { formatStudentYear };
