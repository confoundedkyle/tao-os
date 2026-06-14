---
name: migrate-local
description: Apply Supabase database migrations to the local dev database. Use when asked to apply, run, or push a migration locally, after adding a file under supabase/migrations/, or when the local DB schema is behind the migration files. Local-only — never touches prod.
---

# migrate-local

Apply pending SQL migrations to the **local** Supabase database. Migrations live in
`supabase/migrations/NNNN_name.sql` (sequentially numbered, e.g. `0013_rate_limits.sql`)
and run in filename order.

The local stack runs on `127.0.0.1` (API `54321`, Postgres `54322`). There is **no
linked remote project**, and prod is migrated **only** through the GitHub Actions deploy
pipeline — so this skill must never run `supabase db push` or target a remote. Local only.

## Steps

1. **Make sure the local stack is running.** If `supabase status` errors or the API URL
   is unreachable, start it:

   ```bash
   supabase status >/dev/null 2>&1 || supabase start
   ```

2. **Apply pending migrations** (non-destructive — runs only migrations not yet recorded
   in the local history, keeps existing data):

   ```bash
   supabase migration up
   ```

   Expect `Applying migration <file>...` for each new one, then `Local database is up to
   date.` If it says up to date with nothing applied, the schema was already current.

3. **Verify it took.** Either list the local migration history (the `--local` flag is
   required — without it the CLI tries the remote project and errors with "Cannot find
   project ref"):

   ```bash
   supabase migration list --local
   ```

   …or exercise the new object via PostgREST with the local service-role key (the same way
   the app's `db()` client reaches it). Read the key from `supabase status` (`SERVICE_ROLE_KEY`)
   — don't hardcode it. Example, confirming a table exists:

   ```bash
   SR=$(supabase status -o json | python3 -c "import sys,json;print(json.load(sys.stdin)['SERVICE_ROLE_KEY'])")
   curl -s "http://127.0.0.1:54321/rest/v1/<table>?limit=1" \
     -H "apikey: $SR" -H "Authorization: Bearer $SR" -o /dev/null -w "HTTP %{http_code}\n"
   ```

   `200` (or `206`) means the table is reachable. For a new RPC, POST to
   `/rest/v1/rpc/<function_name>` with its JSON args. **Clean up any test rows you insert.**

## When the schema is wrong, not just behind

`supabase migration up` only adds *new* migrations; it won't undo or re-run an already-applied
one. If you edited an existing migration file or the local DB drifted, do a full rebuild — this
**wipes local data**, re-runs every migration in order, then runs the seed (`npm run seed` per
`config.toml`):

```bash
supabase db reset
```

Use `db reset` (not `migration up`) after changing a migration mid-development. Heed seed
ordering: the seed always runs, so a migration that adds a column the seed writes to must come
*before* anything that depends on it.

## Creating a new migration first

If the user wants a *new* migration applied, create the file before step 2: next number,
descriptive name, e.g. `supabase/migrations/0014_add_widgets.sql`. Match the existing files'
style (plain SQL, a comment header explaining the change, `enable row level security` on new
tables since the app uses the service-role key — see `0005_connections.sql`). Then run
`supabase migration up`.

## Notes

- Never `supabase db push` or `supabase link` here — prod schema changes ship via
  `.github/workflows/deploy.yml` only.
- `supabase status` prints all local URLs/keys (Studio at `54323`, Mailpit at `54324`).
- If `supabase` isn't installed: `brew install supabase/tap/supabase`.
