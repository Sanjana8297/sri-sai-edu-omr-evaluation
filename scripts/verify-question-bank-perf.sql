-- Run after applying prisma/migrations/20260516120000_question_bank_perf/migration.sql
-- Replace exam/subject/search with real values from your dataset.

EXPLAIN (ANALYZE, BUFFERS)
SELECT
  id::int,
  exam,
  subject,
  year,
  chapter,
  difficulty,
  COALESCE(question_text_preview, left(question_text, 280)) AS preview,
  is_important,
  is_repeated,
  repetition_count
FROM question_bank
WHERE exam = 'JEE'
  AND subject = 'Physics'
  AND search_vector @@ websearch_to_tsquery('english', 'kinematics')
ORDER BY is_important DESC, repetition_count DESC, id DESC
LIMIT 40;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)::bigint
FROM question_bank
WHERE exam = 'JEE' AND subject = 'Physics';
