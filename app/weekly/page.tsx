import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/text";
import { GenerateWeekly } from "@/components/client/settings";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  await requirePageUser();
  const sp = await searchParams;
  const sb = db();
  const { data: list } = await sb.from("weekly_reports").select("id,week_start").order("week_start", { ascending: false }).limit(30);
  const sel = sp.w ? list?.find((r: any) => r.week_start === sp.w) : list?.[0];
  const { data: rep } = sel ? await sb.from("weekly_reports").select("*").eq("id", sel.id).single() : { data: null };
  const c = rep?.content ?? null;
  const src = new Map<string, any>((c?.sources ?? []).map((s: any) => [s.id, s]));
  const Ref = ({ id }: { id: string }) => { const s = src.get(id); return s ? <Link href={`/paper/${s.paper_id}`} className="font-serif font-semibold hover:text-navy">{s.title}</Link> : null; };
  const Meta = ({ id }: { id: string }) => { const s = src.get(id); return s ? <div className="text-[12px] text-muted">{s.meta} · {s.design}</div> : null; };
  const Simple = ({ title, items }: { title: string; items?: any[] }) => items?.length ? (
    <section className="mt-8"><h2 className="kicker mb-2">{title}</h2>{items.map((x: any, i: number) => <div key={i} className="border-b rule py-2.5"><Ref id={x.id} /><Meta id={x.id} /><p className="mt-1 text-[14.5px] text-ink-2">{x.note}</p></div>)}</section>
  ) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0">
        <div className="border-b-2 border-ink pb-3">
          <div className="kicker">Weekly Neurosurgery Intelligence Report</div>
          <h1 className="mt-1 font-serif text-[2rem] font-bold leading-tight">{c ? `${fmtDate(c.period.from)} — ${fmtDate(c.period.to)}` : "No report yet"}</h1>
          <div className="mt-2 flex items-center gap-3 text-[12.5px] text-muted">{c && <span>{c.counts?.indexed} papers considered · ranked by design, size & relevance (not novelty)</span>}<GenerateWeekly /></div>
        </div>
        {c?.ai?.headline && <p className="reading mt-5 text-[1.15rem]">{c.ai.headline}</p>}
        {c?.ai?.top_papers?.length > 0 && (
          <section className="mt-6">
            <h2 className="kicker mb-2">Ten most clinically important papers</h2>
            <ol>{c.ai.top_papers.map((t: any, i: number) => (
              <li key={i} className="flex gap-4 border-b rule py-3.5">
                <span className="num w-6 shrink-0 pt-0.5 text-right font-serif text-xl font-bold text-navy">{i + 1}</span>
                <div className="min-w-0"><Ref id={t.id} /><Meta id={t.id} /><p className="mt-1.5 text-[14.5px]"><b className="font-medium">Why it matters:</b> {t.why_it_matters}</p><p className="mt-1 font-serif text-[15px] text-ok">{t.takeaway}</p></div>
              </li>
            ))}</ol>
          </section>
        )}
        <Simple title="Major randomised trials" items={c?.ai?.major_trials} />
        <Simple title="Important meta-analyses" items={c?.ai?.meta_analyses} />
        <Simple title="Newly released guidelines" items={c?.ai?.guidelines} />
        <Simple title="New surgical techniques" items={c?.ai?.new_techniques} />
        {c?.ai?.controversies?.length > 0 && <section className="mt-8"><h2 className="kicker mb-2">Important controversies</h2><ul className="list-disc space-y-1.5 pl-5">{c.ai.controversies.map((x: any, i: number) => <li key={i}>{x.topic} {x.ids?.map((id: string) => { const s = src.get(id); return s ? <Link key={id} href={`/paper/${s.paper_id}`} className="cite">{id}</Link> : null; })}</li>)}</ul></section>}
        {c?.ai?.emerging?.length > 0 && <section className="mt-8 rounded-xl border-l-4 border-navy bg-navy-soft/50 p-4"><h2 className="kicker mb-2 !text-navy">Five emerging developments to monitor</h2><ol className="list-decimal space-y-1.5 pl-5">{c.ai.emerging.map((x: any, i: number) => <li key={i}>{x.development} {x.ids?.map((id: string) => { const s = src.get(id); return s ? <Link key={id} href={`/paper/${s.paper_id}`} className="cite">{id}</Link> : null; })}</li>)}</ol></section>}
        {c?.editions?.length > 0 && <section className="mt-8"><h2 className="kicker mb-2">New textbook editions</h2>{c.editions.map((e: any, i: number) => <p key={i} className="text-[14px]"><b>{e.title}</b> — {e.body}</p>)}</section>}
        {!c && <p className="mt-6 text-muted">Reports are generated automatically every Monday from the week&apos;s indexed papers. Generate one now once papers have been ingested.</p>}
      </div>
      <aside>
        <h2 className="kicker mb-2">Archive</h2>
        {(list ?? []).map((r: any) => <Link key={r.id} href={`/weekly?w=${r.week_start}`} className={`block py-1 text-[13px] ${r.id === sel?.id ? "font-semibold text-navy" : "text-ink-2 hover:text-navy"}`}>Week of {fmtDate(r.week_start)}</Link>)}
      </aside>
    </div>
  );
}
