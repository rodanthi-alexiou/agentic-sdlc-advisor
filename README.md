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
Source lives in `.apm/`, the manifest is `apm.yml`. Consumers add
`rodanthi-alexiou/agentic-sdlc-advisor#v1.0.0` to their dependencies and run
`apm install`.

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

## The output

A report at `agentic-sdlc-report.md`: verdict and single highest-leverage action, repo
profile, per-pillar findings with evidence, at most five recommendations ordered by
leverage, three ranked pilot use cases with named reviewers and stop conditions, the gates
blocking the next level, an explicit *do not do yet* list, risks, and everything it could
not verify.

## Design decisions worth knowing

**Overall level is the minimum pillar score, not the average.** A repo with excellent
context files and no branch protection scores 0, because the failure mode is unreviewed
generated code reaching main. Averaging would hide exactly the thing that matters.

**The agent may only cite from `references/sources.md`.** Fabricated documentation URLs are
the most common way an audit report loses credibility. Entries are marked `VERIFIED` or
`TITLE-ONLY` so the distinction survives into the report.

**Deterministic work lives in `scan.sh`.** Asking a model to enumerate files is slower and
less reliable than a shell script. The model does judgement; the script does inventory.

**The evidence is presented as mixed, because it is.** The skill explicitly forbids quoting
headline productivity percentages without their counter-evidence. Reports written for
senior engineers get discarded on the first inflated number.

**It tells you what to skip.** Every report includes a *do not do yet* section. Telling a
Level 1 team not to adopt spec-driven development is often the most valuable line in it.

## Limits

- Static inspection plus operator input. It does not read your Copilot metrics, CI history,
  or actual agent session logs — those would sharpen it considerably.
- Branch protection, firewall state, Advanced Security enablement, and plan tier are not
  visible from the filesystem. Supply `gh` auth or answer the questions; otherwise they land
  under *Not verified*.
- The scoring thresholds are a considered opinion, not an industry standard. Adjust
  `rubric.md` to your organization's risk posture.
- This ecosystem changes monthly. Re-verify `sources.md` before treating any citation as
  current.

## License

MIT.
