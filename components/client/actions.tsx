"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CheckNowButton({ label = "Check now" }: { label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const router = useRouter();
  return (
    <Button size="sm" variant="outline" disabled={state === "busy"} onClick={async () => {
      setState("busy");
      const r = await fetch("/api/ingest/now", { method: "POST" });
      setState(r.ok ? "done" : "err");
      setTimeout(() => router.refresh(), 45000);
    }}>
      {state === "busy" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      {state === "done" ? "Queued — refresh in a minute" : state === "err" ? "Failed — see Settings" : label}
    </Button>
  );
}

export function AskBox({ placeholder = "Ask a neurosurgical question — answered from your library + PubMed, with citations" }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/assistant?q=${encodeURIComponent(q.trim())}`); }} className="flex gap-2">
      <input className="input h-11 text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      <Button variant="primary" size="lg" type="submit">Ask</Button>
    </form>
  );
}

export function LookupBox() {
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form className="flex flex-col gap-1" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr("");
      const r = await fetch("/api/lookup", { method: "POST", body: JSON.stringify({ q }) });
      const j = await r.json(); setBusy(false);
      if (r.ok) router.push(`/paper/${j.id}`); else setErr(j.error);
    }}>
      <div className="flex gap-2"><input className="input h-9 text-sm" placeholder="Import by PMID or DOI" value={q} onChange={(e) => setQ(e.target.value)} /><Button size="md" disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : "Open"}</Button></div>
      {err && <span className="text-xs text-bad">{err}</span>}
    </form>
  );
}
