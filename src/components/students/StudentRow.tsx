"use client";

import { memo, type ReactNode } from "react";
import { dashTableRow } from "@/lib/dashboard-ui";
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
    <tr className={dashTableRow}>
      <td className="font-medium">{student.name}</td>
      <td>{displayLoginId(student)}</td>
      <td>{formatStudentYear(student)}</td>
      <td>
        <div className="flex items-center justify-end gap-2">{actions}</div>
      </td>
    </tr>
  );
});

export { formatStudentYear };
