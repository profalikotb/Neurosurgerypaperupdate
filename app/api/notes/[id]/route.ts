import { withUser, ok, bad, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";
import { sm2 } from "@/lib/srs";

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(async (req, u, ctx) => {
  const id = await idOf(ctx);
  const b = await req.json();
  const sb = db();
  const { data: n } = await sb.from("notes").select("*").eq("id", id).eq("user_id", u.id).maybeSingle();
  if (!n) return bad("Not found", 404);
  if (b.grade !== undefined) { await sb.from("notes").update(sm2(n, b.grade)).eq("id", id); return ok(); }
  if (typeof b.text === "string") await sb.from("notes").update({ text: b.text }).eq("id", id);
  if (typeof b.difficult === "boolean") await sb.from("notes").update({ difficult: b.difficult, due_at: b.difficult ? new Date().toISOString() : n.due_at }).eq("id", id);
  return ok();
});

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, u, ctx) => {
  await db().from("notes").delete().eq("id", await idOf(ctx)).eq("user_id", u.id);
  return ok();
});
