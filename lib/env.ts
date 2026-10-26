// Centralised, server-only configuration. Never import this from a client component.
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),

  llmBase: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  llmKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4.1",
  llmModelFast: process.env.LLM_MODEL_FAST || process.env.LLM_MODEL || "gpt-4.1-mini",

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
