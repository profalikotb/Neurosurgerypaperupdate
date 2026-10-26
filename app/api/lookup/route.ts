import { withUser, ok, bad } from "@/lib/api";
import { db } from "@/lib/supabase/admin";
import { esearch } from "@/lib/sources/pubmed";
import { ingestPmids } from "@/lib/ingest";

export const maxDuration = 120;

/** Resolve a PMID or DOI → ingest (if new) → return local paper id. */
export const POST = withUser(async (req) => {
  const { q } = await req.json();
  const s = String(q ?? "").trim();
  const sb = db();
  let pmid = s.match(/^(?:pmid:?\s*)?(\d{5,9})$/i)?.[1] ?? null;
  const doi = s.match(/10\.\d{4,9}\/\S+/)?.[0]?.replace(/[.,;]$/, "").toLowerCase() ?? null;
  if (!pmid && !doi) return bad("Not a PMID or DOI");
  const existing = pmid ? await sb.from("papers").select("id").eq("pmid", pmid).maybeSingle() : await sb.from("papers").select("id").eq("doi", doi).maybeSingle();
  if (existing.data) return ok({ id: existing.data.id });
  if (!pmid && doi) pmid = (await esearch(`${doi}[doi]`, { retmax: 1 })).ids[0] ?? null;
  if (!pmid) return bad("Not found in PubMed. Only PubMed-indexed articles can be imported.", 404);
  const ids = await ingestPmids([pmid]);
  return ids[0] ? ok({ id: ids[0] }) : bad("Import failed", 500);
});
