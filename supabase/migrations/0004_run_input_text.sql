-- Persist the free-text prompt a user typed when starting a run, so the run
-- detail page can show typed context alongside any attached input documents.
alter table workflow_runs add column if not exists input_text text;
