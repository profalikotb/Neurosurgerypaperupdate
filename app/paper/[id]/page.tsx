import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { AccessBadge, LevelBadge, StudyBadge, Flags, Score } from "@/components/badges";
import { BookmarkButton } from "@/components/bookmark-button";
import { PaperReader } from "@/components/client/paper-reader";
import { fmtDate } from "@/lib/text";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const id = Number((await params).id);
  if (!id) notFound();
  const sb = db();
  const { data: p } = await sb.from("papers").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: sums }, { data: bm }, { data: notes }, { data: quizzes }, { data: jobs }, { count: secCount }] = await Promise.all([
    sb.from("summaries").select("kind,source_basis,model,content,verification,created_at").eq("paper_id", id),
    sb.from("bookmarks").select("paper_id").eq("user_id", user.id).eq("paper_id", id).maybeSingle(),
    sb.from("notes").select("id,text").eq("user_id", user.id).eq("paper_id", id),
    sb.from("quizzes").select("id,created_at").eq("user_id", user.id).eq("paper_id", id).order("created_at", { ascending: false }).limit(3),
    sb.from("jobs").select("id,payload,status").eq("type", "summarize").in("status", ["queued", "running"]).contains("payload", { paperId: id }),
    sb.from("paper_sections").select("id", { count: "exact", head: true }).eq("paper_id", id),
  ]);
  const byKind = Object.fromEntries((sums ?? []).map((s: any) => [s.kind, s]));
  const pending = Object.fromEntries((jobs ?? []).map((j: any) => [j.payload.kind ?? "core", j.id]));
  const authors: { name: string; affiliation?: string }[] = p.authors ?? [];

  return (
    <article className="mx-auto max-w-[860px]">
      <div className="no-print mb-3 text-[13px] text-muted"><Link href="/" className="hover:text-navy">← Today</Link></div>
      <header className="border-b-2 border-ink pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StudyBadge type={p.study_type} /><LevelBadge level={p.evidence_level} /><AccessBadge access={p.fulltext_access} /><Flags p={p} />
          {(p.subspecialties ?? []).map((s: string) => <Link key={s} href={`/search?subspecialty=${encodeURIComponent(s)}`} className="rounded-md border rule px-1.5 text-[11.5px] leading-5 text-muted hover:text-navy">{s}</Link>)}
          <span className="ml-auto"><Score s={p.importance_score} /></span>
        </div>
        <h1 className="mt-3 font-serif text-[1.7rem] font-bold leading-[1.22] tracking-tight sm:text-[2rem]">{p.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{authors.map((a) => a.name).join(", ") || "Authors not listed"}</p>
        <div className="mt-2 grid gap-x-6 gap-y-1 text-[13px] text-muted sm:grid-cols-2">
          <div><span className="font-medium text-ink-2">{p.journal_name}</span>{p.volume && <> · {p.volume}{p.issue && `(${p.issue})`}{p.pages && `:${p.pages}`}</>}</div>
          <div>Published {fmtDate(p.pub_date)} · Indexed {fmtDate(p.indexed_at)}</div>
          <div className="flex flex-wrap gap-x-3 font-mono text-[12px]">
            {p.pmid && <a className="hover:text-navy" href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`} target="_blank" rel="noreferrer">PMID {p.pmid}</a>}
            {p.pmcid && <a className="hover:text-navy" href={`https://pmc.ncbi.nlm.nih.gov/articles/${p.pmcid}/`} target="_blank" rel="noreferrer">{p.pmcid}</a>}
            {p.doi && <a className="hover:text-navy" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">doi:{p.doi}</a>}
          </div>
          <div className="flex items-center gap-1">
            {p.verified_at ? <><ShieldCheck size={13} className="text-ok" /> Metadata verified (Crossref)</> : p.verification_note ? <><ShieldAlert size={13} className="text-warn" /> {p.verification_note}</> : "Metadata from PubMed"}
            {p.citation_count != null && <> · cited {p.citation_count}×</>}
          </div>
        </div>
        {authors[0]?.affiliation && <p className="mt-1 text-[12px] text-muted">{authors[0].affiliation}</p>}
        <div className="no-print mt-3 flex flex-wrap items-center gap-2">
          <BookmarkButton id={p.id} initial={Boolean(bm)} withLabel />
          {p.oa_url && <a href={p.oa_url} target="_blank" rel="noreferrer" className="text-[13px] text-navy hover:underline">Open-access copy ↗</a>}
          {p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="text-[13px] text-navy hover:underline">Publisher page ↗</a>}
        </div>
      </header>

      <PaperReader
        paper={{ id: p.id, title: p.title, abstract: p.abstract, abstract_sections: p.abstract_sections, fulltext_access: p.fulltext_access, pmid: p.pmid, doi: p.doi, journal: p.journal_abbr, date: p.pub_date, sections: secCount ?? 0 }}
        core={byKind.core ?? null} expert={byKind.expert ?? null} arabic={byKind.arabic ?? null}
        pending={pending} savedNotes={(notes ?? []).map((n: any) => n.text)} quizzes={quizzes ?? []}
      />
    </article>
  );
}
