-- Prof. Ali Kotb — Neurosurgery Knowledge & Literature Update
-- Initial schema. Run once in Supabase → SQL Editor (or `supabase db push`).
-- Security model: RLS is ENABLED on every table with NO policies, so the browser
-- (anon/authenticated keys) cannot read or write any table directly. All data access
-- goes through Next.js server routes that verify the session and use the service role.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ───────────────────────── Journals ─────────────────────────
create table if not exists journals (
  id            serial primary key,
  name          text not null,
  nlm_abbr      text not null unique,       -- PubMed [ta] abbreviation(s); alternatives separated by '|'
  tier          text not null default 'core' check (tier in ('core','additional')),
  neuro_filter  boolean not null default false, -- general journals: only neurosurgery-relevant papers
  enabled       boolean not null default true,
  priority      int not null default 0,       -- user ordering / boost (0-10)
  last_ingested timestamptz
);

-- ───────────────────────── Papers ─────────────────────────
create table if not exists papers (
  id                bigserial primary key,
  pmid              text unique,
  pmcid             text,
  doi               text,
  title             text not null,
  title_norm        text not null,
  abstract          text,
  abstract_sections jsonb,                   -- [{label, text}] when PubMed abstract is structured
  authors           jsonb not null default '[]'::jsonb,
  author_string     text,
  journal_id        int references journals(id) on delete set null,
  journal_name      text,
  journal_abbr      text,
  volume            text,
  issue             text,
  pages             text,
  pub_date          date,                    -- publication date (issue / epub)
  pub_date_text     text,
  indexed_at        timestamptz,             -- PubMed Entrez date (indexing) — kept distinct from pub_date
  pub_types         text[] not null default '{}',
  mesh              text[] not null default '{}',
  mesh_text         text,
  keywords          text[] not null default '{}',
  study_type        text,
  evidence_level    text,
  subspecialties    text[] not null default '{}',
  sample_size       int,
  importance_score  int not null default 0,
  practice_change_candidate boolean not null default false,
  debated           boolean not null default false,
  is_retracted      boolean not null default false,
  hidden            boolean not null default false,   -- errata, letters etc. — kept but not surfaced
  fulltext_access   text not null default 'unknown'
                    check (fulltext_access in ('unknown','open_pmc','open_other','none','user_upload')),
  oa_url            text,
  oa_license        text,
  citation_count    int,
  fulltext_fetched_at timestamptz,
  verified_at       timestamptz,             -- metadata cross-checked against Crossref
  verification_note text,
  embedding         vector(512),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  fts tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(abstract,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(author_string,'') || ' ' || coalesce(journal_name,'') || ' ' || coalesce(mesh_text,'')), 'C')
  ) stored
);
create unique index if not exists papers_doi_uq on papers (lower(doi)) where doi is not null;
create index if not exists papers_title_norm_idx on papers (title_norm);
create index if not exists papers_fts_idx on papers using gin (fts);
create index if not exists papers_indexed_idx on papers (indexed_at desc);
create index if not exists papers_pubdate_idx on papers (pub_date desc);
create index if not exists papers_score_idx on papers (importance_score desc);
create index if not exists papers_subsp_idx on papers using gin (subspecialties);
create index if not exists papers_emb_idx on papers using hnsw (embedding vector_cosine_ops);

-- Full text, stored as ordered sections (JATS from PMC, or parsed user PDF)
create table if not exists paper_sections (
  id        bigserial primary key,
  paper_id  bigint not null references papers(id) on delete cascade,
  ord       int not null,
  label     text not null,                   -- "Methods", "Results", "Table 2", "Figure 1"
  kind      text not null default 'section' check (kind in ('section','table','figure','abstract')),
  page      text,
  text      text not null
);
create index if not exists paper_sections_paper_idx on paper_sections (paper_id, ord);

-- AI summaries (core = A–H + quick points, expert = professor review, arabic = translation)
create table if not exists summaries (
  id            bigserial primary key,
  paper_id      bigint not null references papers(id) on delete cascade,
  kind          text not null check (kind in ('core','expert','arabic')),
  source_basis  text not null check (source_basis in ('verified_fulltext','user_fulltext','abstract_only','metadata_only')),
  model         text,
  content       jsonb not null,
  verification  jsonb,                       -- server-side quote/number checks
  created_at    timestamptz not null default now(),
  unique (paper_id, kind)
);

-- ───────────────────────── Library ─────────────────────────
create table if not exists documents (
  id            bigserial primary key,
  owner         uuid,
  kind          text not null check (kind in ('textbook','paper_fulltext','other')),
  title         text not null,
  authors       text,
  edition       text,
  year          int,
  publisher     text,
  isbn          text,
  subspecialty  text,
  storage_path  text,                        -- null when indexed locally by scripts/index-books.mjs
  source_file   text,
  paper_id      bigint references papers(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  pages_total   int,
  pages_done    int not null default 0,
  chapters      jsonb not null default '[]'::jsonb,   -- [{title, page}]
  error         text,
  latest_edition_seen text,
  created_at    timestamptz not null default now()
);

create table if not exists chunks (
  id           bigserial primary key,
  document_id  bigint not null references documents(id) on delete cascade,
  paper_id     bigint references papers(id) on delete cascade,
  chapter      text,
  page_label   text,                         -- printed page when detectable, else PDF page index
  page_index   int,
  ord          int not null,
  text         text not null,
  embedding    vector(512),
  fts tsvector generated always as (to_tsvector('english', coalesce(chapter,'') || ' ' || text)) stored
);
create index if not exists chunks_doc_idx on chunks (document_id, ord);
create index if not exists chunks_fts_idx on chunks using gin (fts);
create index if not exists chunks_emb_idx on chunks using hnsw (embedding vector_cosine_ops);

-- ───────────────────────── Jobs & logs ─────────────────────────
create table if not exists jobs (
  id           bigserial primary key,
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  dedupe_key   text,
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  priority     int not null default 0,
  attempts     int not null default 0,
  max_attempts int not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists jobs_dedupe_uq on jobs (dedupe_key) where status in ('queued','running');
create index if not exists jobs_queue_idx on jobs (status, run_after, priority desc);

create table if not exists event_log (
  id         bigserial primary key,
  level      text not null default 'info',
  scope      text not null,
  message    text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_state (
  key   text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── Personal data ─────────────────────────
create table if not exists settings (
  user_id      uuid primary key,
  interests    jsonb not null default '{}'::jsonb,   -- {subspecialty: weight 0-3}
  email_digest boolean not null default false,
  digest_email text,
  arabic       boolean not null default false,
  updated_at   timestamptz not null default now()
);

create table if not exists bookmarks (
  user_id    uuid not null,
  paper_id   bigint not null references papers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create table if not exists reads (
  user_id      uuid not null,
  paper_id     bigint not null references papers(id) on delete cascade,
  progress     real not null default 0,
  mode         text,
  last_read_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

-- Saved learning points; every note is also a spaced-repetition card (SM-2)
create table if not exists notes (
  id            bigserial primary key,
  user_id       uuid not null,
  paper_id      bigint references papers(id) on delete set null,
  topic         text,
  text          text not null,
  source_ref    text,
  difficult     boolean not null default false,
  ease          real not null default 2.5,
  interval_days int not null default 0,
  reps          int not null default 0,
  due_at        timestamptz not null default now(),
  last_reviewed timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists notes_due_idx on notes (user_id, due_at);

create table if not exists quizzes (
  id         bigserial primary key,
  user_id    uuid not null,
  paper_id   bigint references papers(id) on delete cascade,
  topic      text,
  kind       text not null check (kind in ('mcq','essay')),
  content    jsonb not null,
  sources    jsonb,
  created_at timestamptz not null default now()
);

create table if not exists topic_reviews (
  id          bigserial primary key,
  user_id     uuid not null,
  topic       text not null,
  kind        text not null default 'topic' check (kind in ('topic','procedure')),
  status      text not null default 'pending' check (status in ('pending','ready','failed')),
  content     jsonb,
  sources     jsonb,
  searched_at timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);

create table if not exists chats (
  id         bigserial primary key,
  user_id    uuid not null,
  title      text,
  created_at timestamptz not null default now()
);
create table if not exists chat_messages (
  id         bigserial primary key,
  chat_id    bigint not null references chats(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  sources    jsonb,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table if not exists weekly_reports (
  id         bigserial primary key,
  week_start date not null unique,
  content    jsonb not null,
  paper_ids  bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id         bigserial primary key,
  kind       text not null,                 -- 'edition', 'digest', 'system'
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ───────────────────────── RLS: deny all to browser keys ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['journals','papers','paper_sections','summaries','documents','chunks','jobs',
    'event_log','app_state','settings','bookmarks','reads','notes','quizzes','topic_reviews','chats',
    'chat_messages','weekly_reports','notifications']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ───────────────────────── Functions ─────────────────────────
-- Atomically claim queued jobs (and reclaim jobs stuck >10 min)
create or replace function claim_jobs(p_limit int, p_types text[] default null)
returns setof jobs language plpgsql as $$
begin
  return query
  update jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
  where j.id in (
    select id from jobs
    where ((status = 'queued' and run_after <= now())
        or (status = 'running' and locked_at < now() - interval '10 minutes'))
      and (p_types is null or type = any(p_types))
    order by priority desc, created_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
end $$;

-- Paper keyword search with filters; returns ids + rank
create or replace function search_papers(
  q text, p_limit int default 50,
  p_from date default null, p_to date default null,
  p_types text[] default null, p_journal text default null,
  p_subspecialty text default null, p_fulltext boolean default false,
  p_levels text[] default null
) returns table (id bigint, rank real) language sql stable as $$
  select p.id,
         case when q is null or q = '' then 0
              else ts_rank_cd(p.fts, websearch_to_tsquery('english', q)) end as rank
  from papers p
  where not p.hidden
    and (q is null or q = '' or p.fts @@ websearch_to_tsquery('english', q))
    and (p_from is null or p.pub_date >= p_from)
    and (p_to is null or p.pub_date <= p_to)
    and (p_types is null or p.study_type = any(p_types))
    and (p_journal is null or p.journal_abbr = p_journal)
    and (p_subspecialty is null or p_subspecialty = any(p.subspecialties))
    and (not p_fulltext or p.fulltext_access in ('open_pmc','open_other','user_upload'))
    and (p_levels is null or p.evidence_level = any(p_levels))
  order by rank desc, p.importance_score desc, p.pub_date desc nulls last
  limit p_limit
$$;

create or replace function match_papers(query_embedding vector(512), p_limit int default 30)
returns table (id bigint, similarity real) language sql stable as $$
  select id, (1 - (embedding <=> query_embedding))::real
  from papers
  where embedding is not null and not hidden
  order by embedding <=> query_embedding
  limit p_limit
$$;

-- Hybrid (keyword + vector) chunk retrieval using Reciprocal Rank Fusion
create or replace function hybrid_chunks(
  q text, query_embedding vector(512) default null, p_limit int default 12,
  p_doc_ids bigint[] default null, p_paper_id bigint default null
) returns table (id bigint, document_id bigint, paper_id bigint, chapter text, page_label text, text text, score real)
language sql stable as $$
  with kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, websearch_to_tsquery('english', q)) desc) as r
    from chunks c
    where c.fts @@ websearch_to_tsquery('english', q)
      and (p_doc_ids is null or c.document_id = any(p_doc_ids))
      and (p_paper_id is null or c.paper_id = p_paper_id)
    limit 60
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as r
    from chunks c
    where query_embedding is not null and c.embedding is not null
      and (p_doc_ids is null or c.document_id = any(p_doc_ids))
      and (p_paper_id is null or c.paper_id = p_paper_id)
    order by c.embedding <=> query_embedding
    limit 60
  ),
  fused as (
    select coalesce(kw.id, vec.id) as id,
           (coalesce(1.0/(60+kw.r), 0) + coalesce(1.0/(60+vec.r), 0))::real as score
    from kw full outer join vec on kw.id = vec.id
  )
  select c.id, c.document_id, c.paper_id, c.chapter, c.page_label, c.text, f.score
  from fused f join chunks c on c.id = f.id
  order by f.score desc
  limit p_limit
$$;

-- Private storage bucket for user-uploaded PDFs (50 MB/file on Supabase free tier)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

-- ───────────────────────── Seed journals (PubMed NLM abbreviations) ─────────────────────────
insert into journals (name, nlm_abbr, tier, neuro_filter, priority) values
 ('Journal of Neurosurgery','J Neurosurg','core',false,10),
 ('Journal of Neurosurgery: Spine','J Neurosurg Spine','core',false,8),
 ('Journal of Neurosurgery: Pediatrics','J Neurosurg Pediatr','core',false,7),
 ('Neurosurgery','Neurosurgery','core',false,10),
 ('Operative Neurosurgery','Oper Neurosurg (Hagerstown)|Oper Neurosurg','core',false,9),
 ('World Neurosurgery','World Neurosurg','core',false,6),
 ('Acta Neurochirurgica','Acta Neurochir (Wien)','core',false,8),
 ('Neurosurgical Review','Neurosurg Rev','core',false,6),
 ('Neurosurgical Focus','Neurosurg Focus','core',false,8),
 ('Neurosurgical Focus: Video','Neurosurg Focus Video','core',false,6),
 ('Journal of Neurological Surgery Part B: Skull Base','J Neurol Surg B Skull Base','core',false,9),
 ('Neuro-Oncology','Neuro Oncol','additional',false,7),
 ('Neuro-Oncology Advances','Neurooncol Adv','additional',false,5),
 ('Journal of Neuro-Oncology','J Neurooncol','additional',false,6),
 ('Brain','Brain','additional',true,4),
 ('Stroke','Stroke','additional',true,5),
 ('Journal of NeuroInterventional Surgery','J Neurointerv Surg','additional',false,6),
 ('Spine','Spine (Phila Pa 1976)','additional',false,6),
 ('The Spine Journal','Spine J','additional',false,6),
 ('European Spine Journal','Eur Spine J','additional',false,5),
 ('Lancet Neurology','Lancet Neurol','additional',true,7),
 ('JAMA Neurology','JAMA Neurol','additional',true,7),
 ('Nature Reviews Neurology','Nat Rev Neurol','additional',true,5),
 ('New England Journal of Medicine','N Engl J Med','additional',true,8),
 ('Clinical Neurology and Neurosurgery','Clin Neurol Neurosurg','additional',false,4)
on conflict (nlm_abbr) do nothing;

create or replace function journal_counts()
returns table (journal_id int, n bigint) language sql stable as $$
  select journal_id, count(*) from papers where journal_id is not null group by journal_id
$$;
