import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { CARD_COLS, decorate } from "@/lib/data";
import { PaperCard } from "@/components/paper-card";
import { STUDY_TYPES, SUBSPECIALTIES } from "@/lib/classify";
import { ingestSearch, ingestPmids } from "@/lib/ingest";
import { esearch } from "@/lib/sources/pubmed";
import { embed, vec } from "@/lib/llm";
import { libraryPassages } from "@/lib/ai/context";
import { hasEmbeddings } from "@/lib/env";
import { cn } from "@/components/ui/cn";
import { truncate } from "@/lib/text";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = Record<string, string | undefined>;
const W: Record<string, number> = { Guideline: 1.5, "Meta-analysis": 1.45, RCT: 1.45, "Systematic review": 1.3, "Prospective cohort": 1.15, "Retrospective cohort": 1, "Case series": 0.85, "Case report": 0.6, "Editorial / Letter": 0.4 };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const tab = sp.tab === "library" ? "library" : "papers";
  const sb = db();
  let note = "";

  // Exact identifier → open directly
  const pmid = q.match(/^(?:pmid:?\s*)?(\d{5,9})$/i)?.[1];
  const doi = q.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i)?.[1]?.toLowerCase();
  if (pmid || doi) {
    const { data } = pmid ? await sb.from("papers").select("id").eq("pmid", pmid).maybeSingle() : await sb.from("papers").select("id").eq("doi", doi).maybeSingle();
    let id = data?.id;
    if (!id) {
      const p = pmid ?? (await esearch(`${doi}[doi]`, { retmax: 1 }).catch(() => ({ ids: [] as string[] }))).ids[0];
      if (p) id = (await ingestPmids([p]).catch(() => []))[0];
    }
    if (id) redirect(`/paper/${id}`);
    note = "Identifier not found in PubMed.";
  }

  let papers: any[] = [];
  let passages: any[] = [];
  if (tab === "papers") {
    if (q && sp.pubmed === "1") {
      try { const n = await ingestSearch(q, 40, sp.sort === "date" ? "pub_date" : "relevance"); note = `PubMed searched live: ${n.length} result(s) added/updated.`; }
      catch (e: any) { note = `PubMed search failed: ${e.message}`; }
    }
    const from = sp.from ? `${sp.from}-01-01` : sp.days ? new Date(Date.now() - Number(sp.days) * 864e5).toISOString().slice(0, 10) : null;
    const { data: hits, error } = await sb.rpc("search_papers", {
      q: q || null, p_limit: 120, p_from: from, p_to: sp.to ? `${sp.to}-12-31` : null,
      p_types: sp.type ? [sp.type] : null, p_journal: sp.journal || null, p_subspecialty: sp.subspecialty || null,
      p_fulltext: sp.fulltext === "1", p_levels: sp.level ? [sp.level] : null,
    });
    if (error) note = error.message;
    const score = new Map<number, number>();
    (hits ?? []).forEach((h: any, i: number) => score.set(h.id, 1 / (10 + i)));
    if (q && sp.semantic !== "0" && hasEmbeddings()) {
      try {
        const e = await embed([q]);
        const { data: v } = await sb.rpc("match_papers", { query_embedding: vec(e![0]), p_limit: 60 });
        (v ?? []).filter((r: any) => r.similarity > 0.35).forEach((r: any, i: number) => score.set(r.id, (score.get(r.id) ?? 0) + 1 / (10 + i)));
      } catch { /* keyword only */ }
    }
    const ids = [...score.keys()];
    if (ids.length) {
      const { data } = await sb.from("papers").select(CARD_COLS).in("id", ids.slice(0, 200)).eq("hidden", false);
      // Semantic hits bypass SQL filters — re-apply them here
      const pass = (r: any) => (!sp.type || r.study_type === sp.type) && (!sp.level || r.evidence_level === sp.level) && (!sp.journal || r.journal_abbr === sp.journal)
        && (!sp.subspecialty || r.subspecialties?.includes(sp.subspecialty)) && (sp.fulltext !== "1" || ["open_pmc", "open_other", "user_upload"].includes(r.fulltext_access))
        && (!from || (r.pub_date ?? "") >= from) && (!sp.to || (r.pub_date ?? "") <= `${sp.to}-12-31`);
      const rows = (await decorate(data ?? [], user.id)).filter(pass);
      const rel = (r: any) => (score.get(r.id) ?? 0) * (W[r.study_type] ?? 1) * (1 + r.importance_score / 200);
      rows.sort(sp.sort === "date" ? (a, b) => String(b.pub_date ?? "").localeCompare(String(a.pub_date ?? "")) : sp.sort === "score" ? (a, b) => b.importance_score - a.importance_score : (a, b) => rel(b) - rel(a));
      papers = rows.slice(0, 60);
    }
  } else if (q) {
    passages = await libraryPassages(q, 20).catch(() => []);
  }

  const qs = (o: SP) => "?" + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const { data: journals } = await sb.from("journals").select("name,nlm_abbr").order("name");

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">Search</h1>
      <form className="mt-3 space-y-3" action="/search">
        <input type="hidden" name="tab" value={tab} />
        <div className="flex gap-2">
          <input name="q" defaultValue={q} className="input h-11 text-[15px]" placeholder="Disease, technique, author, anatomy, PMID or DOI…" autoFocus />
          <button className="h-11 rounded-[10px] bg-navy px-5 font-medium text-white dark:text-[#0b1020]">Search</button>
        </div>
        {tab === "papers" && (
          <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4 lg:grid-cols-7">
            <Sel name="type" v={sp.type} opts={STUDY_TYPES} label="Any design" />
            <Sel name="level" v={sp.level} opts={["Guideline", "1a", "1b", "2b", "3", "4", "5"]} label="Any level" />
            <Sel name="subspecialty" v={sp.subspecialty} opts={Object.keys(SUBSPECIALTIES)} label="Any subspecialty" />
            <Sel name="journal" v={sp.journal} opts={(journals ?? []).map((j: any) => j.nlm_abbr.split("|")[0])} label="Any journal" />
            <input name="from" defaultValue={sp.from} placeholder="From year" className="input h-9 py-1" inputMode="numeric" />
            <Sel name="sort" v={sp.sort} opts={["relevance", "date", "score"]} label="Best evidence first" />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><input type="checkbox" name="fulltext" value="1" defaultChecked={sp.fulltext === "1"} />Full text</label>
              <label className="flex items-center gap-1" title="Also query PubMed live and import results"><input type="checkbox" name="pubmed" value="1" defaultChecked={sp.pubmed === "1"} />+PubMed</label>
            </div>
          </div>
        )}
      </form>
      <div className="mt-4 flex gap-1 border-b rule">
        {(["papers", "library"] as const).map((t) => <Link key={t} href={qs({ tab: t })} className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-[13.5px] font-medium text-muted", tab === t && "border-navy text-navy")}>{t === "papers" ? "Journal articles" : "Textbook & PDF library"}</Link>)}
      </div>
      {note && <p className="mt-3 text-[13px] text-muted">{note}</p>}

      {tab === "papers" && (
        <div className="mt-1">
          {papers.length ? <p className="py-2 text-[12.5px] text-muted">{papers.length} result(s) · ranked by relevance × evidence strength{hasEmbeddings() ? " · hybrid keyword + semantic" : " · keyword"}</p> : null}
          {papers.map((p) => <PaperCard key={p.id} p={p} />)}
          {!papers.length && (q || sp.journal || sp.subspecialty || sp.type) && <p className="py-10 text-center text-muted">No indexed papers match. <Link className="link" href={qs({ pubmed: "1" })}>Search PubMed live and import →</Link></p>}
        </div>
      )}
      {tab === "library" && (
        <div className="mt-3 space-y-3">
          {passages.map((r: any) => (
            <div key={r.id} className="card p-4">
              <div className="text-[12.5px] text-muted"><b className="text-ink-2">{r.doc?.title}</b>{r.doc?.edition ? ` · ${r.doc.edition} ed.` : ""}{r.chapter ? ` · ${r.chapter}` : ""}{r.page_label ? ` · p. ${r.page_label}` : ""}</div>
              <p className="reading mt-1 text-[15px]">{truncate(r.text, 700)}</p>
              {r.paper_id && <Link href={`/paper/${r.paper_id}`} className="link text-[12.5px]">Open paper</Link>}
            </div>
          ))}
          {q && !passages.length && <p className="py-10 text-center text-muted">No passages found. Upload or index textbooks in the Library.</p>}
        </div>
      )}
    </div>
  );
}

function Sel({ name, v, opts, label }: { name: string; v?: string; opts: readonly string[]; label: string }) {
  return (
    <select name={name} defaultValue={v ?? ""} className="input h-9 py-1">
      <option value="">{label}</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
