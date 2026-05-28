"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import {
  InstitutionDashboardPanel,
  PerformanceAnalyticsPanel,
  ResultScoreReportsPanel,
} from "./reports-analytics-panels";

type ReportsSection = "results" | "analytics" | "institution";

const SECTION_LABELS: Record<ReportsSection, string> = {
  results: "Result & Score Reports",
  analytics: "Performance Analytics",
  institution: "Institution Dashboard",
};

const SECTION_SUBTITLES: Record<ReportsSection, string> = {
  results: "Instant and aggregate",
  analytics: "AI-driven insights",
  institution: "Centre-level overview",
};

function AdminReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<ReportsSection>("results");

  useEffect(() => {
    const param = searchParams.get("section");
    if (param === "results" || param === "analytics" || param === "institution") {
      setSection(param);
    } else {
      router.replace("/dashboard/admin/reports?section=results");
    }
  }, [searchParams, router]);

  return (
    <DashboardShell
      badge="Administrator"
      title="Reports & Analytics"
      subtitle={SECTION_SUBTITLES[section]}
      navItems={adminNavItems}
      fullWidthContent
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 border-b border-[var(--border)] pb-4">
          <h2 className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABELS[section]}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{SECTION_SUBTITLES[section]}</p>
        </div>

        {section === "results" ? <ResultScoreReportsPanel resetKey={section} /> : null}
        {section === "analytics" ? <PerformanceAnalyticsPanel resetKey={section} /> : null}
        {section === "institution" ? <InstitutionDashboardPanel resetKey={section} /> : null}
      </div>
    </DashboardShell>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <AdminReportsContent />
    </Suspense>
  );
}
