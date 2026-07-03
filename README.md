# TAO OS — Talent Acquisition Open OS

An open-source, fully self-hostable recruiting platform: AI agents,
sourcing workflows, and compliance guardrails for technical talent
acquisition — built by a recruiter, for recruiters.

> **Attribution:** TAO OS is an independent derivative of
> [Calyflow](https://github.com/Calyflow/calyflow-app) by Michal Juhas,
> licensed under [AGPL-3.0](LICENSE). Key modifications planned and in
> progress: LiteLLM/OpenRouter provider layer, Clerk-free authentication,
> a hands-off list compliance gate, and an extended workflow library
> covering the post-submittal hiring lifecycle.

## Status

Early days — freshly forked. Roadmap:

- [ ] Rebrand user-facing UI to TAO OS
- [ ] LiteLLM + OpenRouter as first-class LLM providers
- [ ] Hands-off list compliance gate (code-enforced, not prompt-enforced)
- [ ] Leadership Sourcer agent (GitHub-signal → company pivot → public-voice)
- [ ] Original workflow library: screening, debriefs, offers, pipeline health

## Running locally

See [RUN.md](RUN.md) — upstream's local setup (Docker + local Supabase)
works unchanged.

## License

AGPL-3.0. Upstream copyright © Michal Juhas / Calyflow contributors;
modifications © Kyle Byrd (confoundedkyle).
