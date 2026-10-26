import { env } from "@/lib/env";
import { fetchRetry } from "@/lib/http";

export type OaLocation = { pdfUrl: string | null; landingUrl: string | null; license: string | null; hostType: string | null; version: string | null };

export async function unpaywall(doi: string): Promise<OaLocation | null> {
  if (!env.contactEmail) return null; // Unpaywall requires an email
  const r = await fetchRetry(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(env.contactEmail)}`, { retries: 1, timeoutMs: 20000 });
  if (!r.ok) return null;
  const j: any = await r.json();
  if (!j?.is_oa || !j.best_oa_location) return null;
  const b = j.best_oa_location;
  return { pdfUrl: b.url_for_pdf ?? null, landingUrl: b.url_for_landing_page ?? b.url ?? null, license: b.license ?? null, hostType: b.host_type ?? null, version: b.version ?? null };
}
