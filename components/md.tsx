import React from "react";

/** Minimal, safe Markdown → React (no HTML injection). Citations [S1]/[L2] become anchors to #src-S1. */
export function inline(text: string, valid?: Set<string>, keyBase = ""): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[(?:[SL]\d+)\]|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0], k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), valid, k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-navy-soft px-1 font-mono text-[.85em]">{t.slice(1, -1)}</code>);
    else if (/^\[[SL]\d+\]$/.test(t)) {
      const id = t.slice(1, -1);
      out.push(valid && !valid.has(id) ? <span key={k} className="cite !bg-bad-soft !text-bad" title="Invalid citation removed">?</span> : <a key={k} href={`#src-${id}`} className="cite">{id}</a>);
    } else if (t.startsWith("[")) {
      const mm = t.match(/^\[([^\]]+)\]\((.+)\)$/)!;
      out.push(<a key={k} href={mm[2]} target="_blank" rel="noreferrer" className="link">{mm[1]}</a>);
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isAr = (s: string) => /[؀-ۿ]/.test(s);

export function Markdown({ text, valid, className }: { text: string; valid?: Set<string>; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { const t = para.join(" "); blocks.push(<p key={blocks.length} dir={isAr(t) ? "rtl" : undefined}>{inline(t, valid, `p${blocks.length}`)}</p>); para = []; } };
  const flushList = () => {
    if (list) { const L = list.ordered ? "ol" : "ul"; const k = blocks.length; blocks.push(<L key={k}>{list.items.map((it, j) => <li key={j} dir={isAr(it) ? "rtl" : undefined}>{inline(it, valid, `l${k}-${j}`)}</li>)}</L>); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    const n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (h) { flushPara(); flushList(); const H = h[1].length <= 2 ? "h2" : "h3"; blocks.push(<H key={blocks.length}>{inline(h[2], valid, `h${blocks.length}`)}</H>); continue; }
    if (b || n) { flushPara(); const ordered = Boolean(n); if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push((b ?? n)![1]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return <div className={`prose-md ${className ?? ""}`}>{blocks}</div>;
}
