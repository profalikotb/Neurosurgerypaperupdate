import { withUser, ok, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (req, u, ctx) => {
  const id = await idOf(ctx);
  const { progress = 0, mode = null } = await req.json().catch(() => ({}));
  const sb = db();
  const { data: cur } = await sb.from("reads").select("progress").eq("user_id", u.id).eq("paper_id", id).maybeSingle();
  await sb.from("reads").upsert({ user_id: u.id, paper_id: id, progress: Math.max(cur?.progress ?? 0, Math.min(1, Number(progress) || 0)), mode, last_read_at: new Date().toISOString() });
  return ok();
});
