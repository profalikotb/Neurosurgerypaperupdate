import { fetchRetry } from "@/lib/http";
import { titleSimilarity } from "@/lib/text";

/** Confirms that a DOI resolves in Crossref and that its title matches. */
export async function verifyDoi(doi: string, title: string): Promise<{ ok: boolean; note: string }> {
  const r = await fetchRetry(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { retries: 1, timeoutMs: 15000 });
  if (r.status === 404) return { ok: false, note: "DOI not found in Crossref" };
  if (!r.ok) return { ok: false, note: `Crossref ${r.status}` };
  const j: any = await r.json();
  const ct = (j?.message?.title?.[0] as string) ?? "";
  const sim = titleSimilarity(ct, title);
  return sim >= 0.6 ? { ok: true, note: `Crossref title match ${(sim * 100).toFixed(0)}%` } : { ok: false, note: `Crossref title mismatch (${(sim * 100).toFixed(0)}%): "${ct.slice(0, 120)}"` };
}
