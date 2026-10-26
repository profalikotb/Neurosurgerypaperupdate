"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Flag, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fmtDate } from "@/lib/text";

const ar = (s: string) => /[؀-ۿ]/.test(s);

export function ReviewSession({ cards, titles }: { cards: any[]; titles: Record<string, string> }) {
  const [i, setI] = useState(0);
  const [done, setDone] = useState(0);
  const router = useRouter();
  if (!cards.length) return <div className="card p-6 text-center"><div className="font-serif text-xl font-semibold">Nothing due for review</div><p className="mt-1 text-[14px] text-muted">Save points from papers, topic reviews and assistant answers — they come back here on a spaced-repetition schedule.</p></div>;
  if (i >= cards.length) return <div className="card p-6 text-center"><div className="font-serif text-xl font-semibold">Session complete · {done} reviewed</div><Button className="mt-3" onClick={() => router.refresh()}>Load more</Button></div>;
  const c = cards[i];
  const grade = async (g: 0 | 3 | 4 | 5) => { await fetch(`/api/notes/${c.id}`, { method: "PATCH", body: JSON.stringify({ grade: g }) }); setDone(done + 1); setI(i + 1); };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b rule px-4 py-2 text-[12px] text-muted"><span>Due for review · {i + 1} / {cards.length}</span>{c.difficult && <span className="text-warn">● marked difficult</span>}</div>
      <div className="px-5 py-8 sm:px-8">
        <p className={cn("reading text-[1.2rem] leading-relaxed", ar(c.text) && "ar")} dir={ar(c.text) ? "rtl" : undefined}>{c.text}</p>
        <div className="mt-3 text-[12px] text-muted">{c.paper_id ? <Link href={`/paper/${c.paper_id}`} className="hover:text-navy">{titles[c.paper_id]}</Link> : c.topic}{c.source_ref ? ` · § ${c.source_ref}` : ""}</div>
      </div>
      <div className="grid grid-cols-4 border-t rule text-[13px] font-medium">
        {([[0, "Forgot", "text-bad"], [3, "Hard", "text-warn"], [4, "Good", "text-navy"], [5, "Easy", "text-ok"]] as const).map(([g, l, cl]) => (
          <button key={g} onClick={() => grade(g)} className={cn("border-r rule py-3 last:border-0 hover:bg-navy-soft", cl)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function NotesList({ notes, titles }: { notes: any[]; titles: Record<string, string> }) {
  const [list, setList] = useState(notes);
  const [q, setQ] = useState("");
  const shown = list.filter((n) => !q || n.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input mb-2 h-9 text-sm" placeholder="Filter notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.map((n) => (
        <div key={n.id} className="group flex gap-2 border-b rule py-2.5">
          <div className="min-w-0 flex-1">
            <p className={cn("font-serif text-[15px] leading-relaxed", ar(n.text) && "ar")} dir={ar(n.text) ? "rtl" : undefined}>{n.text}</p>
            <div className="mt-0.5 text-[11.5px] text-muted">{n.paper_id ? <Link href={`/paper/${n.paper_id}`} className="hover:text-navy">{(titles[n.paper_id] ?? "").slice(0, 80)}</Link> : n.topic} · next {fmtDate(n.due_at)} · {n.reps} reviews</div>
          </div>
          <button title="Mark difficult" onClick={async () => { await fetch(`/api/notes/${n.id}`, { method: "PATCH", body: JSON.stringify({ difficult: !n.difficult }) }); setList(list.map((x) => x.id === n.id ? { ...x, difficult: !x.difficult } : x)); }} className={cn("p-1 text-muted hover:text-warn", n.difficult && "text-warn")}><Flag size={14} /></button>
          <button title="Delete" onClick={async () => { await fetch(`/api/notes/${n.id}`, { method: "DELETE" }); setList(list.filter((x) => x.id !== n.id)); }} className="p-1 text-muted opacity-0 hover:text-bad group-hover:opacity-100"><Trash2 size={14} /></button>
        </div>
      ))}
      {!shown.length && <p className="py-4 text-[13px] text-muted">No notes.</p>}
    </div>
  );
}

export function Quiz({ quiz, sources, title }: { quiz: any; sources: any[]; title: string }) {
  const [ans, setAns] = useState<Record<number, number>>({});
  const [reveal, setReveal] = useState<Record<number, boolean>>({});
  const mcqs = quiz.mcqs ?? [];
  const score = Object.entries(ans).filter(([i, a]) => mcqs[+i]?.answer_index === a).length;
  const src = (id?: string) => sources.find((s) => s.id === id);
  const pick = async (i: number, k: number) => {
    if (ans[i] !== undefined) return;
    setAns({ ...ans, [i]: k });
    const q = mcqs[i];
    if (q.answer_index !== k) await fetch("/api/notes", { method: "POST", body: JSON.stringify({ text: `${q.stem.trim()} → ${q.options[q.answer_index]}. ${q.explanation}`, topic: title, sourceRef: q.citation }) }).then((r) => r.ok && r.json()).then(async (j) => { if (j?.ids?.[0]) await fetch(`/api/notes/${j.ids[0]}`, { method: "PATCH", body: JSON.stringify({ difficult: true }) }); });
  };
  return (
    <div>
      <div className="sticky top-14 z-10 -mx-4 border-b rule bg-paper/95 px-4 py-2 text-[13px] backdrop-blur sm:mx-0 sm:px-0">Score: <b className="num">{score}</b> / {Object.keys(ans).length} answered of {mcqs.length} · wrong answers are saved to revision as difficult</div>
      {mcqs.map((q: any, i: number) => {
        const a = ans[i];
        return (
          <div key={i} className="card mt-4 p-5">
            <div className="reading text-[16.5px]"><b className="font-sans text-navy">{i + 1}.</b> {q.stem}</div>
            <div className="mt-3 space-y-1.5">
              {q.options.map((o: string, k: number) => {
                const right = a !== undefined && k === q.answer_index, wrong = a === k && k !== q.answer_index;
                return (
                  <button key={k} onClick={() => pick(i, k)} className={cn("flex w-full items-start gap-2 rounded-lg border rule px-3 py-2 text-left text-[14.5px] hover:border-navy", right && "border-ok bg-ok-soft", wrong && "border-bad bg-bad-soft")}>
                    <span className="font-semibold text-muted">{String.fromCharCode(65 + k)}</span><span className="flex-1">{o}</span>
                    {right && <CheckCircle2 size={16} className="text-ok" />}{wrong && <XCircle size={16} className="text-bad" />}
                  </button>
                );
              })}
            </div>
            {a !== undefined && (
              <div className="mt-3 rounded-lg bg-navy-soft/60 p-3 text-[14px]">
                <p><b>Explanation.</b> {q.explanation}</p>
                <ul className="mt-2 space-y-0.5 text-[13px] text-ink-2">{(q.why_others_wrong ?? []).map((w: string, k: number) => <li key={k}><b>{String.fromCharCode(65 + k)}:</b> {w}</li>)}</ul>
                {q.citation && <p className="mt-2 text-[12px] text-muted">Source [{q.citation}]: {src(q.citation)?.title} — {src(q.citation)?.meta}</p>}
              </div>
            )}
          </div>
        );
      })}
      {(quiz.essays ?? []).length > 0 && <h2 className="mt-10 font-serif text-xl font-semibold">Short-essay questions</h2>}
      {(quiz.essays ?? []).map((e: any, i: number) => (
        <div key={i} className="card mt-4 p-5">
          <div className="reading text-[16.5px] font-semibold">{e.question}</div>
          {reveal[i] ? (
            <div className="reading mt-3 text-[15.5px]">
              <p className="whitespace-pre-line">{e.model_answer}</p>
              {e.key_points?.length > 0 && <><h4 className="kicker mt-3">Key points</h4><ul className="list-disc pl-5">{e.key_points.map((k: string, j: number) => <li key={j}>{k}</li>)}</ul></>}
              {e.citation && <p className="mt-2 font-sans text-[12px] text-muted">Source [{e.citation}]: {src(e.citation)?.title}</p>}
            </div>
          ) : <Button className="mt-3" variant="subtle" onClick={() => setReveal({ ...reveal, [i]: true })}>Show model answer</Button>}
        </div>
      ))}
    </div>
  );
}
