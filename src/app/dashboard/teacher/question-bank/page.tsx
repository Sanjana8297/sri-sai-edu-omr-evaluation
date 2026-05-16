"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SUBJECTS_BY_TRACK, type TeacherTrack } from "@/lib/dashboard-nav";

/** Index route — pick first subject for track and open it (subjects live in the sidebar). */
export default function TeacherQuestionBankPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Opening question bank…");

  useEffect(() => {
    let cancelled = false;

    async function redirectToSubject() {
      try {
        const res = await fetch("/api/me");
        const json = await res.json();
        const track: TeacherTrack =
          res.ok && (json.user?.category === "JEE" || json.user?.category === "NEET")
            ? json.user.category
            : "JEE";
        if (cancelled) return;
        const subject = SUBJECTS_BY_TRACK[track][0];
        router.replace(`/dashboard/teacher/question-bank/${encodeURIComponent(subject)}`);
      } catch {
        if (!cancelled) {
          setMessage("Could not load your track. Use the sidebar under Question Bank to open a subject.");
        }
      }
    }

    void redirectToSubject();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6">
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
