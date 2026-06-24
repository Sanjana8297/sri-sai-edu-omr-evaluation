-- Drop legacy monolithic question_bank after subject-table cutover.
-- Prerequisite: QUESTION_BANK_SUBJECT_TABLES=true and verify-question-bank-subject-split.sql passes.

DROP TABLE IF EXISTS public.question_bank;
