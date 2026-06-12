# Integration Roadmap

Proposal for the next waves of Calyflow connectors, targeting recruiters, in-house TA teams, and
agency owners. Every candidate below passes the **API-friendly bar** we set when dropping Dripify,
Vincere, and Workday (commit `de73170`): credentials a customer (or their admin) can obtain
themselves — no vendor partnership program, no per-tenant registration with the vendor's
integration team, no ToS-violating scraping.

Auth types use the catalog's `Connector.auth` union (`"oauth" | "apikey"`) so entries can be
copied into `lib/connectors.ts` as-is. "apikey" includes vendor variants like access-key pairs
and client-credentials grants — anything where the customer pastes static credentials instead of
going through a browser redirect.

## 1. Current catalog snapshot

26 entries today (23 live, 3 planning) in `lib/connectors.ts`:

| Category | Live | Planning |
|---|---|---|
| ATS (13) | Ashby, BreezyHR, Greenhouse, JazzHR, Lever, Loxo, Manatal, Recruitee, Recruiterflow, Teamtailor, Workable, Zoho Recruit | Pinpoint |
| CRM (4) | Airtable, HubSpot, Pipedrive, Zoho CRM | — |
| Tools (9) | Apollo, Bright Data, ContactOut, Coresignal, Hunter, Lemlist, Lusha | HireEZ, Instantly |

Notable gap: **no spreadsheet connectors**. Airtable is the closest thing, and it currently sits
in the CRM category.

## 2. Proposed connectors — Tier 1

### 2.1 Spreadsheets (new; highest priority)

Recruiters and agencies run candidate pipelines, BD lists, and client trackers out of
spreadsheets more than out of any single ATS. Both connectors follow the existing Airtable
OAuth/PKCE pattern (`lib/integrations/airtable.ts`: list containers → list tables/sheets → query
rows → render Markdown).

| Connector | Auth | Notes |
|---|---|---|
| **Google Sheets** | `oauth` | Sheets API v4 for values, Drive API (`drive.file` / `spreadsheets.readonly` scopes) for listing files. Reads: spreadsheet list, sheet tabs, ranges/rows. |
| **Microsoft Excel (Office 365)** | `oauth` | Microsoft Graph workbook API (`Files.Read`, `offline_access` scopes). The Azure app registration is Calyflow's own, not per-tenant, so it passes the API-friendly bar. Reads: drive items, worksheets, tables, ranges. |

Suggested blurbs:
- Google Sheets — "Read candidate and client trackers straight from your Google Sheets."
- Microsoft Excel — "Pull pipelines and lists from Excel workbooks in OneDrive and SharePoint."

Category: done — the catalog now has a `data` category holding Airtable (live) plus Google Sheets
and Microsoft Excel as coming-soon entries. Agent pairing: extend the `airtable-research-agent`
pattern into a generic "spreadsheet research agent" that works across all three.

### 2.2 ATS — agency / staffing

| Connector | Auth | Why / API notes | Agent |
|---|---|---|---|
| **Bullhorn** | `oauth` | The dominant agency/staffing ATS; the single biggest ask we can expect from agency owners. Customer admins generate API credentials themselves (Tools → BH Connect → Web Services API) or via a Bullhorn support ticket — self-serve, but flag the extra step in onboarding copy. REST API: candidates, jobs (JobOrder), placements, notes. | `bullhorn-sourcing-agent` |
| **JobAdder** | `oauth` | Strong in ANZ/UK agency market; open developer portal, standard OAuth2. Reads: candidates, jobs, placements. | `jobadder-sourcing-agent` |
| **Crelate** | `apikey` | Popular with US executive-search and boutique agencies. Simple key-based REST API. Reads: contacts, jobs, activities. | `crelate-sourcing-agent` |
| **CATS** | `apikey` | Long-running agency ATS with an open, well-documented REST API. Reads: candidates, jobs, pipelines. | `cats-sourcing-agent` |

### 2.3 ATS — in-house TA

| Connector | Auth | Why / API notes | Agent |
|---|---|---|---|
| **SmartRecruiters** | `apikey` | Mid-market/enterprise TA suite with open API docs; customers create API keys (OAuth also available if we want posting later). Reads: candidates, jobs, applications. | `smartrecruiters-sourcing-agent` |
| **BambooHR** | `apikey` | SMB HRIS with a built-in ATS; ubiquitous in 50–500-employee companies. Per-user API keys. Reads: applicants, job openings, employees. | `bamboohr-sourcing-agent` |
| **Personio** | `apikey` | Leading European SMB HR platform (client-credentials grant — customer pastes client ID/secret). Reads: applications, candidates, positions. | `personio-sourcing-agent` |
| **Pinpoint** (promote from planning) | `apikey` | Already in the catalog as planning; has a customer-creatable API key and a clean JSON:API. Reads: candidates, jobs, applications. | `pinpoint-sourcing-agent` |

### 2.4 CRM

| Connector | Auth | Why / API notes | Agent |
|---|---|---|---|
| **Salesforce** | `oauth` | Table-stakes for agencies selling into enterprise; many staffing firms run BD on Salesforce. Standard OAuth2 + REST/SOQL. Reads: leads, contacts, accounts, opportunities. | extend `bd-prospecting-agent` |
| **Attio** | `oauth` | Fast-growing modern CRM, popular with newer agencies; supports OAuth 2.0 for multi-user apps (workspace API tokens also exist as a fallback). Reads: objects, records, lists. | extend `airtable-research-agent` pattern |
| **Notion** | `oauth` | Widely used as a lightweight recruiting CRM/wiki; public OAuth API. Reads: databases, pages, blocks. | `notion-research-agent` |
| **monday.com** | `apikey` | Common candidate/client tracker in agencies; GraphQL API with personal tokens. Reads: boards, items, columns. | extend spreadsheet/research agent |

### 2.5 Data enrichment

Complements the existing Apollo / Lusha / ContactOut / Hunter / Coresignal set.

| Connector | Auth | Why / API notes |
|---|---|---|
| **People Data Labs** | `apikey` | API-first person/company enrichment at scale; person enrich + search endpoints. |
| **RocketReach** | `apikey` | Large contact database recruiters already pay for; lookup + search endpoints. |
| **SignalHire** | `apikey` | Recruiter-focused contact finder; person enrichment by LinkedIn URL/email. |
| **Snov.io** | `apikey` | Email finder + verifier (client-credentials grant; customer pastes client ID/secret). |
| **Dropcontact** | `apikey` | GDPR-native enrichment, strong in the EU market; batch enrich endpoint. |

Agent pairing: all five plug into the existing `bd-prospecting-agent` multi-tool pattern
(waterfall: cheap lookups first, paid credits last).

### 2.6 Call recording / interview intelligence (new category)

Interview debriefs, client intake calls, and candidate screens are the highest-signal unstructured
data recruiters have. Reads are transcripts + summaries + action items; pair with a shared
`interview-notes-agent` that searches transcripts and files structured notes into Calyflow
documents.

| Connector | Auth | Why / API notes |
|---|---|---|
| **Fireflies.ai** | `apikey` | Very common notetaker in SMB recruiting; open GraphQL API (transcripts, summaries, users). |
| **Zoom** | `oauth` | Cloud recordings + transcript files via OAuth app; the underlying platform for most interviews. |
| **Gong** | `apikey` | Standard in agency BD/sales teams; admins self-serve an access-key pair (Settings → API). Calls, transcripts, stats. |
| **Fathom** | `apikey` | Fast-growing free notetaker; public API + webhooks (meetings, transcripts, summaries, action items). |
| **tl;dv** | `apikey` | Popular in EU; key-based API (meetings, notes/highlights in Markdown, webhooks). Note: API requires their Business plan. |

### 2.7 Outreach

| Connector | Auth | Why / API notes |
|---|---|---|
| **Instantly** (promote from planning) | `apikey` | Already in catalog as planning; API v2 is self-serve (Bearer key from Settings → Integrations → API). Campaigns, leads, analytics. |
| **Smartlead** | `apikey` | Major Instantly alternative for cold email at volume; full REST API. |
| **Reply.io** | `apikey` | Multichannel sequences (email + calls + LinkedIn tasks); key-based API. |
| **Woodpecker** | `apikey` | Cold-email tool popular with EU agencies; key-based API. |

## 3. Tier 2 — worth tracking, not first wave

Tracker RMS and PCRecruiter (agency ATS long tail), Jobvite (API key issued via support),
Folk and Close (CRM long tail), Grain and Avoma (call recording long tail), FullEnrich and
Findymail and Wiza (waterfall/email enrichment long tail).

## 4. Explicit exclusions

Same standards as the `de73170` drops:

- **Partner/tenant-gated** (like Workday, Vincere): iCIMS, SAP SuccessFactors, ZoomInfo, SeekOut,
  BrightHire, **Metaview** — verified June 2026: Metaview's recruiting platform has no public
  developer API, only vendor-managed ATS integrations. Keep Metaview on a watch list; it is the
  most recruiting-native interview-intelligence tool and worth revisiting if an API opens.
- **No public API / ToS risk** (like Dripify): Otter.ai (no self-serve public API),
  LinkedIn-automation tools (Expandi, Waalaxy, etc.) — same account-safety and ToS exposure that
  got Dripify dropped.
- **Sunset/dead**: Clearbit (folded into HubSpot Breeze, closed to new customers), Proxycurl
  (shut down 2025 after the LinkedIn lawsuit).

## 5. Suggested rollout order

1. **Google Sheets + Microsoft Excel** — explicitly requested, immediately useful to every
   segment, and both reuse the proven Airtable OAuth pattern.
2. **Bullhorn + JobAdder** (agency reach) and **SmartRecruiters + BambooHR** (in-house reach) —
   the biggest market-coverage jumps per connector.
3. **Enrichment wave** (People Data Labs, RocketReach, SignalHire, Snov.io, Dropcontact) — all
   key-based, cheap to build against the existing Tools/adapter pattern.
4. **Call recording wave** (Fireflies, Zoom, Gong, Fathom, tl;dv) + the shared
   `interview-notes-agent`.
5. **Outreach wave** (promote Instantly; add Smartlead, Reply.io, Woodpecker) and remaining
   Tier 1 CRMs (Salesforce, Attio, Notion, monday.com).

API access models were spot-checked against vendor docs in June 2026 (Bullhorn, Gong, Fathom,
tl;dv, Instantly v2, Snov.io, Attio, Metaview). Re-verify auth details against current vendor
docs when building each adapter.
