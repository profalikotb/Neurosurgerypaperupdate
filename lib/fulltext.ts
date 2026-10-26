import "server-only";
import { db } from "@/lib/supabase/admin";
import { fetchJats, parseJats, Section } from "@/lib/sources/europepmc";
import { fetchRetry } from "@/lib/http";
import { openPdf, pdfInfo, extractPages } from "@/lib/pdf";
import { logEvent } from "@/lib/log";

export type SourceBasis = "verified_fulltext" | "user_fulltext" | "abstract_only" | "metadata_only";
export type StoredSection = Section & { id?: number; ord: number; page?: string | null };

export async function loadSections(paperId: number): Promise<StoredSection[]> {
  const { data } = await db().from("paper_sections").select("id,ord,label,kind,text,page").eq("paper_id", paperId).order("ord");
  return (data ?? []) as StoredSection[];
}

async function saveSections(paperId: number, sections: { label: string; kind: Section["kind"]; text: string; page?: string | null }[]) {
  const sb = db();
  await sb.from("paper_sections").delete().eq("paper_id", paperId);
  const rows = sections.filter((s) => s.text?.trim()).map((s, i) => ({ paper_id: paperId, ord: i, label: s.label.slice(0, 200), kind: s.kind, text: s.text, page: s.page ?? null }));
  for (let i = 0; i < rows.length; i += 200) await sb.from("paper_sections").insert(rows.slice(i, i + 200));
  await sb.from("papers").update({ fulltext_fetched_at: new Date().toISOString() }).eq("id", paperId);
}

/** Tries legal full-text sources in order; returns what the summary may be based on. */
export async function ensureFullText(paperId: number): Promise<{ basis: SourceBasis; sections: StoredSection[] }> {
  const sb = db();
  const { data: p } = await sb.from("papers").select("id,pmcid,doi,abstract,fulltext_access,oa_url,fulltext_fetched_at").eq("id", paperId).single();
  if (!p) throw new Error(`Paper ${paperId} not found`);

  let sections = await loadSections(paperId);
  const hasBody = sections.some((s) => s.kind === "section");
  if (hasBody) return { basis: p.fulltext_access === "user_upload" ? "user_fulltext" : "verified_fulltext", sections };

  if (p.fulltext_access === "open_pmc" && p.pmcid) {
    try {
      const xml = await fetchJats(p.pmcid);
      if (xml) {
        const { sections: secs, license } = parseJats(xml);
        if (secs.some((s) => s.kind === "section")) {
          await saveSections(paperId, secs);
          if (license) await sb.from("papers").update({ oa_license: license }).eq("id", paperId);
          return { basis: "verified_fulltext", sections: await loadSections(paperId) };
        }
      }
    } catch (e: any) { await logEvent("fulltext", `PMC fetch failed for ${p.pmcid}: ${e.message}`, null, "warn"); }
  }

  if (p.fulltext_access === "open_other" && p.oa_url) {
    try {
      const r = await fetchRetry(p.oa_url, { retries: 1, timeoutMs: 45000, headers: { Accept: "application/pdf" } });
      const ct = r.headers.get("content-type") ?? "";
      if (r.ok && /pdf/i.test(ct)) {
        const buf = await r.arrayBuffer();
        if (buf.byteLength < 40 * 1024 * 1024) {
          const pdf = await openPdf(buf);
          const info = await pdfInfo(pdf);
          const pages = await extractPages(pdf, 1, Math.min(info.numPages, 80), info.labels);
          const secs = pages.filter((pg) => pg.text.length > 50).map((pg) => ({ label: `Page ${pg.label ?? pg.index}`, kind: "section" as const, text: pg.text, page: pg.label ?? String(pg.index) }));
          if (secs.length) { await saveSections(paperId, secs); return { basis: "verified_fulltext", sections: await loadSections(paperId) }; }
        }
      }
    } catch (e: any) { await logEvent("fulltext", `OA PDF fetch failed for paper ${paperId}: ${e.message}`, null, "warn"); }
  }

  sections = sections.length ? sections : [];
  return { basis: p.abstract ? "abstract_only" : "metadata_only", sections };
}

/** Stores text extracted from a user-uploaded PDF as the paper's full text. */
export async function saveUserFullText(paperId: number, pages: { index: number; label: string | null; text: string }[]) {
  const secs = pages.filter((pg) => pg.text.length > 30).map((pg) => ({ label: `Page ${pg.label ?? pg.index}`, kind: "section" as const, text: pg.text, page: pg.label ?? String(pg.index) }));
  await saveSections(paperId, secs);
  await db().from("papers").update({ fulltext_access: "user_upload" }).eq("id", paperId);
  await db().from("summaries").delete().eq("paper_id", paperId); // force regeneration on the better source
}
