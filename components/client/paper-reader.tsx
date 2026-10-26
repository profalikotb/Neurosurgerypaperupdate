"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Wand2, Plus, Check, AlertTriangle, CheckCircle2, Download, Printer, FileText, ListChecks, GraduationCap, Languages, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BasisBadge } from "@/components/badges";
import { UploadPdf } from "./upload-pdf";
import { useJob } from "./use-job";
import { cn } from "@/components/ui/cn";

type Sum = { kind: string; source_basis: string; model: string; content: any; verification: any; created_at: string } | null;
type Paper = { id: number; title: string; abstract: string | null; abstract_sections: { label: string; text: string }[] | null; fulltext_access: string; pmid: string | null; doi: string | null; journal: string | null; date: string | null; sections: number };
type Mode = "quick" | "detailed" | "expert" | "arabic";

const NR = /^(not reported|not reported in abstract|insufficient verified source information\.?|n\/a|none)$/i;
const has = (s: any) => typeof s === "string" && s.trim() && !NR.test(s.trim());

export function PaperReader({ paper, core, expert, arabic, pending, savedNotes, quizzes }: { paper: Paper; core: Sum; expert: Sum; arabic: Sum; pending: Record<string, number>; savedNotes: string[]; quizzes: { id: number }[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("detailed");
  const [saved, setSaved] = useState(new Set(savedNotes));
  const [err, setErr] = useState("");
  const [quizBusy, setQuizBusy] = useState(false);
  const jobs = {
    core: useJob((s, e) => { if (s === "failed") setErr(e ?? "Failed"); router.refresh(); }),
    expert: useJob((s, e) => { if (s === "failed") setErr(e ?? "Failed"); router.refresh(); }),
    arabic: useJob((s, e) => { if (s === "failed") setErr(e ?? "Failed"); router.refresh(); }),
  };
  useEffect(() => { for (const k of ["core", "expert", "arabic"] as const) if (pending[k]) jobs[k].start(pending[k]); /* eslint-disable-next-line */ }, []);

  // Reading progress (throttled)
  const last = useRef(0);
  useEffect(() => {
    if (!core) return;
    const onScroll = () => {
      const h = document.documentElement;
      const prog = Math.min(1, (h.scrollTop + h.clientHeight) / h.scrollHeight);
      if (prog - last.current > 0.1 || prog > 0.97 && last.current < 0.97) { last.current = prog; fetch(`/api/papers/${paper.id}/progress`, { method: "POST", body: JSON.stringify({ progress: prog, mode }) }); }
    };
    fetch(`/api/papers/${paper.id}/progress`, { method: "POST", body: JSON.stringify({ progress: 0.02, mode }) });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [core, paper.id, mode]);

  const gen = async (kind: "core" | "expert" | "arabic", regenerate = false) => {
    setErr("");
    const r = await fetch(`/api/papers/${paper.id}/summary`, { method: "POST", body: JSON.stringify({ kind, regenerate }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    if (j.jobId) jobs[kind].start(j.jobId);
  };

  const save = async (texts: string[], sourceRef?: string) => {
    const fresh = texts.filter((t) => !saved.has(t));
    if (!fresh.length) return;
    const r = await fetch("/api/notes", { method: "POST", body: JSON.stringify({ texts: fresh, paperId: paper.id, sourceRef }) });
    if (r.ok) setSaved(new Set([...saved, ...fresh]));
  };

  const quiz = async () => {
    setQuizBusy(true); setErr("");
    const r = await fetch("/api/quiz", { method: "POST", body: JSON.stringify({ paperId: paper.id }) });
    const j = await r.json(); setQuizBusy(false);
    if (r.ok) router.push(`/revision/quiz/${j.quizId}`); else setErr(j.error);
  };

  const c = core?.content;
  const v = core?.verification;
  const md = useMemo(() => (c ? toMarkdown(paper, core!, expert, arabic, mode) : ""), [c, paper, core, expert, arabic, mode]);

  const exportDocx = async () => {
    const r = await fetch("/api/export/docx", { method: "POST", body: JSON.stringify({ title: paper.title.slice(0, 120), markdown: md }) });
    if (!r.ok) return setErr("Export failed");
    const blob = await r.blob(); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "summary.docx"; a.click();
  };
  const exportMd = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = "summary.md"; a.click(); };

  const SaveBtn = ({ t, refx }: { t: string; refx?: string }) => (
    <button onClick={() => save([t], refx)} className={cn("no-print ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-60 hover:bg-navy-soft hover:text-navy hover:opacity-100", saved.has(t) && "text-ok opacity-100")} title={saved.has(t) ? "Saved to revision" : "Save to revision"} aria-label="Save point">
      {saved.has(t) ? <Check size={13} /> : <Plus size={13} />}
    </button>
  );

  // ───────── No summary yet ─────────
  if (!c) {
    return (
      <div className="mt-6">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-lg font-semibold">Comprehensive AI analysis</h2>
              <p className="mt-0.5 text-[13.5px] text-ink-2">
                {paper.fulltext_access === "open_pmc" || paper.fulltext_access === "open_other" || paper.fulltext_access === "user_upload"
                  ? "Legal full text is available — the analysis will read methods, results and tables, and every finding is checked against the source."
                  : "No legal free full text was found. The analysis will be labelled ABSTRACT ONLY. Upload a PDF you are licensed to use for a full-text analysis."}
              </p>
            </div>
            <Button variant="primary" disabled={jobs.core.running} onClick={() => gen("core")}>{jobs.core.running ? <><Loader2 size={15} className="animate-spin" />Analysing… ({jobs.core.status})</> : <><Wand2 size={15} />Generate summary</>}</Button>
            <UploadPdf meta={{ kind: "paper_fulltext", paperId: paper.id }} label="Upload full-text PDF" />
          </div>
          {jobs.core.running && <p className="mt-3 text-[12.5px] text-muted">Retrieving full text, related evidence and library passages, then analysing — typically 1–3 minutes. You can leave this page; it continues in the background.</p>}
          {err && <p className="mt-3 text-[13px] text-bad">{err}</p>}
        </div>
        <Abstract paper={paper} />
      </div>
    );
  }

  const basis = core!.source_basis;
  return (
    <div className="mt-5">
      {/* Basis + verification */}
      <div className="flex flex-wrap items-center gap-2">
        <BasisBadge basis={basis} large />
        {v?.totals && <span className="text-[12.5px] text-muted"><CheckCircle2 size={13} className="mr-1 inline text-ok" />{v.totals.verified}/{v.totals.findings} findings matched verbatim to source{v.totals.flagged ? <> · <AlertTriangle size={13} className="mx-1 inline text-warn" />{v.totals.flagged} flagged</> : null}</span>}
        <span className="text-[11.5px] text-muted">· {core!.model} · {new Date(core!.created_at).toLocaleDateString("en-GB")}</span>
      </div>
      {basis === "abstract_only" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
          Methods, complications and technical details below are limited to what the abstract states. <UploadPdf meta={{ kind: "paper_fulltext", paperId: paper.id }} label="Upload full text to upgrade" variant="subtle" />
        </div>
      )}

      {/* Mode switch + tools */}
      <div className="no-print sticky top-14 z-20 -mx-4 mt-4 border-b rule bg-paper/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <div className="flex flex-wrap items-center gap-1">
          {([["quick", "Quick revision", "2–3 min"], ["detailed", "Detailed review", "10–15 min"], ["expert", "Professor review", "journal club"], ["arabic", "العربية", ""]] as const).map(([k, l, s]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-navy-soft", mode === k && "bg-navy text-white hover:bg-navy dark:text-[#0b1020]", k === "arabic" && "ar")}>
              {l}{s && <span className={cn("ml-1 hidden text-[11px] font-normal sm:inline", mode === k ? "opacity-80" : "text-muted")}>{s}</span>}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={quiz} disabled={quizBusy} title="Generate MCQs & essay questions">{quizBusy ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={15} />}<span className="hidden sm:inline">MCQs</span></Button>
            <Menu label={<><Download size={15} /><span className="hidden sm:inline">Export</span></>}>
              <button onClick={exportDocx} className="menu-item"><FileText size={14} />Word (.docx)</button>
              <button onClick={() => window.print()} className="menu-item"><Printer size={14} />Print / Save as PDF (A4)</button>
              <button onClick={exportMd} className="menu-item"><Download size={14} />Markdown</button>
            </Menu>
            <Menu label={<RotateCcw size={14} />}>
              <button onClick={() => gen("core", true)} className="menu-item">Regenerate summary</button>
              <div className="px-2 py-1"><UploadPdf meta={{ kind: "paper_fulltext", paperId: paper.id }} label="Replace with my PDF" /></div>
            </Menu>
          </div>
        </div>
      </div>
      {err && <p className="mt-3 text-[13px] text-bad">{err}</p>}
      {quizzes.length > 0 && <p className="no-print mt-2 text-[12.5px] text-muted">Previous question sets: {quizzes.map((q, i) => <Link key={q.id} href={`/revision/quiz/${q.id}`} className="link mr-2">#{i + 1}</Link>)}</p>}

      <div className="reading mt-5">
        {mode === "quick" && (
          <section>
            <SectionHead n="" t="Quick revision" action={<Button size="sm" variant="subtle" onClick={() => save(c.quick_points ?? [])}><ListChecks size={14} />Save all to revision</Button>} />
            <ol className="space-y-2.5">{(c.quick_points ?? []).map((q: string, i: number) => <li key={i} className="flex gap-3"><span className="num w-6 shrink-0 text-right font-sans text-[13px] font-semibold text-navy">{i + 1}</span><span className="flex-1">{q}</span><SaveBtn t={q} /></li>)}</ol>
            <Essential c={c} SaveBtn={SaveBtn} />
          </section>
        )}

        {mode === "detailed" && <Detailed c={c} v={v} SaveBtn={SaveBtn} save={save} basis={basis} />}

        {mode === "expert" && (expert ? <Expert e={expert.content} SaveBtn={SaveBtn} /> : (
          <Empty text="An advanced critical appraisal for journal club / postgraduate teaching: statistics, risk-of-bias, competing techniques, evidence gaps and discussion questions with model answers." running={jobs.expert.running} status={jobs.expert.status} onGo={() => gen("expert")} label="Generate professor review" />
        ))}

        {mode === "arabic" && (arabic ? <ArabicView a={arabic.content} SaveBtn={SaveBtn} /> : (
          <Empty text="شرح عربي أكاديمي للنقاط الأساسية مع الإبقاء على المصطلحات الإنجليزية بين أقواس." running={jobs.arabic.running} status={jobs.arabic.status} onGo={() => gen("arabic")} label="إنشاء الشرح بالعربية" rtl />
        ))}

        {mode !== "arabic" && <Context c={c} />}
      </div>
    </div>
  );
}

/* ───────────────────────── Detailed (A–H) ───────────────────────── */
function Detailed({ c, v, SaveBtn, save, basis }: any) {
  const d = c.design ?? {}, w = c.why_it_matters ?? {}, id = c.identification ?? {}, cr = c.critical ?? {}, t = c.takeaways ?? {};
  const surg = (c.surgical?.items ?? []) as any[];
  return (
    <>
      <section>
        <SectionHead n="A" t="Article identification" />
        <Grid rows={[["Publication type", id.publication_type], ["Design", id.design_label], ["Setting", id.study_setting], ["Location", id.study_location], ["Evidence", id.evidence_comment]]} />
      </section>
      <section>
        <SectionHead n="B" t="Why the paper matters" />
        <Grid rows={[["Clinical problem", w.clinical_problem], ["Previous standard", w.previous_standard], ["Knowledge gap", w.knowledge_gap], ["Importance", w.importance], ["Why read it", w.why_read]]} />
      </section>
      <section>
        <SectionHead n="C" t="Study design" />
        <Grid rows={[["Hypothesis", d.hypothesis], ["Objectives", d.objectives], ["Design", d.design], ["Sample size", d.sample_size], ["Inclusion", d.inclusion], ["Exclusion", d.exclusion], ["Comparison", d.comparison], ["Follow-up", d.follow_up], ["Primary outcomes", d.primary_outcomes], ["Secondary outcomes", d.secondary_outcomes], ["Statistics", d.statistics]]} />
        {d.quote && <Quote q={d.quote} r={d.source_ref} check={v?.design} />}
      </section>
      <section>
        <SectionHead n="D" t="Detailed findings" />
        <ol className="space-y-3">
          {(c.findings ?? []).map((f: any, i: number) => {
            const chk = v?.findings?.[i];
            const ok = chk && chk.quote_found && !chk.missing_numbers?.length;
            return (
              <li key={i} className="flex gap-3">
                <span className="num w-6 shrink-0 pt-0.5 text-right font-sans text-[13px] font-semibold text-navy">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div>{f.text}<SaveBtn t={f.text} refx={f.source_ref} /></div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 font-sans">
                    {f.category && f.category !== "other" && <Badge tone="outline">{f.category}</Badge>}
                    {f.source_ref && <Badge tone="navy">§ {f.source_ref}</Badge>}
                    {chk && (ok ? <Badge tone="ok" title="Supporting quote found verbatim in source; all numbers present"><CheckCircle2 size={11} />verified</Badge>
                      : <Badge tone="warn" title={[!chk.quote_found && "Supporting quote not found in source", chk.missing_numbers?.length && `Numbers not found in source: ${chk.missing_numbers.join(", ")}`].filter(Boolean).join(" · ")}><AlertTriangle size={11} />{!chk.quote_found ? "quote not matched" : `check: ${chk.missing_numbers.join(", ")}`}</Badge>)}
                  </div>
                  {f.quote && <details className="mt-1 font-sans text-[12.5px] text-muted"><summary className="cursor-pointer select-none">source excerpt</summary><blockquote className="mt-1 border-l-2 border-navy/40 pl-2 italic">“{f.quote}”</blockquote></details>}
                </div>
              </li>
            );
          })}
        </ol>
        {!c.findings?.length && <p className="text-muted">Insufficient verified source information.</p>}
      </section>
      <section>
        <SectionHead n="E" t="Surgical implications" />
        {c.surgical?.applicable && surg.length ? (
          <div className="overflow-hidden rounded-xl border rule font-sans text-[14px]">
            {surg.map((s, i) => (
              <div key={i} className="grid gap-1 border-b rule px-3 py-2.5 last:border-0 sm:grid-cols-[150px_1fr]">
                <div className="text-[12.5px] font-semibold text-ink-2">{s.aspect}</div>
                <div>
                  <span className="font-serif text-[15.5px] leading-relaxed">{s.text}</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {s.origin === "paper" ? <Badge tone="ok">Reported by paper{s.source_ref ? ` · § ${s.source_ref}` : ""}</Badge> : <Badge tone="warn">Background knowledge — not from this paper{s.citation ? ` · ${s.citation}` : " · unverified"}</Badge>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="font-sans text-[14px] text-muted">{basis === "abstract_only" ? "Not reported in abstract." : "Not a surgical-technique paper, or technique not reported."}</p>}
      </section>
      <section>
        <SectionHead n="F" t="Critical analysis" />
        <div className="grid gap-4 sm:grid-cols-2">
          <List title="Strengths" items={cr.strengths} tone="ok" />
          <List title="Limitations" items={cr.limitations} tone="warn" />
        </div>
        <Grid rows={[["Selection bias", cr.selection_bias], ["Confounding", cr.confounding], ["Statistical concerns", cr.statistical_concerns], ["Sample size", cr.sample_size], ["Generalisability", cr.generalizability], ["Conclusions justified?", cr.conclusions_justified], ["Should practice change?", cr.practice_change]]} />
      </section>
      <section>
        <SectionHead n="G" t="Comparison with established literature" />
        {(c.comparison ?? []).length ? (
          <ul className="space-y-2">{c.comparison.map((x: any, i: number) => (
            <li key={i} className="flex gap-2"><RelationChip r={x.relation} /><span className="flex-1">{x.statement} {x.citation ? <a href={`#src-${x.citation}`} className="cite">{x.citation}</a> : <span className="font-sans text-[11px] text-warn" title="No source provided — model background knowledge">[unverified background]</span>}</span></li>
          ))}</ul>
        ) : <p className="text-muted">Insufficient verified source information.</p>}
      </section>
      <section>
        <SectionHead n="H" t="Final clinical takeaways" action={<Button size="sm" variant="subtle" onClick={() => save(t.learning_points ?? [])}><ListChecks size={14} />Save all</Button>} />
        <h4 className="kicker mb-2">High-yield learning points</h4>
        <ol className="space-y-2">{(t.learning_points ?? []).map((q: string, i: number) => <li key={i} className="flex gap-3"><span className="num w-6 shrink-0 text-right font-sans text-[13px] font-semibold text-navy">{i + 1}</span><span className="flex-1">{q}</span><SaveBtn t={q} /></li>)}</ol>
        <Essential c={c} SaveBtn={SaveBtn} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <List title="Should change in practice" items={t.should_change} tone="ok" />
          <List title="Should NOT change yet" items={t.should_not_change_yet} tone="warn" />
          <List title="Controversies" items={t.controversies} />
          <List title="Unanswered research questions" items={t.research_questions} />
        </div>
        {(c.not_reported ?? []).length > 0 && <div className="mt-5 rounded-lg bg-[color-mix(in_srgb,var(--color-muted)_8%,transparent)] p-3 font-sans text-[13px] text-ink-2"><b>Not reported by the source:</b> {c.not_reported.join("; ")}</div>}
      </section>
    </>
  );
}

function Essential({ c, SaveBtn }: any) {
  const t = c.takeaways ?? {};
  if (!t.essential_five?.length && !t.clinical_implications?.length) return null;
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border-l-4 border-navy bg-navy-soft/60 p-4">
        <h4 className="kicker mb-2 !text-navy">Five essentials to remember</h4>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15.5px]">{(t.essential_five ?? []).map((x: string, i: number) => <li key={i}>{x}<SaveBtn t={x} /></li>)}</ol>
      </div>
      <div className="rounded-xl border-l-4 border-ok bg-ok-soft/60 p-4">
        <h4 className="kicker mb-2 !text-ok">Three clinical implications</h4>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15.5px]">{(t.clinical_implications ?? []).map((x: string, i: number) => <li key={i}>{x}<SaveBtn t={x} /></li>)}</ol>
      </div>
    </div>
  );
}

/* ───────────────────────── Expert ───────────────────────── */
function Expert({ e, SaveBtn }: any) {
  return (
    <>
      {e.verdict && <div className="rounded-xl border-l-4 border-navy bg-navy-soft/60 p-4 text-[16.5px]"><span className="kicker mb-1 block !text-navy">Verdict</span>{e.verdict}</div>}
      <section><SectionHead n="1" t="Statistical interpretation" /><Bullets items={e.statistical_interpretation} SaveBtn={SaveBtn} /></section>
      <section><SectionHead n="2" t="Methodological appraisal" /><Bullets items={e.methodological_appraisal} SaveBtn={SaveBtn} /></section>
      <section><SectionHead n="3" t="Surgical controversies" /><Bullets items={e.surgical_controversies} SaveBtn={SaveBtn} /></section>
      {(e.competing_techniques ?? []).length > 0 && <section><SectionHead n="4" t="Competing techniques" />
        <div className="overflow-x-auto rounded-xl border rule"><table className="w-full font-sans text-[13.5px]"><thead className="bg-navy-soft text-left text-[12px] text-navy"><tr><th className="p-2">Technique</th><th className="p-2">Evidence</th><th className="p-2">Comparison</th></tr></thead>
          <tbody>{e.competing_techniques.map((x: any, i: number) => <tr key={i} className="border-t rule align-top"><td className="p-2 font-semibold">{x.technique}</td><td className="p-2">{x.evidence} {x.citation ? <a href={`#src-${x.citation}`} className="cite">{x.citation}</a> : <span className="text-[11px] text-warn">[unverified]</span>}</td><td className="p-2">{x.comparison}</td></tr>)}</tbody></table></div></section>}
      <section><SectionHead n="5" t="Evidence gaps" /><Bullets items={e.evidence_gaps} SaveBtn={SaveBtn} /></section>
      <section><SectionHead n="6" t="Future studies" /><Bullets items={e.future_studies} SaveBtn={SaveBtn} /></section>
      <section><SectionHead n="7" t="Teaching pearls" /><Bullets items={e.teaching_pearls} SaveBtn={SaveBtn} /></section>
      {(e.journal_club_questions ?? []).length > 0 && <section><SectionHead n="8" t="Journal club questions" />
        {e.journal_club_questions.map((q: any, i: number) => <details key={i} className="mb-2 rounded-lg border rule p-3"><summary className="cursor-pointer font-semibold">{i + 1}. {q.question}</summary><p className="mt-2 text-ink-2">{q.model_answer}</p></details>)}</section>}
    </>
  );
}

function ArabicView({ a, SaveBtn }: any) {
  return (
    <div dir="rtl" className="ar text-[1.08rem] leading-[2]">
      {a.summary_ar && <p className="rounded-xl bg-navy-soft/60 p-4">{a.summary_ar}</p>}
      <h3 className="mt-6 mb-2 text-lg font-semibold text-navy">نقاط المراجعة السريعة</h3>
      <ol className="list-decimal space-y-2 pr-6">{(a.quick_points_ar ?? []).map((x: string, i: number) => <li key={i}>{x}<SaveBtn t={x} /></li>)}</ol>
      <h3 className="mt-6 mb-2 text-lg font-semibold text-navy">خمس نقاط أساسية</h3>
      <ol className="list-decimal space-y-2 pr-6">{(a.essential_ar ?? []).map((x: string, i: number) => <li key={i}>{x}<SaveBtn t={x} /></li>)}</ol>
      <h3 className="mt-6 mb-2 text-lg font-semibold text-navy">الدلالات السريرية</h3>
      <ol className="list-decimal space-y-2 pr-6">{(a.implications_ar ?? []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ol>
    </div>
  );
}

function Context({ c }: { c: any }) {
  const ctx = (c.context ?? []) as any[];
  if (!ctx.length) return null;
  return (
    <section className="mt-10 border-t rule pt-4 font-sans">
      <h4 className="kicker mb-2">Comparison sources (retrieved, not part of this paper)</h4>
      <ol className="space-y-1.5 text-[13px]">
        {ctx.map((s) => (
          <li key={s.id} id={`src-${s.id}`} className="flex gap-2 scroll-mt-28">
            <span className="cite shrink-0">{s.id}</span>
            <span>{s.kind === "paper" && s.paper_id ? <Link href={`/paper/${s.paper_id}`} className="font-medium hover:text-navy">{s.title}</Link> : <span className="font-medium">{s.title}</span>}
              <span className="text-muted"> — {s.meta}{s.design ? ` · ${s.design}` : ""}</span>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 text-navy">↗</a>}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Abstract({ paper }: { paper: Paper }) {
  return (
    <section className="reading mt-6">
      <SectionHead n="" t="Abstract" />
      {paper.abstract_sections?.length ? paper.abstract_sections.map((s, i) => <p key={i} className="mb-3">{s.label && <b className="font-sans text-[12px] uppercase tracking-wider text-navy">{s.label}. </b>}{s.text}</p>)
        : paper.abstract ? <p>{paper.abstract}</p> : <p className="text-muted">No abstract available. Insufficient verified source information.</p>}
    </section>
  );
}

/* ───────────────────────── Primitives ───────────────────────── */
function SectionHead({ n, t, action }: { n: string; t: string; action?: React.ReactNode }) {
  return <div className="mb-3 mt-9 flex items-baseline gap-2 border-b rule pb-1.5 first:mt-0">{n && <span className="font-sans text-[12px] font-bold text-navy">{n}</span>}<h3 className="font-serif text-[1.25rem] font-semibold">{t}</h3><span className="no-print ml-auto">{action}</span></div>;
}
function Grid({ rows }: { rows: [string, any][] }) {
  const r = rows.filter(([, v]) => has(v));
  const missing = rows.filter(([, v]) => !has(v)).map(([k]) => k);
  return (
    <div>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[170px_1fr]">
        {r.map(([k, v]) => <div key={k} className="contents"><dt className="pt-0.5 font-sans text-[12.5px] font-semibold text-ink-2">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {missing.length > 0 && <p className="mt-2 font-sans text-[12px] text-muted">Not reported: {missing.join(", ")}</p>}
    </div>
  );
}
function List({ title, items, tone }: { title: string; items?: string[]; tone?: "ok" | "warn" }) {
  if (!items?.length) return null;
  return <div><h4 className={cn("kicker mb-1.5", tone === "ok" && "!text-ok", tone === "warn" && "!text-warn")}>{title}</h4><ul className="list-disc space-y-1 pl-5 text-[15.5px]">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>;
}
function Bullets({ items, SaveBtn }: { items?: string[]; SaveBtn: any }) {
  if (!items?.length) return <p className="text-muted">—</p>;
  return <ul className="list-disc space-y-1.5 pl-5">{items.map((x, i) => <li key={i}>{x}<SaveBtn t={x} /></li>)}</ul>;
}
function Quote({ q, r, check }: { q: string; r?: string; check?: any }) {
  return <details className="mt-2 font-sans text-[12.5px] text-muted"><summary className="cursor-pointer">source excerpt{r ? ` · § ${r}` : ""}{check ? (check.quote_found ? " · verified" : " · not matched") : ""}</summary><blockquote className="mt-1 border-l-2 border-navy/40 pl-2 italic">“{q}”</blockquote></details>;
}
function RelationChip({ r }: { r: string }) {
  const tone = r === "agrees" ? "ok" : r === "contradicts" ? "bad" : r === "unresolved" ? "warn" : "neutral";
  return <Badge tone={tone as any} className="mt-1 h-fit shrink-0 font-sans">{r}</Badge>;
}
function Empty({ text, running, status, onGo, label, rtl }: any) {
  return (
    <div className="card mt-2 p-5 font-sans" dir={rtl ? "rtl" : undefined}>
      <p className={cn("text-[14px] text-ink-2", rtl && "ar")}>{text}</p>
      <Button className="mt-3" variant="primary" disabled={running} onClick={onGo}>{running ? <><Loader2 size={15} className="animate-spin" />{status}…</> : <><Languages size={15} className={rtl ? "" : "hidden"} /><Wand2 size={15} className={rtl ? "hidden" : ""} />{label}</>}</Button>
    </div>
  );
}
function Menu({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{label}<ChevronDown size={13} /></Button>
      {open && <div className="card absolute right-0 top-9 z-30 w-60 p-1 shadow-lg [&_.menu-item]:flex [&_.menu-item]:w-full [&_.menu-item]:items-center [&_.menu-item]:gap-2 [&_.menu-item]:rounded-md [&_.menu-item]:px-2 [&_.menu-item]:py-1.5 [&_.menu-item]:text-left [&_.menu-item]:text-[13px] [&_.menu-item:hover]:bg-navy-soft" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

/* ───────────────────────── Markdown export ───────────────────────── */
function toMarkdown(p: Paper, core: NonNullable<Sum>, expert: Sum, arabic: Sum, mode: Mode): string {
  const c = core.content, L: string[] = [];
  const basis = { verified_fulltext: "Verified full text", user_fulltext: "User-uploaded full text", abstract_only: "ABSTRACT ONLY — FULL TEXT NOT REVIEWED", metadata_only: "Metadata only" }[core.source_basis] ?? core.source_basis;
  L.push(`**${p.journal ?? ""}** · ${p.date ?? ""}${p.pmid ? ` · PMID ${p.pmid}` : ""}${p.doi ? ` · doi:${p.doi}` : ""}`, `**Source basis:** ${basis}`, "");
  const list = (h: string, a?: string[], num = true) => { if (a?.length) { L.push(`## ${h}`); a.forEach((x, i) => L.push(num ? `${i + 1}. ${x}` : `- ${x}`)); L.push(""); } };
  if (mode === "arabic" && arabic) { const a = arabic.content; L.push(a.summary_ar ?? ""); list("نقاط المراجعة السريعة", a.quick_points_ar); list("خمس نقاط أساسية", a.essential_ar); list("الدلالات السريرية", a.implications_ar); return L.join("\n"); }
  if (mode === "quick") { list("Quick revision", c.quick_points); list("Five essentials", c.takeaways?.essential_five); list("Clinical implications", c.takeaways?.clinical_implications); return L.join("\n"); }
  if (mode === "expert" && expert) { const e = expert.content; L.push(`## Verdict`, e.verdict ?? "", ""); list("Statistical interpretation", e.statistical_interpretation, false); list("Methodological appraisal", e.methodological_appraisal, false); list("Surgical controversies", e.surgical_controversies, false); list("Evidence gaps", e.evidence_gaps, false); list("Future studies", e.future_studies, false); list("Teaching pearls", e.teaching_pearls, false); (e.journal_club_questions ?? []).forEach((q: any, i: number) => L.push(`**Q${i + 1}. ${q.question}**`, q.model_answer, "")); return L.join("\n"); }
  const kv = (h: string, o: any, keys: [string, string][]) => { L.push(`## ${h}`); keys.forEach(([k, l]) => has(o?.[k]) && L.push(`- **${l}:** ${o[k]}`)); L.push(""); };
  kv("A. Identification", c.identification, [["publication_type", "Type"], ["design_label", "Design"], ["study_setting", "Setting"], ["study_location", "Location"], ["evidence_comment", "Evidence"]]);
  kv("B. Why it matters", c.why_it_matters, [["clinical_problem", "Clinical problem"], ["previous_standard", "Previous standard"], ["knowledge_gap", "Gap"], ["importance", "Importance"], ["why_read", "Why read"]]);
  kv("C. Study design", c.design, [["hypothesis", "Hypothesis"], ["objectives", "Objectives"], ["design", "Design"], ["sample_size", "Sample size"], ["inclusion", "Inclusion"], ["exclusion", "Exclusion"], ["comparison", "Comparison"], ["follow_up", "Follow-up"], ["primary_outcomes", "Primary outcomes"], ["secondary_outcomes", "Secondary outcomes"], ["statistics", "Statistics"]]);
  list("D. Findings", (c.findings ?? []).map((f: any) => `${f.text}${f.source_ref ? ` (§ ${f.source_ref})` : ""}`));
  if (c.surgical?.applicable) list("E. Surgical implications", (c.surgical.items ?? []).map((s: any) => `**${s.aspect}:** ${s.text} _(${s.origin === "paper" ? "reported by paper" : "background, not from paper"})_`), false);
  list("F. Strengths", c.critical?.strengths, false); list("F. Limitations", c.critical?.limitations, false);
  kv("F. Appraisal", c.critical, [["selection_bias", "Selection bias"], ["confounding", "Confounding"], ["statistical_concerns", "Statistics"], ["generalizability", "Generalisability"], ["conclusions_justified", "Conclusions justified"], ["practice_change", "Practice change"]]);
  list("G. Comparison with literature", (c.comparison ?? []).map((x: any) => `[${x.relation}] ${x.statement}${x.citation ? ` [${x.citation}]` : " [unverified background]"}`), false);
  list("H. Learning points", c.takeaways?.learning_points); list("Five essentials", c.takeaways?.essential_five); list("Clinical implications", c.takeaways?.clinical_implications);
  list("Should change", c.takeaways?.should_change, false); list("Should not change yet", c.takeaways?.should_not_change_yet, false); list("Research questions", c.takeaways?.research_questions, false);
  if ((c.context ?? []).length) list("Comparison sources", c.context.map((s: any) => `[${s.id}] ${s.title} — ${s.meta}`), false);
  return L.join("\n");
}
