import { env } from "@/lib/env";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout + retry on 429/5xx/network errors (exponential backoff, honours Retry-After). */
export async function fetchRetry(url: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}): Promise<Response> {
  const { timeoutMs = 30000, retries = 3, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...rest,
        signal: ctrl.signal,
        headers: { "User-Agent": `NeurosurgeryUpdate/1.0 (mailto:${env.contactEmail || "unknown"})`, ...(rest.headers ?? {}) },
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        lastErr = new HttpError(res.status, `${res.status} from ${new URL(url).host}`);
        if (attempt < retries) { await sleep(ra ? ra * 1000 : 800 * 2 ** attempt); continue; }
        throw lastErr;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (attempt < retries) { await sleep(800 * 2 ** attempt); continue; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function getJSON<T = any>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const r = await fetchRetry(url, init);
  if (!r.ok) throw new HttpError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.json() as Promise<T>;
}

export async function getText(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<string> {
  const r = await fetchRetry(url, init);
  if (!r.ok) throw new HttpError(r.status, `${r.status} ${r.statusText} — ${url}`);
  return r.text();
}

/** Simple serial rate limiter (NCBI: 3 req/s without key, 10 with). */
export function limiter(perSecond: number) {
  let last = 0;
  const gap = 1000 / perSecond;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, last + gap - now);
    last = now + wait;
    if (wait) await sleep(wait);
  };
}
