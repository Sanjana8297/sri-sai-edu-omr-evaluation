export type CachedExamProgress = {
  answers: Record<string, string>;
  markedForReview: string[];
  visited: string[];
  updatedAt: string;
};

function cacheKey(examId: string) {
  return `exam-progress:${examId}`;
}

export function readCachedProgress(examId: string): CachedExamProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(examId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedExamProgress;
  } catch {
    return null;
  }
}

export function writeCachedProgress(examId: string, progress: CachedExamProgress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(cacheKey(examId), JSON.stringify(progress));
}

export function clearCachedProgress(examId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cacheKey(examId));
}

const SUBMITTED_EXAM_STORAGE_PREFIX = "exam-submitted-";

export function markExamSubmittedLocally(examId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${SUBMITTED_EXAM_STORAGE_PREFIX}${examId}`, "1");
  } catch {
    /* ignore */
  }
}

export function wasExamSubmittedLocally(examId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(`${SUBMITTED_EXAM_STORAGE_PREFIX}${examId}`) === "1";
  } catch {
    return false;
  }
}

export function clearExamSubmittedLocally(examId: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${SUBMITTED_EXAM_STORAGE_PREFIX}${examId}`);
  } catch {
    /* ignore */
  }
}
