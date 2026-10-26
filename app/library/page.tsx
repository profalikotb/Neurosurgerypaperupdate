import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { CARD_COLS, decorate } from "@/lib/data";
import { PaperCard } from "@/components/paper-card";
import { AddTextbook, DeleteDoc } from "@/components/client/library";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/text";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const tab = (await searchParams).tab ?? "books";
  const sb = db();
  const [{ data: docs }, { data: bms }] = await Promise.all([
    sb.from("documents").select("*").order("created_at", { ascending: false }),
    sb.from("bookmarks").select("paper_id,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
  ]);
  const books = (docs ?? []).filter((d: any) => d.kind !== "paper_fulltext");
  const fulltexts = (docs ?? []).filter((d: any) => d.kind === "paper_fulltext");
  const ids = (bms ?? []).map((b: any) => b.paper_id);
  const { data: saved } = ids.length ? await sb.from("papers").select(CARD_COLS).in("id", ids) : { data: [] };
  const savedCards = (await decorate(saved ?? [], user.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const { count: chunkCount } = await sb.from("chunks").select("id", { count: "exact", head: true });

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="kicker">My personal library</div>
      <h1 className="font-serif text-[1.9rem] font-bold">Library</h1>
      <p className="text-[13px] text-muted">{books.length} textbooks/references · {fulltexts.length} uploaded article PDFs · {savedCards.length} saved papers · {(chunkCount ?? 0).toLocaleString()} indexed passages</p>
      <div className="mt-4 flex gap-1 border-b rule">
        {[["books", "Textbooks & references"], ["saved", "Saved papers"], ["fulltext", "Uploaded article PDFs"]].map(([k, l]) => <Link key={k} href={`/library?tab=${k}`} className={cn("-mb-px border-b-2 border-transparent px-3 py-2 text-[13.5px] font-medium text-muted", tab === k && "border-navy text-navy")}>{l}</Link>)}
      </div>

      {tab === "books" && (
        <div className="mt-4 space-y-4">
          <AddTextbook />
          {books.map((d: any) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-[17px] font-semibold leading-snug">{d.title}</div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{[d.authors, d.edition && `${d.edition} ed.`, d.year, d.publisher, d.isbn && `ISBN ${d.isbn}`].filter(Boolean).join(" · ") || "No bibliographic details"}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge tone={d.status === "ready" ? "ok" : d.status === "failed" ? "bad" : "warn"}>{d.status}</Badge>
                    {d.pages_total ? <span className="text-muted">{d.pages_done}/{d.pages_total} pages indexed</span> : null}
                    {d.subspecialty && <Badge tone="outline">{d.subspecialty}</Badge>}
                    {!d.storage_path && <Badge tone="teal">indexed locally</Badge>}
                    {d.error && <span className="text-bad">{d.error}</span>}
                    <span className="text-muted">added {fmtDate(d.created_at)}</span>
                  </div>
                  {d.status === "processing" && d.pages_total ? <div className="mt-2 h-1 rounded bg-rule"><div className="h-1 rounded bg-navy" style={{ width: `${Math.round((d.pages_done / d.pages_total) * 100)}%` }} /></div> : null}
                  {(d.chapters ?? []).length > 0 && (
                    <details className="mt-2 text-[13px]"><summary className="cursor-pointer text-navy">{d.chapters.length} chapters</summary>
                      <ol className="mt-1 columns-1 gap-6 sm:columns-2">{d.chapters.map((c: any, i: number) => <li key={i} className="break-inside-avoid py-0.5"><Link href={`/search?tab=library&q=${encodeURIComponent(c.title)}`} className="hover:text-navy">{c.title}</Link> <span className="text-muted">p.{c.page}</span></li>)}</ol>
                    </details>
                  )}
                </div>
                <DeleteDoc id={d.id} />
              </div>
            </div>
          ))}
          <p className="text-[12px] text-muted">Only upload content you are licensed to use. Files stay in a private bucket and are never shared or redistributed; answers quote short passages with book/chapter/page references.</p>
        </div>
      )}
      {tab === "saved" && <div className="mt-2">{savedCards.length ? savedCards.map((p) => <PaperCard key={p.id} p={p} />) : <p className="py-10 text-center text-muted">Bookmark papers to keep them here.</p>}</div>}
      {tab === "fulltext" && (
        <div className="mt-3">
          {fulltexts.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 border-b rule py-2.5 text-[14px]">
              <Link href={d.paper_id ? `/paper/${d.paper_id}` : "#"} className="min-w-0 flex-1 truncate font-medium hover:text-navy">{d.title}</Link>
              <Badge tone={d.status === "ready" ? "ok" : d.status === "failed" ? "bad" : "warn"}>{d.status}</Badge><DeleteDoc id={d.id} />
            </div>
          ))}
          {!fulltexts.length && <p className="py-10 text-center text-muted">Upload a full-text PDF from any paper page to upgrade its summary from abstract-only.</p>}
        </div>
      )}
    </div>
  );
}
