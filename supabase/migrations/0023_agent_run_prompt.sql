-- The full assembled prompt (system prompt + user message) is stored on a run
-- ONLY when it fails, so failures can be analysed later without re-running.
-- Null on successful runs to avoid bloating the table with large prompts.
alter table agent_runs add column prompt text;
