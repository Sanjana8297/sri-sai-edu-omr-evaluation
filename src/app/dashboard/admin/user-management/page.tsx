"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { StudentProfilesPanel, TeacherRolesPanel } from "./admin-user-panels";

type ManagementSection = "profiles" | "roles";

const SECTION_LABELS: Record<ManagementSection, string> = {
  profiles: "Student Profiles",
  roles: "Teacher / Admin Roles",
};

const SECTION_SUBTITLES: Record<ManagementSection, string> = {
  profiles: "Enrolment and records",
  roles: "RBAC permissions",
};

function AdminUserManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<ManagementSection>("profiles");

  useEffect(() => {
    const param = searchParams.get("section");
    if (param === "profiles" || param === "roles") {
      setSection(param);
    } else {
      router.replace("/dashboard/admin/user-management?section=profiles");
    }
  }, [searchParams, router]);

  return (
    <DashboardShell
      badge="Administrator"
      title="Student & User Management"
      subtitle={SECTION_SUBTITLES[section]}
      navItems={adminNavItems}
      fullWidthContent
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 border-b border-[var(--border)] pb-4">
          <h2 className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABELS[section]}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{SECTION_SUBTITLES[section]}</p>
        </div>

        {section === "profiles" ? <StudentProfilesPanel resetKey={section} /> : null}
        {section === "roles" ? <TeacherRolesPanel resetKey={section} /> : null}
      </div>
    </DashboardShell>
  );
}

export default function AdminUserManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <AdminUserManagementContent />
    </Suspense>
  );
}
