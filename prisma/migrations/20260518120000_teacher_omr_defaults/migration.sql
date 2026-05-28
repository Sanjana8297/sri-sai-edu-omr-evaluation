-- Per-teacher OMR template designer settings (track, roll digit columns)

ALTER TABLE "Teacher" ADD COLUMN IF NOT EXISTS "omrDefaults" JSONB;
