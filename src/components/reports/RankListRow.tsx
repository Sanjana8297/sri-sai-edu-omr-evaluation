"use client";

import { memo } from "react";
import { dashTableRow } from "@/lib/dashboard-ui";

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
      className={`${dashTableRow} ${
        onSelect ? "cursor-pointer" : ""
      } ${selected ? "!bg-[var(--accent-soft)]" : ""}`}
      onClick={onSelect ? () => onSelect(row.studentId) : undefined}
    >
      <td className="font-medium">#{row.rank}</td>
      <td>
        {row.name}
        <span className="ml-1 text-xs text-[var(--muted)]">({row.category})</span>
      </td>
      <td className="text-right tabular-nums">{row.avgPct}%</td>
      <td>
        <span className="tabular-nums">{row.latestExamScore}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{row.latestExamTitle}</span>
      </td>
    </tr>
  );
});
