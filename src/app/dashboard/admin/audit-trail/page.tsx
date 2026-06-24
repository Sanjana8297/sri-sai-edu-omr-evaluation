"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { readAuditTrail, type AuditEntry } from "@/lib/admin-staff-storage";

function formatActionLabel(action: string): string {
  switch (action) {
    case "PERMISSION_UPDATE":
      return "Permission update";
    case "USER_CREATED":
      return "User created";
    case "USER_DELETED":
      return "User deleted";
    case "CREDENTIALS_RESET":
      return "Credentials reset";
    default:
      return action.replace(/_/g, " ");
  }
}

function AuditEntryCard({ entry }: { entry: AuditEntry }) {
  const isPermissionUpdate = entry.action === "PERMISSION_UPDATE";
  const hasStructuredDetail = isPermissionUpdate && entry.detail.includes(" — ");
  const [staffName, ...rest] = hasStructuredDetail ? entry.detail.split(" — ") : ["", []];
  const changeText = rest.join(" — ").split(". Current permissions:")[0].trim();

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm">
      <p className="font-medium">{formatActionLabel(entry.action)}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{new Date(entry.at).toLocaleString()}</p>
      {hasStructuredDetail ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            <span className="text-[var(--muted)]">Staff:</span> {staffName}
          </p>
          {changeText ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Changes</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {changeText.split("; ").map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-[var(--foreground)]">{entry.detail}</p>
      )}
    </li>
  );
}

export default function AdminAuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setEntries(readAuditTrail());
  }, []);

  return (
    <DashboardShell
      badge="Administrator"
      title="Activity / audit trail"
      subtitle="Recent admin actions recorded in this browser"
      navItems={adminNavItems}
      fullWidthContent
    >
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No audit entries yet. Actions such as creating staff, updating permissions, or resetting credentials
          will appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <AuditEntryCard key={`${entry.at}-${entry.action}-${entry.detail}`} entry={entry} />
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
