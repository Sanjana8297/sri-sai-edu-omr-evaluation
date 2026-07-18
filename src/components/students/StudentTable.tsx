"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "@/components/ui/EmptyState";
import { dashTable, dashTableHead } from "@/lib/dashboard-ui";
import { StudentRow, STUDENT_TABLE_COLS } from "./StudentRow";
import type { TeacherStudent } from "@/lib/data/fetchers";

type StudentTableProps = {
  students: TeacherStudent[];
  threshold?: number;
  emptyMessage?: string;
  /** When true, skip the outer card wrapper (parent already provides one). */
  embedded?: boolean;
  renderActions: (student: TeacherStudent) => ReactNode;
};

export function StudentTable({
  students,
  threshold = 50,
  emptyMessage = "No students match your search.",
  embedded = false,
  renderActions,
}: StudentTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = students.length > threshold;

  const rowVirtualizer = useVirtualizer({
    count: students.length,
    getScrollElement: () => (useVirtual ? parentRef.current : null),
    estimateSize: () => 52,
    overscan: 8,
  });

  const header = (
    <thead className={dashTableHead}>
      <tr>
        <th className="text-left">Name</th>
        <th className="text-left">Login ID</th>
        <th className="text-left">Roll no.</th>
        <th className="text-left">Year</th>
        <th className="text-right">Actions</th>
      </tr>
    </thead>
  );

  if (students.length === 0) {
    return (
      <EmptyState
        title="No students found"
        description={emptyMessage}
        icon="👥"
      />
    );
  }

  const tableClass = `${dashTable} table-fixed w-full`;

  if (!useVirtual) {
    return (
      <div className={embedded ? "overflow-x-auto" : undefined}>
        <table className={tableClass}>
          {STUDENT_TABLE_COLS}
          {header}
          <tbody>
            {students.map((student) => (
              <StudentRow key={student.id} student={student} actions={renderActions(student)} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <table className={tableClass}>
        {STUDENT_TABLE_COLS}
        {header}
      </table>
      <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const student = students[virtualRow.index];
            return (
              <table
                key={student.id}
                className={tableClass}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {STUDENT_TABLE_COLS}
                <tbody>
                  <StudentRow student={student} actions={renderActions(student)} />
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </div>
  );
}
