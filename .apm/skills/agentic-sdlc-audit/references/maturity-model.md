---
title: Maturity model and advancement gates
description: Agentic SDLC maturity levels with stable executable advancement gates
---

Five levels. A team is at the level whose gates it has **all** passed. Skipping levels is
the most common and most expensive mistake — it produces agent output volume without the
review capacity or guardrails to absorb it.

---

## Level 0 — Unprepared

**Looks like:** Copilot licences issued, no repo configuration, no branch protection, build
steps living in people's heads.

**Risk:** generated code reaching main unreviewed; agents failing for environmental reasons
and the team concluding "the technology does not work".

**Gate to Level 1** — all required:
- [ ] `default-branch-protection`: Default branch protected; direct pushes blocked
- [ ] `required-human-review`: Required human review on every PR
- [ ] `build-command-verified` and `test-feedback-loop`: Build, test, and lint runnable
      from documented single commands, verified by someone
- [ ] `secret-scanning-push-protection`: Secret scanning with push protection enabled

---

## Level 1 — Assisted (inline + chat)

**Looks like:** developers using completion and chat in the IDE. Value is real but bounded
by the individual.

**Assets:** `AGENTS.md` with verified commands and boundaries;
`.github/copilot-instructions.md` consistent with the linter.

**Gate to Level 2** — all required:
- [ ] `root-agents` and `context-commands-verified`: `AGENTS.md` present, repo-specific,
      commands verified by execution
- [ ] `context-maintained`: Instruction files reviewed in PRs and updated within 90 days
- [ ] `code-scanning-blocking`: Code scanning enabled and blocking on new high-severity
      findings
- [ ] `codeowners-sensitive-paths`: CODEOWNERS routing sensitive paths
- [ ] `context-maintained`: A named owner for the context files

---

## Level 2 — Supervised agents (agent mode, synchronous)

**Looks like:** engineers running multi-file changes in agent mode with a human watching
every step. Refactors, test backfill, migration scaffolding.

**Assets:** path-scoped instructions for large repos; a small committed prompt library;
first custom agent for a recurring role such as review or test authoring.

**Gate to Level 3** — all required:
- [ ] `copilot-setup-valid`: `copilot-setup-steps.yml` present, correctly named job, on the default branch,
      minimal `permissions`, and manually run once to prove it works
- [ ] `private-dependencies-resolve`: Private dependencies resolve inside the agent environment
- [ ] `agent-firewall`: Firewall enabled with an explicit allowlist, or disabling justified in writing
- [ ] `issue-templates`: Issue template with required problem, acceptance criteria, and out-of-scope fields
- [ ] `baseline-metrics`: Baseline metrics captured, including DORA four keys and current PR review wait time
- [ ] `review-capacity`: Review capacity assessed: who reviews agent PRs, and how many per week can they
      absorb?

---

## Level 3 — Delegated agents (cloud agent, asynchronous)

**Looks like:** issues assigned to Copilot; PRs arrive for review. The team's constraint
shifts from authoring to reviewing.

**Assets:** committed skills for repeatable procedures; MCP servers where genuinely needed,
allowlisted and owned; decomposition of epics into agent-sized sub-issues.

**Watch for the review bottleneck.** This is where adoption fails. One person can generate
PRs faster than a team can review them; the generator feels productive while reviewers
drown. Track PR wait time as the leading indicator and throttle before it degrades.

**Gate to Level 4** — all required:
- [ ] `agent-pr-merge-rate`: Agent PR merge rate stable and comparable to human PRs over at least 30 PRs
- [ ] `agent-pr-revert-rate`: Revert rate on agent PRs no worse than on human PRs
- [ ] `review-wait-time-stable`: Review wait time flat or improving since Level 3 began; if it is climbing, stop and
      fix review capacity before scaling
- [ ] `prompt-injection-posture`: Documented prompt-injection posture; agent tokens least-privilege
- [ ] `metrics-review-changed-decision`: At least one metrics review has changed a decision

---

## Level 4 — Orchestrated

**Looks like:** spec-driven flow with review at the spec and plan checkpoints; parallel
agents on independent work; specialized agents by role; engineers operating as reviewers
and orchestrators.

**Assets:** spec-driven development in the repo; multiple role-scoped custom agents;
AI-assisted review to relieve the human bottleneck.

**Conditions that mean you should step back down a level:**
- Change-failure rate rising
- Review wait time rising
- Reviewers approving without reading diffs
- Architectural coherence degrading — inconsistent patterns appearing across agent PRs

---

## Do not do yet — by level

Include this in every report. Telling a team what to skip is as valuable as telling them
what to build.

| At level | Do not yet invest in |
|---|---|
| 0 | Any Copilot customization at all. Fix protection and the build first — configuration on an unprotected repo increases risk. |
| 1 | Custom agents, skills, MCP servers, spec-driven development. Get `AGENTS.md` accurate first; it benefits every later step. |
| 2 | Async delegation at volume, agent fan-out, multi-agent orchestration. The environment is not proven yet. |
| 3 | Parallel fan-out beyond review capacity, spec-driven rollout across all teams. Prove the loop on one team first. |
| 4 | Treating any of it as finished. Context files decay; re-audit quarterly. |

---

## Sizing the recommendation to the organization

| Signal | Adjustment |
|---|---|
| Regulated domain (finance, health, public sector) | Pillar D gates are hard blockers; require written injection posture at Level 2, not Level 3 |
| Monorepo | Nested `AGENTS.md` and path-scoped instructions move from Level 2 to Level 1 |
| Fewer than 5 active committers | Cap the realistic target at Level 3; orchestration overhead exceeds the benefit |
| No test suite | Every level slips by one. Tests are the agent's feedback loop; without them delegation is guesswork |
| Legacy codebase, low test coverage, high churn | Start pilots in the *seams* — new modules, test backfill, tooling — not in the core |
