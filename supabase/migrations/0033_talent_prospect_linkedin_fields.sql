-- LinkedIn Connections.csv import fields for the Talent Pool.
--
-- Recruiters can export their 1st-degree LinkedIn connections (Settings &
-- Privacy → Data privacy → Download your data → larger archive) and import the
-- resulting Connections.csv into the talent pool. That file carries a company
-- and a "connected on" date beyond what talent_prospects already stores, so add
-- the two columns to hold them.
alter table talent_prospects
  add column if not exists company text,
  add column if not exists connected_on date;
