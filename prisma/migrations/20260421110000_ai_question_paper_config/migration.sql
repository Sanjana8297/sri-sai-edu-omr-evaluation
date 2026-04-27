-- AlterTable
ALTER TABLE "QuestionPaper"
ADD COLUMN "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiPromptVersion" TEXT,
ADD COLUMN "aiConfig" JSONB,
ADD COLUMN "generationMeta" JSONB;
