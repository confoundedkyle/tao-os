-- Cross-instance rate limiting (Cloud Run runs many instances, so an in-memory
-- limiter per instance would not hold). Fixed-window counter keyed by a caller
-- identity + window bucket, incremented atomically via an RPC so concurrent
-- requests can't race past the limit. Mirrors the increment_platform_spent
-- pattern in 0002.
create table rate_limit_hits (
  bucket_key text primary key,    -- "<scope>:<identity>:<window-epoch>"
  count      int not null default 0,
  expires_at timestamptz not null -- when this bucket can be reaped
);
create index rate_limit_hits_expires_idx on rate_limit_hits (expires_at);

-- Returns true when the call is allowed (count for the current window is still
-- within p_limit), false when it should be rejected. One atomic upsert.
create or replace function check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
as $$
declare
  v_window_epoch bigint;
  v_bucket_key   text;
  v_count        int;
begin
  v_window_epoch := floor(extract(epoch from now()) / p_window_seconds);
  v_bucket_key   := p_key || ':' || v_window_epoch;

  insert into rate_limit_hits (bucket_key, count, expires_at)
    values (
      v_bucket_key,
      1,
      to_timestamp((v_window_epoch + 2) * p_window_seconds)
    )
  on conflict (bucket_key)
    do update set count = rate_limit_hits.count + 1
  returning count into v_count;

  -- Opportunistic reap of stale buckets; the table stays tiny.
  delete from rate_limit_hits where expires_at < now();

  return v_count <= p_limit;
end;
$$;

-- Defense-in-depth: app uses the service-role key exclusively (see 0003).
alter table rate_limit_hits enable row level security;
