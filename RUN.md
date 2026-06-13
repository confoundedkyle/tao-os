# Run Calyflow locally

Three commands, from the project root:

```bash
colima start     # if Docker isn't running (e.g. after a reboot)
supabase start   # boot the local Supabase stack (data persists across stop/start)
npm run dev      # start the app — it talks to your local Supabase
```

Then open http://localhost:3000 and sign in as `michal@michaljuhas.com`
(single-workspace mode — no password).

## Handy

- **Studio** (browse the local DB): http://127.0.0.1:54323
- **Mailpit** (catches outgoing emails): http://127.0.0.1:54324
- Stop when done: `supabase stop` (keeps data) · `colima stop` (frees RAM/CPU)
- Re-seed library data after a wipe: `npm run seed`
- Switch back to production keys: `cp .env.local.prod.bak .env.local`
