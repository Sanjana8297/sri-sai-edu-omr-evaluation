import { decryptApiKey, encryptApiKey, maskApiKey } from "@/lib/llm-settings-crypto";
import {
  LLM_SETTINGS_ID,
  type LlmSettingsRow,
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
  /** Whether teachers can use AI right now on this deployment */
  aiReady: boolean;
  dbHasEncryptedKey: boolean;
  decryptOk: boolean;
  envKeyPresent: boolean;
  statusMessage: string | null;
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

async function readRowSafe(): Promise<LlmSettingsRow | null> {
  try {
    return await readLlmSettingsRow();
  } catch (error) {
    if (error instanceof LlmSettingsTableMissingError) {
      return null;
    }
    throw error;
  }
}

function tryDecryptStoredKey(encrypted: string | null | undefined): {
  key: string | null;
  decryptFailed: boolean;
} {
  if (!encrypted) return { key: null, decryptFailed: false };
  try {
    const key = decryptApiKey(encrypted);
    return { key: key || null, decryptFailed: false };
  } catch {
    return { key: null, decryptFailed: true };
  }
}

function buildStatusMessage(input: {
  tableReady: boolean;
  dbHasEncryptedKey: boolean;
  decryptOk: boolean;
  envKeyPresent: boolean;
  aiReady: boolean;
}): string | null {
  if (input.aiReady) {
    return input.envKeyPresent && !input.dbHasEncryptedKey
      ? "AI is active via OPENAI_API_KEY in environment variables."
      : "AI is active. Teachers can generate papers.";
  }
  if (!input.tableReady) {
    return "Database table missing. Run npx prisma migrate deploy on production, then redeploy Vercel.";
  }
  if (input.dbHasEncryptedKey && !input.decryptOk) {
    return (
      "A key is stored but cannot be decrypted. Set LLM_SETTINGS_SECRET (or AUTH_SECRET) to the same value " +
      "used when the key was saved, or enter a new API key below and save again."
    );
  }
  if (!input.dbHasEncryptedKey && !input.envKeyPresent) {
    return "No API key in the database. Enter your OpenAI key below and click Save (do not leave the field blank).";
  }
  return "AI is not ready. Enter an API key below and save.";
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
  try {
    const row = await readLlmSettingsRow();
    const { decryptFailed } = tryDecryptStoredKey(row?.apiKeyEncrypted);
    const { apiKey } = await getLlmRuntimeConfig();
    if (apiKey) return null;

    if (decryptFailed) {
      return (
        "An API key is saved in LLM Settings but could not be decrypted. " +
        "Ensure LLM_SETTINGS_SECRET or AUTH_SECRET on Vercel matches when the key was saved, " +
        "or re-enter the API key under Admin → LLM Settings on this live site and save again."
      );
    }

    if (row && !row.apiKeyEncrypted && !envApiKey()) {
      return (
        "No API key is stored yet. An admin must open LLM Settings on this site, paste the OpenAI API key, and click Save."
      );
    }
  } catch (error) {
    if (error instanceof LlmSettingsTableMissingError) {
      return (
        "LLM settings database table is missing on production. " +
        "Run: npx prisma migrate deploy — then redeploy the Vercel project."
      );
    }
    throw error;
  }

  if (process.env.VERCEL === "1") {
    return (
      "AI is not configured on this deployment. Add OPENAI_API_KEY in Vercel → Environment Variables, " +
      "or save a key under Admin → LLM Settings on this exact URL, then redeploy."
    );
  }

  return "AI is not configured. Ask an admin to set the API key under LLM Settings, or add OPENAI_API_KEY to .env.";
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
  const dbHasEncryptedKey = Boolean(row?.apiKeyEncrypted);
  const decryptOk = dbHasEncryptedKey && Boolean(dbKey);
  const envKeyPresent = Boolean(envKey);
  const aiReady = Boolean(activeKey);

  return {
    model: row?.model?.trim() || envModel(),
    baseUrl: row?.baseUrl?.trim() || envBaseUrl(),
    hasApiKey: Boolean(activeKey),
    apiKeyMasked: activeKey ? maskApiKey(activeKey) : null,
    usingEnvApiKey: Boolean(envKey) && !dbKey,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    tableReady,
    aiReady,
    dbHasEncryptedKey,
    decryptOk,
    envKeyPresent,
    statusMessage: buildStatusMessage({
      tableReady,
      dbHasEncryptedKey,
      decryptOk,
      envKeyPresent,
      aiReady,
    }),
  };
}

/** Quick check that stored credentials can reach the LLM API */
export async function testLlmConnection(): Promise<{ ok: boolean; message: string }> {
  const configError = await getAiConfigError();
  if (configError) {
    return { ok: false, message: configError };
  }

  try {
    const response = await callOpenAiChatCompletion({
      max_tokens: 5,
      messages: [{ role: "user", content: "Reply with OK" }],
    });
    if (response.ok) {
      return { ok: true, message: "Connection successful. Teachers can use AI features." };
    }
    const text = await response.text();
    return { ok: false, message: `API returned ${response.status}: ${text.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Connection test failed" };
  }
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

  const current = await getLlmSettingsForAdmin();
  const incomingKey = input.apiKey?.trim() ?? "";
  if (!current.aiReady && !incomingKey && !input.clearApiKey) {
    throw new Error(
      "API key is required. Paste your OpenAI key in the API key field and save — saving model/URL alone does not enable AI."
    );
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
