/** How long after an exam ends it stays visible on Exam Scheduling. */
export const SCHEDULED_EXAM_LIST_GRACE_MS = 24 * 60 * 60 * 1000;

export function isExamListedInScheduling(endTime: string | Date): boolean {
  const end = typeof endTime === "string" ? new Date(endTime) : endTime;
  if (Number.isNaN(end.getTime())) return true;
  return Date.now() < end.getTime() + SCHEDULED_EXAM_LIST_GRACE_MS;
}
