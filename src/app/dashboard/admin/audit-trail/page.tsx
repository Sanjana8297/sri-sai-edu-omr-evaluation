"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { readAuditTrail, type AuditEntry } from "@/lib/admin-staff-storage";

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
            <li
              key={`${entry.at}-${entry.action}-${entry.detail}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
            >
              <p className="font-medium">{entry.action}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {new Date(entry.at).toLocaleString()} · {entry.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
