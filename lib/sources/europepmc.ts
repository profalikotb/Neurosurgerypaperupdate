import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { isTag, isText, type Element, type AnyNode } from "domhandler";
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

type El = Element;
const OPTS = { xmlMode: true };
const kids = (el: El, name?: string): El[] => (el.children ?? []).filter((c): c is El => isTag(c) && (!name || c.name === name));
const first = (el: El, name: string): El | undefined => kids(el, name)[0];

/** Text content, optionally skipping floats (tables/figures) and numeric bibliography call-outs. */
function text(node: AnyNode, skipFloats = false): string {
  if (isText(node)) return node.data;
  if (!isTag(node)) return "";
  if (skipFloats) {
    if (node.name === "table-wrap" || node.name === "fig") return "";
    if (node.name === "xref" && node.attribs["ref-type"] === "bibr" && /^[\s\d,\u2013\-\[\]()]*$/.test(textContent(node))) return "";
  }
  return (node.children ?? []).map((c) => text(c, skipFloats)).join("");
}

/** Parse JATS into ordered sections: abstract, body sections (with sub-headings inline), tables, figure captions. */
export function parseJats(xml: string): { sections: Section[]; license: string | null } {
  const doc = parseDocument(xml, OPTS);
  const out: Section[] = [];
  const lic = selectOne("permissions license", doc, OPTS) as El | null;
  const license = lic ? clean(lic.attribs["xlink:href"] ?? (selectOne("license-p", lic, OPTS) ? textContent(selectOne("license-p", lic, OPTS)!) : "")) || null : null;

  const abs = selectOne("article-meta abstract", doc, OPTS) as El | null;
  if (abs) {
    const ps = selectAll("p", abs, OPTS).map((p) => clean(text(p, true))).filter(Boolean);
    out.push({ label: "Abstract", kind: "abstract", text: ps.join("\n") || clean(textContent(abs)) });
  }

  const walk = (sec: El, prefix: string) => {
    const t = first(sec, "title");
    const title = (t ? clean(textContent(t)) : "") || "Section";
    const label = prefix ? `${prefix} › ${title}` : title;
    const paras = kids(sec, "p").map((p) => clean(text(p, true))).filter(Boolean);
    if (paras.length) out.push({ label, kind: "section", text: paras.join("\n\n") });
    kids(sec, "sec").forEach((s) => walk(s, prefix || title));
  };
  const body = selectOne("body", doc, OPTS) as El | null;
  if (body) {
    const secs = kids(body, "sec");
    secs.forEach((s) => walk(s, ""));
    if (!secs.length) {
      const paras = kids(body, "p").map((p) => clean(text(p, true))).filter(Boolean);
      if (paras.length) out.push({ label: "Body", kind: "section", text: paras.join("\n\n") });
    }
  }

  for (const t of selectAll("table-wrap", doc, OPTS) as unknown as El[]) {
    const lab = first(t, "label");
    const cap = selectOne("caption", t, OPTS);
    const rows = (selectAll("tr", t, OPTS) as El[]).map((tr) => kids(tr).filter((c) => c.name === "th" || c.name === "td").map((c) => clean(textContent(c))).join(" | "));
    const foot = selectOne("table-wrap-foot", t, OPTS);
    out.push({ label: (lab && clean(textContent(lab))) || "Table", kind: "table", text: [cap ? clean(textContent(cap)) : "", ...rows, foot ? clean(textContent(foot)) : ""].filter(Boolean).join("\n") });
  }
  for (const f of selectAll("fig", doc, OPTS) as unknown as El[]) {
    const lab = first(f, "label");
    const cap = selectOne("caption", f, OPTS);
    const caption = cap ? clean(textContent(cap)) : "";
    if (caption) out.push({ label: (lab && clean(textContent(lab))) || "Figure", kind: "figure", text: caption });
  }
  return { sections: out, license };
}
