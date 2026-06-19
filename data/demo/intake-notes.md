# Intake call notes — Senior Backend Engineer (Platform)

**Client:** Northwind (Series B fintech, payment infrastructure)
**Hiring manager:** Dana Okonkwo, Engineering Manager — Platform
**Call date:** intake kickoff · **Recruiter:** you

## Why this role is open
The Platform team owns the services that move money for thousands of
marketplaces. They've grown to four engineers and the ledger/settlement load has
outgrown the team. Dana needs a senior who can own services end to end and take
on-call, not someone who needs hand-holding. One previous hire fell through at
offer stage (counter-offer), so there's urgency — Dana wants a shortlist within
two weeks.

## The team & context
- 4 engineers today (2 senior, 2 mid). This hire would be the 3rd senior.
- Stack: Go services, PostgreSQL, Kubernetes on GCP, Kafka for events, Terraform.
- On-call rotation is 1-in-4; the new hire joins the rotation after ~6 weeks.
- Biggest current pain: settlement pipeline latency spikes and a ledger that's
  hard to evolve safely. They want someone who has *operated* systems like this.

## Must-haves (Dana's words)
- "Has actually run services in production and been on the pager for them."
- Deep PostgreSQL — schema design and query optimisation, not just ORM usage.
- Real Kubernetes operational experience (debugging, scaling), not just `kubectl apply`.
- Distributed-systems judgement: idempotency, retries, consistency trade-offs.

## Nice-to-haves
- Payments / ledger / double-entry accounting domain.
- Mentoring — they'll inherit one mid-level engineer to grow.
- Event-driven architecture experience (Kafka or similar).

## Dealbreakers / watch-outs
- Pure feature-team backgrounds with no ops/on-call ownership.
- Job-hoppers (Dana flagged sub-12-month stints as a concern, wants context).
- Title inflation — "senior" at a 10-person startup ≠ scale they need.

## Process & logistics
- Comp band: competitive Series-B equity + salary (Dana to confirm exact band).
- Remote, UK/EU time zones. Async-friendly but expects overlap hours.
- Loop: recruiter screen → HM call with Dana → system-design → take-home review → team.
- Move fast: counter-offers are the real competition. Keep candidates warm.

## Screening priorities for the first call
Depth of production Kubernetes, evidence of *owning* services (not just
contributing), PostgreSQL depth, and distributed-systems maturity. Payments is a
strong plus, not a blocker. Probe tenure context for any short stints.
