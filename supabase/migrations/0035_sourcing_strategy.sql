-- Sourcing cockpit — the "Sourcing" tab that drives adaptive search.
--
-- 1) Chat/run history for the STRATEGIST: the read-only planning agent that
--    proposes the next sourcing wave (which channels/connectors, example
--    queries, expected yield/cost) before any credits are spent. Exact mirror
--    of sourcing_plan_runs (0027) / qualification_runs (0028): kept separate
--    from agent_runs because it's driven by the private harness, not a stored
--    agent. Each row is one turn; turns of one chat share conversation_id. The
--    strategist never saves a document, so output_doc_id stays null.
create table if not exists sourcing_strategy_runs (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references projects not null,
  conversation_id    uuid,
  status             text,        -- running | succeeded | failed
  task               text,        -- the recruiter's steer, or null for "propose the next wave"
  steps              jsonb,       -- [{ type, tool, summary }] tool-call trace
  output_text        text,        -- the proposed strategy markdown shown for approval
  output_doc_id      uuid references documents,  -- always null; kept for shape parity
  error_message      text,
  provider           text,
  model              text,
  input_tokens       int,
  output_tokens      int,
  cache_read_tokens  int,
  cost_usd           numeric(10,6),
  created_by         text,
  created_at         timestamptz default now()
);
create index if not exists sourcing_strategy_runs_project_idx
  on sourcing_strategy_runs (project_id, conversation_id, created_at);

alter table sourcing_strategy_runs enable row level security;

-- 2) The approved strategy a shortlist run executed + its self-evaluation. When
--    the recruiter approves a proposal, its text is threaded into the sourcing
--    harness as the wave's guideline and recorded in `strategy`. When the run
--    finishes it grades itself: `outcome` ranks the search
--    (successful | weak | dry) and `learnings` captures 1–3 concise, project-
--    specific insights that steer the NEXT wave. Together they let the channel-
--    performance ledger show which strategy produced which yield and why.
alter table shortlist_runs
  add column if not exists strategy text,
  add column if not exists outcome  text,   -- successful | weak | dry
  add column if not exists learnings text;   -- what to do more/less of next wave
