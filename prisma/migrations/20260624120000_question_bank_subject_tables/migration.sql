-- Split question_bank into per-subject tables (physics, chemistry, maths, zoology, botany).
-- Keeps question_bank until a follow-up migration drops it after cutover.

CREATE OR REPLACE FUNCTION public._create_question_subject_table(tbl text) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS public.%I (
      id bigserial NOT NULL,
      exam text NOT NULL,
      subject text NOT NULL,
      year integer NULL,
      question_text text NOT NULL,
      options jsonb NULL,
      correct_answer text NULL,
      source_name text NOT NULL,
      source_url text NOT NULL,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      content_hash text NOT NULL,
      repetition_count integer NOT NULL DEFAULT 1,
      is_repeated boolean NOT NULL DEFAULT false,
      is_important boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      chapter text NULL,
      difficulty text NULL,
      exam_type text NULL,
      search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english'::regconfig, COALESCE(question_text, ''::text))
      ) STORED,
      question_text_preview text GENERATED ALWAYS AS (left(question_text, 280)) STORED,
      CONSTRAINT %I_pkey PRIMARY KEY (id),
      CONSTRAINT %I_content_hash_key UNIQUE (content_hash)
    );
  $ddl$, tbl, tbl, tbl);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (exam, subject, id DESC)', tbl || '_exam_subject_id_idx', tbl);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (exam, subject, difficulty) WHERE difficulty IS NOT NULL',
    tbl || '_exam_subject_difficulty_idx', tbl
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (exam, subject, year) WHERE year IS NOT NULL',
    tbl || '_exam_subject_year_idx', tbl
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (exam, subject, exam_type) WHERE exam_type IS NOT NULL',
    tbl || '_exam_subject_exam_type_idx', tbl
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I (exam, subject, is_important DESC, repetition_count DESC, id DESC)',
    tbl || '_exam_subject_sort_idx', tbl
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON public.%I USING GIN (search_vector)',
    tbl || '_search_vector_idx', tbl
  );
END;
$$;

SELECT public._create_question_subject_table('physics');
SELECT public._create_question_subject_table('chemistry');
SELECT public._create_question_subject_table('maths');
SELECT public._create_question_subject_table('zoology');
SELECT public._create_question_subject_table('botany');

DO $$
BEGIN
  IF to_regclass('public.question_bank') IS NULL THEN
    RAISE NOTICE 'question_bank does not exist — skipping data copy';
    RETURN;
  END IF;

  INSERT INTO public.physics (
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  )
  SELECT
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  FROM public.question_bank
  WHERE LOWER(TRIM(subject)) = 'physics'
  ON CONFLICT (content_hash) DO NOTHING;

  INSERT INTO public.chemistry (
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  )
  SELECT
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  FROM public.question_bank
  WHERE LOWER(TRIM(subject)) = 'chemistry'
  ON CONFLICT (content_hash) DO NOTHING;

  INSERT INTO public.maths (
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  )
  SELECT
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  FROM public.question_bank
  WHERE LOWER(TRIM(subject)) IN ('maths', 'mathematics')
  ON CONFLICT (content_hash) DO NOTHING;

  INSERT INTO public.zoology (
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  )
  SELECT
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  FROM public.question_bank
  WHERE LOWER(TRIM(subject)) = 'zoology'
  ON CONFLICT (content_hash) DO NOTHING;

  INSERT INTO public.botany (
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  )
  SELECT
    id, exam, subject, year, question_text, options, correct_answer,
    source_name, source_url, tags, content_hash, repetition_count,
    is_repeated, is_important, created_at, updated_at,
    chapter, difficulty, exam_type
  FROM public.question_bank
  WHERE LOWER(TRIM(subject)) = 'botany'
  ON CONFLICT (content_hash) DO NOTHING;
END;
$$;

SELECT setval(pg_get_serial_sequence('public.physics', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public.physics), 1), 1));
SELECT setval(pg_get_serial_sequence('public.chemistry', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public.chemistry), 1), 1));
SELECT setval(pg_get_serial_sequence('public.maths', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public.maths), 1), 1));
SELECT setval(pg_get_serial_sequence('public.zoology', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public.zoology), 1), 1));
SELECT setval(pg_get_serial_sequence('public.botany', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM public.botany), 1), 1));

DROP FUNCTION IF EXISTS public._create_question_subject_table(text);

ANALYZE public.physics;
ANALYZE public.chemistry;
ANALYZE public.maths;
ANALYZE public.zoology;
ANALYZE public.botany;
