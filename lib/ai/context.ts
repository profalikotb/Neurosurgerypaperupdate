import "server-only";
import { db } from "@/lib/supabase/admin";
import { embed, vec } from "@/lib/llm";
import { truncate, fmtDate } from "@/lib/text";

export type CtxSource = {
  id: string; // S1 / L1
  kind: "paper" | "library";
  paper_id?: number; document_id?: number;
  title: string; meta: string; design?: string | null; date?: string | null; url?: string | null;
  text: string; pmid?: string | null; doi?: string | null; page?: string | null; chapter?: string | null;
};

const PAPER_COLS = "id,pmid,doi,title,abstract,journal_abbr,pub_date,study_type,evidence_level,author_string,fulltext_access";

export function paperToSource(p: any, id: string, extra?: string): CtxSource {
  return {
    id, kind: "paper", paper_id: p.id, title: p.title,
    meta: `${p.author_string ? truncate(p.author_string, 60) + ". " : ""}${p.journal_abbr ?? ""} ${p.pub_date ? p.pub_date.slice(0, 4) : ""}${p.pmid ? ` · PMID ${p.pmid}` : ""}`,
    design: p.study_type, date: p.pub_date, pmid: p.pmid, doi: p.doi,
    url: p.doi ? `https://doi.org/${p.doi}` : p.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : null,
    text: truncate(extra ?? p.abstract ?? "(no abstract)", 1800),
  };
}

/** Related indexed papers for a query (keyword + optional vector). Strong designs first. */
export async function relatedPapers(query: string, limit = 8, excludeId?: number): Promise<any[]> {
  const sb = db();
  const ids = new Map<number, number>();
  const { data: kw } = await sb.rpc("search_papers", { q: toOrQuery(query), p_limit: 40 });
  (kw ?? []).forEach((r: any, i: number) => ids.set(r.id, (ids.get(r.id) ?? 0) + 1 / (10 + i)));
  try {
    const e = await embed([query]);
    if (e) {
      const { data: v } = await sb.rpc("match_papers", { query_embedding: vec(e[0]), p_limit: 40 });
      (v ?? []).forEach((r: any, i: number) => ids.set(r.id, (ids.get(r.id) ?? 0) + 1 / (10 + i)));
    }
  } catch { /* keyword only */ }
  if (excludeId) ids.delete(excludeId);
  const top = [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id]) => id);
  if (!top.length) return [];
  const { data } = await sb.from("papers").select(PAPER_COLS).in("id", top).eq("hidden", false).eq("is_retracted", false);
  const w: Record<string, number> = { Guideline: 1.6, "Meta-analysis": 1.5, RCT: 1.5, "Systematic review": 1.35, "Prospective cohort": 1.15 };
  return (data ?? []).map((p: any) => ({ p, s: (ids.get(p.id) ?? 0) * (w[p.study_type] ?? 1) }))
    .sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}

/** Library passages (textbooks + uploaded full texts), hybrid retrieval. */
export async function libraryPassages(query: string, limit = 6, opts: { paperId?: number } = {}): Promise<any[]> {
  const sb = db();
  let e: number[][] | null = null;
  try { e = await embed([query]); } catch { e = null; }
  const { data } = await sb.rpc("hybrid_chunks", { q: toOrQuery(query), query_embedding: e ? vec(e[0]) : null, p_limit: limit, p_doc_ids: null, p_paper_id: opts.paperId ?? null });
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: docs } = await sb.from("documents").select("id,title,edition,year,kind,authors").in("id", [...new Set(rows.map((r: any) => r.document_id))]);
  const dm = new Map((docs ?? []).map((d: any) => [d.id, d]));
  return rows.map((r: any) => ({ ...r, doc: dm.get(r.document_id) }));
}

export function libToSource(r: any, id: string): CtxSource {
  const d = r.doc ?? {};
  return {
    id, kind: "library", document_id: r.document_id, title: d.title ?? "Library document",
    meta: `${d.edition ? d.edition + " ed. " : ""}${d.year ?? ""}${r.chapter ? ` · ${r.chapter}` : ""}${r.page_label ? ` · p. ${r.page_label}` : ""}`,
    chapter: r.chapter, page: r.page_label, text: truncate(r.text, 1800),
  };
}

export const renderSources = (s: CtxSource[]) =>
  s.map((x) => `[${x.id}] ${x.kind === "paper" ? `${x.title} — ${x.meta} — design: ${x.design ?? "unclassified"} — published ${fmtDate(x.date)}` : `${x.title} — ${x.meta}`}\n${x.text}`).join("\n\n");

/** Websearch syntax that ORs the meaningful words so FTS recall isn't crippled by long questions. */
export function toOrQuery(q: string): string {
  const stop = new Set("what which when where how does do is are the a an of in on for to and or with without vs versus compare comparison between current recent latest evidence role best should my me about from into than this that these those".split(" "));
  const w = q.toLowerCase().replace(/[^a-z0-9\- ]/g, " ").split(/\s+/).filter((x) => x.length > 2 && !stop.has(x));
  return [...new Set(w)].slice(0, 12).join(" or ");
}
