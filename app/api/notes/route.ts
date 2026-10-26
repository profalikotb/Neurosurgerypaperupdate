import { withUser, ok, bad } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const POST = withUser(async (req, u) => {
  const b = await req.json();
  const items: string[] = Array.isArray(b.texts) ? b.texts : [b.text];
  const rows = items.filter((t) => typeof t === "string" && t.trim()).map((text) => ({ user_id: u.id, text: text.trim(), paper_id: b.paperId ?? null, topic: b.topic ?? null, source_ref: b.sourceRef ?? null }));
  if (!rows.length) return bad("Empty note");
  const { data, error } = await db().from("notes").insert(rows).select("id");
  if (error) return bad(error.message, 500);
  return ok({ ids: data?.map((d: any) => d.id) });
});
