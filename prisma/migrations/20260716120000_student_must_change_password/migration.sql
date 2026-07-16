-- First-login password reset for students.
-- Existing accounts keep access; new students must change password on first login.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Student" SET "mustChangePassword" = false;
