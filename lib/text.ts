export const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export const normalizeTitle = (t: string) =>
  t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Dice coefficient on word bigrams — used to verify Crossref titles and dedupe. */
export function titleSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const w = normalizeTitle(s).split(" ");
    const g = new Map<string, number>();
    for (let i = 0; i < w.length - 1; i++) { const k = w[i] + " " + w[i + 1]; g.set(k, (g.get(k) ?? 0) + 1); }
    if (w.length === 1) g.set(w[0], 1);
    return g;
  };
  const A = grams(a), B = grams(b);
  let inter = 0, total = 0;
  A.forEach((v, k) => { inter += Math.min(v, B.get(k) ?? 0); total += v; });
  B.forEach((v) => { total += v; });
  return total ? (2 * inter) / total : 0;
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export type Chunk = { text: string; page_label?: string | null; page_index?: number | null; chapter?: string | null };

/** Paragraph-aware chunking, ~target chars with small overlap; keeps page provenance. */
export function chunkPages(pages: { text: string; label: string | null; index: number; chapter?: string | null }[], target = 1400, overlap = 150): Chunk[] {
  const out: Chunk[] = [];
  for (const p of pages) {
    const paras = p.text.split(/\n{2,}|(?<=\.)\s*\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.length > 0);
    let buf = "";
    const flush = () => {
      if (buf.trim().length > 80) out.push({ text: buf.trim(), page_label: p.label, page_index: p.index, chapter: p.chapter ?? null });
      buf = buf.length > overlap ? buf.slice(-overlap) : "";
    };
    for (const para of paras) {
      if ((buf + " " + para).length > target && buf.length > 200) flush();
      if (para.length > target * 1.5) {
        for (let i = 0; i < para.length; i += target) { buf += " " + para.slice(i, i + target); if (buf.length >= target) flush(); }
      } else buf += (buf ? " " : "") + para;
    }
    if (buf.trim().length > 80) out.push({ text: buf.trim(), page_label: p.label, page_index: p.index, chapter: p.chapter ?? null });
  }
  return out;
}

export const fmtDate = (d?: string | Date | null) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return String(d);
  return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
};

export const fmtDateTime = (d?: string | Date | null) => {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  const h = x.getHours(), m = String(x.getMinutes()).padStart(2, "0");
  return `${fmtDate(x.toISOString())} ${((h + 11) % 12) + 1}:${m} ${h < 12 ? "AM" : "PM"}`;
};

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
