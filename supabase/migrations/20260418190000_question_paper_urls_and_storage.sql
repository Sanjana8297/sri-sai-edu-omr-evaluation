-- Run this in the Supabase SQL Editor (or via `psql`) against your project database.
-- Safe to run more than once: columns and bucket use IF NOT EXISTS / ON CONFLICT.

-- 1) Table columns (match app / Prisma "QuestionPaper" model)
ALTER TABLE public."QuestionPaper"
ADD COLUMN IF NOT EXISTS "questionPaperUrl" TEXT;

ALTER TABLE public."QuestionPaper"
ADD COLUMN IF NOT EXISTS "answerSheetUrl" TEXT;

-- 2) Storage bucket for PDFs / images / DOCX (public read; uploads via server + service role)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-papers',
  'question-papers',
  TRUE,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Optional: allow anonymous read of objects in this bucket (public URLs)
-- Uploads are performed by your Next.js API using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
DROP POLICY IF EXISTS "Public read question-papers" ON storage.objects;
CREATE POLICY "Public read question-papers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'question-papers');
