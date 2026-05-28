-- CBT delivery settings on exams and teacher defaults; session state for palette progress
ALTER TABLE "Exam" ADD COLUMN IF NOT EXISTS "cbtSettings" JSONB;

ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "cbtDefaults" JSONB;

ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "cbtState" JSONB;

ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'FULLSCREEN_EXIT';
ALTER TYPE "ProctoringEventType" ADD VALUE IF NOT EXISTS 'CLIPBOARD_ATTEMPT';
