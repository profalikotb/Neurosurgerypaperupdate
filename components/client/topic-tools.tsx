"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2, RefreshCw, GraduationCap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const TOPIC_EXAMPLES = ["Vestibular schwannoma", "Clinoidal meningioma", "Petroclival meningioma", "Glioblastoma", "Pituitary adenoma", "Craniopharyngioma", "Trigeminal neuralgia", "Cerebral aneurysms", "Cerebral AVMs", "Cervical myelopathy", "Lumbar canal stenosis", "Spondylolisthesis", "Pediatric brain tumors"];
export const PROC_EXAMPLES = ["Retrosigmoid approach", "Translabyrinthine approach", "Pterional craniotomy", "Orbitozygomatic approach", "Anterior petrosectomy (Kawase)", "Endoscopic endonasal transsphenoidal surgery", "Far-lateral approach", "Microvascular decompression", "Anterior cervical discectomy and fusion", "Transforaminal lumbar interbody fusion", "Endoscopic third ventriculostomy"];

export function NewTopic() {
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<"topic" | "procedure">("topic");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const go = async (t = topic, k = kind) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/topics", { method: "POST", body: JSON.stringify({ topic: t, kind: k }) });
    const j = await r.json(); setBusy(false);
    if (r.ok) router.push(`/topics/${j.id}`); else setErr(j.error);
  };
  return (
    <div className="card p-4">
      <div className="mb-2 flex gap-1">
        {(["topic", "procedure"] as const).map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-[13.5px] font-medium ${kind === k ? "bg-navy text-white dark:text-[#0b1020]" : "text-ink-2 hover:bg-navy-soft"}`}>{k === "topic" ? "Clinical topic review" : "Surgical atlas / procedure"}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (topic.trim()) go(); }} className="flex gap-2">
        <input className="input h-11" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={kind === "topic" ? "Disease, tumour or condition…" : "Procedure or surgical approach…"} />
        <Button variant="primary" size="lg" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}Build</Button>
      </form>
      {err && <p className="mt-2 text-[13px] text-bad">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(kind === "topic" ? TOPIC_EXAMPLES : PROC_EXAMPLES).map((t) => <button key={t} disabled={busy} onClick={() => go(t, kind)} className="rounded-full border rule px-2.5 py-0.5 text-[12.5px] text-ink-2 hover:border-navy hover:text-navy">{t}</button>)}
      </div>
    </div>
  );
}

export function TopicStatus({ id, status }: { id: number; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status !== "pending") return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/topics/${id}`); const j = await r.json();
      if (j.status !== "pending") { clearInterval(t); router.refresh(); }
    }, 5000);
    return () => clearInterval(t);
  }, [id, status, router]);
  if (status !== "pending") return null;
  return <div className="card mt-6 flex items-center gap-3 p-5 text-[14px]"><Loader2 className="animate-spin text-navy" size={18} />Searching PubMed, retrieving guidelines and library passages, then synthesising — usually 1–3 minutes. You can leave this page.</div>;
}

export function TopicActions({ id, topic }: { id: number; topic: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="no-print flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => { setBusy("r"); await fetch("/api/topics", { method: "POST", body: JSON.stringify({ reviewId: id }) }); router.refresh(); setBusy(null); }}><RefreshCw size={14} />Update evidence</Button>
      <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => { setBusy("q"); const r = await fetch("/api/quiz", { method: "POST", body: JSON.stringify({ topic }) }); const j = await r.json(); setBusy(null); if (r.ok) router.push(`/revision/quiz/${j.quizId}`); else alert(j.error); }}>{busy === "q" ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />}MCQs & essays</Button>
      <Button size="sm" variant="ghost" onClick={() => window.print()}>Print / PDF</Button>
      <Button size="sm" variant="danger" onClick={async () => { if (!confirm("Delete this review?")) return; await fetch(`/api/topics/${id}`, { method: "DELETE" }); router.push("/topics"); }}><Trash2 size={14} /></Button>
    </div>
  );
}
