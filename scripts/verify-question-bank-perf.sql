-- Run after subject tables are live (replaces question_bank perf checks)
-- Example: psql $DATABASE_URL -f scripts/verify-question-bank-perf.sql

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  id, exam, subject, year, chapter, difficulty,
  COALESCE(question_text_preview, left(question_text, 280)) AS preview,
  is_important, is_repeated, repetition_count
FROM physics
WHERE exam = 'JEE' AND subject = 'Physics'
ORDER BY is_important DESC, repetition_count DESC, id DESC
LIMIT 40;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)::bigint
FROM physics
WHERE exam = 'JEE'
  AND search_vector @@ websearch_to_tsquery('english', 'kinematics');
