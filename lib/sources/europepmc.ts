import * as cheerio from "cheerio";
import { getJSON, fetchRetry } from "@/lib/http";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export type EpmcInfo = { pmid: string; pmcid: string | null; isOpenAccess: boolean; inPMC: boolean; citedByCount: number | null; doi: string | null };

/** Batch lookup of OA status / PMCID / citations for PMIDs (≤100 per call). */
export async function epmcLookup(pmids: string[]): Promise<Map<string, EpmcInfo>> {
  const map = new Map<string, EpmcInfo>();
  for (let i = 0; i < pmids.length; i += 100) {
    const slice = pmids.slice(i, i + 100);
    const q = `(${slice.map((p) => `EXT_ID:${p}`).join(" OR ")}) AND SRC:MED`;
    const j = await getJSON<any>(`${BASE}/search?query=${encodeURIComponent(q)}&resultType=lite&format=json&pageSize=100`);
    for (const r of j?.resultList?.result ?? []) {
      map.set(String(r.pmid), {
        pmid: String(r.pmid), pmcid: r.pmcid ?? null, isOpenAccess: r.isOpenAccess === "Y",
        inPMC: r.inPMC === "Y" || r.inEPMC === "Y", citedByCount: r.citedByCount != null ? Number(r.citedByCount) : null, doi: r.doi ?? null,
      });
    }
  }
  return map;
}

export type Section = { label: string; kind: "section" | "table" | "figure" | "abstract"; text: string };

/** Fetch PMC Open Access JATS XML via Europe PMC. Returns null when not in the OA subset. */
export async function fetchJats(pmcid: string): Promise<string | null> {
  const r = await fetchRetry(`${BASE}/${pmcid}/fullTextXML`, { timeoutMs: 45000, retries: 2 });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Europe PMC fullTextXML ${r.status}`);
  const x = await r.text();
  return x.includes("<article") ? x : null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s([,.;:)])/g, "$1").trim();

/** Parse JATS into ordered sections: abstract, body sections (with sub-headings inline), tables, figure captions. */
export function parseJats(xml: string): { sections: Section[]; license: string | null } {
  const $ = cheerio.load(xml, { xml: true });
  const out: Section[] = [];
  const license = clean($("permissions license").first().attr("xlink:href") ?? $("permissions license license-p").first().text() ?? "") || null;

  const abs = $("article-meta abstract").first();
  if (abs.length) out.push({ label: "Abstract", kind: "abstract", text: clean(abs.find("p").map((_, p) => $(p).text()).get().join("\n")) || clean(abs.text()) });

  // Remove floats from body text; they are captured separately
  const tables = $("table-wrap");
  const figs = $("fig");

  const walk = (sec: any, prefix: string) => {
    const title = clean($(sec).children("title").first().text()) || "Section";
    const label = prefix ? `${prefix} › ${title}` : title;
    const paras = $(sec).children("p").map((_, p) => {
      const c = $(p).clone();
      c.find("table-wrap, fig, xref[ref-type='bibr'] sup").remove();
      return clean(c.text());
    }).get().filter(Boolean);
    if (paras.length) out.push({ label, kind: "section", text: paras.join("\n\n") });
    $(sec).children("sec").each((_, s) => walk(s, prefix ? prefix : title));
  };
  $("body").children("sec").each((_, s) => walk(s, ""));
  if (!$("body").children("sec").length) {
    const paras = $("body > p").map((_, p) => clean($(p).text())).get().filter(Boolean);
    if (paras.length) out.push({ label: "Body", kind: "section", text: paras.join("\n\n") });
  }

  tables.each((_, t) => {
    const label = clean($(t).children("label").text()) || "Table";
    const caption = clean($(t).find("caption").first().text());
    const rows = $(t).find("tr").map((_, tr) => $(tr).find("th,td").map((_, c) => clean($(c).text())).get().join(" | ")).get();
    const foot = clean($(t).find("table-wrap-foot").text());
    out.push({ label, kind: "table", text: [caption, ...rows, foot].filter(Boolean).join("\n") });
  });
  figs.each((_, f) => {
    const label = clean($(f).children("label").text()) || "Figure";
    const caption = clean($(f).find("caption").text());
    if (caption) out.push({ label, kind: "figure", text: caption });
  });
  return { sections: out, license };
}
