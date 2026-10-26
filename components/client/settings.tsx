"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJob } from "./use-job";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function GenerateWeekly() {
  const router = useRouter();
  const job = useJob(() => router.refresh());
  return <Button size="sm" variant="outline" disabled={job.running} onClick={async () => { const r = await fetch("/api/weekly", { method: "POST" }); const j = await r.json(); if (j.jobId) job.start(j.jobId); }}>{job.running ? <><Loader2 size={14} className="animate-spin" />Generating…</> : "Generate now"}</Button>;
}

const LEVELS = ["Off", "Low", "Medium", "High"];
export function Interests({ subs, initial }: { subs: string[]; initial: Record<string, number> }) {
  const [v, setV] = useState<Record<string, number>>(initial);
  const [saved, setSaved] = useState(false);
  const set = async (k: string, n: number) => { const nv = { ...v, [k]: n }; setV(nv); setSaved(false); await fetch("/api/settings", { method: "POST", body: JSON.stringify({ interests: nv }) }); setSaved(true); };
  return (
    <div>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {subs.map((s) => (
          <div key={s} className="flex items-center justify-between gap-2 border-b rule py-1.5 text-[13.5px]">
            <span>{s}</span>
            <div className="flex overflow-hidden rounded-md border rule">{LEVELS.map((l, i) => <button key={l} onClick={() => set(s, i)} className={`px-2 py-0.5 text-[11.5px] ${(v[s] ?? 0) === i ? "bg-navy text-white dark:text-[#0b1020]" : "text-muted hover:bg-navy-soft"}`}>{l}</button>)}</div>
          </div>
        ))}
      </div>
      {saved && <p className="mt-1 text-[12px] text-ok">Saved — dashboard ranking updated.</p>}
    </div>
  );
}

export function JournalRow({ j }: { j: any }) {
  const router = useRouter();
  const [row, setRow] = useState(j);
  const patch = async (u: any) => { setRow({ ...row, ...u }); await fetch("/api/journals", { method: "PATCH", body: JSON.stringify({ id: j.id, ...u }) }); };
  return (
    <tr className="border-t rule text-[13px]">
      <td className="py-1.5 pr-2"><input type="checkbox" checked={row.enabled} onChange={(e) => patch({ enabled: e.target.checked })} aria-label="Follow" /></td>
      <td className="pr-2"><div className="font-medium">{row.name}</div><div className="font-mono text-[11px] text-muted">{row.nlm_abbr}</div></td>
      <td className="pr-2"><select value={row.tier} onChange={(e) => patch({ tier: e.target.value })} className="rounded border rule bg-surface px-1 py-0.5 text-[12px]"><option value="core">core</option><option value="additional">additional</option></select></td>
      <td className="pr-2"><input type="checkbox" checked={row.neuro_filter} onChange={(e) => patch({ neuro_filter: e.target.checked })} title="Only neurosurgery-relevant papers" /></td>
      <td className="pr-2"><input type="number" min={0} max={10} value={row.priority} onChange={(e) => patch({ priority: Number(e.target.value) })} className="w-14 rounded border rule bg-surface px-1 py-0.5 text-[12px]" /></td>
      <td className="whitespace-nowrap text-[11.5px] text-muted">{row.count ?? 0} · {row.last ?? "—"}</td>
      <td><button onClick={async () => { if (confirm(`Remove ${row.name}?`)) { await fetch("/api/journals", { method: "DELETE", body: JSON.stringify({ id: j.id }) }); router.refresh(); } }} className="p-1 text-muted hover:text-bad"><Trash2 size={13} /></button></td>
    </tr>
  );
}

export function AddJournal() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", nlm_abbr: "", tier: "additional", neuro_filter: false, priority: 5 });
  const [msg, setMsg] = useState("");
  return (
    <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={async (e) => { e.preventDefault(); setMsg("Checking PubMed…"); const r = await fetch("/api/journals", { method: "POST", body: JSON.stringify(f) }); const j = await r.json(); setMsg(r.ok ? `Added — ${j.pubmedCount.toLocaleString()} articles in PubMed` : j.error); if (r.ok) router.refresh(); }}>
      <input className="input h-9 py-1 text-sm" placeholder="Journal name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="input h-9 py-1 text-sm" placeholder="NLM abbreviation, e.g. J Neurosurg" value={f.nlm_abbr} onChange={(e) => setF({ ...f, nlm_abbr: e.target.value })} />
      <label className="flex items-center gap-1 text-[12.5px]"><input type="checkbox" checked={f.neuro_filter} onChange={(e) => setF({ ...f, neuro_filter: e.target.checked })} />neuro filter</label>
      <Button>Add journal</Button>
      {msg && <p className="text-[12px] text-muted sm:col-span-4">{msg}</p>}
    </form>
  );
}

export function DigestSettings({ initial, email }: { initial: { email_digest: boolean; digest_email: string | null }; email: string }) {
  const [on, setOn] = useState(initial.email_digest);
  const [addr, setAddr] = useState(initial.digest_email ?? email);
  const save = (o: any) => fetch("/api/settings", { method: "POST", body: JSON.stringify(o) });
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
      <label className="flex items-center gap-2"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); save({ email_digest: e.target.checked, digest_email: addr }); }} />Email me the weekly report</label>
      <input className="input h-9 max-w-xs py-1 text-sm" value={addr} onChange={(e) => setAddr(e.target.value)} onBlur={() => save({ digest_email: addr })} />
    </div>
  );
}

export function RunQueue() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/jobs/run", { method: "POST" }); setBusy(false); router.refresh(); }}>{busy ? <Loader2 size={14} className="animate-spin" /> : null}Process queue now</Button>;
}

export function SignOut() {
  const router = useRouter();
  return <Button size="sm" variant="ghost" onClick={async () => { await supabaseBrowser().auth.signOut(); router.push("/login"); }}>Sign out</Button>;
}
