import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { env, hasLLM, hasEmbeddings } from "@/lib/env";
import { getSettings } from "@/lib/data";
import { SUBSPECIALTIES } from "@/lib/classify";
import { Interests, JournalRow, AddJournal, DigestSettings, RunQueue, SignOut } from "@/components/client/settings";
import { CheckNowButton } from "@/components/client/actions";
import { Badge } from "@/components/ui/badge";
import { getState } from "@/lib/log";
import { fmtDate, fmtDateTime } from "@/lib/text";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();
  const sb = db();
  const [settings, { data: journals }, { data: jobs }, { data: logs }, lastDaily, { data: counts }] = await Promise.all([
    getSettings(user.id),
    sb.from("journals").select("*").order("priority", { ascending: false }),
    sb.from("jobs").select("status,type"),
    sb.from("event_log").select("level,scope,message,created_at").in("level", ["warn", "error"]).order("created_at", { ascending: false }).limit(15),
    getState("last_daily"),
    sb.rpc("journal_counts"),
  ]);
  const perJournal = new Map<number, number>();
  (counts ?? []).forEach((c: any) => perJournal.set(c.journal_id, Number(c.n)));
  const q = (s: string) => (jobs ?? []).filter((j: any) => j.status === s).length;
  const checks: [string, boolean, string][] = [
    ["AI provider", hasLLM(), `${env.llmModel} @ ${env.llmBase.replace(/^https?:\/\//, "")}`],
    ["Embeddings (semantic search)", hasEmbeddings(), hasEmbeddings() ? `${env.embModel} · ${env.embDims}d` : "keyword search only"],
    ["NCBI API key", Boolean(env.ncbiKey), env.ncbiKey ? "10 req/s" : "optional — 3 req/s"],
    ["Contact email (Unpaywall/Crossref)", Boolean(env.contactEmail), env.contactEmail || "required for Unpaywall OA lookup"],
    ["Cron secret", Boolean(env.cronSecret), env.cronSecret ? "set" : "automation disabled"],
    ["Email digest (Resend)", Boolean(env.resendKey && env.digestFrom), env.resendKey ? "configured" : "optional"],
  ];

  return (
    <div className="mx-auto max-w-[960px] space-y-10">
      <div className="flex items-center justify-between"><h1 className="font-serif text-[1.9rem] font-bold">Settings</h1><span className="text-[12.5px] text-muted">{user.email} <SignOut /></span></div>

      <section>
        <h2 className="kicker mb-2">Neurosurgical interests (personalises ranking)</h2>
        <Interests subs={Object.keys(SUBSPECIALTIES)} initial={(settings.interests ?? {}) as Record<string, number>} />
      </section>

      <section id="journals">
        <div className="mb-2 flex items-center gap-3"><h2 className="kicker">Monitored journals</h2><CheckNowButton label="Check all now" /></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-left text-[11.5px] uppercase tracking-wider text-muted"><th>Follow</th><th>Journal · PubMed abbreviation</th><th>Tier</th><th title="Restrict to neurosurgery-relevant papers">Filter</th><th>Priority</th><th>Indexed · last</th><th /></tr></thead>
            <tbody>{(journals ?? []).map((j: any) => <JournalRow key={j.id} j={{ ...j, count: perJournal.get(j.id), last: j.last_ingested ? fmtDate(j.last_ingested) : null }} />)}</tbody>
          </table>
        </div>
        <AddJournal />
      </section>

      <section>
        <h2 className="kicker mb-2">Weekly digest</h2>
        <DigestSettings initial={{ email_digest: settings.email_digest, digest_email: settings.digest_email }} email={user.email} />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-3"><h2 className="kicker">System status</h2><RunQueue /></div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {checks.map(([k, ok, d]) => <div key={k} className="flex items-center justify-between rounded-lg border rule px-3 py-2 text-[13px]"><span>{k}</span><span className="flex items-center gap-2 text-[11.5px] text-muted">{d}<Badge tone={ok ? "ok" : "warn"}>{ok ? "OK" : "—"}</Badge></span></div>)}
        </div>
        <p className="mt-3 text-[13px] text-muted">Last daily run: {lastDaily?.at ? fmtDateTime(lastDaily.at) : "never"} · Queue: {q("queued")} queued · {q("running")} running · {q("failed")} failed · {q("done")} done</p>
        {(logs ?? []).length > 0 && (
          <div className="mt-3 rounded-xl border rule">
            {(logs ?? []).map((l: any, i: number) => <div key={i} className="flex gap-3 border-b rule px-3 py-1.5 text-[12px] last:border-0"><Badge tone={l.level === "error" ? "bad" : "warn"}>{l.scope}</Badge><span className="min-w-0 flex-1 break-words">{l.message}</span><span className="shrink-0 text-muted">{fmtDateTime(l.created_at)}</span></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
