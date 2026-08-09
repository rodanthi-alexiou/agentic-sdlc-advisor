---
title: Agentic SDLC Advisor
description: Audit repository readiness for agent-driven development with GitHub Copilot
---

A GitHub Copilot add-on that scans a repository, scores its readiness for agent-driven
development, and produces a cited, prioritized adoption report — including which pilot use
cases will show value first.

Works on repositories that already have Copilot customization and on ones that have none.

## What you get

| File | What it is |
|---|---|
| `.apm/skills/agentic-sdlc-audit/SKILL.md` | The audit procedure — six phases, read-only |
| `.apm/skills/.../references/best-practices.md` | Per-component best practices, each cited |
| `.apm/skills/.../references/rubric.md` | Five-pillar scored checklist |
| `.apm/skills/.../references/maturity-model.md` | Levels 0–4 with hard advancement gates |
| `.apm/skills/.../references/use-cases.md` | Pilot catalogue, tiered by observed success rate |
| `.apm/skills/.../references/sources.md` | Citation registry — the agent may cite only from here |
| `.apm/skills/.../scripts/scan.sh` | Deterministic inventory, no network, no writes |
| `.apm/skills/.../assets/report-template.md` | Output structure |
| `.apm/skills/.../assets/templates/` | Starter `AGENTS.md`, instructions, setup-steps, issue template |
| `.apm/agents/agentic-sdlc-advisor.agent.md` | Custom agent persona |
| `.apm/prompts/agentic-sdlc-audit.prompt.md` | `/agentic-sdlc-audit` slash command |

Three entry points on one engine — the agent and the prompt both delegate to the skill, so
the logic lives in exactly one place.

## Install

Three options — see [DISTRIBUTION.md](DISTRIBUTION.md) for the full comparison.

**One repo (trial):** the existing `.github/` mirror is preserved, but standalone
distribution remains unsupported until its retention and generation policy are approved.

**Many repos (recommended):** ship as an [APM](https://microsoft.github.io/apm/) package.
Source lives in `.apm/`, and the manifest is `apm.yml`. To test the current prerelease,
install it directly in the repository you want to audit:

```bash
apm install rodanthi-alexiou/agentic-sdlc-advisor#v1.1.0-rc.1 --target copilot
```

To manage it as a pinned dependency, add the following entry to the target repository's
`apm.yml`, then run `apm install`:

```yaml
dependencies:
  apm:
    - rodanthi-alexiou/agentic-sdlc-advisor#v1.1.0-rc.1
```

> [!IMPORTANT]
> `v1.1.0-rc.1` is a prerelease candidate for evaluation. It has passed package and
> cross-platform contract tests, but it has not completed the 12-repository pilot required
> for promotion to the final `v1.1.0` release.

**Without APM:** `apm pack` produces a plugin bundle for plugin-aware hosts.

The default plugin bundle from
[rodanthi-alexiou/agentic-sdlc-advisor](https://github.com/rodanthi-alexiou/agentic-sdlc-advisor)
is the selected release artifact. APM CLI 0.26.0 is the minimum supported version.

Note that APM deploys skills to `.agents/skills/` (the cross-client converged location) and
agents to `.github/agents/`. The skill discovers its own directory at runtime, so both
layouts work.

## Use

**In VS Code / JetBrains chat:**
```
/agentic-sdlc-audit
/agentic-sdlc-audit guardrails only
/agentic-sdlc-audit we already run agent mode, regulated fintech
```

**As an agent:** select `agentic-sdlc-advisor` from the agent picker and ask for an audit.

**Via issue assignment:** open an issue titled *"Audit our agentic SDLC readiness"* and
assign it to Copilot with the custom agent selected. The report comes back as a PR.

**In Copilot CLI:** `copilot -p "Use the agentic-sdlc-audit skill on this repo"`

The skill triggers on natural phrasing too — "are we set up for the coding agent?", "why do
our agent PRs keep failing?", "what should our AGENTS.md say?"

The package exposes equivalent APM dispatch paths through `apm run` and `apm run audit`.
Node.js is the supported shared runtime after validation on Windows, Ubuntu, and macOS.

## Prompting techniques

Start with a broad audit when you want the maturity verdict and the highest-leverage next
steps:

```text
/agentic-sdlc-audit
```

Add known operating context in the same prompt. This reduces `UNVERIFIED` findings and
helps the advisor right-size its recommendations:

```text
/agentic-sdlc-audit Team of 8, Copilot Enterprise, customer-facing but not regulated,
private NuGet feed behind a firewall, coding agent used on test maintenance.
```

Name a focus when one area matters most. The report still includes the overall maturity
level because a strong area cannot compensate for a missing release gate:

```text
/agentic-sdlc-audit Focus on branch protection, required checks, CODEOWNERS, and secret
scanning. Explain which gaps are verified and which require GitHub access.
```

Describe a concrete failure when troubleshooting adoption:

```text
Use the agentic-sdlc-audit skill. Our coding-agent pull requests often fail during setup
because they cannot restore private dependencies. Identify the evidence, likely blocker,
and smallest pilot that can prove the fix.
```

Ask for strict mode when you want a read-only result in chat with no file writes:

```text
Audit this repository in strict mode. Return the compact report in chat and do not write
any files.
```

Approve exact paths when you want durable artifacts. The report and full inventory need
separate approval:

```text
Audit this repository in standard mode. Write the report to
docs/agentic-sdlc-readiness.md and the full inventory to
artifacts/agentic-sdlc-inventory.json. Do not modify any other path.
```

Use follow-up prompts to challenge or operationalize the result without changing the
evidence:

```text
For each UNVERIFIED finding, tell me the minimum access or operator answer needed to
verify it.

Turn the top recommendation into acceptance criteria and a review checklist. Do not
implement it yet.

Compare the three proposed pilots by expected learning value, reviewer effort, and stop
condition.
```

The advisor may ask one grouped question for facts it cannot discover: team size, Copilot
plan, regulated-domain status, firewall state, and prior coding-agent use. You may skip
the question. Missing facts remain `UNVERIFIED`; they are never guessed.

## The output

Standard mode writes only a caller-approved report path and, when separately approved, an
inventory path. Strict mode writes nothing and returns equivalent report content through
chat or stdout. Both modes contain the same findings, scores, citations, warnings, and
unknowns.

The report contains a verdict and single highest-leverage action, repository profile,
per-pillar evidence, at most five recommendations, three ranked pilots, advancement
gates, explicit deferrals, risks, and every unverified check. Raw scanner output is not
included by default.

## Design decisions worth knowing

**Overall level is the minimum pillar score, not the average.** A repo with excellent
context files and no branch protection scores 0, because the failure mode is unreviewed
generated code reaching main. Averaging would hide exactly the thing that matters.

**The agent may only cite from `references/sources.md`.** Fabricated documentation URLs are
the most common way an audit report loses credibility. Entries are marked `VERIFIED` or
`TITLE-ONLY` so the distinction survives into the report.

**Deterministic work emits structured inventory.** The inventory validates against
`schemas/inventory-v1.schema.json`; scoring and rendering consume that model rather than
parsing human-readable scanner output.

**The evidence is presented as mixed, because it is.** The skill explicitly forbids quoting
headline productivity percentages without their counter-evidence. Reports written for
senior engineers get discarded on the first inflated number.

**It tells you what to skip.** Every report includes a *do not do yet* section. Telling a
Level 1 team not to adopt spec-driven development is often the most valuable line in it.

## Limits

* Static inspection plus operator input. It does not read your Copilot metrics, CI history,
  or actual agent session logs — those would sharpen it considerably.
* Branch protection, firewall state, Advanced Security enablement, and plan tier are not
  visible from the filesystem. Supply `gh` auth or answer the questions; otherwise they land
  under *Not verified*.
* Dependency-review readiness is unsupported and remains `UNVERIFIED` in this release.
* The scoring thresholds are a considered opinion, not an industry standard. Adjust
  `rubric.md` to your organization's risk posture.
* This ecosystem changes monthly. Re-verify `sources.md` before treating any citation as
  current.

## License

MIT.
