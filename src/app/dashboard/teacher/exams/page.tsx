"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { teacherNavItems } from "@/lib/dashboard-nav";
import { OnlineExamModulePanel, OmrSheetManagementPanel } from "./omr-online-panels";

type DeliverySection = "omr" | "online";

const SECTION_LABELS: Record<DeliverySection, string> = {
  omr: "OMR Sheet Management",
  online: "Online Exam Module",
};

const SECTION_SUBTITLES: Record<DeliverySection, string> = {
  omr: "Design, print and scan",
  online: "CBT / hybrid delivery",
};

function TeacherExamsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<DeliverySection>("omr");

  useEffect(() => {
    const param = searchParams.get("section");
    if (param === "scheduling") {
      router.replace("/dashboard/teacher/exam-scheduling");
      return;
    }
    if (param === "omr" || param === "online") {
      setSection(param);
    } else {
      router.replace("/dashboard/teacher/exams?section=omr");
    }
  }, [searchParams, router]);

  return (
    <DashboardShell
      badge="Teacher"
      title="OMR & Exam Delivery"
      subtitle={SECTION_SUBTITLES[section]}
      navItems={teacherNavItems}
      fullWidthContent
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 border-b border-[var(--border)] pb-4">
          <h2 className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABELS[section]}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{SECTION_SUBTITLES[section]}</p>
        </div>

        {section === "omr" ? <OmrSheetManagementPanel resetKey={section} /> : null}
        {section === "online" ? <OnlineExamModulePanel resetKey={section} /> : null}
      </div>
    </DashboardShell>
  );
}

export default function TeacherExamsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <TeacherExamsPageContent />
    </Suspense>
  );
}
