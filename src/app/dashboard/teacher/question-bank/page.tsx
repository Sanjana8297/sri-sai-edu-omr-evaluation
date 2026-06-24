"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SUBJECTS_BY_TRACK, type TeacherTrack } from "@/lib/dashboard-nav";
import { useMeQuery } from "@/hooks/data/use-me";

/** Index route — pick first subject for track and open it (subjects live in the sidebar). */
export default function TeacherQuestionBankPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useMeQuery();
  const [message, setMessage] = useState("Opening question bank…");

  useEffect(() => {
    if (isLoading) return;

    const track: TeacherTrack =
      data?.user?.category === "JEE" || data?.user?.category === "NEET"
        ? data.user.category
        : "JEE";

    if (isError) {
      setMessage("Could not load your track. Use the sidebar under Question Bank to open a subject.");
      return;
    }

    const subject = SUBJECTS_BY_TRACK[track][0];
    router.replace(`/dashboard/teacher/question-bank/${encodeURIComponent(subject)}`);
  }, [data, isError, isLoading, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6">
      <p className="text-sm text-[var(--muted)]">{message}</p>
    </div>
  );
}
