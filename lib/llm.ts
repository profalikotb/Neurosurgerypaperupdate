import "server-only";
import { env } from "@/lib/env";
import { fetchRetry } from "@/lib/http";

export type Msg = { role: "system" | "user" | "assistant"; content: string };
type Opts = { model?: string; maxTokens?: number; temperature?: number; json?: boolean };

export class LLMError extends Error {}

function explain(status: number, body: string): string {
  if (status === 401) return "AI provider rejected the API key (401). Check LLM_API_KEY.";
  if (/insufficient_quota|billing|credit/i.test(body)) return "AI provider account has no credit (insufficient quota). Add billing or switch provider.";
  if (status === 429) return "AI provider rate limit reached — the job will retry automatically.";
  if (status === 404) return `Model not found at provider: ${body.slice(0, 200)}`;
  return `AI provider error ${status}: ${body.slice(0, 300)}`;
}

async function call(messages: Msg[], o: Opts, stream: boolean): Promise<Response> {
  if (!env.llmKey) throw new LLMError("No AI provider configured (LLM_API_KEY).");
  const body: Record<string, unknown> = { model: o.model ?? env.llmModel, messages, stream };
  body.max_tokens = o.maxTokens ?? 4000;
  if (o.temperature !== undefined) body.temperature = o.temperature;
  if (o.json) body.response_format = { type: "json_object" };

  // Some providers/models reject particular params; strip and retry (max 3 adaptations).
  for (let i = 0; i < 4; i++) {
    const r = await fetchRetry(`${env.llmBase}/chat/completions`, {
      method: "POST", timeoutMs: 280000, retries: 2,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.llmKey}`, "HTTP-Referer": "https://neurosurgery-update.app", "X-Title": "Neurosurgery Update" },
      body: JSON.stringify(body),
    });
    if (r.ok) return r;
    const t = await r.text();
    if (r.status === 400) {
      if (/max_completion_tokens/i.test(t) && "max_tokens" in body) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; continue; }
      if (/temperature/i.test(t) && "temperature" in body) { delete body.temperature; continue; }
      if (/response_format|json_object/i.test(t) && "response_format" in body) { delete body.response_format; continue; }
    }
    throw new LLMError(explain(r.status, t));
  }
  throw new LLMError("AI provider rejected request parameters.");
}

export async function chat(messages: Msg[], o: Opts = {}): Promise<{ text: string; model: string; finish: string | null }> {
  const r = await call(messages, o, false);
  const j: any = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LLMError("AI provider returned an empty response.");
  return { text, model: j.model ?? o.model ?? env.llmModel, finish: j?.choices?.[0]?.finish_reason ?? null };
}

/** Extracts the first JSON object from a model reply (tolerates ```json fences). */
export function parseJsonLoose<T = any>(s: string): T {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : s;
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new LLMError("AI reply did not contain JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function chatJSON<T = any>(messages: Msg[], o: Opts = {}): Promise<{ data: T; model: string }> {
  const r = await chat(messages, { ...o, json: true });
  try { return { data: parseJsonLoose<T>(r.text), model: r.model }; }
  catch (e) {
    if (r.finish === "length") throw new LLMError("AI output was truncated (token limit). Increase model output limit or use a larger model.");
    throw e;
  }
}

/** Streams plain-text deltas from an OpenAI-compatible SSE response. */
export async function* chatStream(messages: Msg[], o: Opts = {}): AsyncGenerator<string> {
  const r = await call(messages, o, true);
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try { const d = JSON.parse(data)?.choices?.[0]?.delta?.content; if (d) yield d; } catch { /* keep-alive */ }
    }
  }
}

/** Embeddings (batched). Returns null when embeddings are not configured. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!env.embKey || !texts.length) return null;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64).map((t) => t.slice(0, 8000));
    const r = await fetchRetry(`${env.embBase}/embeddings`, {
      method: "POST", timeoutMs: 60000,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.embKey}` },
      body: JSON.stringify({ model: env.embModel, input: batch, dimensions: env.embDims }),
    });
    if (!r.ok) throw new LLMError(explain(r.status, await r.text()));
    const j: any = await r.json();
    for (const d of j.data) {
      const v: number[] = d.embedding;
      if (v.length !== env.embDims) throw new LLMError(`Embedding size ${v.length} ≠ ${env.embDims}. Use a model that supports 'dimensions' or change the migration.`);
      out.push(v);
    }
  }
  return out;
}

export const vec = (v: number[] | null | undefined) => (v ? `[${v.join(",")}]` : null);
