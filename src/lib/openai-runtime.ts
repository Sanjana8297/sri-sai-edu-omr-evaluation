import { decryptApiKey, encryptApiKey, maskApiKey } from "@/lib/llm-settings-crypto";
import {
  LLM_SETTINGS_ID,
  LlmSettingsTableMissingError,
  readLlmSettingsRow,
  upsertLlmSettingsRow,
} from "@/lib/llm-settings-store";

export { LLM_SETTINGS_ID };
export const DEFAULT_LLM_MODEL = "gpt-4.1-mini";
export const DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1";

export type LlmRuntimeConfig = {
  apiKey: string | null;
  model: string;
  baseUrl: string;
  source: "database" | "env";
};

export type LlmSettingsAdminView = {
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  usingEnvApiKey: boolean;
  updatedAt: string | null;
  tableReady: boolean;
};

type CacheEntry = { config: LlmRuntimeConfig; expiresAt: number };
let runtimeCache: CacheEntry | null = null;
const CACHE_MS = 15_000;

function invalidateRuntimeCache(): void {
  runtimeCache = null;
}

function envApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key || null;
}

function envModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_LLM_MODEL;
}

function envBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL;
}

async function readRowSafe() {
  try {
    return await readLlmSettingsRow();
  } catch (error) {
    if (error instanceof LlmSettingsTableMissingError) {
      return null;
    }
    throw error;
  }
}

export async function getLlmRuntimeConfig(): Promise<LlmRuntimeConfig> {
  const now = Date.now();
  if (runtimeCache && runtimeCache.expiresAt > now) {
    return runtimeCache.config;
  }

  const row = await readRowSafe();

  let apiKey: string | null = null;
  let keyFromDb = false;

  if (row?.apiKeyEncrypted) {
    try {
      apiKey = decryptApiKey(row.apiKeyEncrypted);
      keyFromDb = true;
    } catch {
      apiKey = null;
    }
  }

  if (!apiKey) {
    apiKey = envApiKey();
  }

  const source: LlmRuntimeConfig["source"] = keyFromDb ? "database" : "env";
  const model = row?.model?.trim() || envModel();
  const baseUrl = row?.baseUrl?.trim() || envBaseUrl();

  const config: LlmRuntimeConfig = { apiKey, model, baseUrl, source };
  runtimeCache = { config, expiresAt: now + CACHE_MS };
  return config;
}

export async function getAiConfigError(): Promise<string | null> {
  const { apiKey } = await getLlmRuntimeConfig();
  if (!apiKey) {
    return "AI is not configured. Ask an admin to set the API key under LLM Settings, or add OPENAI_API_KEY to .env.";
  }
  return null;
}

export async function getLlmSettingsForAdmin(): Promise<LlmSettingsAdminView> {
  let tableReady = true;
  let row = null;

  try {
    row = await readLlmSettingsRow();
  } catch (error) {
    if (error instanceof LlmSettingsTableMissingError) {
      tableReady = false;
    } else {
      throw error;
    }
  }

  const envKey = envApiKey();

  let dbKey: string | null = null;
  if (row?.apiKeyEncrypted) {
    try {
      dbKey = decryptApiKey(row.apiKeyEncrypted);
    } catch {
      dbKey = null;
    }
  }

  const activeKey = dbKey ?? envKey;

  return {
    model: row?.model?.trim() || envModel(),
    baseUrl: row?.baseUrl?.trim() || envBaseUrl(),
    hasApiKey: Boolean(activeKey),
    apiKeyMasked: activeKey ? maskApiKey(activeKey) : null,
    usingEnvApiKey: Boolean(envKey) && !dbKey,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    tableReady,
  };
}

export type UpdateLlmSettingsInput = {
  model: string;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  adminId: string;
};

export async function updateLlmSettings(input: UpdateLlmSettingsInput): Promise<LlmSettingsAdminView> {
  const model = input.model.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/$/, "");

  if (!model) {
    throw new Error("Model is required");
  }
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    throw new Error("Base URL must start with http:// or https://");
  }

  let apiKeyEncrypted: string | null | undefined = undefined;
  if (input.clearApiKey) {
    apiKeyEncrypted = null;
  } else if (input.apiKey !== undefined && input.apiKey.trim().length > 0) {
    apiKeyEncrypted = encryptApiKey(input.apiKey.trim());
  }

  await upsertLlmSettingsRow({
    model,
    baseUrl,
    apiKeyEncrypted,
    adminId: input.adminId,
  });

  invalidateRuntimeCache();
  return getLlmSettingsForAdmin();
}

export async function callOpenAiChatCompletion(body: Record<string, unknown>): Promise<Response> {
  const { apiKey, model, baseUrl } = await getLlmRuntimeConfig();
  if (!apiKey) {
    throw new Error("Missing API key");
  }

  const payload = { ...body, model: body.model ?? model };

  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}
