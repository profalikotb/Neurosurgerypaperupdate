import { XMLParser } from "fast-xml-parser";
import { env } from "@/lib/env";
import { getJSON, getText, limiter } from "@/lib/http";
import { stripTags } from "@/lib/text";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const rate = limiter(env.ncbiKey ? 9 : 2.5);
const common = () => `tool=NeurosurgeryUpdate${env.contactEmail ? `&email=${encodeURIComponent(env.contactEmail)}` : ""}${env.ncbiKey ? `&api_key=${env.ncbiKey}` : ""}`;

export type PubmedRecord = {
  pmid: string; pmcid: string | null; doi: string | null;
  title: string; abstract: string | null; abstract_sections: { label: string; text: string }[] | null;
  authors: { name: string; affiliation?: string }[]; author_string: string;
  journal_name: string; journal_abbr: string; volume: string | null; issue: string | null; pages: string | null;
  pub_date: string | null; pub_date_text: string; indexed_at: string | null;
  pub_types: string[]; mesh: string[]; keywords: string[]; language: string | null;
};

/** esearch → list of PMIDs. `term` is standard PubMed syntax. */
export async function esearch(term: string, opts: { retmax?: number; sort?: "relevance" | "pub_date" | "most+recent"; mindate?: string; maxdate?: string; datetype?: "edat" | "pdat" } = {}): Promise<{ ids: string[]; count: number }> {
  await rate();
  const p = new URLSearchParams({ db: "pubmed", term, retmode: "json", retmax: String(opts.retmax ?? 100), sort: opts.sort ?? "relevance" });
  if (opts.mindate) { p.set("mindate", opts.mindate); p.set("maxdate", opts.maxdate ?? "3000"); p.set("datetype", opts.datetype ?? "edat"); }
  const j = await getJSON<any>(`${BASE}/esearch.fcgi?${p}&${common()}`);
  return { ids: j?.esearchresult?.idlist ?? [], count: Number(j?.esearchresult?.count ?? 0) };
}

/** efetch in batches of 150 → parsed records. */
export async function efetch(pmids: string[]): Promise<PubmedRecord[]> {
  const out: PubmedRecord[] = [];
  for (let i = 0; i < pmids.length; i += 150) {
    await rate();
    const ids = pmids.slice(i, i + 150).join(",");
    const xml = await getText(`${BASE}/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml&${common()}`, { timeoutMs: 60000 });
    out.push(...parsePubmedXml(xml));
  }
  return out;
}

const ARR = new Set(["PubmedArticle", "Author", "AbstractText", "PublicationType", "MeshHeading", "Keyword", "KeywordList", "ArticleId", "PubMedPubDate", "ELocationID", "AffiliationInfo"]);
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", parseTagValue: false, parseAttributeValue: false,
  isArray: (name) => ARR.has(name),
  stopNodes: ["*.ArticleTitle", "*.AbstractText", "*.Affiliation", "*.Keyword", "*.VernacularTitle"],
});

const txt = (v: any): string => (v == null ? "" : typeof v === "string" ? stripTags(v) : typeof v === "object" ? stripTags(String(v["#text"] ?? "")) : String(v));
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const mm = (m?: string) => (!m ? null : /^\d+$/.test(m) ? m.padStart(2, "0") : MONTHS[m.slice(0, 3).toLowerCase()] ?? null);

function dateOf(d: any): string | null {
  if (!d?.Year) return null;
  const m = mm(String(d.Month ?? "")) ?? "01";
  const day = String(d.Day ?? "01").padStart(2, "0");
  return `${d.Year}-${m}-${day}`;
}

export function parsePubmedXml(xml: string): PubmedRecord[] {
  const doc = parser.parse(xml);
  const arts: any[] = doc?.PubmedArticleSet?.PubmedArticle ?? [];
  return arts.map((a) => {
    const mc = a.MedlineCitation ?? {};
    const art = mc.Article ?? {};
    const jr = art.Journal ?? {};
    const ji = jr.JournalIssue ?? {};
    const ids: any[] = a.PubmedData?.ArticleIdList?.ArticleId ?? [];
    const idOf = (t: string) => { const x = ids.find((i) => i?.["@_IdType"] === t); return x ? txt(x) : null; };
    const eloc: any[] = art.ELocationID ?? [];
    const doi = idOf("doi") ?? (eloc.find((e) => e?.["@_EIdType"] === "doi") ? txt(eloc.find((e) => e?.["@_EIdType"] === "doi")) : null);

    const absParts: any[] = art.Abstract?.AbstractText ?? [];
    const sections = absParts.map((p) => ({ label: typeof p === "object" ? String(p["@_Label"] ?? "") : "", text: txt(p) })).filter((s) => s.text);
    const abstract = sections.length ? sections.map((s) => (s.label ? `${s.label}: ${s.text}` : s.text)).join("\n") : null;

    const authors = (art.AuthorList?.Author ?? []).map((au: any) => ({
      name: au.CollectiveName ? txt(au.CollectiveName) : [txt(au.LastName), txt(au.Initials)].filter(Boolean).join(" "),
      affiliation: au.AffiliationInfo?.[0]?.Affiliation ? txt(au.AffiliationInfo[0].Affiliation) : undefined,
    })).filter((x: any) => x.name);
    const author_string = authors.length > 6 ? `${authors.slice(0, 6).map((x: any) => x.name).join(", ")}, et al.` : authors.map((x: any) => x.name).join(", ");

    const pd = ji.PubDate ?? {};
    const issueDate = pd.Year ? dateOf(pd) : pd.MedlineDate ? (() => { const y = String(pd.MedlineDate).match(/\d{4}/)?.[0]; const m = mm(String(pd.MedlineDate).match(/[A-Za-z]{3}/)?.[0]); return y ? `${y}-${m ?? "01"}-01` : null; })() : null;
    const artDate = art.ArticleDate ? dateOf(Array.isArray(art.ArticleDate) ? art.ArticleDate[0] : art.ArticleDate) : null;
    const hist: any[] = a.PubmedData?.History?.PubMedPubDate ?? [];
    const entrez = hist.find((h) => h?.["@_PubStatus"] === "entrez") ?? hist.find((h) => h?.["@_PubStatus"] === "pubmed");
    const pub_date = artDate && (!issueDate || artDate < issueDate) ? artDate : issueDate;

    return {
      pmid: txt(mc.PMID),
      pmcid: idOf("pmc"),
      doi: doi ? doi.trim() : null,
      title: txt(art.ArticleTitle) || txt(art.VernacularTitle) || "(untitled)",
      abstract, abstract_sections: sections.some((s) => s.label) ? sections : null,
      authors, author_string,
      journal_name: txt(jr.Title), journal_abbr: txt(mc.MedlineJournalInfo?.MedlineTA) || txt(jr.ISOAbbreviation),
      volume: txt(ji.Volume) || null, issue: txt(ji.Issue) || null, pages: txt(art.Pagination?.MedlinePgn) || null,
      pub_date, pub_date_text: [pd.Year, pd.Month, pd.Day].filter(Boolean).join(" ") || txt(pd.MedlineDate),
      indexed_at: entrez ? `${dateOf(entrez)}T${String(entrez.Hour ?? "00").padStart(2, "0")}:${String(entrez.Minute ?? "00").padStart(2, "0")}:00Z` : null,
      pub_types: (art.PublicationTypeList?.PublicationType ?? []).map(txt),
      mesh: (mc.MeshHeadingList?.MeshHeading ?? []).map((m: any) => txt(m.DescriptorName)).filter(Boolean),
      keywords: (mc.KeywordList ?? []).flatMap((k: any) => (k.Keyword ?? []).map(txt)).filter(Boolean),
      language: txt(art.Language) || null,
    };
  }).filter((r) => r.pmid);
}

/** Build a PubMed journal clause from "Abbr|Alt Abbr". */
export const journalClause = (nlm: string) => "(" + nlm.split("|").map((a) => `"${a.trim()}"[ta]`).join(" OR ") + ")";

export const NEURO_FILTER_TERM =
  '(neurosurgery[mh] OR neurosurgical procedures[mh] OR "neurosurg*"[tiab] OR craniotomy[tiab] OR "brain neoplasms"[mh] OR "intracranial aneurysm"[mh] OR "spinal diseases"[mh] OR hydrocephalus[tiab] OR "deep brain stimulation"[tiab] OR thrombectomy[tiab] OR "subarachnoid hemorrhage"[tiab] OR "intracerebral hemorrhage"[tiab] OR "traumatic brain injury"[tiab] OR glioma[tiab] OR glioblastoma[tiab] OR meningioma[tiab] OR "subdural"[tiab])';
