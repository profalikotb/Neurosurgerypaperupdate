import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { getDashboard } from "@/lib/data";
import { PaperCard } from "@/components/paper-card";
import { AskBox, CheckNowButton, LookupBox } from "@/components/client/actions";
import { fmtDate, fmtDateTime, truncate } from "@/lib/text";
import { Sparkles, BookOpen, Clock, NotebookPen, Library, BookMarked } from "lucide-react";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "today", label: "Today's important papers" },
  { k: "week", label: "This week" },
  { k: "guidelines", label: "New guidelines" },
  { k: "debated", label: "Controversies" },
] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const d = await getDashboard(user.id);
  const sp = await searchParams;
  const tab = (sp.tab as (typeof TABS)[number]["k"]) ?? (d.today.length ? "today" : "week");
  const list = tab === "today" ? d.today : tab === "week" ? d.week : tab === "guidelines" ? d.guidelines : d.debated;
  const empty = !d.week.length && !d.today.length && !d.guidelines.length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="border-b-2 border-ink pb-3">
          <div className="kicker">{new Date().toLocaleDateString("en-GB", { weekday: "long" })} · {fmtDate(new Date())}</div>
          <h1 className="mt-1 font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.4rem]">Latest Neurosurgery Updates</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
            <span>Literature last checked: <span className="text-ink-2">{d.lastDaily?.at ? fmtDateTime(d.lastDaily.at) : "never"}</span></span>
            <span>· {d.journals.length ? `${d.lastDaily?.journals ?? d.journals.length} journals monitored` : ""}</span>
            <CheckNowButton />
          </div>
        </div>

        <div className="mt-5"><AskBox /></div>

        {empty && (
          <div className="card mt-6 p-6">
            <h2 className="font-serif text-xl font-semibold">No papers indexed yet</h2>
            <p className="mt-1 text-[15px] text-ink-2">Press <b>Check now</b> to pull the last {process.env.INGEST_LOOKBACK_DAYS ?? 30} days from the monitored journals via PubMed. The first run takes a few minutes; papers appear as each journal finishes. Afterwards it runs automatically every day.</p>
          </div>
        )}

        {d.changed.length > 0 && (
          <section className="mt-6 rounded-2xl border border-ok/25 bg-ok-soft/60 p-4 sm:p-5">
            <div className="flex items-center gap-2"><Sparkles size={16} className="text-ok" /><h2 className="font-serif text-lg font-semibold">What&apos;s changed in neurosurgery?</h2></div>
            <p className="mt-0.5 text-[12.5px] text-muted">RCTs, meta-analyses and guidelines from the last 45 days with a directional primary result. Candidates for practice change — read the appraisal before acting.</p>
            <div className="mt-2">{d.changed.slice(0, 4).map((p) => <PaperCard key={p.id} p={p} compact />)}</div>
          </section>
        )}

        {!empty && (
          <section className="mt-6">
            <div className="flex gap-1 overflow-x-auto border-b rule">
              {TABS.map((t) => (
                <Link key={t.k} href={`/?tab=${t.k}`} scroll={false} className={cn("-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[13.5px] font-medium text-muted hover:text-ink", tab === t.k && "border-navy text-navy")}>{t.label}</Link>
              ))}
            </div>
            {list.length ? list.map((p) => <PaperCard key={p.id} p={p} />) : <p className="py-8 text-center text-[14px] text-muted">Nothing in this section yet.</p>}
            {tab === "week" && <div className="pt-3 text-right"><Link className="link text-sm" href="/search?sort=score&days=7">All papers this week →</Link></div>}
          </section>
        )}
      </div>

      <aside className="space-y-5">
        {d.continueReading.length > 0 && (
          <Panel icon={<Clock size={15} />} title="Continue reading">
            {d.continueReading.map((r: any) => (
              <Link key={r.paper_id} href={`/paper/${r.paper_id}`} className="block border-b rule py-2 last:border-0">
                <div className="text-[13.5px] font-medium leading-snug hover:text-navy">{truncate(r.paper.title, 95)}</div>
                <div className="mt-1 h-1 w-full rounded bg-rule"><div className="h-1 rounded bg-navy" style={{ width: `${Math.round(r.progress * 100)}%` }} /></div>
              </Link>
            ))}
          </Panel>
        )}
        <Panel icon={<NotebookPen size={15} />} title="Revision" action={<Link href="/revision" className="link text-xs">Open</Link>}>
          <div className="flex items-baseline gap-2 py-1"><span className="num font-serif text-3xl font-bold text-navy">{d.dueCards}</span><span className="text-[13px] text-muted">points due for review</span></div>
          {d.notes.map((n: any) => <div key={n.id} className="border-t rule py-2 text-[13px] leading-snug text-ink-2" dir={/[؀-ۿ]/.test(n.text) ? "rtl" : undefined}>{truncate(n.text, 120)}</div>)}
        </Panel>
        <Panel icon={<BookOpen size={15} />} title="Latest journal issues">
          {d.journals.map((j: any) => (
            <Link key={j.id} href={`/search?journal=${encodeURIComponent(j.nlm_abbr.split("|")[0])}&sort=date`} className="flex items-center justify-between border-b rule py-1.5 text-[13px] last:border-0 hover:text-navy">
              <span className="truncate">{j.name}</span><span className="ml-2 shrink-0 text-[11px] text-muted">{j.last_ingested ? fmtDate(j.last_ingested) : "—"}</span>
            </Link>
          ))}
          <Link href="/settings#journals" className="mt-1 block text-xs text-muted hover:text-navy">Manage journals →</Link>
        </Panel>
        <Panel icon={<Library size={15} />} title="My library" action={<Link href="/library" className="link text-xs">Open</Link>}>
          {d.docs.length ? d.docs.map((x: any) => <div key={x.id} className="flex justify-between border-b rule py-1.5 text-[13px] last:border-0"><span className="truncate">{x.title}</span><span className="ml-2 shrink-0 text-[11px] text-muted">{x.status === "ready" ? (x.edition ? `${x.edition} ed.` : x.year ?? "") : x.status}</span></div>)
            : <p className="text-[13px] text-muted">Upload papers and licensed textbooks to ground answers in your own references.</p>}
        </Panel>
        {d.editions.length > 0 && (
          <Panel icon={<BookMarked size={15} />} title="Updated textbooks">
            {d.editions.map((e: any) => <a key={e.id} href={e.link ?? "#"} target="_blank" rel="noreferrer" className="block border-b rule py-2 text-[13px] last:border-0 hover:text-navy"><b className="font-medium">{e.title}</b><div className="text-[12px] text-muted">{e.body}</div></a>)}
          </Panel>
        )}
        <Panel title="Import a specific paper"><LookupBox /></Panel>
      </aside>
    </div>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center gap-1.5 text-navy">{icon}<h2 className="kicker !text-ink-2">{title}</h2><span className="ml-auto">{action}</span></div>
      {children}
    </section>
  );
}
