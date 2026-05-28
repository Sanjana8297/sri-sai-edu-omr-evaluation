-- Admin-configurable LLM API key and model (singleton row)

CREATE TABLE "LlmSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "apiKeyEncrypted" TEXT,
  "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "baseUrl" TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LlmSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "LlmSettings" ("id", "model", "baseUrl", "updatedAt")
VALUES ('default', 'gpt-4.1-mini', 'https://api.openai.com/v1', CURRENT_TIMESTAMP);
