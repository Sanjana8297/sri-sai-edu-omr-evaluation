-- Verify question_bank → subject table split (run AFTER subject_tables migration, BEFORE drop_question_bank)
-- After drop_question_bank is applied, question_bank no longer exists — use per-table counts only.
-- Run: psql $DATABASE_URL -f scripts/verify-question-bank-subject-split.sql

\echo '=== 1. Source row count (question_bank) ==='
SELECT COUNT(*) AS total_source FROM public.question_bank;

\echo '=== 2. Destination row counts ==='
SELECT 'physics'   AS tbl, COUNT(*) FROM public.physics
UNION ALL
SELECT 'chemistry' AS tbl, COUNT(*) FROM public.chemistry
UNION ALL
SELECT 'maths'     AS tbl, COUNT(*) FROM public.maths
UNION ALL
SELECT 'zoology'   AS tbl, COUNT(*) FROM public.zoology
UNION ALL
SELECT 'botany'    AS tbl, COUNT(*) FROM public.botany;

\echo '=== 3. Sum of destination vs source ==='
SELECT
  (SELECT COUNT(*) FROM public.question_bank) AS source_count,
  (
    SELECT COUNT(*) FROM public.physics
  ) + (
    SELECT COUNT(*) FROM public.chemistry
  ) + (
    SELECT COUNT(*) FROM public.maths
  ) + (
    SELECT COUNT(*) FROM public.zoology
  ) + (
    SELECT COUNT(*) FROM public.botany
  ) AS destination_sum;

\echo '=== 4. Unmigrated subjects (must be empty before cutover) ==='
SELECT DISTINCT subject, COUNT(*) AS cnt
FROM public.question_bank
WHERE LOWER(TRIM(subject)) NOT IN ('physics', 'chemistry', 'maths', 'mathematics', 'zoology', 'botany')
GROUP BY subject
ORDER BY subject;

\echo '=== 5. Rows in question_bank not copied to any subject table (by content_hash) ==='
SELECT COUNT(*) AS orphaned_rows
FROM public.question_bank qb
WHERE NOT EXISTS (SELECT 1 FROM public.physics p WHERE p.content_hash = qb.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.chemistry c WHERE c.content_hash = qb.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.maths m WHERE m.content_hash = qb.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.zoology z WHERE z.content_hash = qb.content_hash)
  AND NOT EXISTS (SELECT 1 FROM public.botany b WHERE b.content_hash = qb.content_hash);
