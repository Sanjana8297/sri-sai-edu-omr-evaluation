"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RankListRow, type RankListRowData } from "@/components/reports/RankListRow";

type RankListTableProps = {
  rows: RankListRowData[];
  threshold?: number;
  selectedStudentId?: string;
  onSelectStudent?: (studentId: string) => void;
};

export function RankListTable({
  rows,
  threshold = 40,
  selectedStudentId,
  onSelectStudent,
}: RankListTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const useVirtual = rows.length > threshold;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => (useVirtual ? parentRef.current : null),
    estimateSize: () => 56,
    overscan: 8,
  });

  const header = (
    <thead className="sticky top-0 z-10 bg-[var(--card)] text-[var(--muted)]">
      <tr>
        <th className="px-3 py-2">Rank</th>
        <th className="px-3 py-2">Student</th>
        <th className="px-3 py-2">Avg %</th>
        <th className="px-3 py-2">Latest Exam Score</th>
      </tr>
    </thead>
  );

  if (!useVirtual) {
    return (
      <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
        <table className="min-w-full text-left text-sm">
          {header}
          <tbody>
            {rows.map((row) => (
              <RankListRow
                key={row.studentId}
                row={row}
                selected={selectedStudentId === row.studentId}
                onSelect={
                  onSelectStudent
                    ? (id) => onSelectStudent(selectedStudentId === id ? "" : id)
                    : undefined
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        {header}
      </table>
      <div ref={parentRef} className="max-h-64 overflow-y-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <table
                key={row.studentId}
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
                  <RankListRow
                    row={row}
                    selected={selectedStudentId === row.studentId}
                    onSelect={
                      onSelectStudent
                        ? (id) => onSelectStudent(selectedStudentId === id ? "" : id)
                        : undefined
                    }
                  />
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </div>
  );
}
