-- AlterTable
ALTER TABLE "ExamSession"
ADD COLUMN "submittedAnswers" JSONB,
ADD COLUMN "scoreObtained" DOUBLE PRECISION,
ADD COLUMN "scoreMax" DOUBLE PRECISION;
