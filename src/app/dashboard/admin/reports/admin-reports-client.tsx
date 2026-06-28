"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import {
  PerformanceAnalyticsPanel,
  ResultScoreReportsPanel,
} from "./reports-analytics-panels";
import { InstitutionDashboardPanel } from "./institution-dashboard-panel";

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

function isReportsSection(value: string | null): value is ReportsSection {
  return value === "results" || value === "analytics" || value === "institution";
}

function AdminReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialParam = searchParams.get("section");
  const [section, setSection] = useState<ReportsSection>(
    isReportsSection(initialParam) ? initialParam : "results"
  );

  useEffect(() => {
    const param = searchParams.get("section");
    if (isReportsSection(param)) {
      setSection(param);
    } else {
      router.replace("/dashboard/admin/reports?section=results");
    }
  }, [searchParams, router]);

  useSetDashboardPage({
    title: "Reports & Analytics",
    subtitle: SECTION_SUBTITLES[section],
    fullWidthContent: true,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6 border-b border-[var(--border)] pb-4">
        {section !== "institution" ? (
          <>
            <h2 className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABELS[section]}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{SECTION_SUBTITLES[section]}</p>
          </>
        ) : null}
      </div>

      {section === "results" ? <ResultScoreReportsPanel resetKey={section} /> : null}
      {section === "analytics" ? <PerformanceAnalyticsPanel resetKey={section} /> : null}
      {section === "institution" ? <InstitutionDashboardPanel /> : null}
    </div>
  );
}

export function AdminReportsClient() {
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
