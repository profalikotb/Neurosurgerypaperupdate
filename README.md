# Prof. Ali Kotb — Neurosurgery Knowledge & Literature Update

**Your Intelligent Neurosurgical Library, Research Updates & Revision Assistant.**

Next.js 15 (TypeScript, Tailwind v4, shadcn-style UI) · Supabase (Postgres + pgvector, Auth, private Storage) · Vercel · any OpenAI-compatible LLM.

Core workflow: **Open app → latest important papers → open paper → evidence-based summary → save points → revise later.**

---

## What it does

| Area | Implementation |
|---|---|
| Journal monitoring | 25 journals seeded (core + additional). Daily PubMed E-utilities query per journal by Entrez date, exact NLM abbreviation (`"J Neurosurg"[ta]`). General journals (NEJM, Lancet Neurol, JAMA Neurol, Brain, Stroke, Nat Rev Neurol) pass through a neurosurgical relevance filter. Add/remove/prioritise in Settings (abbreviation is validated against PubMed). |
| Metadata | PubMed XML → title, authors + affiliation, journal, vol/issue/pages, **publication date kept separate from indexing date**, DOI, PMID, PMCID, publication types, MeSH, keywords. DOI verified against Crossref (title match). Retractions flagged and scored 0. Errata hidden. Dedupe on PMID, DOI. |
| Full-text access | Europe PMC (PMC Open Access, JATS XML parsed into sections, tables, figure captions) → Unpaywall legal OA PDF → otherwise abstract only. User-uploaded PDFs upgrade a paper to *User-uploaded full text*. No paywall bypass, no scraping. |
| Classification & ranking | **Rule-based and transparent** (not AI-scored): study design, design-based evidence level, subspecialties, sample size, importance score (design, n, multicentre, journal tier). "Potentially practice-changing" requires RCT / meta-analysis / guideline (or large multicentre prospective cohort) **and** a directional result — technology buzzwords do not raise scores. Personal interests reweight the dashboard at read time. |
| AI analysis | Structured A–H analysis (identification, why it matters, design, numbered findings, surgical implications, critical analysis, comparison with literature, takeaways) + Quick revision. Professor review (statistics, risk-of-bias, competing techniques, gaps, journal-club Q&A) and Arabic explanation on demand. |
| Integrity safeguards | Every finding must carry a section reference and a **verbatim quote**; the server checks each quote and every number against the source text and marks findings *verified* / *flagged*. Surgical points are labelled *Reported by paper* vs *Background knowledge*. Comparisons may cite only retrieved sources; uncited claims are shown as *unverified background*. Invalid citation IDs are stripped. Source badge on every summary: Verified full text · User-uploaded full text · ABSTRACT ONLY — FULL TEXT NOT REVIEWED · Metadata only. |
| Library & RAG | Upload licensed PDFs (≤50 MB) → background extraction in 40-page batches, chapters from PDF outline, printed page labels where present → hybrid search (Postgres FTS + pgvector, RRF fusion). Large textbooks: `npm run index-books` on your PC uploads text only. New-edition detection monthly (Google Books). |
| Assistant | Streaming chat. Retrieval = your library [L#] + indexed papers + live PubMed (query built by a fast model, recent + high-evidence searches) [S#]. Answers grade evidence, flag disagreement, state literature-coverage date, say *Insufficient verified source information* when appropriate. |
| Topic reviews & Surgical atlas | Combines textbook passages + recent papers/guidelines into *What we know · What changed · Controversial · Remember in practice*, approaches table, outcomes; or a 15-heading operative technique entry. Date of evidence search shown. |
| Revision | Save any point → SM-2 spaced repetition cards. MCQs (5 options, explanation, why each distractor is wrong, citation) and short-essay questions with model answers; wrong answers become "difficult" cards. Reading history and progress. |
| Weekly report | Every Monday: top 10 papers, RCTs, meta-analyses, guidelines, new techniques, controversies, 5 emerging developments, new textbook editions. Optional email via Resend. |
| Export | Word (.docx, Arabic paragraphs set RTL), Markdown, Print/PDF (A4 print stylesheet). |

## Architecture

```
Browser ──(Supabase Auth cookie)──► Next.js on Vercel ──service role──► Supabase Postgres (RLS: deny-all to browser keys)
                                        │                                 └ Storage bucket "uploads" (private)
                                        ├─ /api/* route handlers (auth-checked)
                                        ├─ jobs table queue  ◄── Vercel Cron (daily) + GitHub Actions (every 15 min) + after() kicks
                                        └─ PubMed · Europe PMC · Unpaywall · Crossref · Google Books · LLM provider
```

Slow work (ingest, enrichment, summaries, PDF extraction, topic reviews, weekly report) runs as **persistent jobs** with retries, back-off, stale-lock recovery and error logs (Settings → System status). Nothing heavy runs inside a user request except a quick enqueue.

---

## Deployment (≈30 minutes, no coding)

### 1 · Supabase
1. supabase.com → **New project** (choose a nearby region, e.g. Frankfurt).
2. **SQL Editor** → paste all of `supabase/migrations/0001_init.sql` → **Run**.
3. **Authentication → Providers → Email**: keep enabled; turn **off** "Allow new users to sign up".
4. **Authentication → Users → Add user**: your email + password (tick *Auto confirm*).
5. **Project Settings → API**: copy *Project URL*, *anon* key, *service_role* key.

### 2 · GitHub
Create a new private repository (e.g. `profalikotb/neurosurgery-knowledge-update`) and upload the project files (or `git push`). Do not upload `.env.local`.

### 3 · Vercel
1. vercel.com → **Add New → Project** → import the repository. Framework: Next.js; Root Directory: `/` (leave default).
2. **Environment Variables**: add every variable from `.env.example` with real values. Minimum: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_EMAILS`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `CONTACT_EMAIL`, `CRON_SECRET` (any long random string).
3. **Deploy**. The daily cron (`vercel.json`) is registered automatically.

### 4 · Background queue (GitHub Actions)
Repository → Settings → Secrets and variables → Actions → add `APP_URL` (e.g. `https://your-app.vercel.app`) and `CRON_SECRET` (same value as Vercel). The workflow `.github/workflows/process-queue.yml` then drains the queue every 15 min.

### 5 · First run
Sign in → **Check now** on the dashboard. The first back-fill (default 30 days, all journals) takes several minutes; papers appear journal by journal. Then set your subspecialty interests in **Settings**.

### Optional
- **Semantic search**: set `EMBEDDING_API_KEY` (OpenAI `text-embedding-3-small` at 512 dims, or any provider that supports the `dimensions` parameter). Without it, search is keyword-only and still works.
- **NCBI API key** (free) raises PubMed throughput 3 → 10 req/s.
- **Weekly email**: Resend API key + verified sender domain, then enable in Settings.
- **Index big textbooks from your PC**: `npm install`, create `.env.local` from `.env.example`, then
  `npm run index-books -- "E:\Neurosurgical Books"` (add a `books.json` sidecar for title/edition/year/ISBN — see header of `scripts/index-books.mjs`).

## Local development
```bash
npm install
cp .env.example .env.local   # fill values
npm run dev                   # http://localhost:3000
npm test                      # parser / classifier / verification unit tests
npm run typecheck
```

## Operational notes & limits (read once)
- **Vercel function time**: background jobs use `maxDuration = 300` (requires Fluid Compute, default on new projects). If your plan limits functions to 60 s, PDF batches still complete (40 pages/run) but long summaries may need the Pro plan.
- **Supabase free tier**: 500 MB database, 1 GB storage, 50 MB/file, project pauses after 7 days of inactivity (the daily cron keeps it awake). A large textbook collection with embeddings will outgrow the free database — 512-dim vectors are used to keep ~2 KB/passage. Upgrade to Pro ($25/mo) when the Library tab shows >150k passages.
- **GitHub scheduled workflows** pause after 60 days without repository activity; re-enable from the Actions tab if the queue stops.
- **LLM cost guard**: `AUTO_SUMMARIZE_MIN_SCORE` and `AUTO_SUMMARIZE_DAILY_LIMIT` cap automatic summaries; everything else is on demand.
- **Scanned PDFs** contain no text layer — OCR them first (e.g. Adobe "Recognize Text" or `ocrmypdf`).
- **Journal abbreviations**: if a journal shows 0 papers after the first run, Settings → System status will warn; correct its NLM abbreviation (NLM Catalog).
- **OpenAlex** is not used in this version; Europe PMC supplies citation counts.
- Supplementary textbook knowledge appears only as retrieved library passages [L#] or explicitly labelled background — never merged into a paper's findings.

## Repository layout
```
app/                    pages (dashboard, paper, search, assistant, topics, revision, library, weekly, settings) + api/
components/             UI (paper card, badges, reader, chat, revision, uploads) + ui/ primitives
lib/sources/            pubmed · europepmc (JATS) · unpaywall · crossref · books
lib/ai/                 prompts · summarize · verify · context · rag · topic · quiz · weekly
lib/                    ingest · fulltext · pdf · jobs · queue · classify · srs · data · auth · llm
supabase/migrations/    schema, RLS, search functions, journal seed
scripts/index-books.mjs local textbook indexer
tests/                  vitest unit tests with PubMed/JATS fixtures
```
