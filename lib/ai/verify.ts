// Server-side verification of AI output against the source text. Pure functions (unit-tested).

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[‐-―−]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/±/g, "+/-").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/\s+/g, " ").trim();

const words = (s: string) => norm(s).replace(/[^a-z0-9.%<>=+\-/ ]/g, " ").split(/\s+/).filter(Boolean);

export function makeIndex(source: string) {
  const n = norm(source);
  const w = words(source);
  const grams = new Set<string>();
  for (let i = 0; i < w.length - 3; i++) grams.add(w.slice(i, i + 4).join(" "));
  const numbers = new Set(numbersIn(source));
  return { n, grams, numbers };
}
export type SourceIndex = ReturnType<typeof makeIndex>;

/** Numbers as they would be compared: "12.50" → "12.5", "1,204" → "1204". Excludes 1-digit integers (too common to be informative). */
export function numbersIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.replace(/(\d),(\d{3})/g, "$1$2").matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w])/g)) {
    let v = m[1];
    if (v.includes(".")) v = v.replace(/0+$/, "").replace(/\.$/, "");
    if (/^\d$/.test(v)) continue;
    out.push(v);
  }
  return out;
}

export type Check = { quote_found: boolean; quote_score: number; missing_numbers: string[] };

export function checkClaim(idx: SourceIndex, text: string, quote: string | null | undefined): Check {
  let quote_found = false, quote_score = 0;
  if (quote && quote.trim().length >= 12) {
    const q = norm(quote);
    if (idx.n.includes(q)) { quote_found = true; quote_score = 1; }
    else {
      const w = words(quote);
      const g: string[] = [];
      for (let i = 0; i < w.length - 3; i++) g.push(w.slice(i, i + 4).join(" "));
      const hit = g.filter((x) => idx.grams.has(x)).length;
      quote_score = g.length ? hit / g.length : 0;
      quote_found = quote_score >= 0.6;
    }
  }
  const missing_numbers = [...new Set(numbersIn(text))].filter((n) => !idx.numbers.has(n) && !/^(19|20)\d\d$/.test(n));
  return { quote_found, quote_score: Math.round(quote_score * 100) / 100, missing_numbers };
}

/** Verifies findings, design block and paper-origin surgical items of a core summary. */
export function verifyCore(core: any, source: string) {
  const idx = makeIndex(source);
  const findings = (core.findings ?? []).map((f: any) => checkClaim(idx, f.text ?? "", f.quote));
  const surgical = (core.surgical?.items ?? []).map((s: any) => (s.origin === "paper" ? checkClaim(idx, s.text ?? "", s.quote) : null));
  const design = core.design ? checkClaim(idx, [core.design.sample_size, core.design.follow_up].join(" "), core.design.quote) : null;
  const ok = findings.filter((c: Check) => c.quote_found && !c.missing_numbers.length).length;
  return {
    findings, surgical, design,
    totals: { findings: findings.length, verified: ok, flagged: findings.length - ok },
    checked_at: new Date().toISOString(),
  };
}

/** Removes citation IDs the model invented (not in the allowed set). */
export function sanitizeCitations(text: string, allowed: Set<string>): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = text.replace(/\[((?:[SL]\d+)(?:\s*[,;]\s*[SL]\d+)*)\]/g, (_m, inner: string) => {
    const ids = inner.split(/\s*[,;]\s*/).filter((id) => { const ok = allowed.has(id); if (!ok) removed.push(id); return ok; });
    return ids.length ? ids.map((i) => `[${i}]`).join("") : "";
  });
  return { text: out, removed };
}

export function filterIds(ids: unknown, allowed: Set<string>): string[] {
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string" && allowed.has(x)) : [];
}
