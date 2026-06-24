"use client";

import { memo } from "react";

export type RankListRowData = {
  studentId: string;
  name: string;
  category: string;
  avgPct: number;
  rank: number;
  latestExamTitle: string;
  latestExamScore: string;
};

type RankListRowProps = {
  row: RankListRowData;
  selected?: boolean;
  onSelect?: (studentId: string) => void;
};

export const RankListRow = memo(function RankListRow({
  row,
  selected = false,
  onSelect,
}: RankListRowProps) {
  return (
    <tr
      className={`border-t border-[var(--border)] ${
        onSelect ? "cursor-pointer transition-colors hover:bg-[var(--background)]" : ""
      } ${selected ? "bg-[var(--accent-soft)]" : ""}`}
      onClick={onSelect ? () => onSelect(row.studentId) : undefined}
    >
      <td className="px-3 py-2 font-medium">#{row.rank}</td>
      <td className="px-3 py-2">
        {row.name}
        <span className="ml-1 text-xs text-[var(--muted)]">({row.category})</span>
      </td>
      <td className="px-3 py-2">{row.avgPct}%</td>
      <td className="px-3 py-2">
        {row.latestExamScore}
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{row.latestExamTitle}</span>
      </td>
    </tr>
  );
});
