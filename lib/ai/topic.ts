import "server-only";
import { db } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/llm";
import { retrieve } from "@/lib/ai/rag";
import { renderSources } from "@/lib/ai/context";
import { INTEGRITY_RULES, TOPIC_SCHEMA, PROCEDURE_SCHEMA } from "@/lib/ai/prompts";
import { filterIds } from "@/lib/ai/verify";

/** Walks any JSON and drops citation IDs that were not supplied as sources. */
function cleanCitations(node: any, allowed: Set<string>): any {
  if (Array.isArray(node)) return node.map((n) => cleanCitations(n, allowed));
  if (node && typeof node === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) out[k] = k === "citations" ? filterIds(v, allowed) : cleanCitations(v, allowed);
    return out;
  }
  return node;
}

export async function generateTopicReview(reviewId: number) {
  const sb = db();
  const { data: rv } = await sb.from("topic_reviews").select("*").eq("id", reviewId).single();
  if (!rv) throw new Error("Review not found");
  try {
    const isProc = rv.kind === "procedure";
    const r = await retrieve(isProc ? `${rv.topic} surgical technique approach complications outcomes` : rv.topic, { live: true, maxPapers: 18, maxLib: 10, years: 6 });
    const allowed = new Set(r.sources.map((s) => s.id));
    const sys = `You are a senior academic neurosurgeon writing a structured ${isProc ? "operative technique review (surgical atlas entry)" : "comprehensive topic review"} for a Professor of Neurosurgery. Integrate textbook passages (L#) for established knowledge and journal articles (S#) for recent evidence and guidelines.\n${INTEGRITY_RULES}\n${isProc ? PROCEDURE_SCHEMA : TOPIC_SCHEMA}`;
    const { data, model } = await chatJSON<any>([
      { role: "system", content: sys },
      { role: "user", content: `TOPIC: ${rv.topic}\nTODAY: ${new Date().toISOString().slice(0, 10)}\n\nSOURCES:\n${renderSources(r.sources)}` },
    ], { maxTokens: 12000, temperature: 0.2 });
    const content = { ...cleanCitations(data, allowed), model, pubmed_query: r.pubmedQuery };
    await sb.from("topic_reviews").update({ status: "ready", content, sources: r.sources.map((s) => ({ ...s, text: undefined })), searched_at: r.searchedAt, error: null }).eq("id", reviewId);
  } catch (e: any) {
    await sb.from("topic_reviews").update({ status: "failed", error: e.message }).eq("id", reviewId);
    throw e;
  }
}
