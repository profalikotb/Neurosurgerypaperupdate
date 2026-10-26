import { withUser, ok, idOf } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const GET = withUser<{ params: Promise<{ id: string }> }>(async (_req, _u, ctx) => {
  const { data } = await db().from("jobs").select("id,type,status,attempts,last_error,result,updated_at").eq("id", await idOf(ctx)).maybeSingle();
  return ok(data ?? { status: "missing" });
});
