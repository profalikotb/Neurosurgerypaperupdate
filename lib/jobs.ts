import "server-only";
import { db } from "@/lib/supabase/admin";
import { env, hasLLM } from "@/lib/env";
import { enqueue } from "@/lib/queue";
import { ingestJournal, enrichPapers, loadJournals } from "@/lib/ingest";
import { summarizePaper } from "@/lib/ai/summarize";
import { generateTopicReview } from "@/lib/ai/topic";
import { generateWeekly, weekStartOf } from "@/lib/ai/weekly";
import { openPdf, pdfInfo, extractPages } from "@/lib/pdf";
import { saveUserFullText } from "@/lib/fulltext";
import { chunkPages, isoDay } from "@/lib/text";
import { embed, vec } from "@/lib/llm";
import { newestEdition } from "@/lib/sources/books";
import { logEvent, getState, setState } from "@/lib/log";

type Job = { id: number; type: string; payload: any; attempts: number; max_attempts: number };

const SLICE = 40; // PDF pages per job run — keeps each run well inside the serverless time limit

const handlers: Record<string, (p: any) => Promise<unknown>> = {
  async ingest_journal({ journalId }) {
    const r = await ingestJournal(journalId);
    for (let i = 0; i < r.newIds.length; i += 40) await enqueue("enrich_papers", { ids: r.newIds.slice(i, i + 40) }, { priority: 2 });
    return { found: r.found, inserted: r.inserted };
  },

  async enrich_papers({ ids }) { await enrichPapers(ids, { verify: true }); return { n: ids.length }; },

  async summarize({ paperId, kind }) {
    if (!hasLLM()) throw new Error("No AI provider configured.");
    return summarizePaper(paperId, kind ?? "core");
  },

  async auto_summarize() {
    if (!hasLLM()) return { skipped: "no LLM" };
    const today = isoDay(new Date());
    const st = (await getState<{ day: string; n: number }>("auto_summarize")) ?? { day: today, n: 0 };
    const used = st.day === today ? st.n : 0;
    const room = Math.max(0, env.autoSummDailyLimit - used);
    if (!room) return { skipped: "daily limit" };
    const sb = db();
    const { data: cands } = await sb.from("papers").select("id")
      .in("fulltext_access", ["open_pmc", "open_other"]).gte("importance_score", env.autoSummMinScore)
      .gte("indexed_at", new Date(Date.now() - 14 * 864e5).toISOString()).eq("hidden", false).eq("is_retracted", false)
      .order("importance_score", { ascending: false }).limit(60);
    const ids = (cands ?? []).map((c: any) => c.id);
    const { data: done } = ids.length ? await sb.from("summaries").select("paper_id").eq("kind", "core").in("paper_id", ids) : { data: [] };
    const doneSet = new Set((done ?? []).map((d: any) => d.paper_id));
    const todo = ids.filter((id) => !doneSet.has(id)).slice(0, room);
    for (const id of todo) await enqueue("summarize", { paperId: id, kind: "core" }, { dedupe: `sum:${id}:core`, priority: 1 });
    await setState("auto_summarize", { day: today, n: used + todo.length });
    return { queued: todo.length };
  },

  async extract_document({ documentId, from = 1 }) {
    const sb = db();
    const { data: doc } = await sb.from("documents").select("*").eq("id", documentId).single();
    if (!doc) throw new Error("Document not found");
    if (!doc.storage_path) throw new Error("Document has no stored file");
    await sb.from("documents").update({ status: "processing", error: null }).eq("id", documentId);
    const { data: file, error } = await sb.storage.from("uploads").download(doc.storage_path);
    if (error || !file) throw new Error(`Storage download failed: ${error?.message}`);
    const pdf = await openPdf(await file.arrayBuffer());
    const info = await pdfInfo(pdf);
    if (from === 1) {
      await sb.from("chunks").delete().eq("document_id", documentId);
      await sb.from("documents").update({ pages_total: info.numPages, chapters: info.outline, pages_done: 0 }).eq("id", documentId);
    }
    const isPaper = doc.kind === "paper_fulltext";
    const to = isPaper ? Math.min(info.numPages, 120) : Math.min(info.numPages, from + SLICE - 1);
    const pages = await extractPages(pdf, from, to, info.labels);
    if (isPaper && doc.paper_id) await saveUserFullText(doc.paper_id, pages);

    const chapterAt = (idx: number) => { let c: string | null = null; for (const o of info.outline) if (o.page <= idx) c = o.title; return c; };
    const chunks = chunkPages(pages.map((p) => ({ text: p.text, label: p.label, index: p.index, chapter: chapterAt(p.index) })));
    let embs: number[][] | null = null;
    try { embs = await embed(chunks.map((c) => `${c.chapter ? c.chapter + ": " : ""}${c.text}`)); } catch (e: any) { await logEvent("embed", e.message, { documentId }, "warn"); }
    const { count } = await sb.from("chunks").select("id", { count: "exact", head: true }).eq("document_id", documentId);
    const rows = chunks.map((c, i) => ({ document_id: documentId, paper_id: isPaper ? doc.paper_id : null, chapter: c.chapter, page_label: c.page_label ?? String(c.page_index), page_index: c.page_index, ord: (count ?? 0) + i, text: c.text, embedding: vec(embs?.[i]) }));
    for (let i = 0; i < rows.length; i += 100) { const { error: e } = await sb.from("chunks").insert(rows.slice(i, i + 100)); if (e) throw new Error(e.message); }

    const doneTo = isPaper ? info.numPages : to;
    await sb.from("documents").update({ pages_done: doneTo, status: doneTo >= info.numPages ? "ready" : "processing" }).eq("id", documentId);
    if (doneTo < info.numPages) await enqueue("extract_document", { documentId, from: doneTo + 1 }, { dedupe: `doc:${documentId}:${doneTo + 1}`, priority: 1 });
    else if (isPaper && doc.paper_id && hasLLM()) await enqueue("summarize", { paperId: doc.paper_id, kind: "core" }, { dedupe: `sum:${doc.paper_id}:core`, priority: 6 });
    return { pages: `${from}-${doneTo}/${info.numPages}`, chunks: rows.length };
  },

  async topic_review({ reviewId }) { await generateTopicReview(reviewId); return { reviewId }; },

  async weekly_report({ weekStart }) { if (!hasLLM()) throw new Error("No AI provider configured."); return { id: await generateWeekly(weekStart) }; },

  async check_editions() {
    const sb = db();
    const { data: books } = await sb.from("documents").select("id,title,authors,edition,year,latest_edition_seen").eq("kind", "textbook");
    let alerts = 0;
    for (const b of books ?? []) {
      const hit = await newestEdition(b.title, b.authors).catch(() => null);
      if (!hit?.year || !b.year) continue;
      const key = `${hit.year}|${hit.edition ?? ""}`;
      if (hit.year > b.year && b.latest_edition_seen !== key) {
        await sb.from("notifications").insert({ kind: "edition", title: `Newer edition detected: ${b.title}`, body: `${hit.title} — ${hit.edition ? hit.edition + " ed., " : ""}${hit.year}${hit.publisher ? `, ${hit.publisher}` : ""}${hit.isbn ? ` (ISBN ${hit.isbn})` : ""}. Your library copy: ${b.edition ?? "?"} ed., ${b.year}.`, link: hit.link });
        await sb.from("documents").update({ latest_edition_seen: key }).eq("id", b.id);
        alerts++;
      }
    }
    return { checked: books?.length ?? 0, alerts };
  },
};

async function runOne(job: Job) {
  const sb = db();
  const h = handlers[job.type];
  try {
    if (!h) throw new Error(`Unknown job type ${job.type}`);
    const result = await h(job.payload ?? {});
    await sb.from("jobs").update({ status: "done", result: (result ?? null) as any, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.id);
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 1500);
    const final = job.attempts >= job.max_attempts || /not configured|not found|no credit|rejected the API key/i.test(msg);
    await sb.from("jobs").update({
      status: final ? "failed" : "queued", last_error: msg, locked_at: null, updated_at: new Date().toISOString(),
      run_after: new Date(Date.now() + job.attempts * job.attempts * 60_000).toISOString(),
    }).eq("id", job.id);
    if (job.type === "extract_document" && final) await sb.from("documents").update({ status: "failed", error: msg }).eq("id", job.payload?.documentId);
    await logEvent(`job:${job.type}`, msg, { jobId: job.id, payload: job.payload }, final ? "error" : "warn");
  }
}

/** Processes queued jobs until the time budget is used. Safe to call concurrently (SKIP LOCKED). */
export async function runJobs(budgetMs = 240_000, types?: string[]): Promise<{ processed: number }> {
  const t0 = Date.now();
  let processed = 0;
  while (Date.now() - t0 < budgetMs) {
    const { data, error } = await db().rpc("claim_jobs", { p_limit: 1, p_types: types ?? null });
    if (error) throw error;
    const job = (data as Job[] | null)?.[0];
    if (!job) break;
    await runOne(job);
    processed++;
  }
  return { processed };
}

/** Daily schedule: journal ingest, auto-summaries, Monday weekly report, monthly edition check, housekeeping. */
export async function scheduleDaily() {
  const today = new Date();
  const day = isoDay(today);
  const journals = (await loadJournals()).filter((j) => j.enabled);
  for (const j of journals) await enqueue("ingest_journal", { journalId: j.id }, { dedupe: `ingest:${j.id}:${day}`, priority: 3 });
  await enqueue("auto_summarize", {}, { dedupe: `auto:${day}`, runAfter: new Date(Date.now() + 25 * 60_000) });
  if (today.getUTCDay() === 1) await enqueue("weekly_report", { weekStart: weekStartOf(today) }, { dedupe: `weekly:${weekStartOf(today)}`, runAfter: new Date(Date.now() + 90 * 60_000) });
  if (today.getUTCDate() === 1) await enqueue("check_editions", {}, { dedupe: `editions:${day}` });
  const sb = db();
  await sb.from("jobs").delete().eq("status", "done").lt("updated_at", new Date(Date.now() - 14 * 864e5).toISOString());
  await sb.from("event_log").delete().lt("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
  await setState("last_daily", { at: new Date().toISOString(), journals: journals.length });
}
