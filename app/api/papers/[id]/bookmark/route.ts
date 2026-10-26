import { withUser, ok, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, u, ctx) => {
  const id = await idOf(ctx);
  const sb = db();
  const { data } = await sb.from("bookmarks").select("paper_id").eq("user_id", u.id).eq("paper_id", id).maybeSingle();
  if (data) { await sb.from("bookmarks").delete().eq("user_id", u.id).eq("paper_id", id); return ok({ bookmarked: false }); }
  await sb.from("bookmarks").insert({ user_id: u.id, paper_id: id });
  return ok({ bookmarked: true });
});
