import { SUBJECTS_BY_TRACK, type TeacherTrack } from "@/lib/dashboard-nav";
import {
  examAttemptFingerprint,
  mergeUniqueExamAttempts,
  overallAvgFromNormalizedAttempts,
} from "@/lib/exam-attempt-dedup";
import {
  compareExamAnswers,
  parseQuestionPaperContentWithOptions,
} from "@/lib/exam-paper-parser";

export type SubjectScoreRow = {
  subject: string;
  avg: number | null;
  examCount: number;
};

export type StudentSubjectStats = {
  track: TeacherTrack;
  /** All recorded exam attempts (report card). */
  allAttempts: number;
  /** Average % across all recorded attempts (report card). */
  overallAvg: number | null;
  /** Exams with subject-level scores in this breakdown. */
  scoredAttempts: number;
  /** Mean of per-subject averages (subject breakdown header + total row). */
  subjectOverallAvg: number | null;
  subjects: SubjectScoreRow[];
};

export type TrackSubjectStats = {
  allAttempts: number;
  overallAvg: number | null;
  scoredAttempts: number;
  subjectOverallAvg: number | null;
  subjects: SubjectScoreRow[];
};

type ScoreContribution = {
  studentId: string;
  track: TeacherTrack;
  subject: string;
  percentage: number;
  attemptKey: string;
};

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sectionNameToTrackSubject(sectionName: string, track: TeacherTrack): string | null {
  const partBeforeDash = sectionName.split(" - ")[0]?.trim() ?? sectionName.trim();
  const lower = partBeforeDash
    .toLowerCase()
    .replace(/section[\s-]*ii/gi, "")
    .replace(/section[\s-]*i/gi, "")
    .replace(/single correct answer type/gi, "")
    .replace(/numerical value answer type/gi, "")
    .replace(/[()\-:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const subject of SUBJECTS_BY_TRACK[track]) {
    if (lower === subject.toLowerCase() || lower.includes(subject.toLowerCase())) return subject;
    if (subject === "Maths" && (lower.includes("math") || lower.includes("mathematics"))) return "Maths";
  }

  if (track === "NEET") {
    if (lower.includes("botany")) return "Botany";
    if (lower.includes("zoology")) return "Zoology";
  }

  return null;
}

export function titleToSingleSubject(title: string, track: TeacherTrack): string | null {
  const lower = title.toLowerCase();
  const matched = SUBJECTS_BY_TRACK[track].filter((subject) => {
    if (lower.includes(subject.toLowerCase())) return true;
    if (subject === "Maths" && (lower.includes("math") || lower.includes("mathematics"))) return true;
    if (subject === "Botany" && lower.includes("botany")) return true;
    if (subject === "Zoology" && lower.includes("zoology")) return true;
    return false;
  });
  return matched.length === 1 ? matched[0]! : null;
}

function scoreQuestionSubset(
  submittedAnswers: Record<string, string>,
  answerKey: Record<string, string>
): { obtained: number; max: number } {
  const keyEntries = Object.entries(answerKey);
  let obtained = 0;
  for (const [questionId, expectedRaw] of keyEntries) {
    const selectedRaw = submittedAnswers[questionId];
    if (!selectedRaw) continue;
    if (compareExamAnswers(selectedRaw, expectedRaw)) obtained += 4;
    else obtained -= 1;
  }
  return { obtained, max: keyEntries.length * 4 };
}

export function scoreBySubjectFromPaper(input: {
  questionContent: string;
  keyContent: string;
  submittedAnswers: Record<string, string>;
  track: TeacherTrack;
}): Record<string, number> {
  const { sections, answerKey } = parseQuestionPaperContentWithOptions(
    input.questionContent,
    input.keyContent
  );
  const totals = new Map<string, { obtained: number; max: number }>();

  for (const section of sections) {
    const subject = sectionNameToTrackSubject(section.name, input.track);
    if (!subject) continue;

    const sectionKey: Record<string, string> = {};
    for (const question of section.questions) {
      const expected = answerKey[question.id];
      if (expected) sectionKey[question.id] = expected;
    }
    if (Object.keys(sectionKey).length === 0) continue;

    const { obtained, max } = scoreQuestionSubset(input.submittedAnswers, sectionKey);
    if (max <= 0) continue;

    const bucket = totals.get(subject) ?? { obtained: 0, max: 0 };
    bucket.obtained += obtained;
    bucket.max += max;
    totals.set(subject, bucket);
  }

  const percentages: Record<string, number> = {};
  for (const [subject, { obtained, max }] of totals) {
    percentages[subject] = roundPct((obtained / max) * 100);
  }
  return percentages;
}

function countScoredAttempts(
  contributions: ScoreContribution[],
  track: TeacherTrack,
  studentId?: string
): number {
  const keys = new Set<string>();
  for (const c of contributions) {
    if (c.track !== track) continue;
    if (studentId != null && c.studentId !== studentId) continue;
    keys.add(`${c.studentId}|${c.attemptKey}`);
  }
  return keys.size;
}

function buildStudentSubjectStats(
  contributions: ScoreContribution[],
  track: TeacherTrack,
  studentId: string,
  allAttempts: number,
  overallAvg: number | null
): StudentSubjectStats {
  const subjects = aggregateContributions(contributions, track, studentId);
  return {
    track,
    allAttempts,
    overallAvg,
    scoredAttempts: countScoredAttempts(contributions, track, studentId),
    subjectOverallAvg: totalAverageFromSubjectScores(subjects),
    subjects,
  };
}

function buildTrackSubjectStats(
  contributions: ScoreContribution[],
  track: TeacherTrack,
  allAttempts: number,
  overallAvg: number | null
): TrackSubjectStats {
  const subjects = aggregateContributions(contributions, track);
  return {
    allAttempts,
    overallAvg,
    scoredAttempts: countScoredAttempts(contributions, track),
    subjectOverallAvg: totalAverageFromSubjectScores(subjects),
    subjects,
  };
}

function aggregateContributions(
  contributions: ScoreContribution[],
  track: TeacherTrack,
  studentId?: string
): SubjectScoreRow[] {
  const filtered = contributions.filter(
    (c) => c.track === track && (studentId == null || c.studentId === studentId)
  );
  const bySubject = new Map<string, number[]>();
  const examKeysBySubject = new Map<string, Set<string>>();
  for (const c of filtered) {
    const list = bySubject.get(c.subject) ?? [];
    list.push(c.percentage);
    bySubject.set(c.subject, list);
    const keys = examKeysBySubject.get(c.subject) ?? new Set<string>();
    keys.add(c.attemptKey);
    examKeysBySubject.set(c.subject, keys);
  }

  return SUBJECTS_BY_TRACK[track].map((subject) => {
    const values = bySubject.get(subject) ?? [];
    const examCount = examKeysBySubject.get(subject)?.size ?? 0;
    return {
      subject,
      avg:
        values.length > 0
          ? roundPct(values.reduce((sum, value) => sum + value, 0) / values.length)
          : null,
      examCount,
    };
  });
}

export function totalAverageFromSubjectScores(scores: SubjectScoreRow[]): number | null {
  const withData = scores.filter((s) => s.avg != null);
  if (withData.length === 0) return null;
  return roundPct(withData.reduce((sum, s) => sum + s.avg!, 0) / withData.length);
}

function attemptFingerprint(
  studentId: string,
  title: string,
  marksObtained: number,
  maxMarks: number
): string {
  return examAttemptFingerprint(studentId, title, marksObtained, maxMarks);
}

export type SubjectScoresPayload = {
  byStudent: Record<string, StudentSubjectStats>;
  trackAggregates: Record<TeacherTrack, TrackSubjectStats>;
};

function overallAvgFromAttempts(
  attempts: Array<{ marksObtained: number; maxMarks: number }>
): number | null {
  return overallAvgFromNormalizedAttempts(attempts);
}

export function buildSubjectScoresPayload(input: {
  sessions: Array<{
    id: string;
    studentId: string;
    submittedAt: Date | null;
    startedAt: Date;
    submittedAnswers: unknown;
    scoreObtained: number | null;
    scoreMax: number | null;
    exam: {
      category: string;
      title: string;
      questionPaper: { questionContent: string; keyContent: string };
    };
  }>;
  attempts: Array<{
    id: string;
    studentId: string;
    category: string;
    title: string;
    examDate: Date;
    marksObtained: number;
    maxMarks: number;
  }>;
  studentTracks: Map<string, TeacherTrack>;
}): SubjectScoresPayload {
  const uniqueAttempts = mergeUniqueExamAttempts({
    sessions: input.sessions,
    attempts: input.attempts,
  });

  const subjectScoresByAttempt = new Map<string, Record<string, number>>();

  for (const session of input.sessions) {
    if (session.scoreMax == null || session.scoreMax <= 0) continue;
    const track: TeacherTrack = session.exam.category === "NEET" ? "NEET" : "JEE";
    const submitted =
      session.submittedAnswers && typeof session.submittedAnswers === "object"
        ? (session.submittedAnswers as Record<string, string>)
        : {};

    const attemptKey = attemptFingerprint(
      session.studentId,
      session.exam.title,
      session.scoreObtained ?? 0,
      session.scoreMax
    );

    const subjectPercentages = scoreBySubjectFromPaper({
      questionContent: session.exam.questionPaper.questionContent,
      keyContent: session.exam.questionPaper.keyContent,
      submittedAnswers: submitted,
      track,
    });

    if (Object.keys(subjectPercentages).length > 0) {
      subjectScoresByAttempt.set(attemptKey, subjectPercentages);
    }
  }

  for (const attempt of input.attempts) {
    if (attempt.maxMarks <= 0) continue;
    const attemptKey = attemptFingerprint(
      attempt.studentId,
      attempt.title,
      attempt.marksObtained,
      attempt.maxMarks
    );
    if (subjectScoresByAttempt.has(attemptKey)) continue;

    const track: TeacherTrack =
      input.studentTracks.get(attempt.studentId) ??
      (attempt.category === "NEET" ? "NEET" : "JEE");
    const singleSubject = titleToSingleSubject(attempt.title, track);
    if (!singleSubject) continue;

    subjectScoresByAttempt.set(attemptKey, {
      [singleSubject]: roundPct((attempt.marksObtained / attempt.maxMarks) * 100),
    });
  }

  const contributions: ScoreContribution[] = [];

  for (const attempt of uniqueAttempts) {
    const attemptKey = attemptFingerprint(
      attempt.studentId,
      attempt.title,
      attempt.marksObtained,
      attempt.maxMarks
    );
    const track: TeacherTrack =
      input.studentTracks.get(attempt.studentId) ??
      (attempt.category === "NEET" ? "NEET" : "JEE");
    const overallPct = roundPct((attempt.marksObtained / attempt.maxMarks) * 100);
    const bySubject = subjectScoresByAttempt.get(attemptKey);

    if (bySubject && Object.keys(bySubject).length > 0) {
      for (const [subject, percentage] of Object.entries(bySubject)) {
        contributions.push({
          studentId: attempt.studentId,
          track,
          subject,
          percentage,
          attemptKey,
        });
      }
      continue;
    }

    for (const subject of SUBJECTS_BY_TRACK[track]) {
      contributions.push({
        studentId: attempt.studentId,
        track,
        subject,
        percentage: overallPct,
        attemptKey,
      });
    }
  }

  const attemptCountByStudent = new Map<string, number>();
  const attemptsByStudent = new Map<string, Array<{ marksObtained: number; maxMarks: number }>>();
  for (const attempt of uniqueAttempts) {
    attemptCountByStudent.set(
      attempt.studentId,
      (attemptCountByStudent.get(attempt.studentId) ?? 0) + 1
    );
    const list = attemptsByStudent.get(attempt.studentId) ?? [];
    list.push({ marksObtained: attempt.marksObtained, maxMarks: attempt.maxMarks });
    attemptsByStudent.set(attempt.studentId, list);
  }

  const studentIds = new Set([...input.studentTracks.keys(), ...attemptCountByStudent.keys()]);

  const byStudent: SubjectScoresPayload["byStudent"] = {};
  for (const studentId of studentIds) {
    const track = input.studentTracks.get(studentId);
    if (!track) continue;
    byStudent[studentId] = buildStudentSubjectStats(
      contributions,
      track,
      studentId,
      attemptCountByStudent.get(studentId) ?? 0,
      overallAvgFromAttempts(attemptsByStudent.get(studentId) ?? [])
    );
  }

  const trackAggregates: SubjectScoresPayload["trackAggregates"] = {
    JEE: buildTrackSubjectStats(
      contributions,
      "JEE",
      [...studentIds].reduce((sum, id) => {
        if (input.studentTracks.get(id) !== "JEE") return sum;
        return sum + (attemptCountByStudent.get(id) ?? 0);
      }, 0),
      overallAvgFromAttempts(
        uniqueAttempts.filter((a) => input.studentTracks.get(a.studentId) === "JEE")
      )
    ),
    NEET: buildTrackSubjectStats(
      contributions,
      "NEET",
      [...studentIds].reduce((sum, id) => {
        if (input.studentTracks.get(id) !== "NEET") return sum;
        return sum + (attemptCountByStudent.get(id) ?? 0);
      }, 0),
      overallAvgFromAttempts(
        uniqueAttempts.filter((a) => input.studentTracks.get(a.studentId) === "NEET")
      )
    ),
  };

  return {
    byStudent,
    trackAggregates,
  };
}
