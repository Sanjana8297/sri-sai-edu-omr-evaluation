-- Add optional roll/enrolment number for matching scanned OMR sheets to a student.
ALTER TABLE "Student" ADD COLUMN "rollNumber" TEXT;

-- Speed up per-teacher roll number lookups during OMR matching.
CREATE INDEX "Student_teacherId_rollNumber_idx" ON "Student"("teacherId", "rollNumber");
