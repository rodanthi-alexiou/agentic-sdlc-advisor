---
title: Agentic SDLC Advisor Distribution
description: Package ownership, release artifacts, and consumer installation paths
---

## Distribution boundaries

The repository has three distinct package surfaces:

- `.apm/` is the authoritative, reviewed package source. Make product changes only in
   this tree.
- The default `apm pack` plugin bundle is the selected release artifact. Release
   validation must use the default plugin format, not the legacy `--format apm` format.
- `.github/` is an existing standalone mirror with deferred disposition. Preserve it
   unchanged without treating it as source or supported release output.

The approved publisher and release repository are
`rodanthi-alexiou/agentic-sdlc-advisor`. APM CLI 0.26.0 is the minimum supported version
for package validation and release.

## Distribution options

Three options. They are not alternatives — they stack. Pick based on **how many
repositories** need this, not on which sounds more sophisticated.

| Option | Right when | Cost |
|---|---|---|
| A · Copy `.github/` into one repo | You are trialling it on a single repo | Zero setup, drifts the moment there is a second repo |
| B · APM package | Several repos or teams need it, versioned | Requires the `apm` CLI, one manifest |
| C · `apm pack` → plugin bundle | Consumers should not need APM | One extra command at release time |

**For your case** — auditing agentic-SDLC readiness across an enterprise's repositories —
option B is the right answer, and it is not a close call. The add-on is inherently
multi-repo: its whole purpose is to be pointed at many codebases. Copying `.github/`
around is exactly the drift problem it exists to diagnose. Ship it as a package, and use
option C at release so teams that have not adopted APM can still consume it.

---

## Option A — Standalone mirror decision pending

The existing `.github/` tree is preserved for compatibility, but it has no approved
source-to-artifact generation command or drift check. Do not edit it directly or publish
it as a supported standalone release until its retention or retirement is decided.

---

## Option B — APM package (recommended)

APM is Microsoft's dependency manager for agent configuration: one `apm.yml` declares the
skills, prompts, agents, instructions, and MCP servers a project needs, `apm install`
deploys them, and `apm.lock.yaml` pins the resolved tree with content hashes so a fresh
clone reproduces the same setup byte-for-byte.

### Layout

This repository contains both trees, but only one is authoritative:

```
agentic-sdlc-advisor/
├── apm.yml                  # the manifest
├── .apm/                    # SOURCE — what you edit
│   ├── skills/agentic-sdlc-audit/
│   ├── agents/agentic-sdlc-advisor.agent.md
│   └── prompts/agentic-sdlc-audit.prompt.md
└── .github/                 # PRESERVED MIRROR — disposition pending
```

`.apm/` is authoritative when present. Edit there. APM deployment output and the
standalone `.github/` mirror are consumer artifacts, not product source.

### Publish

Publish versioned releases from
[rodanthi-alexiou/agentic-sdlc-advisor](https://github.com/rodanthi-alexiou/agentic-sdlc-advisor)
using the publisher identity declared in `apm.yml`.

### Consume

In any repository that should be auditable, add to its `apm.yml`:

```yaml
dependencies:
  apm:
      - rodanthi-alexiou/agentic-sdlc-advisor#v1.0.0    # pin the tag
```

Then:

```bash
apm install
```

Or install directly without editing a manifest:

```bash
apm install rodanthi-alexiou/agentic-sdlc-advisor#v1.0.0 --target copilot
```

### Where things land — read this before debugging

APM splits primitives by whether they are runtime-specific:

| Primitive | Deploys to | Why |
|---|---|---|
| Agents | `.github/agents/` | Runtime-specific — Copilot's directory |
| Skills | `.agents/skills/` | Cross-client converged location per the agentskills.io standard, read by Copilot, Cursor, OpenCode, Codex, Gemini, Windsurf |
| Prompts | Copilot's native prompt directory | |

Claude Code, Grok Build, and Kiro are exceptions and read `.claude/skills/`,
`.grok/skills/`, `.kiro/skills/` respectively.

**This is why the skill no longer hardcodes `.github/skills/`.** Version 1.0.0 discovers
its own directory at runtime, so it works from `.agents/skills/`, `.github/skills/`, or
`apm_modules/`. If you need the older per-client layout, pass `--legacy-skill-paths` or set
`APM_LEGACY_SKILL_PATHS=1`.

`apm install` adds `apm_modules/` to `.gitignore` automatically. Commit `apm.yml`,
`apm.lock.yaml`, and the deployed directories so teammates and CI get an identical setup
from `git pull && apm install`.

### Enterprise controls worth knowing

APM has an explicit governance layer, which matters if you are rolling this across an org:

- **Policy files** — declare what packages an org will allow; `apm audit` scans
  dependencies for violations before they ship.
- **Drift detection** — catches repos whose deployed config no longer matches the lockfile.
- **CI enforcement** and **GitHub rulesets** integration.
- **Registry proxy** for air-gapped or restricted-network environments.
- Installs from GitHub, GitHub Enterprise, GitLab, Bitbucket, Azure DevOps, Gitea, or any
  git host.

If you are the platform team standardizing agent configuration, that governance layer is
the actual reason to choose APM over copying files — more than the convenience.

---

## Option C — Plugin bundle

The default plugin bundle is the selected release artifact for consumers who should not
need APM installed:

```bash
apm pack
```

Produces a plugin-native bundle — a synthesized `plugin.json` plus `agents/` and `skills/`
in convention directories, with no `apm.yml`, `.apm/`, or `apm_modules/`. Attach it to a
GitHub release. Plugin-aware hosts including Copilot CLI can consume it directly.

Validate the package boundary before release:

```powershell
./tools/Test-PackageBoundary.ps1
```

The check runs `apm compile --validate`, previews the default plugin bundle, and rejects
missing or unexpected release files. It does not validate or synchronize `.github/`.

If you know from the start you want to ship a plugin, scaffold with
`apm plugin init agentic-sdlc-advisor`, which writes `plugin.json` alongside `apm.yml`
from day one.

---

## Should you publish to a marketplace?

`awesome-copilot` is GitHub's community-curated library of agents, instructions, skills,
prompts, and plugins, pre-registered as the default marketplace in Copilot CLI and VS Code.
APM can pull from it (`apm marketplace add github/awesome-copilot`).

Publishing there is worth considering **after** you have run the audit against a dozen real
repositories and tuned the rubric thresholds. The scoring in `references/rubric.md` is a
considered opinion, not an industry standard; publishing it before it has met real
codebases would be premature. Run it internally first, adjust, then decide.

For internal-only distribution, a private repo as an APM dependency is sufficient and needs
no marketplace at all.

---

## Recommended sequence

1. **Trial** — option A on one repository you know well. Does the verdict match your
   intuition? If not, fix the rubric before distributing.
2. **Tune** — adjust `references/rubric.md` thresholds to your risk posture, and re-verify
   `references/sources.md` (the `TITLE-ONLY` entries especially).
3. **Package** — option B, tagged `v1.0.0`, in an internal repo.
4. **Pilot** — three teams, pinned to the tag.
5. **Govern** — add an APM policy file and CI drift detection once more than a handful of
   repos depend on it.
6. **Release** — `apm pack` for teams outside APM; consider a marketplace only after the
   rubric has earned it.

---

## Sources

- APM documentation — https://microsoft.github.io/apm/
- APM repository — https://github.com/microsoft/apm
- First package guide — https://microsoft.github.io/apm/getting-started/first-package/
- Manifest schema — https://microsoft.github.io/apm/reference/manifest-schema/
- Targets matrix — https://microsoft.github.io/apm/reference/targets-matrix/
- Policy reference — https://microsoft.github.io/apm/enterprise/policy-reference/
- Sample package — https://github.com/microsoft/apm-sample-package
- GitHub Docs, custom agents — https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents
- GitHub Docs, agent skills — https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- github/awesome-copilot — https://github.com/github/awesome-copilot
