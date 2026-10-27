import "server-only";
import { NextResponse } from "next/server";
import { requireApiUser, AppUser } from "@/lib/auth";

/** Wraps a handler with auth + uniform JSON error handling. */
export function withUser<C = any>(fn: (req: Request, user: AppUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const u = await requireApiUser();
    if (u instanceof NextResponse) return u;
    try { return await fn(req, u, ctx); }
    catch (e: any) {
      console.error(e);
      const m = String(e?.message ?? "Server error");
      const hint = /relation .* does not exist|Could not find the (table|function)|schema cache/i.test(m)
        ? "Database tables are missing — run supabase/migrations/0001_init.sql in Supabase → SQL Editor. (" + m + ")"
        : /Invalid API key|JWT|apikey/i.test(m) ? "Supabase key rejected — check SUPABASE_SERVICE_ROLE_KEY in Vercel. (" + m + ")" : m;
      return NextResponse.json({ error: hint }, { status: 500 });
    }
  };
}
export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
export const idOf = async (ctx: { params: Promise<{ id: string }> }) => Number((await ctx.params).id);
