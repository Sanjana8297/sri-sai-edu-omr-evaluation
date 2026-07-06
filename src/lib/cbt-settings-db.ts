import { prisma } from "@/lib/prisma";
import { DEFAULT_CBT_SETTINGS, parseCbtSettings, type CbtSettings } from "@/lib/cbt-settings";
import {
  extractPaperAccessFromCbtDefaults,
  mergePaperAccessIntoCbtDefaults,
} from "@/lib/admin-staff-storage";

export async function getTeacherCbtDefaults(teacherId: string): Promise<CbtSettings> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ cbtDefaults: unknown }>>(
      `SELECT "cbtDefaults" FROM "Teacher" WHERE id = $1 LIMIT 1`,
      teacherId,
    );
    return parseCbtSettings(rows[0]?.cbtDefaults ?? null);
  } catch {
    return { ...DEFAULT_CBT_SETTINGS };
  }
}

export async function setTeacherCbtDefaults(teacherId: string, settings: CbtSettings): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cbtDefaults: unknown }>>(
    `SELECT "cbtDefaults" FROM "Teacher" WHERE id = $1 LIMIT 1`,
    teacherId,
  );
  const existing = rows[0]?.cbtDefaults ?? null;
  const paperAccess = extractPaperAccessFromCbtDefaults(existing);
  const merged = mergePaperAccessIntoCbtDefaults(settings as unknown, paperAccess);
  const json = JSON.stringify(merged);
  await prisma.$executeRawUnsafe(
    `UPDATE "Teacher" SET "cbtDefaults" = $1::jsonb WHERE id = $2`,
    json,
    teacherId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "Exam" SET "cbtSettings" = $1::jsonb WHERE "teacherId" = $2 AND "endTime" > NOW()`,
    json,
    teacherId,
  );
}

export async function getExamCbtSettings(examId: string): Promise<CbtSettings> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ cbtSettings: unknown }>>(
      `SELECT "cbtSettings" FROM "Exam" WHERE id = $1 LIMIT 1`,
      examId,
    );
    return parseCbtSettings(rows[0]?.cbtSettings ?? null);
  } catch {
    return { ...DEFAULT_CBT_SETTINGS };
  }
}

export async function setExamCbtSettings(examId: string, settings: CbtSettings): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Exam" SET "cbtSettings" = $1::jsonb WHERE id = $2`,
    JSON.stringify(settings),
    examId,
  );
}

export type ExamSessionCbtState = {
  markedForReview?: string[];
  visited?: string[];
  /** 0-based index into flat question list — restored on resume */
  activeQuestionIndex?: number;
  /** Skip instruction screen when student returns to an in-progress attempt */
  instructionsAcknowledged?: boolean;
};

export async function getExamSessionCbtState(sessionId: string): Promise<ExamSessionCbtState> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ cbtState: unknown }>>(
      `SELECT "cbtState" FROM "ExamSession" WHERE id = $1 LIMIT 1`,
      sessionId,
    );
    const raw = rows[0]?.cbtState;
    if (!raw || typeof raw !== "object") return {};
    return raw as ExamSessionCbtState;
  } catch {
    return {};
  }
}

export async function saveExamSessionProgress(
  sessionId: string,
  answers: Record<string, string>,
  cbtState: ExamSessionCbtState,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "ExamSession" SET "submittedAnswers" = $1::jsonb, "cbtState" = $2::jsonb WHERE id = $3`,
    JSON.stringify(answers),
    JSON.stringify(cbtState),
    sessionId,
  );
}
