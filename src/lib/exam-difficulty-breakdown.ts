import { compareExamAnswers, parseQuestionPaperContentWithOptions } from "@/lib/exam-paper-parser";

export type DifficultyLabel = "Easy" | "Medium" | "Hard";

export type ExamDifficultyLevel = {
  label: DifficultyLabel;
  /** % of responses on this tier's questions that were correct (null when no responses). */
  accuracy: number | null;
  /** Number of questions classified into this tier. */
  questionCount: number;
  /** Total student responses recorded on this tier's questions. */
  responseCount: number;
};

export type ExamDifficultyBreakdown = {
  examId: string;
  title: string;
  category: string;
  /** ISO date string of the exam start time. */
  date: string;
  sessionCount: number;
  questionCount: number;
  /** % of all recorded responses that were correct (null when no responses). */
  overallAccuracy: number | null;
  levels: ExamDifficultyLevel[];
};

export type ExamDifficultyInput = {
  id: string;
  title: string;
  category: string;
  startTime: Date;
  questionPaper: { questionContent: string; keyContent: string } | null;
  examSessions: Array<{ submittedAnswers: unknown }>;
};

/** Proportion-correct thresholds used to infer per-question difficulty from responses. */
const EASY_MIN = 0.7;
const MEDIUM_MIN = 0.4;

function classify(pCorrect: number): DifficultyLabel {
  if (pCorrect >= EASY_MIN) return "Easy";
  if (pCorrect >= MEDIUM_MIN) return "Medium";
  return "Hard";
}

/**
 * Builds a per-exam accuracy breakdown by inferred question difficulty.
 *
 * The question bank has no difficulty tags, so difficulty is derived from
 * class-wide responses (item analysis): a question's difficulty is based on the
 * proportion of students who answered it correctly. Accuracy for each tier is
 * then the share of correct responses on that tier's questions.
 */
export function buildExamDifficultyBreakdown(
  exams: ExamDifficultyInput[]
): ExamDifficultyBreakdown[] {
  const result: ExamDifficultyBreakdown[] = [];

  for (const exam of exams) {
    if (!exam.questionPaper) continue;

    const { answerKey } = parseQuestionPaperContentWithOptions(
      exam.questionPaper.questionContent,
      exam.questionPaper.keyContent
    );
    const questionIds = Object.keys(answerKey);
    if (questionIds.length === 0) continue;

    const perQuestion = new Map<string, { correct: number; attempted: number }>();
    for (const qid of questionIds) perQuestion.set(qid, { correct: 0, attempted: 0 });

    for (const sessionRow of exam.examSessions) {
      const submitted =
        sessionRow.submittedAnswers && typeof sessionRow.submittedAnswers === "object"
          ? (sessionRow.submittedAnswers as Record<string, string>)
          : {};
      for (const qid of questionIds) {
        const selected = submitted[qid];
        if (!selected) continue;
        const stat = perQuestion.get(qid)!;
        stat.attempted += 1;
        if (compareExamAnswers(selected, answerKey[qid]!)) stat.correct += 1;
      }
    }

    const buckets: Record<DifficultyLabel, { questionCount: number; correct: number; attempted: number }> = {
      Easy: { questionCount: 0, correct: 0, attempted: 0 },
      Medium: { questionCount: 0, correct: 0, attempted: 0 },
      Hard: { questionCount: 0, correct: 0, attempted: 0 },
    };

    for (const qid of questionIds) {
      const stat = perQuestion.get(qid)!;
      if (stat.attempted === 0) continue;
      const tier = classify(stat.correct / stat.attempted);
      buckets[tier].questionCount += 1;
      buckets[tier].correct += stat.correct;
      buckets[tier].attempted += stat.attempted;
    }

    const levels: ExamDifficultyLevel[] = (["Easy", "Medium", "Hard"] as const).map((label) => {
      const b = buckets[label];
      return {
        label,
        accuracy: b.attempted > 0 ? Math.round((b.correct / b.attempted) * 1000) / 10 : null,
        questionCount: b.questionCount,
        responseCount: b.attempted,
      };
    });

    const totalCorrect = buckets.Easy.correct + buckets.Medium.correct + buckets.Hard.correct;
    const totalAttempted = buckets.Easy.attempted + buckets.Medium.attempted + buckets.Hard.attempted;

    result.push({
      examId: exam.id,
      title: exam.title,
      category: exam.category,
      date: exam.startTime.toISOString(),
      sessionCount: exam.examSessions.length,
      questionCount: questionIds.length,
      overallAccuracy: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : null,
      levels,
    });
  }

  result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return result;
}
