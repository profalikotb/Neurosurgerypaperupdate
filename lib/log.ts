import "server-only";
import { db } from "@/lib/supabase/admin";

export async function logEvent(scope: string, message: string, meta?: unknown, level: "info" | "warn" | "error" = "info") {
  const line = `[${level}] ${scope}: ${message}`;
  if (level === "error") console.error(line, meta ?? ""); else console.log(line);
  try { await db().from("event_log").insert({ scope, message: message.slice(0, 2000), meta: meta ?? null, level }); } catch { /* logging must never throw */ }
}

export async function getState<T = any>(key: string): Promise<T | null> {
  const { data } = await db().from("app_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}
export async function setState(key: string, value: unknown) {
  await db().from("app_state").upsert({ key, value, updated_at: new Date().toISOString() });
}
