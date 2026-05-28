export const VIOLATION_LIMIT = 1;

export type SessionStatus = "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
export type ProctorEventType =
  | "TAB_HIDDEN"
  | "WINDOW_BLUR"
  | "PERMISSION_DENIED"
  | "PERMISSION_REVOKED"
  | "CAMERA_MISSING"
  | "MIC_MISSING"
  | "HEARTBEAT"
  | "FULLSCREEN_EXIT"
  | "CLIPBOARD_ATTEMPT";

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function computeSessionDeadline(startedAt: Date, examEndTime: Date, durationMinutes: number): Date {
  const durationCutoff = new Date(startedAt.getTime() + durationMinutes * 60_000);
  return durationCutoff.getTime() < examEndTime.getTime() ? durationCutoff : examEndTime;
}
