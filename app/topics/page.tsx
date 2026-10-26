import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { NewTopic } from "@/components/client/topic-tools";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/text";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const user = await requirePageUser();
  const { data } = await db().from("topic_reviews").select("id,topic,kind,status,searched_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const topics = (data ?? []).filter((t: any) => t.kind === "topic"), procs = (data ?? []).filter((t: any) => t.kind === "procedure");
  return (
    <div className="mx-auto max-w-[900px]">
      <div className="kicker">Synthesis</div>
      <h1 className="font-serif text-[1.9rem] font-bold">Topic reviews & Surgical atlas</h1>
      <p className="mb-4 mt-1 text-[14.5px] text-ink-2">Each review combines your textbook passages with recent publications and guidelines retrieved live from PubMed, structured as <i>what we know · what changed · what is controversial · what to remember</i>. Every point is linked to its source; uncited points are labelled as unverified background.</p>
      <NewTopic />
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {[["Clinical topic reviews", topics], ["Surgical atlas", procs]].map(([h, list]: any) => (
          <section key={h}>
            <h2 className="kicker mb-2">{h}</h2>
            {list.length ? list.map((t: any) => (
              <Link key={t.id} href={`/topics/${t.id}`} className="flex items-center justify-between border-b rule py-2.5 hover:text-navy">
                <span className="font-serif text-[16px] font-semibold">{t.topic}</span>
                <span className="text-[12px] text-muted">{t.status === "ready" ? `evidence ${fmtDate(t.searched_at)}` : <Badge tone={t.status === "failed" ? "bad" : "warn"}>{t.status}</Badge>}</span>
              </Link>
            )) : <p className="text-[13.5px] text-muted">None yet.</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
