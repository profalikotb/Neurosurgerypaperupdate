import { withUser, ok } from "@/lib/api";
import { db } from "@/lib/supabase/admin";

export const POST = withUser(async (req, u) => {
  const b = await req.json();
  const row: Record<string, unknown> = { user_id: u.id, updated_at: new Date().toISOString() };
  if (b.interests && typeof b.interests === "object") row.interests = b.interests;
  if (typeof b.email_digest === "boolean") row.email_digest = b.email_digest;
  if (typeof b.digest_email === "string") row.digest_email = b.digest_email || u.email;
  if (typeof b.arabic === "boolean") row.arabic = b.arabic;
  await db().from("settings").upsert(row);
  return ok();
});
