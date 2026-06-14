# Calyflow — Security Audit

_Date: 2026-06-14 · Scope: full application (hosted multi-workspace + self-host single-workspace)_

## Summary

The codebase has a **strong baseline security posture**. The review found **no SQL injection,
no IDOR, no XSS, no command injection, and no committed secrets**. The issues identified are
**hardening gaps** (missing transport/anti-clickjacking headers, no rate limiting, an
unauthenticated-by-default self-host sign-in). High-severity items have been fixed in this pass;
lower-severity items are documented below as recommendations.

## Methodology

Static review of authn/authz, the data layer, input handling/injection surfaces, secrets &
configuration, dependencies, third-party integrations, and CI/CD. Runtime checks confirmed the
new security headers and the auth gating on `/api/download` and `/api/cron`.

## Verified strong controls (no change needed)

- **Tenant isolation** — every read/write is scoped by `workspace_id` resolved from the *session*,
  never from the client (`lib/queries.ts`). Nested resources are scoped through joins
  (run → project → client → workspace). No IDOR found.
- **No SQL injection** — all DB access goes through the Supabase query builder / parameterised RPCs
  (`db().rpc(...)`); no string-built SQL anywhere.
- **No XSS / eval / shell exec** — no `dangerouslySetInnerHTML`, `eval`, `new Function`, or child-process use.
- **Centralised auth at the edge** — `proxy.ts` (Next 16's renamed middleware) protects all routes
  except an explicit public allow-list (`/sign-in`, `/api/health`, `/api/cron`, `/api/webhooks`,
  `/api/v1/*`). Server handlers re-check via `getSession()`/`requireSession()`/`requireAdmin()`.
- **OAuth connectors** — PKCE + signed-state httpOnly cookies on all 10+ connectors; tokens stored
  AES-256-GCM encrypted at rest (`lib/crypto.ts`).
- **Webhook authenticity** — Clerk webhook verified with Svix signatures (`/api/webhooks/clerk`).
- **SSRF guard** — domain-import scraping is constrained to the target domain (`hostIsWithinDomain`);
  URL imports restricted to http(s).
- **Uploads** — sanitised, UUID-prefixed, workspace-scoped storage paths; 20 MB cap; control-char stripping.
- **Infra** — non-root Docker image; CI uses Workload Identity Federation with a quality gate before
  secrets are exposed.

## Corrections to the initial automated scan

- **"Committed secrets" — FALSE POSITIVE.** `.env.local` is gitignored, **untracked**, and **absent
  from git history**; `.env.example` holds only placeholders. The real keys exist only in the local
  dev checkout. (Still: rotate them if that checkout was ever shared — see Low findings.)
- **"No middleware" — INCORRECT.** There *is* centralized route protection in `proxy.ts`. The scan
  looked for `middleware.ts`; Next 16 renames it to `proxy.ts`.

## Findings

### High severity — fixed in this pass

| # | Finding | File(s) | Fix |
|---|---------|---------|-----|
| H1 | **Self-host sign-in unauthenticated + admin-by-email.** Single-workspace mode accepted any well-formed email and granted admin to any `ADMIN_EMAILS` address — anyone reaching an exposed instance could become admin. | `lib/actions/auth.ts`, `lib/env.ts`, sign-in page | Added optional `SINGLE_WORKSPACE_PASSWORD` gate (constant-time compare) + IP rate limit (5/min). Default dev behaviour unchanged. |
| H2 | **No security headers.** No CSP, HSTS, anti-clickjacking, MIME-sniff, or referrer/permissions policy. | `next.config.ts` | Added `headers()` for all routes: CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. |
| H3 | **`/api/download` unbounded.** Ran server-side docx generation on arbitrary input. (Proxy gated auth, but no size limit → CPU/memory DoS.) | `app/api/download/route.ts` | Explicit `getSession()` 401, 1 MB input cap (413), and per-workspace rate limit (30/min). |
| H4 | **No rate limiting anywhere.** Notably sign-in (brute force) and `/api/download`. | new `lib/ratelimit.ts`, migration `0013_rate_limits.sql` | Postgres-backed fixed-window limiter (atomic RPC, works across Cloud Run instances) with in-memory dev fallback. Applied to sign-in + download. |

### Quick win — fixed

| # | Finding | File | Fix |
|---|---------|------|-----|
| Q1 | Cron bearer token compared with `!==` (timing side-channel). | `app/api/cron/sync-models/route.ts` | `timingSafeEqual` length-guarded compare. |

### Medium / Low — documented, not changed

- **M1 — Shared key for encryption and cookie signing.** `lib/crypto.ts` `key()` feeds both AES-GCM
  and the HMAC `sign/verify`. Not exploitable, but derive per-purpose subkeys (HKDF) for defense in depth.
- **M2 — Upload type trusts extension, not magic bytes** (`lib/extract.ts`). Add content sniffing.
- **L1 — Error-message leakage.** A few routes (e.g. domain import) return raw `error.message`;
  prefer generic messages with server-side logging.
- **L2 — Permissive CORS (`*`) on `/api/v1/*`.** Acceptable (public marketing catalog, no sensitive
  data) — documented as intentional.
- **L3 — Rotate local dev secrets** in `.env.local` if that checkout was ever shared. No repo leak.
- **L4 — `claude.yml` CI** runs with `id-token: write` on PR events; confirm it's restricted to trusted actors.

## Notes on the CSP

The shipped CSP is deliberately conservative: `script-src`/`style-src`/`connect-src` stay permissive
(`'unsafe-inline'`, `https:`) so Clerk and Supabase keep working, while `frame-ancestors`,
`object-src`, and `base-uri` are hard-locked (the high-value anti-clickjacking / anti-injection
directives). Follow-up: tighten `script-src` to nonces once Clerk's required origins are pinned.

## Verification performed

- `tsc --noEmit`, `eslint`, and `npm test` (174 tests) all pass; `npm run build` succeeds.
- Runtime: confirmed all six security headers present on `/sign-in`, `/api/health`, and other routes.
- `/api/cron/sync-models` returns 401 with a wrong/absent bearer token.
- `/api/download` is not reachable unauthenticated (proxy redirect + handler 401).
