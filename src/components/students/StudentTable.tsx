"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { StudentRow } from "./StudentRow";
import type { TeacherStudent } from "@/lib/data/fetchers";

type StudentTableProps = {
  students: TeacherStudent[];
  threshold?: number;
  emptyMessage?: string;
  renderActions: (student: TeacherStudent) => ReactNode;
};

export function StudentTable({
  students,
  threshold = 50,
  emptyMessage = "No students match your search.",
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
    <thead className="border-b border-[var(--border)] text-[var(--muted)]">
      <tr>
        <th className="px-4 py-3 font-medium">Name</th>
        <th className="px-4 py-3 font-medium">Login ID</th>
        <th className="px-4 py-3 font-medium">Year</th>
        <th className="px-4 py-3 font-medium text-right">Actions</th>
      </tr>
    </thead>
  );

  if (students.length === 0) {
    return (
      <table className="min-w-full text-left text-sm">
        {header}
        <tbody>
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-[var(--muted)]">
              {emptyMessage}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (!useVirtual) {
    return (
      <table className="min-w-full text-left text-sm">
        {header}
        <tbody>
          {students.map((student) => (
            <StudentRow key={student.id} student={student} actions={renderActions(student)} />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div>
      <table className="min-w-full text-left text-sm">{header}</table>
      <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const student = students[virtualRow.index];
            return (
              <table
                key={student.id}
                className="min-w-full text-left text-sm"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
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
