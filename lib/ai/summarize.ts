import "server-only";
import { db } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/llm";
import { env } from "@/lib/env";
import { ensureFullText, SourceBasis, StoredSection } from "@/lib/fulltext";
import { coreSystem, expertSystem, ARABIC_SYSTEM } from "@/lib/ai/prompts";
import { verifyCore, filterIds } from "@/lib/ai/verify";
import { relatedPapers, libraryPassages, paperToSource, libToSource, renderSources, CtxSource } from "@/lib/ai/context";

const BUDGET = 90_000; // characters of source text sent to the model (~22k tokens)

/** Section priority when trimming long papers: results/methods/tables are preserved longest. */
function priority(s: StoredSection): number {
  const l = s.label.toLowerCase();
  if (s.kind === "table") return 5;
  if (/result|outcome|finding/.test(l)) return 5;
  if (/method|patients|material|design|statistic|population|technique|procedure|operative|surgical/.test(l)) return 4;
  if (s.kind === "abstract" || /conclusion/.test(l)) return 4;
  if (/discussion|limitation/.test(l)) return 3;
  if (s.kind === "figure") return 2;
  if (/introduction|background/.test(l)) return 1;
  return 2;
}

export function assembleSource(paper: any, basis: SourceBasis, sections: StoredSection[]): string {
  const head = `TITLE: ${paper.title}\nJOURNAL: ${paper.journal_name ?? paper.journal_abbr} (${paper.pub_date ?? paper.pub_date_text ?? ""})\nPUBLICATION TYPES: ${(paper.pub_types ?? []).join(", ")}\n`;
  if (basis === "abstract_only" || basis === "metadata_only" || !sections.some((s) => s.kind === "section")) {
    return `${head}\n[§ Abstract]\n${paper.abstract ?? "(no abstract available)"}`;
  }
  const secs = [...sections];
  if (!secs.some((s) => s.kind === "abstract") && paper.abstract) secs.unshift({ ord: -1, label: "Abstract", kind: "abstract", text: paper.abstract });
  let total = secs.reduce((a, s) => a + s.text.length, 0);
  const caps = new Map<StoredSection, number>(secs.map((s) => [s, s.text.length]));
  for (const p of [1, 2, 3, 4, 5]) {
    if (total <= BUDGET) break;
    for (const s of secs.filter((x) => priority(x) === p)) {
      const cap = p <= 2 ? 600 : p === 3 ? 2500 : 6000;
      const cur = caps.get(s)!;
      if (cur > cap) { total -= cur - cap; caps.set(s, cap); }
    }
  }
  return head + secs.map((s) => {
    const cap = caps.get(s)!;
    const t = s.text.length > cap ? s.text.slice(0, cap) + " […trimmed]" : s.text;
    return `\n[§ ${s.label}]\n${t}`;
  }).join("\n");
}

async function buildContext(paper: any): Promise<CtxSource[]> {
  const q = `${paper.title} ${(paper.mesh ?? []).slice(0, 6).join(" ")}`;
  const [rel, lib] = await Promise.all([
    relatedPapers(q, 6, paper.id).catch(() => []),
    libraryPassages(q, 4).catch(() => []),
  ]);
  return [...rel.map((p, i) => paperToSource(p, `S${i + 1}`, (p.abstract ?? "").slice(0, 900))), ...lib.map((r, i) => libToSource(r, `L${i + 1}`))];
}

export async function summarizePaper(paperId: number, kind: "core" | "expert" | "arabic" = "core") {
  const sb = db();
  const { data: paper, error } = await sb.from("papers").select("*").eq("id", paperId).single();
  if (error || !paper) throw new Error(`Paper ${paperId} not found`);

  if (kind === "arabic") return arabic(paper);

  const { basis, sections } = await ensureFullText(paperId);
  const source = assembleSource(paper, basis, sections);
  const ctx = await buildContext(paper);
  const allowed = new Set(ctx.map((c) => c.id));
  const ctxText = ctx.length ? `\n\nCONTEXT FOR COMPARISON (cite only these IDs; they are NOT the paper under review):\n${renderSources(ctx)}` : "\n\nCONTEXT FOR COMPARISON: none available — any comparison must use citation:null (unverified background).";

  if (kind === "expert") {
    const core = await sb.from("summaries").select("content").eq("paper_id", paperId).eq("kind", "core").maybeSingle();
    const { data, model } = await chatJSON<any>([
      { role: "system", content: expertSystem(basis) },
      { role: "user", content: `SOURCE (${basis}):\n${source}${ctxText}${core.data ? `\n\nEXISTING STRUCTURED SUMMARY (for orientation; re-check against SOURCE):\n${JSON.stringify(core.data.content).slice(0, 12000)}` : ""}` },
    ], { maxTokens: 9000, temperature: 0.2 });
    (data.competing_techniques ?? []).forEach((c: any) => { if (c.citation && !allowed.has(c.citation)) c.citation = null; });
    await sb.from("summaries").upsert({ paper_id: paperId, kind: "expert", source_basis: basis, model, content: { ...data, context: ctx.map(stripText) } }, { onConflict: "paper_id,kind" });
    return { basis };
  }

  const { data, model } = await chatJSON<any>([
    { role: "system", content: coreSystem(basis) },
    { role: "user", content: `SOURCE (${basis}):\n${source}${ctxText}` },
  ], { maxTokens: 14000, temperature: 0.1 });

  // Strip citations the model was not given
  (data.comparison ?? []).forEach((c: any) => { if (c.citation && !allowed.has(c.citation)) c.citation = null; });
  (data.surgical?.items ?? []).forEach((s: any) => { if (s.citation && !allowed.has(s.citation)) s.citation = null; });
  const verification = basis === "metadata_only" ? null : verifyCore(data, source);

  await sb.from("summaries").upsert({ paper_id: paperId, kind: "core", source_basis: basis, model, content: { ...data, context: ctx.map(stripText) }, verification }, { onConflict: "paper_id,kind" });
  return { basis, verification: verification?.totals };
}

const stripText = (c: CtxSource) => ({ ...c, text: undefined });

async function arabic(paper: any) {
  const sb = db();
  const { data: core } = await sb.from("summaries").select("content,source_basis").eq("paper_id", paper.id).eq("kind", "core").maybeSingle();
  if (!core) throw new Error("Generate the English summary first.");
  const c = core.content as any;
  const { data, model } = await chatJSON<any>([
    { role: "system", content: ARABIC_SYSTEM },
    { role: "user", content: JSON.stringify({ title: paper.title, why: c.why_it_matters?.importance, quick_points: c.quick_points, essential_five: c.takeaways?.essential_five, clinical_implications: c.takeaways?.clinical_implications }) },
  ], { model: env.llmModelFast, maxTokens: 5000, temperature: 0.2 });
  await sb.from("summaries").upsert({ paper_id: paper.id, kind: "arabic", source_basis: core.source_basis, model, content: data }, { onConflict: "paper_id,kind" });
  return { basis: core.source_basis };
}

export { filterIds };
