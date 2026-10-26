import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { chatJSON, chatStream, Msg } from "@/lib/llm";
import { ingestSearch } from "@/lib/ingest";
import { relatedPapers, libraryPassages, paperToSource, libToSource, renderSources, CtxSource } from "@/lib/ai/context";
import { RAG_SYSTEM } from "@/lib/ai/prompts";
import { logEvent } from "@/lib/log";

const PAPER_COLS = "id,pmid,doi,title,abstract,journal_abbr,pub_date,study_type,evidence_level,author_string,fulltext_access,is_retracted,hidden";
const DESIGN_W: Record<string, number> = { Guideline: 1.6, "Meta-analysis": 1.5, RCT: 1.5, "Systematic review": 1.35, "Prospective cohort": 1.15 };

export const wantsRecent = (q: string) => /recent|latest|new|advance|update|current|trend|evidence|trial|20\d\d|past (year|months)|this year|changed/i.test(q);

/** Ask a fast model for a precise PubMed query; fall back to plain keywords. */
export async function pubmedQueryFor(question: string): Promise<string> {
  try {
    const { data } = await chatJSON<{ pubmed_query: string }>([
      { role: "system", content: 'Convert the neurosurgical question into ONE precise PubMed search string using MeSH and [tiab] terms with AND/OR. No date or publication-type filters. Return JSON {"pubmed_query": str}.' },
      { role: "user", content: question },
    ], { model: env.llmModelFast, maxTokens: 300, temperature: 0 });
    if (data?.pubmed_query && data.pubmed_query.length < 500) return data.pubmed_query;
  } catch { /* fall through */ }
  return question.replace(/[?"]/g, "");
}

export type Retrieval = { sources: CtxSource[]; pubmedQuery: string | null; searchedAt: string; liveCount: number };

export async function retrieve(question: string, opts: { live?: boolean; maxPapers?: number; maxLib?: number; years?: number } = {}): Promise<Retrieval> {
  const maxPapers = opts.maxPapers ?? 10, maxLib = opts.maxLib ?? 6;
  let pubmedQuery: string | null = null;
  let liveIds: number[] = [];
  const local = await relatedPapers(question, maxPapers * 2).catch(() => []);
  const live = opts.live ?? (wantsRecent(question) || local.length < 4);
  if (live) {
    try {
      pubmedQuery = await pubmedQueryFor(question);
      const yrs = opts.years ?? (wantsRecent(question) ? 3 : 10);
      const dp = `AND ("${new Date().getFullYear() - yrs}"[dp] : "3000"[dp])`;
      const [a, b] = await Promise.all([
        ingestSearch(`(${pubmedQuery}) ${dp} AND english[la]`, 12, "relevance"),
        ingestSearch(`(${pubmedQuery}) AND (randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] OR guideline[pt] OR practice guideline[pt]) AND english[la]`, 8, "relevance"),
      ]);
      liveIds = [...new Set([...b, ...a])];
    } catch (e: any) { await logEvent("rag", `PubMed live search failed: ${e.message}`, null, "warn"); }
  }
  const sb = db();
  const { data: liveRows } = liveIds.length ? await sb.from("papers").select(PAPER_COLS).in("id", liveIds) : { data: [] as any[] };
  const pool = new Map<number, { p: any; s: number }>();
  (liveRows ?? []).forEach((p: any) => pool.set(p.id, { p, s: 1 / (8 + liveIds.indexOf(p.id)) }));
  local.forEach((p: any, i: number) => { const cur = pool.get(p.id); pool.set(p.id, { p, s: (cur?.s ?? 0) + 1 / (8 + i) }); });
  const papers = [...pool.values()].filter((x) => !x.p.is_retracted && !x.p.hidden)
    .map((x) => ({ ...x, s: x.s * (DESIGN_W[x.p.study_type] ?? 1) }))
    .sort((a, b) => b.s - a.s).slice(0, maxPapers).map((x) => x.p);
  const lib = await libraryPassages(question, maxLib).catch(() => []);
  const sources = [...papers.map((p, i) => paperToSource(p, `S${i + 1}`)), ...lib.map((r, i) => libToSource(r, `L${i + 1}`))];
  return { sources, pubmedQuery, searchedAt: new Date().toISOString(), liveCount: liveIds.length };
}

export function coverageLine(r: Retrieval): string {
  const d = new Date(r.searchedAt);
  const ds = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const papers = r.sources.filter((s) => s.kind === "paper").length, lib = r.sources.length - papers;
  return `Literature coverage: ${papers} indexed article(s)${r.pubmedQuery ? ` incl. live PubMed search on ${ds}` : ` from the local index (as of ${ds})`}; ${lib} library passage(s).`;
}

export async function* answerStream(question: string, history: Msg[], r: Retrieval): AsyncGenerator<string> {
  if (!r.sources.length) {
    yield "**Insufficient verified source information.** No indexed articles or library passages matched this question. Try rephrasing, or add relevant papers/textbooks to the library.";
    return;
  }
  const msgs: Msg[] = [
    { role: "system", content: RAG_SYSTEM },
    ...history.slice(-6),
    { role: "user", content: `QUESTION: ${question}\n\nSOURCES:\n${renderSources(r.sources)}\n\n${coverageLine(r)}` },
  ];
  yield* chatStream(msgs, { maxTokens: 4000, temperature: 0.2 });
}
