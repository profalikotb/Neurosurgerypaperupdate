// Centralised, server-only configuration. Never import this from a client component.
/** Trimmed env value; strips accidental surrounding quotes. */
const v = (k: string) => (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "");

// Accept the common alternative names so a differently-named key still works.
const llmKey = () => v("LLM_API_KEY") || v("OPENROUTER_API_KEY") || v("OPENAI_API_KEY");
const isOpenRouter = () => /openrouter/i.test(v("LLM_BASE_URL")) || (!v("LLM_BASE_URL") && (v("OPENROUTER_API_KEY") !== "" || llmKey().startsWith("sk-or-")));
const llmBase = () => (v("LLM_BASE_URL") || (isOpenRouter() ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
/** OpenRouter model IDs need a vendor prefix ("openai/gpt-4.1"). */
const model = (m: string) => (isOpenRouter() && !m.includes("/") ? `openai/${m}` : m);

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),

  llmBase: llmBase(),
  llmKey: llmKey(),
  llmModel: model(v("LLM_MODEL") || "gpt-4.1"),
  llmModelFast: model(v("LLM_MODEL_FAST") || v("LLM_MODEL") || "gpt-4.1-mini"),

  embBase: (process.env.EMBEDDING_BASE_URL ?? process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  embKey: process.env.EMBEDDING_API_KEY ?? "",
  embModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  embDims: num(process.env.EMBEDDING_DIMENSIONS, 512),

  ncbiKey: process.env.NCBI_API_KEY ?? "",
  contactEmail: process.env.CONTACT_EMAIL ?? "",

  cronSecret: process.env.CRON_SECRET ?? "",
  lookbackDays: num(process.env.INGEST_LOOKBACK_DAYS, 30),
  autoSummMinScore: num(process.env.AUTO_SUMMARIZE_MIN_SCORE, 60),
  autoSummDailyLimit: num(process.env.AUTO_SUMMARIZE_DAILY_LIMIT, 15),

  resendKey: process.env.RESEND_API_KEY ?? "",
  digestFrom: process.env.DIGEST_FROM ?? "",
};

export const hasLLM = () => Boolean(env.llmKey);
export const hasEmbeddings = () => Boolean(env.embKey);

export const APP_NAME = "Prof. Ali Kotb — Neurosurgery Knowledge & Literature Update";
