ALTER TABLE "QuestionPaper"
ADD COLUMN "questionContent" TEXT NOT NULL DEFAULT '';

ALTER TABLE "QuestionPaper"
ALTER COLUMN "keyContent" SET DEFAULT '';
