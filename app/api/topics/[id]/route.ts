import { withUser, ok, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, u, ctx) => {
  const { data } = await db().from("topic_reviews").select("id,status,error").eq("id", await idOf(ctx)).eq("user_id", u.id).maybeSingle();
  return ok(data ?? { status: "missing" });
});
export const DELETE = withUser<{ params: Promise<{ id: string }> }>(async (_req, u, ctx) => {
  await db().from("topic_reviews").delete().eq("id", await idOf(ctx)).eq("user_id", u.id);
  return ok();
});
