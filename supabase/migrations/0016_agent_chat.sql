-- Multi-turn agent chat. Each follow-up is still its own agent_runs row (so
-- per-turn steps, tokens, and cost accounting stay intact); rows are grouped
-- into a conversation by conversation_id, and the assistant's reply text is now
-- stored (output_text) so a conversation can be re-rendered on reload and the
-- prior turns can be threaded back as context.
alter table agent_runs
  add column conversation_id uuid,
  add column output_text text;

-- Existing runs each become their own single-turn conversation.
update agent_runs set conversation_id = id where conversation_id is null;

-- Loading a conversation = all turns for one (project, agent, conversation),
-- oldest first.
create index agent_runs_conversation_idx
  on agent_runs (project_id, workspace_agent_id, conversation_id, created_at);
