import { after } from "next/server";
import { withUser, ok, bad, idOf } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { runJobs } from "@/lib/jobs";
import { db } from "@/lib/supabase/admin";
import { hasLLM } from "@/lib/env";

export const maxDuration = 300;

export const POST = withUser<{ params: Promise<{ id: string }> }>(async (req, _u, ctx) => {
  if (!hasLLM()) return bad("No AI provider configured. Add LLM_API_KEY in Vercel → Settings → Environment Variables.");
  const id = await idOf(ctx);
  const { kind = "core", regenerate = false } = await req.json().catch(() => ({}));
  if (!["core", "expert", "arabic"].includes(kind)) return bad("Invalid kind");
  if (regenerate) await db().from("summaries").delete().eq("paper_id", id).eq("kind", kind);
  const jobId = await enqueue("summarize", { paperId: id, kind }, { dedupe: `sum:${id}:${kind}`, priority: 9 });
  after(() => runJobs(270_000).catch(() => null));
  return ok({ jobId });
});
