import "server-only";
import { db } from "@/lib/supabase/admin";
import { personalScore } from "@/lib/classify";
import { getState } from "@/lib/log";

export const CARD_COLS =
  "id,pmid,pmcid,doi,title,abstract,author_string,journal_name,journal_abbr,journal_id,pub_date,indexed_at,study_type,evidence_level,subspecialties,importance_score,practice_change_candidate,debated,is_retracted,fulltext_access,sample_size,citation_count";

export type PaperCard = {
  id: number; pmid: string | null; pmcid: string | null; doi: string | null; title: string; abstract: string | null; author_string: string | null;
  journal_name: string | null; journal_abbr: string | null; journal_id: number | null; pub_date: string | null; indexed_at: string | null;
  study_type: string | null; evidence_level: string | null; subspecialties: string[]; importance_score: number;
  practice_change_candidate: boolean; debated: boolean; is_retracted: boolean; fulltext_access: string; sample_size: number | null; citation_count: number | null;
  takeaway?: string | null; summarized?: boolean; bookmarked?: boolean; personal?: number;
};

export async function getSettings(userId: string) {
  const { data } = await db().from("settings").select("*").eq("user_id", userId).maybeSingle();
  return data ?? { user_id: userId, interests: {}, email_digest: false, digest_email: null, arabic: false };
}

/** Attaches AI takeaways, bookmark flags and personalised score. */
export async function decorate(papers: any[], userId: string): Promise<PaperCard[]> {
  if (!papers.length) return [];
  const sb = db();
  const ids = papers.map((p) => p.id);
  const [{ data: sums }, { data: bms }, settings, { data: js }] = await Promise.all([
    sb.from("summaries").select("paper_id,content->takeaways->clinical_implications,content->why_it_matters->why_read").eq("kind", "core").in("paper_id", ids),
    sb.from("bookmarks").select("paper_id").eq("user_id", userId).in("paper_id", ids),
    getSettings(userId),
    sb.from("journals").select("id,priority"),
  ]);
  const sm = new Map((sums ?? []).map((s: any) => [s.paper_id, s]));
  const bm = new Set((bms ?? []).map((b: any) => b.paper_id));
  const jp = new Map((js ?? []).map((j: any) => [j.id, j.priority]));
  return papers.map((p) => {
    const s: any = sm.get(p.id);
    const takeaway = s ? (s.why_read ?? (Array.isArray(s.clinical_implications) ? s.clinical_implications[0] : null)) : null;
    return { ...p, takeaway, summarized: Boolean(s), bookmarked: bm.has(p.id), personal: personalScore(p, (settings.interests ?? {}) as Record<string, number>, jp.get(p.journal_id) ?? 0) };
  });
}

const byPersonal = (a: PaperCard, b: PaperCard) => (b.personal ?? 0) - (a.personal ?? 0);

export async function getDashboard(userId: string) {
  const sb = db();
  const now = Date.now();
  const iso = (days: number) => new Date(now - days * 864e5).toISOString();
  const base = () => sb.from("papers").select(CARD_COLS).eq("hidden", false);

  const [today, week, changed, guidelines, debated, latestByJournal, reads, notes, docs, editions, lastDaily, counts] = await Promise.all([
    base().gte("indexed_at", iso(2)).order("importance_score", { ascending: false }).limit(60),
    base().gte("indexed_at", iso(7)).order("importance_score", { ascending: false }).limit(80),
    base().eq("practice_change_candidate", true).gte("indexed_at", iso(45)).order("importance_score", { ascending: false }).limit(12),
    base().eq("study_type", "Guideline").gte("indexed_at", iso(365)).order("pub_date", { ascending: false }).limit(10),
    base().eq("debated", true).gte("indexed_at", iso(30)).order("importance_score", { ascending: false }).limit(10),
    sb.from("journals").select("id,name,nlm_abbr,last_ingested,priority").eq("enabled", true).order("priority", { ascending: false }).limit(12),
    sb.from("reads").select("paper_id,progress,last_read_at").eq("user_id", userId).lt("progress", 0.95).order("last_read_at", { ascending: false }).limit(5),
    sb.from("notes").select("id,text,paper_id,topic,created_at,due_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    sb.from("documents").select("id,title,edition,year,status,kind").order("created_at", { ascending: false }).limit(5),
    sb.from("notifications").select("*").eq("kind", "edition").order("created_at", { ascending: false }).limit(4),
    getState("last_daily"),
    sb.from("notes").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("due_at", new Date().toISOString()),
  ]);

  const readIds = (reads.data ?? []).map((r: any) => r.paper_id);
  const { data: readPapers } = readIds.length ? await sb.from("papers").select("id,title,journal_abbr").in("id", readIds) : { data: [] };
  const rp = new Map((readPapers ?? []).map((p: any) => [p.id, p]));

  const all = await decorate([...(today.data ?? []), ...(week.data ?? []), ...(changed.data ?? []), ...(guidelines.data ?? []), ...(debated.data ?? [])].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i), userId);
  const pick = (rows: any[] | null) => (rows ?? []).map((r) => all.find((a) => a.id === r.id)!).filter(Boolean);

  return {
    today: pick(today.data).sort(byPersonal).slice(0, 15),
    week: pick(week.data).sort(byPersonal).slice(0, 15),
    changed: pick(changed.data),
    guidelines: pick(guidelines.data),
    debated: pick(debated.data),
    journals: latestByJournal.data ?? [],
    continueReading: (reads.data ?? []).map((r: any) => ({ ...r, paper: rp.get(r.paper_id) })).filter((r: any) => r.paper),
    notes: notes.data ?? [],
    dueCards: counts.count ?? 0,
    docs: docs.data ?? [],
    editions: editions.data ?? [],
    lastDaily: lastDaily as any,
  };
}

export async function latestForJournal(journalId: number, limit = 6) {
  const { data } = await db().from("papers").select("id,title,pub_date,study_type,volume,issue").eq("journal_id", journalId).eq("hidden", false).order("indexed_at", { ascending: false }).limit(limit);
  return data ?? [];
}
