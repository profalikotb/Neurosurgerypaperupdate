import "server-only";
import { getDocumentProxy } from "unpdf";

export type PdfPage = { index: number; label: string | null; text: string };
export type PdfInfo = { numPages: number; outline: { title: string; page: number }[]; labels: string[] | null };

type Proxy = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function openPdf(buf: ArrayBuffer | Uint8Array): Promise<Proxy> {
  return getDocumentProxy(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
}

export async function pdfInfo(pdf: Proxy): Promise<PdfInfo> {
  let labels: string[] | null = null;
  try { labels = (await pdf.getPageLabels()) as string[] | null; } catch { labels = null; }
  const outline: { title: string; page: number }[] = [];
  try {
    const ol = (await pdf.getOutline()) ?? [];
    const walk = async (items: any[], depth: number) => {
      for (const it of items) {
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0]) {
            const idx = typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
            if (depth <= 1) outline.push({ title: String(it.title).trim(), page: idx + 1 });
          }
        } catch { /* broken destination */ }
        if (it.items?.length && depth < 1) await walk(it.items, depth + 1);
      }
    };
    await walk(ol, 0);
  } catch { /* no outline */ }
  outline.sort((a, b) => a.page - b.page);
  return { numPages: pdf.numPages, outline, labels };
}

/** Extracts pages [from, to] (1-based, inclusive) with paragraph breaks and printed page labels where reliable. */
export async function extractPages(pdf: Proxy, from: number, to: number, labels: string[] | null): Promise<PdfPage[]> {
  const out: PdfPage[] = [];
  for (let i = from; i <= Math.min(to, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let text = "", lastY: number | null = null;
    for (const it of tc.items as any[]) {
      if (typeof it.str !== "string") continue;
      const y = it.transform?.[5] ?? 0, h = it.height || 10;
      if (lastY !== null && Math.abs(y - lastY) > h * 1.9) text += "\n\n";
      else if (lastY !== null && Math.abs(y - lastY) > 1) text += "\n";
      text += it.str;
      if (it.hasEOL) text += "\n";
      lastY = y;
    }
    text = text.replace(/[ \t]+/g, " ").replace(/-\n(\w)/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
    out.push({ index: i, label: labels?.[i - 1] ?? inferPrinted(text), text });
    page.cleanup();
  }
  return out;
}

/** A bare number on the first or last line is treated as the printed page number. */
function inferPrinted(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cand = [lines[0], lines[lines.length - 1]].find((l) => l && /^\d{1,4}$/.test(l));
  return cand ?? null;
}
