import "server-only";
import { db } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { classifyPaper, NEURO_RELEVANCE } from "@/lib/classify";
import { efetch, esearch, journalClause, NEURO_FILTER_TERM, PubmedRecord } from "@/lib/sources/pubmed";
import { epmcLookup } from "@/lib/sources/europepmc";
import { unpaywall } from "@/lib/sources/unpaywall";
import { verifyDoi } from "@/lib/sources/crossref";
import { normalizeTitle, isoDay } from "@/lib/text";
import { embed, vec } from "@/lib/llm";
import { logEvent } from "@/lib/log";
import { enqueue } from "@/lib/queue";

type Journal = { id: number; name: string; nlm_abbr: string; tier: "core" | "additional"; neuro_filter: boolean; enabled: boolean; priority: number; last_ingested: string | null };

export async function loadJournals(): Promise<Journal[]> {
  const { data, error } = await db().from("journals").select("*").order("priority", { ascending: false });
  if (error) throw error;
  return data as Journal[];
}

function matchJournal(journals: Journal[], abbr: string): Journal | undefined {
  const a = abbr.toLowerCase();
  return journals.find((j) => j.nlm_abbr.split("|").some((x) => x.trim().toLowerCase() === a));
}

/** Insert new / refresh existing PubMed records. Returns ids of NEW papers. */
export async function upsertRecords(records: PubmedRecord[], journals?: Journal[]): Promise<{ newIds: number[]; allIds: number[] }> {
  if (!records.length) return { newIds: [], allIds: [] };
  const js = journals ?? (await loadJournals());
  const sb = db();
  const { data: existing } = await sb.from("papers").select("id,pmid").in("pmid", records.map((r) => r.pmid));
  const known = new Map((existing ?? []).map((e: any) => [e.pmid as string, e.id as number]));

  const rows = records.map((r) => {
    const j = matchJournal(js, r.journal_abbr);
    const c = classifyPaper({ title: r.title, abstract: r.abstract, pub_types: r.pub_types, mesh: r.mesh, journal_tier: j?.tier ?? "additional", journal_abbr: r.journal_abbr });
    return {
      pmid: r.pmid, pmcid: r.pmcid, doi: r.doi?.toLowerCase() ?? null, title: r.title, title_norm: normalizeTitle(r.title),
      abstract: r.abstract, abstract_sections: r.abstract_sections, authors: r.authors, author_string: r.author_string,
      journal_id: j?.id ?? null, journal_name: r.journal_name, journal_abbr: r.journal_abbr, volume: r.volume, issue: r.issue, pages: r.pages,
      pub_date: r.pub_date, pub_date_text: r.pub_date_text, indexed_at: r.indexed_at, pub_types: r.pub_types, mesh: r.mesh,
      mesh_text: [...r.mesh, ...r.keywords].join("; "), keywords: r.keywords, ...c, updated_at: new Date().toISOString(),
    };
  });

  const fresh = rows.filter((r) => !known.has(r.pmid));
  const stale = rows.filter((r) => known.has(r.pmid));
  const newIds: number[] = [];

  if (fresh.length) {
    const { data, error } = await sb.from("papers").insert(fresh).select("id");
    if (!error) newIds.push(...(data ?? []).map((d: any) => d.id));
    else {
      // Fall back row-by-row so a single DOI clash doesn't drop the batch
      for (const row of fresh) {
        const { data: d, error: e } = await sb.from("papers").insert(row).select("id").maybeSingle();
        if (d) newIds.push(d.id); else if (e) await logEvent("ingest", `skip PMID ${row.pmid}: ${e.message}`, null, "warn");
      }
    }
  }
  for (const row of stale) {
    // Refresh bibliographic fields (e.g. ahead-of-print → issue assigned) without touching enrichment
    await sb.from("papers").update(row).eq("pmid", row.pmid);
  }
  return { newIds, allIds: [...newIds, ...stale.map((s) => known.get(s.pmid)!)] };
}

/** Pull new PubMed records for one journal since its last ingest (Entrez date). */
export async function ingestJournal(journalId: number): Promise<{ found: number; inserted: number; newIds: number[] }> {
  const js = await loadJournals();
  const j = js.find((x) => x.id === journalId);
  if (!j || !j.enabled) return { found: 0, inserted: 0, newIds: [] };
  const since = j.last_ingested ? new Date(new Date(j.last_ingested).getTime() - 2 * 864e5) : new Date(Date.now() - env.lookbackDays * 864e5);
  const term = journalClause(j.nlm_abbr) + (j.neuro_filter ? ` AND ${NEURO_FILTER_TERM}` : "") + " AND english[la]";
  const { ids } = await esearch(term, { retmax: 400, sort: "pub_date", mindate: isoDay(since).replace(/-/g, "/"), datetype: "edat" });
  let records = ids.length ? await efetch(ids) : [];
  if (j.neuro_filter) records = records.filter((r) => NEURO_RELEVANCE.test(`${r.title} ${r.abstract ?? ""} ${r.mesh.join(" ")}`));
  const { newIds } = await upsertRecords(records, js);
  await db().from("journals").update({ last_ingested: new Date().toISOString() }).eq("id", j.id);
  if (!ids.length && !j.last_ingested) await logEvent("ingest", `No PubMed results for ${j.name} (${j.nlm_abbr}) — check the abbreviation in Settings`, null, "warn");
  return { found: ids.length, inserted: newIds.length, newIds };
}

/** Ad-hoc PubMed search → ingest (used by search, chat and topic reviews). */
export async function ingestSearch(term: string, retmax = 20, sort: "relevance" | "pub_date" = "relevance"): Promise<number[]> {
  const { ids } = await esearch(term, { retmax, sort });
  if (!ids.length) return [];
  const recs = await efetch(ids);
  const { newIds, allIds } = await upsertRecords(recs);
  if (newIds.length) await enqueue("enrich_papers", { ids: newIds }, { priority: 5 });
  // preserve PubMed relevance order
  const { data } = await db().from("papers").select("id,pmid").in("id", allIds);
  const byPmid = new Map((data ?? []).map((d: any) => [d.pmid, d.id]));
  return ids.map((p) => byPmid.get(p)).filter(Boolean) as number[];
}

export async function ingestPmids(pmids: string[]): Promise<number[]> {
  const recs = await efetch(pmids);
  const { newIds, allIds } = await upsertRecords(recs);
  if (newIds.length) await enrichPapers(newIds, { verify: true });
  return allIds;
}

/** Full-text availability (Europe PMC / Unpaywall), DOI verification (Crossref), embeddings. */
export async function enrichPapers(ids: number[], opts: { verify?: boolean } = {}): Promise<void> {
  const sb = db();
  const { data: papers } = await sb.from("papers").select("id,pmid,pmcid,doi,title,abstract,fulltext_access,verified_at").in("id", ids);
  if (!papers?.length) return;
  const epmc = await epmcLookup(papers.map((p: any) => p.pmid).filter(Boolean)).catch(() => new Map());

  for (const p of papers as any[]) {
    const upd: Record<string, unknown> = {};
    const e = epmc.get(p.pmid);
    if (e) {
      if (e.pmcid && !p.pmcid) upd.pmcid = e.pmcid;
      if (e.citedByCount != null) upd.citation_count = e.citedByCount;
    }
    const pmcid = (upd.pmcid as string) ?? p.pmcid;
    if (p.fulltext_access !== "user_upload") {
      if (e?.isOpenAccess && pmcid) upd.fulltext_access = "open_pmc";
      else if (p.doi) {
        const oa = await unpaywall(p.doi).catch(() => null);
        if (oa && (oa.pdfUrl || oa.landingUrl)) { upd.fulltext_access = "open_other"; upd.oa_url = oa.pdfUrl ?? oa.landingUrl; upd.oa_license = oa.license; }
        else upd.fulltext_access = "none";
      } else upd.fulltext_access = "none";
    }
    if (opts.verify !== false && p.doi && !p.verified_at) {
      const v = await verifyDoi(p.doi, p.title).catch((err) => ({ ok: false, note: `Crossref unavailable: ${String(err?.message ?? err)}` }));
      upd.verification_note = v.note;
      if (v.ok) upd.verified_at = new Date().toISOString();
    }
    if (Object.keys(upd).length) await sb.from("papers").update(upd).eq("id", p.id);
  }

  // Embeddings for semantic search (optional)
  try {
    const embs = await embed((papers as any[]).map((p) => `${p.title}\n${(p.abstract ?? "").slice(0, 3000)}`));
    if (embs) for (let i = 0; i < papers.length; i++) await sb.from("papers").update({ embedding: vec(embs[i]) }).eq("id", (papers as any[])[i].id);
  } catch (e: any) { await logEvent("embed", e.message, null, "warn"); }
}
