import { after } from "next/server";
import { withUser, ok, bad } from "@/lib/api";
import { db } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/queue";
import { runJobs } from "@/lib/jobs";
import { hasLLM } from "@/lib/env";

export const maxDuration = 300;

export const POST = withUser(async (req, u) => {
  if (!hasLLM()) return bad("No AI provider configured.");
  const { topic, kind = "topic", reviewId } = await req.json();
  const sb = db();
  let id = reviewId as number | undefined;
  if (id) await sb.from("topic_reviews").update({ status: "pending", error: null }).eq("id", id).eq("user_id", u.id);
  else {
    if (!topic || String(topic).trim().length < 3) return bad("Enter a topic");
    const { data, error } = await sb.from("topic_reviews").insert({ user_id: u.id, topic: String(topic).trim(), kind: kind === "procedure" ? "procedure" : "topic" }).select("id").single();
    if (error) return bad(error.message, 500);
    id = data.id;
  }
  await enqueue("topic_review", { reviewId: id }, { dedupe: `topic:${id}`, priority: 8 });
  after(() => runJobs(270_000).catch(() => null));
  return ok({ id });
});
