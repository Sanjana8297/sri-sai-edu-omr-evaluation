"use client";

import type { TeacherTrack } from "@/lib/dashboard-nav";

export type FilterState = {
  search: string;
  difficulty: "All" | "easy" | "medium" | "hard";
  year: string;
  chapter: string;
  importantOnly: boolean;
  repeatedOnly: boolean;
  jeeExamType: "All" | "mains" | "advanced";
};

type Props = {
  track: TeacherTrack;
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
};

export function QuestionBankFilters({ track, filters, onChange }: Props) {
  return (
    <>
      <div className="grid gap-2 md:grid-cols-5">
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Search keywords"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          value={filters.difficulty}
          onChange={(e) => onChange({ difficulty: e.target.value as FilterState["difficulty"] })}
        >
          <option value="All">All difficulties</option>
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Year (e.g. 2024)"
          value={filters.year}
          onChange={(e) => onChange({ year: e.target.value })}
        />
        <input
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="Chapter"
          value={filters.chapter}
          onChange={(e) => onChange({ chapter: e.target.value })}
        />
        {track === "JEE" ? (
          <select
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            value={filters.jeeExamType}
            onChange={(e) => onChange({ jeeExamType: e.target.value as FilterState["jeeExamType"] })}
          >
            <option value="All">All exam types</option>
            <option value="mains">JEE Mains</option>
            <option value="advanced">JEE Advanced</option>
          </select>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.importantOnly}
            onChange={(e) => onChange({ importantOnly: e.target.checked })}
          />
          Important only
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.repeatedOnly}
            onChange={(e) => onChange({ repeatedOnly: e.target.checked })}
          />
          Repeated only
        </label>
      </div>
    </>
  );
}
