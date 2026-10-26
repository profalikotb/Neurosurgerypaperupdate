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
      return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
    }
  };
}
export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
export const idOf = async (ctx: { params: Promise<{ id: string }> }) => Number((await ctx.params).id);
