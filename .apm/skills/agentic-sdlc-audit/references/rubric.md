---
title: Scoring rubric
description: Deterministic pillar checks and evidence requirements for Agentic SDLC audits
---

Score each pillar 0–4. Record **observed evidence** for every line — a file path, a line
count, a setting, or `NOT OBSERVED`. Presence alone is not a pass; read the contents.

**Overall level = the minimum pillar score**, not the mean. Justify in the report.

## Deterministic scoring contract

`scripts/evidence-scoring.mjs` is the executable scoring contract. It consumes normalized
findings only and uses the stable control identifiers below. Each score is cumulative: a
pillar reaches a level only after all preceding level requirements pass. Repeated runs with
the same findings must produce byte-equivalent results regardless of input order.

Scope findings to the scored consumer before evaluating controls. Working-tree and
`local-only` findings do not count for cloud-agent or CI readiness. Head-branch findings
count for code review, but not cloud-agent readiness. Overall maturity is the minimum
pillar score.

Remote guardrail checks use these observables:

| Control identifier | Conclusive positive observation |
|---|---|
| `default-branch-protection` | Effective default-branch rules or legacy protection block direct pushes |
| `required-status-checks` | Effective rules require build, test, and lint checks |
| `required-human-review` | Effective rules require at least one human approval |
| `code-scanning-blocking` | Code scanning is enabled and blocks new high-severity findings |
| `secret-scanning-push-protection` | Secret scanning and push protection are both enabled |

Rulesets are preferred when available because they describe effective rules. Legacy branch
protection remains a valid observable when its endpoint is supported and access is
verified. Code scanning, secret scanning, and push protection remain separate named
security observations even when repository metadata returns them together.

---

## Pillar A — Context

| # | Check | Evidence to record |
|---|---|---|
| A1 | `AGENTS.md` exists at root | path, line count |
| A2 | It contains verified build/test/lint commands | quote the commands; do they match the actual build files? |
| A3 | It states explicit boundaries (what not to touch) | yes/no + quote |
| A4 | It is repo-specific, not generic | judgement + one example of specificity or its absence |
| A5 | Nested `AGENTS.md` where the repo is a monorepo | count, paths |
| A6 | `.github/copilot-instructions.md` exists and is under ~300 lines | path, line count |
| A7 | Instructions do not contradict linter/formatter config | list any conflicts found |
| A8 | Path-scoped `.github/instructions/*.instructions.md` with real globs | count, globs used |
| A9 | Context files updated within the last 90 days | `git log -1` on each |

**0** nothing · **1** one file, generic · **2** accurate root context, unverified commands ·
**3** verified commands, boundaries, recently updated · **4** plus path-scoping matched to
the repo's real structure, and maintained in PRs like code

---

## Pillar B — Reusable assets

| # | Check | Evidence |
|---|---|---|
| B1 | `.github/prompts/*.prompt.md` present for recurring tasks | count, names |
| B2 | `.github/agents/*.agent.md` present with scoped `tools` | count; does any omit `tools` (= all tools)? |
| B3 | `.github/skills/*/SKILL.md` present with trigger-shaped descriptions | count; are descriptions "use when…"? |
| B4 | MCP servers configured, allowlisted, and owned | list servers; secrets inlined anywhere? |
| B5 | Assets are reviewed in PRs, not committed ad hoc | check history of `.github/agents` and `.github/prompts` |

**0** none · **1** ad-hoc personal prompts, uncommitted · **2** a few committed prompts ·
**3** agents or skills with scoped tools and clear triggers · **4** a curated, reviewed,
documented library with named owners

---

## Pillar C — Agent environment

| # | Check | Evidence |
|---|---|---|
| C1 | `.github/workflows/copilot-setup-steps.yml` exists | path |
| C2 | Job is named exactly `copilot-setup-steps` | yes/no — if no, it is silently ignored |
| C3 | File is present on the default branch | branch check — if no, it never triggers |
| C4 | `permissions:` declared and minimal | quote the block |
| C5 | Private registries / package feeds resolved in setup | yes/no |
| C6 | Firewall enabled with an extended allowlist (ask the user) | state + justification if disabled |
| C7 | Build and test run from a single documented command | quote it; did you verify it? |
| C8 | Test suite is green and fast enough to be a feedback loop | CI history if visible |

**0** no setup file, undocumented build · **1** setup file present but misconfigured
(wrong job name, no permissions, not on default branch) · **2** working setup, public deps
only · **3** private deps resolved, firewall allowlisted, one-command build+test ·
**4** plus verified reproducibility and monitored setup-step failures

---

## Pillar D — Guardrails

| # | Check | Evidence |
|---|---|---|
| D1 | Default branch protected; no direct pushes | `gh api …/protection` |
| D2 | Required status checks include build + tests + lint | list them |
| D3 | Required human review on every PR, agents included | reviewer count |
| D4 | CODEOWNERS routes sensitive paths | path, which paths covered |
| D5 | Code scanning enabled and blocking | workflow or setting |
| D6 | Secret scanning + push protection enabled | setting |
| D7 | Dependency review on PRs | workflow |
| D8 | No elevated-permission workflows reachable from agent branches | grep `pull_request_target`, `permissions: write-all` |
| D9 | Hard human gates on auth, secrets, IAM, billing, migrations, customer data | documented? |
| D10 | Agent PRs cannot approve or auto-merge | settings |

**0** any of D1–D3 missing — this caps the whole repo at Level 0 · **2** protection and
review in place, scanning partial · **3** full scanning, CODEOWNERS on sensitive paths ·
**4** plus documented injection posture and least-privilege agent tokens

---

## Pillar E — Process and measurement

| # | Check | Evidence |
|---|---|---|
| E1 | Issue templates require problem, acceptance criteria, scope boundary | template fields |
| E2 | Work is decomposed into agent-sized units | median issue size / recent examples |
| E3 | PR template prompts reviewers to check the diff, not the summary | yes/no |
| E4 | Architectural decisions recorded (ADRs) | directory |
| E5 | Review capacity is known and tracked | PR wait time, reviewer count |
| E6 | Baseline metrics captured before agent rollout | DORA four keys, or none |
| E7 | Copilot usage metrics reviewed on a cadence | who, how often |
| E8 | Spec-driven development in use where warranted | `.specify/`, `specs/` |

**0** no templates, no metrics · **1** templates exist but optional fields · **2** required
fields, some baseline · **3** decomposition practised, review capacity tracked, baseline
captured · **4** plus spec-driven flow and a regular metrics review that has changed a
decision

---

## Weighting for the recommendation order

Rank recommendations by **(impact × confidence) ÷ effort**.

| Recommendation class | Impact | Effort | Notes |
|---|---|---|---|
| Missing branch protection / required review | 5 | 1 | Always first. Non-negotiable. |
| Broken or missing `copilot-setup-steps.yml` | 5 | 2 | Largest observed lever on agent success. |
| Missing or generic `AGENTS.md` | 4 | 2 | High leverage, low cost, benefits every agent. |
| Undocumented build/test command | 5 | 2 | Without it nothing else works. |
| Firewall disabled without justification | 4 | 1 | Exfiltration risk. |
| Missing issue template fields | 3 | 1 | Directly gates async delegation quality. |
| Path-scoped instructions | 3 | 3 | Only worthwhile above a size threshold. |
| Custom agents / skills library | 3 | 3 | After context and guardrails, not before. |
| Spec-driven development | 4 | 5 | Level 3+ only. Premature below that. |
| Multi-agent orchestration | 3 | 5 | Level 4. Almost never the right first move. |
