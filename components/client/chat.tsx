"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Send, Plus, NotebookPen, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/md";
import { cn } from "@/components/ui/cn";

type Src = { id: string; kind: string; title: string; meta: string; design?: string; url?: string; paper_id?: number; page?: string; chapter?: string };
type M = { id?: number; role: "user" | "assistant"; content: string; sources?: Src[]; meta?: any; status?: string };

const EXAMPLES = [
  "What is the current evidence for MMA embolization in chronic subdural hematoma?",
  "Compare retrosigmoid and translabyrinthine approaches for vestibular schwannoma.",
  "Current recommendations for WHO grade 2 meningioma after gross total resection?",
  "What changed in glioblastoma management during the past year?",
];

export function ChatUI({ chats, chatId, initial, autoAsk }: { chats: { id: number; title: string }[]; chatId: number; initial: M[]; autoAsk?: string }) {
  const [msgs, setMsgs] = useState<M[]>(initial);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [cid, setCid] = useState(chatId);
  const [live, setLive] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  const router = useRouter();

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => { if (autoAsk && !asked.current) { asked.current = true; ask(autoAsk); } /* eslint-disable-next-line */ }, []);

  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setQ("");
    setMsgs((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", status: "Starting…" }]);
    const upd = (f: (a: M) => M) => setMsgs((m) => { const c = [...m]; c[c.length - 1] = f(c[c.length - 1]); return c; });
    try {
      const r = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ chatId: cid || undefined, message: text, live }) });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error ?? `HTTP ${r.status}`); }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "chat") { setCid(ev.chatId); window.history.replaceState(null, "", `/assistant?c=${ev.chatId}`); }
          else if (ev.type === "status") upd((a) => ({ ...a, status: ev.text }));
          else if (ev.type === "sources") upd((a) => ({ ...a, sources: ev.sources, meta: { coverage: ev.coverage, pubmedQuery: ev.pubmedQuery }, status: "Writing answer…" }));
          else if (ev.type === "delta") upd((a) => ({ ...a, content: a.content + ev.text, status: undefined }));
          else if (ev.type === "done") upd((a) => ({ ...a, id: ev.messageId, content: ev.text ?? a.content, status: undefined, meta: { ...a.meta, removed: ev.removed } }));
          else if (ev.type === "error") throw new Error(ev.error);
        }
      }
    } catch (e: any) { upd((a) => ({ ...a, status: undefined, content: (a.content ? a.content + "\n\n" : "") + `**Error:** ${e.message}` })); }
    setBusy(false); router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <Link href="/assistant" className="mb-2 flex items-center gap-1.5 rounded-lg border rule bg-surface px-3 py-2 text-[13.5px] font-medium hover:bg-navy-soft"><Plus size={15} />New question</Link>
        <div className="space-y-0.5">
          {chats.map((c) => <Link key={c.id} href={`/assistant?c=${c.id}`} className={cn("block truncate rounded-md px-2 py-1.5 text-[13px] text-ink-2 hover:bg-navy-soft", c.id === cid && "bg-navy-soft text-navy")}>{c.title}</Link>)}
        </div>
      </aside>
      <div className="mx-auto w-full max-w-[820px] min-w-0">
        {!msgs.length && (
          <div className="pt-4">
            <div className="kicker">AI neurosurgical research assistant</div>
            <h1 className="mt-1 font-serif text-[1.9rem] font-bold leading-tight">Ask the literature</h1>
            <p className="mt-2 text-[14.5px] text-ink-2">Answers are written only from retrieved sources — your textbook library [L#] and indexed / live PubMed articles [S#] — with evidence grading and the date of literature coverage. Unsupported parts are reported as insufficient evidence.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">{EXAMPLES.map((e) => <button key={e} onClick={() => ask(e)} className="card p-3 text-left text-[13.5px] hover:border-navy">{e}</button>)}</div>
          </div>
        )}
        <div className="space-y-6">
          {msgs.map((m, i) => m.role === "user"
            ? <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[15px] text-white dark:text-[#0b1020]" dir="auto">{m.content}</div>
            : <Answer key={i} m={m} />)}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="sticky bottom-20 mt-6 md:bottom-4">
          <div className="card flex items-end gap-2 p-2 shadow-lg">
            <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} rows={2} dir="auto" placeholder="Ask a question…" className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none" />
            <Button variant="primary" size="icon" disabled={busy || !q.trim()} aria-label="Send">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</Button>
          </div>
          <label className="mt-1.5 flex items-center gap-1.5 px-1 text-[12px] text-muted"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />Include live PubMed search (slower, most current)</label>
        </form>
      </div>
    </div>
  );
}

function Answer({ m }: { m: M }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const valid = new Set((m.sources ?? []).map((s) => s.id));
  const points = () => {
    const sec = m.content.split(/\*\*Teaching points\*\*|#+\s*Teaching points/i)[1] ?? "";
    return sec.split("\n").map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, "").trim()).filter((l) => l.length > 15).slice(0, 15);
  };
  return (
    <div>
      {m.status && <div className="mb-2 flex items-center gap-2 text-[13px] text-muted"><Loader2 size={14} className="animate-spin" />{m.status}</div>}
      {m.content && <Markdown text={m.content} valid={m.sources ? valid : undefined} className="reading text-[16px]" />}
      {m.sources && m.sources.length > 0 && (
        <div className="mt-4 rounded-xl border rule bg-surface p-3">
          <div className="kicker mb-1.5">Sources</div>
          <ol className="space-y-1 text-[12.5px]">
            {m.sources.map((s) => (
              <li key={s.id} id={`src-${s.id}`} className="flex gap-2 scroll-mt-24">
                <span className={cn("cite shrink-0", s.kind === "library" && "!bg-teal-soft !text-teal")}>{s.id}</span>
                <span>{s.paper_id ? <Link href={`/paper/${s.paper_id}`} className="font-medium hover:text-navy">{s.title}</Link> : <span className="font-medium">{s.title}</span>}<span className="text-muted"> — {s.meta}{s.design ? ` · ${s.design}` : ""}</span></span>
              </li>
            ))}
          </ol>
          {m.meta?.coverage && <p className="mt-2 text-[11.5px] text-muted">{m.meta.coverage}{m.meta.pubmedQuery ? <> · PubMed query: <code className="font-mono">{m.meta.pubmedQuery}</code></> : null}</p>}
          {m.meta?.removed?.length > 0 && <p className="mt-1 text-[11.5px] text-bad">Removed {m.meta.removed.length} invalid citation(s) not present in sources.</p>}
        </div>
      )}
      {!m.status && m.content && (
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.content); setCopied(true); }}>{copied ? <Check size={14} /> : <Copy size={14} />}Copy</Button>
          <Button size="sm" variant="ghost" disabled={saved} onClick={async () => { const t = points(); if (!t.length) return; const r = await fetch("/api/notes", { method: "POST", body: JSON.stringify({ texts: t, topic: "Assistant" }) }); if (r.ok) setSaved(true); }}>{saved ? <Check size={14} /> : <NotebookPen size={14} />}{saved ? "Saved" : "Save teaching points"}</Button>
        </div>
      )}
    </div>
  );
}
