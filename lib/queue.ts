import "server-only";
import { db } from "@/lib/supabase/admin";

export type JobType =
  | "ingest_journal" | "enrich_papers" | "summarize" | "extract_document"
  | "topic_review" | "weekly_report" | "check_editions" | "auto_summarize";

/** Enqueue a job. A dedupe_key prevents duplicates while one is queued/running. */
export async function enqueue(type: JobType, payload: Record<string, unknown> = {}, opts: { dedupe?: string; priority?: number; runAfter?: Date } = {}): Promise<number | null> {
  const row: Record<string, unknown> = { type, payload, priority: opts.priority ?? 0, dedupe_key: opts.dedupe ?? null };
  if (opts.runAfter) row.run_after = opts.runAfter.toISOString();
  const { data, error } = await db().from("jobs").insert(row).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505" && opts.dedupe) {
      const { data: ex } = await db().from("jobs").select("id").eq("dedupe_key", opts.dedupe).in("status", ["queued", "running"]).maybeSingle();
      return ex?.id ?? null;
    }
    throw error;
  }
  return data?.id ?? null;
}
