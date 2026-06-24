export type PaperAccess = { create: boolean; publish: boolean; grade: boolean };

export type AuditEntry = { at: string; action: string; detail: string };

export const PAPER_ACCESS_KEY = "admin-teacher-paper-access";
export const AUDIT_TRAIL_KEY = "admin-audit-trail";

export const DEFAULT_PAPER_ACCESS: PaperAccess = {
  create: true,
  publish: false,
  grade: true,
};

export const PAPER_ACCESS_LABELS: Record<keyof PaperAccess, string> = {
  create: "Create / edit papers",
  publish: "Publish exams",
  grade: "Grade / view results",
};

export function formatPaperAccessState(access: PaperAccess): string {
  return (Object.keys(PAPER_ACCESS_LABELS) as (keyof PaperAccess)[])
    .map((key) => `${PAPER_ACCESS_LABELS[key]}: ${access[key] ? "enabled" : "disabled"}`)
    .join("; ");
}

export function describePaperAccessChanges(
  before: PaperAccess,
  after: PaperAccess,
  patch: Partial<PaperAccess>
): string[] {
  return (Object.keys(patch) as (keyof PaperAccess)[])
    .filter((key) => before[key] !== after[key])
    .map(
      (key) =>
        `${PAPER_ACCESS_LABELS[key]}: ${before[key] ? "enabled" : "disabled"} → ${after[key] ? "enabled" : "disabled"}`
    );
}

export function readPaperAccess(): Record<string, PaperAccess> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PAPER_ACCESS_KEY) ?? "{}") as Record<string, PaperAccess>;
  } catch {
    return {};
  }
}

export function writePaperAccess(map: Record<string, PaperAccess>) {
  localStorage.setItem(PAPER_ACCESS_KEY, JSON.stringify(map));
}

export function getPaperAccessForTeacher(
  teacherId: string,
  map?: Record<string, PaperAccess>
): PaperAccess {
  const store = map ?? readPaperAccess();
  return store[teacherId] ?? DEFAULT_PAPER_ACCESS;
}

export function readAuditTrail(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(AUDIT_TRAIL_KEY) ?? "[]") as AuditEntry[];
  } catch {
    return [];
  }
}

export function pushAuditTrail(action: string, detail: string) {
  if (typeof window === "undefined") return;
  const prev = readAuditTrail();
  const next = [{ at: new Date().toISOString(), action, detail }, ...prev].slice(0, 100);
  localStorage.setItem(AUDIT_TRAIL_KEY, JSON.stringify(next));
}
