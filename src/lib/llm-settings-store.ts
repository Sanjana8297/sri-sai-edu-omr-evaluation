import { Prisma } from "@prisma/client";
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
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021") return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('relation "LlmSettings" does not exist') ||
    msg.includes('table "public.LlmSettings" does not exist') ||
    (msg.includes("LlmSettings") && msg.includes("does not exist"))
  );
}

export class LlmSettingsTableMissingError extends Error {
  constructor() {
    super(
      "LLM settings table is missing. Run: npx prisma migrate deploy against the production database, then redeploy."
    );
    this.name = "LlmSettingsTableMissingError";
  }
}

function toRow(row: {
  id: string;
  apiKeyEncrypted: string | null;
  model: string;
  baseUrl: string;
  updatedAt: Date;
  updatedByAdminId: string | null;
}): LlmSettingsRow {
  return {
    id: row.id,
    apiKeyEncrypted: row.apiKeyEncrypted,
    model: row.model,
    baseUrl: row.baseUrl,
    updatedAt: row.updatedAt,
    updatedByAdminId: row.updatedByAdminId,
  };
}

export async function readLlmSettingsRow(): Promise<LlmSettingsRow | null> {
  try {
    const row = await prisma.llmSettings.findUnique({
      where: { id: LLM_SETTINGS_ID },
    });
    return row ? toRow(row) : null;
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
    const updateData: Prisma.LlmSettingsUpdateInput = {
      model: input.model,
      baseUrl: input.baseUrl,
      updatedByAdminId: input.adminId,
    };
    if (input.apiKeyEncrypted !== undefined) {
      updateData.apiKeyEncrypted = input.apiKeyEncrypted;
    }

    await prisma.llmSettings.upsert({
      where: { id: LLM_SETTINGS_ID },
      create: {
        id: LLM_SETTINGS_ID,
        model: input.model,
        baseUrl: input.baseUrl,
        apiKeyEncrypted: input.apiKeyEncrypted ?? null,
        updatedByAdminId: input.adminId,
      },
      update: updateData,
    });
  } catch (error) {
    if (isMissingLlmTableError(error)) {
      throw new LlmSettingsTableMissingError();
    }
    throw error;
  }
}
