-- Question bank list/search performance (indexes + full-text search)

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(question_text, ''))) STORED;

ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS question_text_preview text
  GENERATED ALWAYS AS (left(question_text, 280)) STORED;

CREATE INDEX IF NOT EXISTS question_bank_exam_subject_id_idx
  ON question_bank (exam, subject, id DESC);

CREATE INDEX IF NOT EXISTS question_bank_exam_subject_difficulty_idx
  ON question_bank (exam, subject, difficulty)
  WHERE difficulty IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_bank_exam_subject_year_idx
  ON question_bank (exam, subject, year)
  WHERE year IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_bank_exam_subject_exam_type_idx
  ON question_bank (exam, subject, exam_type)
  WHERE exam_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS question_bank_exam_subject_sort_idx
  ON question_bank (exam, subject, is_important DESC, repetition_count DESC, id DESC);

CREATE INDEX IF NOT EXISTS question_bank_search_vector_idx
  ON question_bank USING GIN (search_vector);

ANALYZE question_bank;
