import { fetchRetry } from "@/lib/http";

export type EditionHit = { title: string; edition: string | null; year: number | null; publisher: string | null; isbn: string | null; link: string | null };

/** Looks up the newest edition of a textbook on Google Books (no key needed for low volume). */
export async function newestEdition(title: string, author?: string | null): Promise<EditionHit | null> {
  const q = `intitle:${title}${author ? ` inauthor:${author.split(/[,;]/)[0]}` : ""}`;
  const r = await fetchRetry(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&orderBy=newest&maxResults=10&printType=books`, { retries: 1 });
  if (!r.ok) return null;
  const j: any = await r.json();
  const hits: EditionHit[] = (j.items ?? []).map((it: any) => {
    const v = it.volumeInfo ?? {};
    const ed = String(v.title + " " + (v.subtitle ?? "")).match(/(\d+)(st|nd|rd|th)\s+ed/i)?.[1] ?? null;
    return {
      title: [v.title, v.subtitle].filter(Boolean).join(": "), edition: ed,
      year: v.publishedDate ? Number(String(v.publishedDate).slice(0, 4)) : null, publisher: v.publisher ?? null,
      isbn: v.industryIdentifiers?.find((x: any) => x.type === "ISBN_13")?.identifier ?? null, link: v.infoLink ?? null,
    };
  }).filter((h: EditionHit) => h.year);
  hits.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return hits[0] ?? null;
}
