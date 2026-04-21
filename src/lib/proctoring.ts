export const VIOLATION_LIMIT = 3;

export type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
export type ProctorEventType =
  | "TAB_HIDDEN"
  | "WINDOW_BLUR"
  | "PERMISSION_DENIED"
  | "PERMISSION_REVOKED"
  | "CAMERA_MISSING"
  | "MIC_MISSING"
  | "HEARTBEAT";

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function computeSessionDeadline(startedAt: Date, examEndTime: Date, durationMinutes: number): Date {
  const durationCutoff = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return durationCutoff.getTime() < examEndTime.getTime() ? durationCutoff : examEndTime;
}
