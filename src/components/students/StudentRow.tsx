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

/** Shared column widths so header + every row stay aligned (including virtualized tables). */
export const STUDENT_TABLE_COLS = (
  <colgroup>
    <col className="w-[40%]" />
    <col className="w-[35%]" />
    <col className="w-[10%]" />
    <col className="w-[15%]" />
  </colgroup>
);

type StudentRowProps = {
  student: TeacherStudent;
  actions: ReactNode;
};

export const StudentRow = memo(function StudentRow({ student, actions }: StudentRowProps) {
  const loginId = displayLoginId(student);
  return (
    <tr className={dashTableRow}>
      <td className="max-w-0 font-medium">
        <span className="block truncate" title={student.name}>
          {student.name}
        </span>
      </td>
      <td className="max-w-0">
        <span className="block truncate font-mono text-xs sm:text-sm" title={loginId}>
          {loginId}
        </span>
      </td>
      <td className="whitespace-nowrap">{formatStudentYear(student)}</td>
      <td className="whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">{actions}</div>
      </td>
    </tr>
  );
});

export { formatStudentYear };
