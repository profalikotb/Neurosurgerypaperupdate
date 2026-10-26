import { withUser, ok, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, _u, ctx) => {
  const id = await idOf(ctx);
  const sb = db();
  const { data: d } = await sb.from("documents").select("storage_path").eq("id", id).maybeSingle();
  if (d?.storage_path) await sb.storage.from("uploads").remove([d.storage_path]);
  await sb.from("documents").delete().eq("id", id);
  return ok();
});

export const PATCH = withUser<{ params: Promise<{ id: string }> }>(async (req, _u, ctx) => {
  const b = await req.json();
  const allowed = ["title", "authors", "edition", "year", "publisher", "isbn", "subspecialty"];
  const upd = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)));
  await db().from("documents").update(upd).eq("id", await idOf(ctx));
  return ok();
});
