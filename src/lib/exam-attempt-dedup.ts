export function examAttemptFingerprint(
  studentId: string,
  title: string,
  marksObtained: number,
  maxMarks: number
): string {
  return `${studentId}|${title}|${Math.round(marksObtained * 1000)}|${Math.round(maxMarks * 1000)}`;
}

export type NormalizedExamAttempt = {
  sourceId: string;
  studentId: string;
  category: string;
  title: string;
  examDate: Date;
  marksObtained: number;
  maxMarks: number;
};

type SessionRow = {
  id: string;
  studentId: string;
  submittedAt: Date | null;
  startedAt: Date;
  scoreObtained: number | null;
  scoreMax: number | null;
  exam: { title: string; category: string };
};

type AttemptRow = {
  id: string;
  studentId: string;
  category: string;
  title: string;
  examDate: Date;
  marksObtained: number;
  maxMarks: number;
};

/** Merge online sessions and stored attempts; skip rows with the same student/exam/score fingerprint. */
export function mergeUniqueExamAttempts(input: {
  sessions: SessionRow[];
  attempts: AttemptRow[];
}): NormalizedExamAttempt[] {
  const byKey = new Map<string, NormalizedExamAttempt>();

  const add = (row: NormalizedExamAttempt) => {
    if (row.maxMarks <= 0) return;
    const key = examAttemptFingerprint(
      row.studentId,
      row.title,
      row.marksObtained,
      row.maxMarks
    );
    if (!byKey.has(key)) byKey.set(key, row);
  };

  for (const session of input.sessions) {
    if (session.scoreMax == null || session.scoreMax <= 0) continue;
    add({
      sourceId: session.id,
      studentId: session.studentId,
      category: session.exam.category,
      title: session.exam.title,
      examDate: session.submittedAt ?? session.startedAt,
      marksObtained: session.scoreObtained ?? 0,
      maxMarks: session.scoreMax,
    });
  }

  for (const attempt of input.attempts) {
    add({
      sourceId: attempt.id,
      studentId: attempt.studentId,
      category: attempt.category,
      title: attempt.title,
      examDate: attempt.examDate,
      marksObtained: attempt.marksObtained,
      maxMarks: attempt.maxMarks,
    });
  }

  return [...byKey.values()].sort((a, b) => b.examDate.getTime() - a.examDate.getTime());
}

export function overallAvgFromNormalizedAttempts(
  attempts: Array<{ marksObtained: number; maxMarks: number }>
): number | null {
  const valid = attempts.filter((a) => a.maxMarks > 0);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, a) => acc + (a.marksObtained / a.maxMarks) * 100, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}
