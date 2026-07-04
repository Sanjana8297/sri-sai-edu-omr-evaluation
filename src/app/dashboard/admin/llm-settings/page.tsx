"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetDashboardPage } from "@/components/dashboard/DashboardPageContext";
import { TableSkeleton } from "@/components/skeletons/DashboardSkeletons";
import {
  dashBtnPrimary,
  dashBtnSecondary,
  dashInput,
  dashLabel,
  dashPanel,
  dashSelect,
} from "@/lib/dashboard-ui";
import { useAdminLlmSettingsQuery } from "@/hooks/data/use-admin-llm-settings";
import { dataKeys } from "@/hooks/data/keys";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "@/lib/openai-runtime";

const MODEL_PRESETS = [
  "gpt-4.1-mini",
  "gpt-4o-mini",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "mistral-large-latest",
  "llama-3.1-70b-instruct",
];
const OTHER_MODEL_VALUE = "__other__";

type SettingsResponse = {
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  usingEnvApiKey: boolean;
  updatedAt: string | null;
  tableReady?: boolean;
  aiReady?: boolean;
  dbHasEncryptedKey?: boolean;
  decryptOk?: boolean;
  envKeyPresent?: boolean;
  statusMessage?: string | null;
};

export default function AdminLlmSettingsPage() {
  useSetDashboardPage({
    title: "LLM Settings",
    subtitle: "API key and model for AI question generation across the app",
  });

  const queryClient = useQueryClient();
  const { data: settingsData, isLoading: loading, refetch } = useAdminLlmSettingsQuery();
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);
  const [modelOptions, setModelOptions] = useState<string[]>(MODEL_PRESETS);
  const [customModel, setCustomModel] = useState("");
  const [showOtherModelInput, setShowOtherModelInput] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LLM_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [usingEnv, setUsingEnv] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);
  const [aiReady, setAiReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const json = settingsData;
    if (!json) return;
    const nextModel = json.model || DEFAULT_LLM_MODEL;
    setModel(nextModel);
    setCustomModel("");
    setShowOtherModelInput(false);
    setModelOptions((prev) => (prev.includes(nextModel) ? prev : [...prev, nextModel]));
    setBaseUrl(json.baseUrl || DEFAULT_LLM_BASE_URL);
    setMasked(json.apiKeyMasked);
    setUsingEnv(json.usingEnvApiKey);
    setUpdatedAt(json.updatedAt);
    setTableReady(json.tableReady !== false);
    setAiReady(json.aiReady === true);
    setStatusMessage(json.statusMessage ?? null);
    setTestResult(null);
    setApiKey("");
    setClearApiKey(false);
    if (json.tableReady === false) {
      setErr(
        "Database table not created yet. Run: npx prisma migrate deploy — then redeploy Vercel."
      );
    } else if (json.aiReady !== true && json.statusMessage) {
      setErr(json.statusMessage);
    } else {
      setErr(null);
    }
  }, [settingsData]);

  function addCustomModel() {
    const next = customModel.trim();
    if (!next) return;
    setModelOptions((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setModel(next);
    setCustomModel("");
    setShowOtherModelInput(false);
  }

  const selectedModelValue = showOtherModelInput
    ? OTHER_MODEL_VALUE
    : modelOptions.includes(model)
      ? model
      : OTHER_MODEL_VALUE;

  const loadSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: dataKeys.adminLlmSettings });
    await refetch();
  }, [queryClient, refetch]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/llm-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          baseUrl,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(clearApiKey ? { clearApiKey: true } : {}),
        }),
      });
      const json = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        setErr(json.error ?? "Could not save settings");
        return;
      }
      setModel(json.model);
      setBaseUrl(json.baseUrl);
      setMasked(json.apiKeyMasked);
      setUsingEnv(json.usingEnvApiKey);
      setUpdatedAt(json.updatedAt);
      setAiReady(json.aiReady === true);
      setStatusMessage(json.statusMessage ?? null);
      setApiKey("");
      setClearApiKey(false);
      setErr(json.aiReady === true ? null : (json.statusMessage ?? null));
      setMsg(
        json.aiReady === true
          ? "LLM settings saved. AI features are ready for teachers."
          : "Settings saved, but AI is still not ready — see the status message above."
      );
    } catch {
      setErr("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/llm-settings/test", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      setTestResult(json.message ?? (res.ok ? "OK" : "Test failed"));
    } catch {
      setTestResult("Network error while testing connection.");
    } finally {
      setTesting(false);
    }
  }

  return (
      <div className="mx-auto max-w-2xl space-y-4">
        {!loading && statusMessage ? (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              aiReady
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            <p className="font-medium">{aiReady ? "Status: Ready" : "Status: Not ready for teachers"}</p>
            <p className="mt-1">{statusMessage}</p>
            <p className="mt-2 text-xs opacity-80">
              Saving only model/URL without pasting an API key does not enable AI.
              
            </p>
          </div>
        ) : null}

      <div className={dashPanel}>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading settings…</p>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
            <div>
              <label className={`${dashLabel} mb-1.5 block normal-case`} htmlFor="llm-model">
                Model
              </label>
              <select
                id="llm-model"
                className={dashSelect}
                value={selectedModelValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === OTHER_MODEL_VALUE) {
                    setShowOtherModelInput(true);
                    return;
                  }
                  setShowOtherModelInput(false);
                  setModel(value);
                  setCustomModel("");
                }}
                required
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value={OTHER_MODEL_VALUE}>Other</option>
              </select>
              {showOtherModelInput && (
                <div className="mt-2 flex gap-2">
                  <input
                    className={`${dashInput} min-w-0 flex-1`}
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Type custom model name"
                  />
                  <button
                    type="button"
                    onClick={addCustomModel}
                    className={dashBtnSecondary}
                  >
                    Add
                  </button>
                </div>
              )}
              <p className="mt-1 text-xs text-[var(--muted)]">
                Used for AI paper builder, question generation, and internet fetch.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="llm-base-url">
                API base URL
              </label>
              <input
                id="llm-base-url"
                type="url"
                className={dashSelect}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={DEFAULT_LLM_BASE_URL}
                required
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                OpenAI-compatible endpoint (default: OpenAI API).
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="llm-api-key">
                API key
              </label>
              <input
                id="llm-api-key"
                type="password"
                autoComplete="new-password"
                className={dashSelect}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={masked ? `Current: ${masked} — enter new key to replace` : "sk-…"}
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Stored encrypted in the database. Leave blank to keep the current key.
                {usingEnv ? " Currently falling back to OPENAI_API_KEY from .env." : null}
              </p>
              {masked ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={clearApiKey}
                    onChange={(e) => setClearApiKey(e.target.checked)}
                  />
                  Remove saved key and use .env only
                </label>
              ) : null}
            </div>

            {updatedAt ? (
              <p className="text-xs text-[var(--muted)]">
                Last updated: {new Date(updatedAt).toLocaleString()}
              </p>
            ) : null}

            {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
            {err ? <p className="text-sm text-red-600">{err}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving || !tableReady}
                className={dashBtnPrimary}
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                onClick={() => void loadSettings()}
                disabled={saving || loading}
                className={dashBtnSecondary}
              >
                Reset form
              </button>
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={saving || loading || testing}
                className={dashBtnSecondary}
              >
                {testing ? "Testing…" : "Test AI connection"}
              </button>
            </div>
            {testResult ? (
              <p className={`text-sm ${testResult.includes("successful") ? "text-emerald-700" : "text-red-600"}`}>
                {testResult}
              </p>
            ) : null}
          </form>
        )}
      </div>
      </div>
  );
}
