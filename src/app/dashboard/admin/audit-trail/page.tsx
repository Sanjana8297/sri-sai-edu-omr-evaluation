"use client";

import { useEffect, useState } from "react";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { dashCard, dashCardMeta, dashCardTitle, dashLabel } from "@/lib/dashboard-ui";
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
    <li className={dashCard}>
      <p className={dashCardTitle}>{formatActionLabel(entry.action)}</p>
      <p className={`${dashCardMeta} mt-1 text-xs`}>{new Date(entry.at).toLocaleString()}</p>
      {hasStructuredDetail ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            <span className="text-[var(--muted)]">Staff:</span> {staffName}
          </p>
          {changeText ? (
            <div>
              <p className={dashLabel}>Changes</p>
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
  useSetDashboardPage({
    title: "Activity / audit trail",
    subtitle: "Recent admin actions recorded in this browser",
    fullWidthContent: true,
  });

  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    setEntries(readAuditTrail());
  }, []);

  return (
    <>
      {entries.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No audit entries yet"
          description="Actions such as creating staff, updating permissions, or resetting credentials will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <AuditEntryCard key={`${entry.at}-${entry.action}-${entry.detail}`} entry={entry} />
          ))}
        </ul>
      )}
    </>
  );
}
