---
name: agentic-sdlc-audit
description: Audit this repo's agentic SDLC readiness and produce a cited adoption report with pilot use cases.
argument-hint: 'Optional focus, e.g. "guardrails only", "we use agent mode already", "regulated"'
agent: agentic-sdlc-advisor
---

Audit this repository for agent-driven development readiness with GitHub Copilot and
produce an implementation report.

Follow the `agentic-sdlc-audit` skill. Depending on how it was installed it lives at
`.agents/skills/agentic-sdlc-audit/`, `.github/skills/agentic-sdlc-audit/`, or under
`apm_modules/`. Locate it, read `SKILL.md`, and follow it. Work read-only — inspect and
report, change nothing.

If the user supplied a focus argument, honour it: narrow the audit to that area but still
report the overall level, because a strong pillar cannot compensate for a missing gate.

Steps:

1. Run the skill's `scripts/scan.sh` for the inventory.
2. Profile the repository per Phase 2 of the skill.
3. Score the five pillars against
   the skill\'s `references/rubric.md`, recording
   observed evidence for every line.
4. Determine the level and the blocking gates from
   the skill\'s `references/maturity-model.md`.
5. Select three ranked pilots from
   the skill\'s `references/use-cases.md`,
   naming real issues from this repo where they exist.
6. Write the report to `agentic-sdlc-report.md` using
   the skill\'s `assets/report-template.md`,
   citing only from
   the skill\'s `references/sources.md`.

Before writing, ask the user only for what the filesystem cannot tell you — team size,
Copilot plan, regulated domain, firewall state, whether the coding agent has been used
yet. Ask once, in a single message, and proceed with `UNVERIFIED` markers if they do not
answer.

Do not recommend more than five actions. Order them by leverage, not by pillar.
