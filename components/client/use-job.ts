"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Polls /api/jobs/:id until done/failed. */
export function useJob(onDone?: (status: string, err?: string | null) => void) {
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(onDone); cb.current = onDone;
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${jobId}`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      if (!alive) return;
      if (j) { setStatus(j.status); setError(j.last_error ?? null); }
      if (j && (j.status === "done" || j.status === "failed")) { setJobId(null); cb.current?.(j.status, j.last_error); return; }
      setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [jobId]);
  const start = useCallback((id: number) => { setError(null); setStatus("queued"); setJobId(id); }, []);
  return { start, status, error, running: jobId !== null };
}
