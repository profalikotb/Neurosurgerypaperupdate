import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { TopicStatus, TopicActions } from "@/components/client/topic-tools";
import { fmtDate } from "@/lib/text";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

type Pt = { point: string; citations?: string[] };

function Cites({ c }: { c?: string[] }) {
  if (!c?.length) return <span className="ml-1 font-sans text-[10.5px] text-warn" title="No retrieved source supports this point — model background knowledge">[unverified]</span>;
  return <>{c.map((x) => <a key={x} href={`#src-${x}`} className="cite">{x}</a>)}</>;
}
function Points({ items, ordered }: { items?: Pt[]; ordered?: boolean }) {
  if (!items?.length) return <p className="text-muted">Insufficient verified source information.</p>;
  const L = ordered ? "ol" : "ul";
  return <L className={`${ordered ? "list-decimal" : "list-disc"} space-y-1.5 pl-5`}>{items.map((p, i) => <li key={i}>{p.point} <Cites c={p.citations} /></li>)}</L>;
}
function Block({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return <section className={`mt-7 ${tone ? `rounded-xl border-l-4 p-4 ${tone}` : ""}`}><h2 className="mb-2 font-serif text-[1.25rem] font-semibold">{title}</h2>{children}</section>;
}

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const id = Number((await params).id);
  const { data: t } = await db().from("topic_reviews").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!t) notFound();
  const c = t.content ?? {};
  const sources = (t.sources ?? []) as any[];
  return (
    <article className="mx-auto max-w-[860px]">
      <div className="no-print mb-3 text-[13px] text-muted"><Link href="/topics" className="hover:text-navy">← Topics</Link></div>
      <header className="border-b-2 border-ink pb-3">
        <div className="kicker">{t.kind === "procedure" ? "Surgical atlas · operative revision" : "Comprehensive topic review"}</div>
        <h1 className="mt-1 font-serif text-[2rem] font-bold leading-tight">{c.title ?? t.topic}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          {t.searched_at && <Badge tone="navy">Latest evidence search: {fmtDate(t.searched_at)}</Badge>}
          <span>{sources.filter((s) => s.kind === "paper").length} articles · {sources.filter((s) => s.kind === "library").length} library passages</span>
          {t.status === "failed" && <Badge tone="bad">Failed: {t.error}</Badge>}
          <span className="ml-auto"><TopicActions id={t.id} topic={t.topic} /></span>
        </div>
      </header>
      <TopicStatus id={t.id} status={t.status} />
      {t.status !== "pending" && c && (
        <div className="reading">
          {c.overview && <p className="mt-5 text-[1.1rem]">{c.overview}</p>}
          {t.kind === "topic" ? (
            <>
              <Block title="What we already know" tone="border-navy bg-navy-soft/50"><Points items={c.already_known} /></Block>
              <Block title="What has changed recently" tone="border-ok bg-ok-soft/50"><Points items={c.changed_recently} /></Block>
              <Block title="What remains controversial" tone="border-warn bg-warn-soft/50"><Points items={c.controversial} /></Block>
              <Block title="What I should remember in practice" tone="border-ink bg-surface"><Points items={c.remember_in_practice} ordered /></Block>
              {c.anatomy?.length > 0 && <Block title="Relevant surgical anatomy"><Points items={c.anatomy} /></Block>}
              {c.approaches?.length > 0 && (
                <Block title="Operative approaches">
                  <div className="overflow-x-auto rounded-xl border rule"><table className="w-full font-sans text-[13.5px]"><thead className="bg-navy-soft text-left text-[12px] text-navy"><tr><th className="p-2">Approach</th><th className="p-2">Indications</th><th className="p-2">Advantages</th><th className="p-2">Limitations</th></tr></thead>
                    <tbody>{c.approaches.map((a: any, i: number) => <tr key={i} className="border-t rule align-top"><td className="p-2 font-semibold">{a.name} <Cites c={a.citations} /></td><td className="p-2">{a.indications}</td><td className="p-2">{a.advantages}</td><td className="p-2">{a.limitations}</td></tr>)}</tbody></table></div>
                </Block>
              )}
              {c.outcomes?.length > 0 && <Block title="Clinical outcomes"><Points items={c.outcomes} /></Block>}
              {c.guidelines?.length > 0 && <Block title="Guidelines & recommendations"><Points items={c.guidelines} /></Block>}
              {c.comparison_table?.rows?.length > 0 && (
                <Block title="Comparison table">
                  <div className="overflow-x-auto rounded-xl border rule"><table className="w-full font-sans text-[13px]"><thead className="bg-navy-soft text-left text-navy"><tr>{c.comparison_table.columns.map((h: string, i: number) => <th key={i} className="p-2">{h}</th>)}</tr></thead>
                    <tbody>{c.comparison_table.rows.map((r: string[], i: number) => <tr key={i} className="border-t rule align-top">{r.map((x, j) => <td key={j} className={`p-2 ${j === 0 ? "font-semibold" : ""}`}>{x}</td>)}</tr>)}</tbody></table></div>
                </Block>
              )}
            </>
          ) : (
            <>
              {(c.sections ?? []).map((s: any, i: number) => <Block key={i} title={s.heading}><Points items={s.points} ordered={/step/i.test(s.heading)} /></Block>)}
              {c.pearls?.length > 0 && <Block title="Surgical pearls" tone="border-ok bg-ok-soft/50"><Points items={c.pearls} /></Block>}
              {c.pitfalls?.length > 0 && <Block title="Pitfalls & warning signs" tone="border-bad bg-bad-soft/50"><Points items={c.pitfalls} /></Block>}
              <p className="mt-5 font-sans text-[12px] text-muted">Diagrams and operative videos are not reproduced — open the cited sources for licensed illustrations.</p>
            </>
          )}
          {c.insufficient?.length > 0 && <div className="mt-6 rounded-lg bg-[color-mix(in_srgb,var(--color-muted)_8%,transparent)] p-3 font-sans text-[13px]"><b>Insufficient verified source information:</b> {c.insufficient.join("; ")}</div>}
          <section className="mt-10 border-t rule pt-4 font-sans">
            <h2 className="kicker mb-2">Sources</h2>
            <ol className="space-y-1.5 text-[13px]">
              {sources.map((s) => (
                <li key={s.id} id={`src-${s.id}`} className="flex gap-2 scroll-mt-24"><span className={`cite shrink-0 ${s.kind === "library" ? "!bg-teal-soft !text-teal" : ""}`}>{s.id}</span>
                  <span>{s.paper_id ? <Link href={`/paper/${s.paper_id}`} className="font-medium hover:text-navy">{s.title}</Link> : <b className="font-medium">{s.title}</b>}<span className="text-muted"> — {s.meta}{s.design ? ` · ${s.design}` : ""}</span></span></li>
              ))}
            </ol>
            {c.pubmed_query && <p className="mt-2 text-[11.5px] text-muted">PubMed query: <code className="font-mono">{c.pubmed_query}</code> · {c.model}</p>}
          </section>
        </div>
      )}
    </article>
  );
}
