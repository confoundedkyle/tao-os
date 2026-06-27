-- Job title for a talent-pool prospect — shown in the list and editable in the
-- add/edit form, so recruiters can record what a prospect actually does.
alter table talent_prospects
  add column if not exists job_title text;
