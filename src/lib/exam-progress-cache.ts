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
