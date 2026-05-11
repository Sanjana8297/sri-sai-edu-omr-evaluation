"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";

type Track = "JEE" | "NEET";

const SUBJECTS_BY_TRACK: Record<Track, string[]> = {
  JEE: ["Maths", "Physics", "Chemistry"],
  NEET: ["Physics", "Chemistry", "Botany", "Zoology"],
};

export default function TeacherQuestionBankPage() {
  const router = useRouter();
  const [track, setTrack] = useState<Track>("JEE");
  const [loadingTrack, setLoadingTrack] = useState(true);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});

  const subjects = useMemo(() => SUBJECTS_BY_TRACK[track], [track]);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      const json = await res.json();
      if (res.ok && (json.user?.category === "JEE" || json.user?.category === "NEET")) {
        setTrack(json.user.category);
      }
    } finally {
      setLoadingTrack(false);
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const loadSubjectCounts = useCallback(async () => {
    if (subjects.length === 0) {
      setSubjectCounts({});
      return;
    }

    setLoadingCounts(true);
    try {
      const results = await Promise.all(
        subjects.map(async (subject) => {
          const params = new URLSearchParams({
            subject,
            limit: "1",
            offset: "0",
          });
          const res = await fetch(`/api/teacher/question-bank?${params.toString()}`);
          const json = await res.json();
          if (!res.ok) return [subject, 0] as const;
          return [subject, Number(json.total ?? 0)] as const;
        })
      );
      setSubjectCounts(Object.fromEntries(results));
    } finally {
      setLoadingCounts(false);
    }
  }, [subjects]);

  useEffect(() => {
    if (loadingTrack) return;
    void loadSubjectCounts();
  }, [loadingTrack, loadSubjectCounts]);

  return (
    <DashboardShell
      badge="Teacher"
      title="Question Bank"
      subtitle="Choose a subject card to open its question list page."
      navItems={teacherNavItems}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          Track: <strong>{track}</strong> (subjects shown based on your teacher track)
        </p>
        {loadingTrack ? <p className="text-sm text-[var(--muted)]">Loading your track...</p> : null}
        {!loadingTrack && loadingCounts ? <p className="text-sm text-[var(--muted)]">Loading question counts...</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {subjects.map((subject) => (
            <button
              key={subject}
              type="button"
              onClick={() => router.push(`/dashboard/teacher/question-bank/${encodeURIComponent(subject)}`)}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold">{subject}</p>
                <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                  {subjectCounts[subject] ?? 0}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">Questions available in database</p>
              <p className="mt-4 text-sm font-medium text-[var(--accent)] transition group-hover:translate-x-0.5">
                Open subject →
              </p>
            </button>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
