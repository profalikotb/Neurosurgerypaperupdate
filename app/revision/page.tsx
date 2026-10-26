import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { ReviewSession, NotesList } from "@/components/client/revision";
import { fmtDate } from "@/lib/text";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const sb = db();
  const now = new Date().toISOString();
  const [{ data: due }, { data: all }, { data: quizzes }, { data: history }] = await Promise.all([
    sb.from("notes").select("id,text,paper_id,topic,source_ref,ease,interval_days,reps,difficult").eq("user_id", user.id).lte("due_at", now).order("difficult", { ascending: false }).order("due_at").limit(40),
    sb.from("notes").select("id,text,paper_id,topic,difficult,due_at,reps,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    sb.from("quizzes").select("id,topic,paper_id,created_at,content->mcqs").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("reads").select("paper_id,progress,last_read_at").eq("user_id", user.id).order("last_read_at", { ascending: false }).limit(15),
  ]);
  const pids = [...new Set([...(all ?? []).map((n: any) => n.paper_id), ...(quizzes ?? []).map((q: any) => q.paper_id), ...(history ?? []).map((h: any) => h.paper_id)].filter(Boolean))];
  const { data: papers } = pids.length ? await sb.from("papers").select("id,title").in("id", pids) : { data: [] };
  const titles = Object.fromEntries((papers ?? []).map((p: any) => [p.id, p.title]));
  const notes = (all ?? []).filter((n: any) => sp.f !== "difficult" || n.difficult);

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="kicker">Personal revision platform</div>
      <h1 className="font-serif text-[1.9rem] font-bold">Revision</h1>
      <section className="mt-4"><ReviewSession cards={due ?? []} titles={titles} /></section>

      <div className="mt-10 grid gap-8 md:grid-cols-[1fr_280px]">
        <section>
          <div className="mb-2 flex items-center gap-3"><h2 className="kicker">Saved notes ({all?.length ?? 0})</h2>
            <Link href="/revision" className={`text-[12.5px] ${sp.f !== "difficult" ? "text-navy" : "text-muted"}`}>All</Link>
            <Link href="/revision?f=difficult" className={`text-[12.5px] ${sp.f === "difficult" ? "text-navy" : "text-muted"}`}>Difficult</Link></div>
          <NotesList notes={notes} titles={titles} />
        </section>
        <aside className="space-y-6">
          <section>
            <h2 className="kicker mb-2">Question sets</h2>
            {(quizzes ?? []).length ? quizzes!.map((q: any) => (
              <Link key={q.id} href={`/revision/quiz/${q.id}`} className="block border-b rule py-2 text-[13px] hover:text-navy">
                <div className="font-medium leading-snug">{q.topic ?? titles[q.paper_id] ?? "Paper"}</div>
                <div className="text-[11.5px] text-muted">{(q.mcqs ?? []).length} MCQs · {fmtDate(q.created_at)}</div>
              </Link>
            )) : <p className="text-[13px] text-muted">Generate MCQs from any paper or topic review.</p>}
          </section>
          <section>
            <h2 className="kicker mb-2">Reading history</h2>
            {(history ?? []).map((h: any) => (
              <Link key={h.paper_id} href={`/paper/${h.paper_id}`} className="block border-b rule py-1.5 text-[12.5px] hover:text-navy">
                <span className="line-clamp-2">{titles[h.paper_id]}</span>
                <span className="text-[11px] text-muted">{Math.round(h.progress * 100)}% · {fmtDate(h.last_read_at)}</span>
              </Link>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
