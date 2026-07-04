"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RankListRow, type RankListRowData } from "@/components/reports/RankListRow";
import { dashTable, dashTableHead, dashTableWrap } from "@/lib/dashboard-ui";

type RankListTableProps = {
  rows: RankListRowData[];
  threshold?: number;
  selectedStudentId?: string;
  onSelectStudent?: (studentId: string) => void;
  /** When true, omit outer card wrapper (for use inside an existing panel). */
  embedded?: boolean;
  maxHeightClass?: string;
};

export function RankListTable({
  rows,
  threshold = 40,
  selectedStudentId,
  onSelectStudent,
  embedded = false,
  maxHeightClass = "max-h-64",
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
    <thead className={`${dashTableHead} sticky top-0 z-10`}>
      <tr>
        <th className="text-left">Rank</th>
        <th className="text-left">Student</th>
        <th className="text-right">Avg %</th>
        <th className="text-left">Latest Exam Score</th>
      </tr>
    </thead>
  );

  const wrapClass = embedded
    ? `${maxHeightClass} overflow-auto rounded-xl bg-[color-mix(in_srgb,var(--background)_45%,transparent)]`
    : `${dashTableWrap} ${maxHeightClass} overflow-y-auto`;

  if (!useVirtual) {
    return (
      <div className={wrapClass}>
        <table className={dashTable}>
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
    <div className={embedded ? wrapClass : dashTableWrap}>
      <table className={dashTable}>
        {header}
      </table>
      <div ref={parentRef} className={`${maxHeightClass} overflow-y-auto`}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <table
                key={row.studentId}
                className={dashTable}
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
