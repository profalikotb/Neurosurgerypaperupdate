import { Badge } from "@/components/ui/badge";
import { FileCheck2, FileText, FileUp, FileQuestion, Lock, Unlock, AlertTriangle, Sparkles } from "lucide-react";

export function AccessBadge({ access }: { access: string }) {
  if (access === "open_pmc") return <Badge tone="ok" title="Open-access full text in PubMed Central"><Unlock size={11} />Full text · PMC</Badge>;
  if (access === "open_other") return <Badge tone="ok" title="Legal open-access copy located by Unpaywall"><Unlock size={11} />Full text · OA</Badge>;
  if (access === "user_upload") return <Badge tone="teal"><FileUp size={11} />Your PDF</Badge>;
  if (access === "none") return <Badge tone="outline" title="No legal free full text found — summaries use the abstract"><Lock size={11} />Abstract only</Badge>;
  return <Badge tone="outline">Checking access…</Badge>;
}

export function BasisBadge({ basis, large }: { basis: string; large?: boolean }) {
  const cls = large ? "text-[12.5px] px-2 py-0.5" : "";
  switch (basis) {
    case "verified_fulltext": return <Badge tone="ok" className={cls}><FileCheck2 size={13} />Verified full text</Badge>;
    case "user_fulltext": return <Badge tone="teal" className={cls}><FileUp size={13} />User-uploaded full text</Badge>;
    case "abstract_only": return <Badge tone="warn" className={cls}><FileText size={13} />ABSTRACT ONLY — FULL TEXT NOT REVIEWED</Badge>;
    default: return <Badge tone="neutral" className={cls}><FileQuestion size={13} />Metadata only</Badge>;
  }
}

const LEVEL_TONE: Record<string, "ok" | "navy" | "neutral" | "warn"> = { Guideline: "ok", "1a": "ok", "1b": "ok", "2b": "navy", "3": "neutral", "4": "neutral", "5": "neutral" };
export function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  return <Badge tone={LEVEL_TONE[level] ?? "neutral"} title="Design-based evidence level (Oxford CEBM style) — not a formal appraisal">{level === "Guideline" ? "Guideline" : `LoE ${level}`}</Badge>;
}

export function StudyBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const strong = ["RCT", "Meta-analysis", "Guideline", "Systematic review"].includes(type);
  return <Badge tone={strong ? "navy" : "neutral"}>{type}</Badge>;
}

export function Flags({ p }: { p: { is_retracted?: boolean; practice_change_candidate?: boolean } }) {
  return <>
    {p.is_retracted && <Badge tone="bad"><AlertTriangle size={11} />RETRACTED</Badge>}
    {p.practice_change_candidate && <Badge tone="ok" title="Strong design with a directional primary result — candidate only; read the appraisal"><Sparkles size={11} />Potentially practice-changing</Badge>}
  </>;
}

export function Score({ s }: { s: number }) {
  return <span className="num inline-flex items-center gap-1 text-[11.5px] font-semibold text-muted" title="Importance score: rule-based on design, sample size, multicentre status and journal — not AI-generated">
    <span className="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-rule"><span className="block h-full bg-navy" style={{ width: `${s}%` }} /></span>{s}
  </span>;
}
