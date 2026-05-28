import { prisma } from "@/lib/prisma";

export const LLM_SETTINGS_ID = "default";

export type LlmSettingsRow = {
  id: string;
  apiKeyEncrypted: string | null;
  model: string;
  baseUrl: string;
  updatedAt: Date;
  updatedByAdminId: string | null;
};

function isMissingLlmTableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('relation "LlmSettings" does not exist') ||
    msg.includes('table "public.LlmSettings" does not exist') ||
    msg.includes("LlmSettings") && msg.includes("does not exist")
  );
}

export class LlmSettingsTableMissingError extends Error {
  constructor() {
    super(
      'LLM settings table is missing. Run: npx prisma migrate deploy — then restart the dev server.'
    );
    this.name = "LlmSettingsTableMissingError";
  }
}

export async function readLlmSettingsRow(): Promise<LlmSettingsRow | null> {
  try {
    const rows = await prisma.$queryRaw<LlmSettingsRow[]>`
      SELECT
        id,
        "apiKeyEncrypted",
        model,
        "baseUrl",
        "updatedAt",
        "updatedByAdminId"
      FROM "LlmSettings"
      WHERE id = ${LLM_SETTINGS_ID}
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch (error) {
    if (isMissingLlmTableError(error)) {
      throw new LlmSettingsTableMissingError();
    }
    throw error;
  }
}

export async function upsertLlmSettingsRow(input: {
  model: string;
  baseUrl: string;
  apiKeyEncrypted?: string | null;
  adminId: string;
}): Promise<void> {
  try {
    const existing = await readLlmSettingsRow();

    if (!existing) {
      await prisma.$executeRaw`
        INSERT INTO "LlmSettings" (
          id, model, "baseUrl", "apiKeyEncrypted", "updatedByAdminId", "createdAt", "updatedAt"
        )
        VALUES (
          ${LLM_SETTINGS_ID},
          ${input.model},
          ${input.baseUrl},
          ${input.apiKeyEncrypted ?? null},
          ${input.adminId},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `;
      return;
    }

    if (input.apiKeyEncrypted !== undefined) {
      await prisma.$executeRaw`
        UPDATE "LlmSettings"
        SET
          model = ${input.model},
          "baseUrl" = ${input.baseUrl},
          "apiKeyEncrypted" = ${input.apiKeyEncrypted},
          "updatedByAdminId" = ${input.adminId},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${LLM_SETTINGS_ID}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "LlmSettings"
        SET
          model = ${input.model},
          "baseUrl" = ${input.baseUrl},
          "updatedByAdminId" = ${input.adminId},
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = ${LLM_SETTINGS_ID}
      `;
    }
  } catch (error) {
    if (isMissingLlmTableError(error)) {
      throw new LlmSettingsTableMissingError();
    }
    throw error;
  }
}
