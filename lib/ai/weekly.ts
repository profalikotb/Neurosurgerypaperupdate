import "server-only";
import { db } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/llm";
import { WEEKLY_SYSTEM } from "@/lib/ai/prompts";
import { paperToSource, renderSources } from "@/lib/ai/context";
import { sendDigest } from "@/lib/email";
import { isoDay } from "@/lib/text";

export function weekStartOf(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return isoDay(x);
}

export async function generateWeekly(weekStart?: string) {
  const sb = db();
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 864e5);
  const ws = weekStart ?? weekStartOf(end);
  const { data: papers } = await sb.from("papers")
    .select("id,pmid,doi,title,abstract,journal_abbr,pub_date,study_type,evidence_level,author_string,importance_score,practice_change_candidate,debated,fulltext_access")
    .gte("indexed_at", start.toISOString()).eq("hidden", false).eq("is_retracted", false)
    .order("importance_score", { ascending: false }).limit(40);
  const list = papers ?? [];
  const sources = list.map((p: any, i: number) => paperToSource(p, `S${i + 1}`, (p.abstract ?? "").slice(0, 1100)));
  const { data: editions } = await sb.from("notifications").select("title,body,link,created_at").eq("kind", "edition").gte("created_at", start.toISOString());

  let ai: any = null, model: string | null = null;
  if (sources.length) {
    const r = await chatJSON<any>([
      { role: "system", content: WEEKLY_SYSTEM },
      { role: "user", content: `WEEK: ${isoDay(start)} → ${isoDay(end)}\nITEMS (pre-ranked):\n${renderSources(sources)}` },
    ], { maxTokens: 7000, temperature: 0.2 });
    ai = r.data; model = r.model;
    const allowed = new Set(sources.map((s) => s.id));
    const fix = (arr: any[]) => (arr ?? []).filter((x) => !x.id || allowed.has(x.id));
    for (const k of ["top_papers", "major_trials", "meta_analyses", "guidelines", "new_techniques"]) ai[k] = fix(ai[k]);
    for (const k of ["controversies", "emerging"]) (ai[k] ?? []).forEach((x: any) => (x.ids = (x.ids ?? []).filter((i: string) => allowed.has(i))));
  }
  const content = {
    period: { from: isoDay(start), to: isoDay(end) }, model, ai,
    sources: sources.map((s) => ({ ...s, text: undefined })),
    counts: { indexed: list.length },
    deterministic: {
      rcts: list.filter((p: any) => p.study_type === "RCT").map((p: any) => p.id),
      meta: list.filter((p: any) => ["Meta-analysis", "Systematic review"].includes(p.study_type)).map((p: any) => p.id),
      guidelines: list.filter((p: any) => p.study_type === "Guideline").map((p: any) => p.id),
    },
    editions: editions ?? [],
  };
  const { data: row } = await sb.from("weekly_reports").upsert({ week_start: ws, content, paper_ids: list.map((p: any) => p.id) }, { onConflict: "week_start" }).select("id").single();
  await sendDigest(ws, content).catch(() => null);
  return row?.id;
}
