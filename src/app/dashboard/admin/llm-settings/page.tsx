"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNavItems } from "@/lib/dashboard-nav";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "@/lib/openai-runtime";

const MODEL_PRESETS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
];

type SettingsResponse = {
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  usingEnvApiKey: boolean;
  updatedAt: string | null;
  tableReady?: boolean;
};

export default function AdminLlmSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_LLM_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [usingEnv, setUsingEnv] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tableReady, setTableReady] = useState(true);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/llm-settings");
      const json = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) {
        setErr(json.error ?? "Could not load LLM settings");
        return;
      }
      setModel(json.model || DEFAULT_LLM_MODEL);
      setBaseUrl(json.baseUrl || DEFAULT_LLM_BASE_URL);
      setMasked(json.apiKeyMasked);
      setUsingEnv(json.usingEnvApiKey);
      setUpdatedAt(json.updatedAt);
      setTableReady(json.tableReady !== false);
      setApiKey("");
      setClearApiKey(false);
      if (json.tableReady === false) {
        setErr(
          "Database table not created yet. Run: npx prisma migrate deploy — then restart npm run dev."
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error while loading settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

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
      setApiKey("");
      setClearApiKey(false);
      setMsg("LLM settings saved. AI features will use the new configuration.");
    } catch {
      setErr("Network error while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell
      badge="Administrator"
      title="LLM Settings"
      subtitle="API key and model for AI question generation across the app"
      navItems={adminNavItems}
    >
      <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading settings…</p>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="llm-model">
                Model
              </label>
              <input
                id="llm-model"
                list="llm-model-presets"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_LLM_MODEL}
                required
              />
              <datalist id="llm-model-presets">
                {MODEL_PRESETS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
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
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
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
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button
                type="button"
                onClick={() => void loadSettings()}
                disabled={saving || loading}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Reset form
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
