import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let _admin: SupabaseClient | null = null;
/** Service-role client. Server only — bypasses RLS. */
export function db(): SupabaseClient {
  if (!_admin) {
    if (!env.supabaseUrl || !env.serviceKey) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    _admin = createClient(env.supabaseUrl, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}
