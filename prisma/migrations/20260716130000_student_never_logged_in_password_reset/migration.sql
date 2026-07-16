-- Track whether a student has ever logged in, and force password reset only for never-logged-in accounts.
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Students who already used the platform (exam session or attempt) count as having logged in.
UPDATE "Student" AS s
SET
  "lastLoginAt" = COALESCE(s."updatedAt", s."createdAt"),
  "mustChangePassword" = false
WHERE EXISTS (SELECT 1 FROM "ExamSession" e WHERE e."studentId" = s.id)
   OR EXISTS (SELECT 1 FROM "ExamAttempt" a WHERE a."studentId" = s.id);

-- Everyone else has never logged in → require password change on first login.
UPDATE "Student"
SET "mustChangePassword" = true
WHERE "lastLoginAt" IS NULL;
