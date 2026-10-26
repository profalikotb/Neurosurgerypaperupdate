import Link from "next/link";
import { AccessBadge, LevelBadge, StudyBadge, Flags, Score } from "@/components/badges";
import { BookmarkButton } from "@/components/bookmark-button";
import { fmtDate, truncate } from "@/lib/text";
import type { PaperCard as P } from "@/lib/data";

export function PaperCard({ p, compact }: { p: P; compact?: boolean }) {
  const snippet = p.takeaway ?? (p.abstract ? truncate(p.abstract.replace(/^(BACKGROUND|OBJECTIVE|OBJECTIVES|INTRODUCTION|PURPOSE):\s*/i, ""), compact ? 180 : 320) : null);
  return (
    <article className="group border-b rule py-4 last:border-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <StudyBadge type={p.study_type} /><LevelBadge level={p.evidence_level} /><AccessBadge access={p.fulltext_access} /><Flags p={p} />
        {p.summarized && <span className="text-[11px] font-medium text-ok">● AI summary ready</span>}
        <span className="ml-auto"><Score s={p.importance_score} /></span>
      </div>
      <Link href={`/paper/${p.id}`} className="block">
        <h3 className="font-serif text-[1.08rem] font-semibold leading-snug text-ink group-hover:text-navy">{p.title}</h3>
      </Link>
      <div className="mt-1 text-[12.5px] text-muted">
        <span className="font-medium text-ink-2">{p.journal_abbr}</span> · {fmtDate(p.pub_date)}
        {p.author_string && <> · {truncate(p.author_string, 70)}</>}
        {p.sample_size ? <> · n={p.sample_size.toLocaleString()}</> : null}
        {p.subspecialties?.length ? <> · <span className="text-ink-2">{p.subspecialties.slice(0, 3).join(", ")}</span></> : null}
      </div>
      {snippet && !compact && (
        <p className={`mt-2 text-[14.5px] leading-relaxed ${p.takeaway ? "font-serif text-ink" : "text-ink-2"}`}>
          {p.takeaway && <span className="kicker mr-1.5 !text-ok">Takeaway</span>}{snippet}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3 text-[13px]">
        <Link href={`/paper/${p.id}`} className="font-medium text-navy hover:underline">{p.summarized ? "Read summary →" : "Open & summarise →"}</Link>
        {p.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`} target="_blank" rel="noreferrer" className="text-muted hover:text-navy">PubMed</a>}
        {p.doi && <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="text-muted hover:text-navy">DOI</a>}
        <span className="ml-auto"><BookmarkButton id={p.id} initial={p.bookmarked} /></span>
      </div>
    </article>
  );
}
