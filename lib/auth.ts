import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export type AppUser = { id: string; email: string };

export async function getUser(): Promise<AppUser | null> {
  if (!env.supabaseUrl) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u?.email) return null;
  if (env.allowedEmails.length && !env.allowedEmails.includes(u.email.toLowerCase())) return null;
  return { id: u.id, email: u.email };
}

/** For server components/pages. */
export async function requirePageUser(): Promise<AppUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

/** For route handlers: returns user or a 401 response. */
export async function requireApiUser(): Promise<AppUser | NextResponse> {
  const u = await getUser();
  return u ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function isCronRequest(req: Request): boolean {
  const h = req.headers.get("authorization") ?? "";
  return Boolean(env.cronSecret) && h === `Bearer ${env.cronSecret}`;
}
