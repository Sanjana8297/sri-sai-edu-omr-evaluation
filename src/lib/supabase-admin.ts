import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Server may use SUPABASE_URL; either that or NEXT_PUBLIC_SUPABASE_URL works for Storage API. */
export function getSupabaseProjectUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = getSupabaseProjectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Returns null if uploads can run; otherwise a message listing what to set in `.env`. */
export function getSupabaseStorageConfigError(): string | null {
  const url = getSupabaseProjectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return null;
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return `File uploads need ${missing.join(" and ")} in .env. Find values under Supabase → Project Settings → API.`;
}

export function isSupabaseStorageConfigured(): boolean {
  return getSupabaseStorageConfigError() === null;
}
