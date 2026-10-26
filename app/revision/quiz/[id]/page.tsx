import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { Quiz } from "@/components/client/revision";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { data: q } = await db().from("quizzes").select("*").eq("id", Number((await params).id)).eq("user_id", user.id).maybeSingle();
  if (!q) notFound();
  const { data: p } = q.paper_id ? await db().from("papers").select("id,title").eq("id", q.paper_id).maybeSingle() : { data: null };
  const title = q.topic ?? p?.title ?? "Questions";
  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-3 text-[13px] text-muted"><Link href="/revision" className="hover:text-navy">← Revision</Link>{p && <> · <Link href={`/paper/${p.id}`} className="hover:text-navy">Back to paper</Link></>}</div>
      <div className="kicker">Postgraduate examination practice</div>
      <h1 className="mb-2 font-serif text-[1.6rem] font-bold leading-tight">{title}</h1>
      <Quiz quiz={q.content} sources={q.sources ?? []} title={title} />
    </div>
  );
}
