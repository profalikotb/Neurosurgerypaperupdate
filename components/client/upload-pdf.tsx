"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useJob } from "./use-job";

type Meta = { kind: "paper_fulltext" | "textbook" | "other"; paperId?: number; title?: string; authors?: string; edition?: string; year?: string; publisher?: string; isbn?: string; subspecialty?: string };

export function UploadPdf({ meta, label = "Upload PDF", onQueued, variant = "outline" }: { meta: Meta; label?: string; onQueued?: () => void; variant?: "outline" | "primary" | "subtle" }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const job = useJob((s, e) => { setMsg(s === "done" ? "Processed ✓" : `Failed: ${e}`); router.refresh(); });

  const go = async (f: File) => {
    setBusy(true); setMsg("Uploading…");
    try {
      const r = await fetch("/api/uploads", { method: "POST", body: JSON.stringify({ ...meta, filename: f.name, size: f.size }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      const { error } = await supabaseBrowser().storage.from("uploads").uploadToSignedUrl(j.path, j.token, f, { contentType: "application/pdf" });
      if (error) throw new Error(error.message);
      const c = await fetch(`/api/uploads/${j.documentId}/complete`, { method: "POST" });
      const cj = await c.json();
      setMsg("Extracting text in background…");
      if (cj.jobId) job.start(cj.jobId);
      onQueued?.();
    } catch (e: any) { setMsg(`Upload failed: ${e.message}`); }
    setBusy(false);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={ref} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) go(f); e.target.value = ""; }} />
      <Button size="sm" variant={variant} disabled={busy || job.running} onClick={() => ref.current?.click()}>
        {busy || job.running ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{label}
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
