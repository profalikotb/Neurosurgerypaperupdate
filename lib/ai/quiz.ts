import "server-only";
import { db } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/llm";
import { env } from "@/lib/env";
import { MCQ_SYSTEM } from "@/lib/ai/prompts";
import { retrieve } from "@/lib/ai/rag";
import { renderSources, paperToSource, CtxSource } from "@/lib/ai/context";
import { loadSections } from "@/lib/fulltext";

export async function generateQuiz(userId: string, opts: { paperId?: number; topic?: string; count?: number }) {
  const sb = db();
  let sources: CtxSource[] = [];
  if (opts.paperId) {
    const { data: p } = await sb.from("papers").select("*").eq("id", opts.paperId).single();
    if (!p) throw new Error("Paper not found");
    const secs = await loadSections(p.id);
    const body = secs.filter((s) => s.kind !== "figure").map((s) => `[§ ${s.label}] ${s.text}`).join("\n").slice(0, 40000);
    const src = paperToSource(p, "S1");
    src.text = body || p.abstract || "";
    sources = [src];
  } else if (opts.topic) {
    sources = (await retrieve(opts.topic, { live: false, maxPapers: 8, maxLib: 8 })).sources;
  }
  if (!sources.length || !sources.some((s) => s.text.length > 200)) throw new Error("Insufficient verified source information to write questions.");
  const n = opts.count ?? 5;
  const { data } = await chatJSON<any>([
    { role: "system", content: MCQ_SYSTEM },
    { role: "user", content: `Write ${n} MCQs and 2 short-essay questions.\n\nSOURCES:\n${renderSources(sources)}` },
  ], { model: env.llmModel, maxTokens: 9000, temperature: 0.4 });
  const allowed = new Set(sources.map((s) => s.id));
  for (const q of [...(data.mcqs ?? []), ...(data.essays ?? [])]) if (q.citation && !allowed.has(q.citation)) q.citation = null;
  const { data: row } = await sb.from("quizzes").insert({ user_id: userId, paper_id: opts.paperId ?? null, topic: opts.topic ?? null, kind: "mcq", content: data, sources: sources.map((s) => ({ ...s, text: undefined })) }).select("id").single();
  return row?.id as number;
}
