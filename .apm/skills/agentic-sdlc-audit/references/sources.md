# Source registry

**Rule: cite only from this list.** Do not construct URLs from memory or by editing paths.
If a needed source is not here, either fetch and verify it first, or write the claim
without a link and mark it `UNVERIFIED`.

Each entry carries a verification status:
- `VERIFIED` — URL confirmed reachable and matching the described content during authoring.
- `TITLE-ONLY` — the document exists and the title is accurate, but the deep URL was not
  confirmed. Cite by publisher + title and link the stable entry point.

Re-verify before relying on any of these; this ecosystem changes monthly.

---

## Primary documentation

| ID | Source | URL | Status |
|---|---|---|---|
| S1 | AGENTS.md — the open standard | https://agents.md/ | VERIFIED |
| S2 | GitHub Blog — *How to write a great agents.md: Lessons from over 2,500 repositories* | https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/ | VERIFIED |
| S3 | openai/agents.md — spec repository | https://github.com/openai/agents.md | TITLE-ONLY |
| S4 | VS Code docs — customizing chat responses (instructions files) | https://code.visualstudio.com/docs/copilot/customization/custom-instructions | TITLE-ONLY |
| S5 | VS Code docs — *Use prompt files in VS Code* | https://code.visualstudio.com/docs/agent-customization/prompt-files | VERIFIED |
| S6 | GitHub Docs — *About custom agents* | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents | VERIFIED |
| S7 | GitHub Docs — *Creating custom agents for Copilot cloud agent* | https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents | VERIFIED |
| S8 | VS Code docs — *Custom agents in VS Code* | https://code.visualstudio.com/docs/agent-customization/custom-agents | VERIFIED |
| S9 | GitHub Docs — *Custom agents configuration* (frontmatter + MCP reference) | https://docs.github.com/en/copilot/reference/custom-agents-configuration | VERIFIED |
| S10 | GitHub Docs — *About agent skills* | https://docs.github.com/en/copilot/concepts/agents/about-agent-skills | VERIFIED |
| S11 | GitHub Docs — *Adding agent skills for GitHub Copilot* | https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills | VERIFIED |
| S12 | github/awesome-copilot — skills catalogue | https://github.com/github/awesome-copilot/blob/main/docs/README.skills.md | VERIFIED |
| S13 | GitHub Docs — *Customizing or disabling the firewall for GitHub Copilot cloud agent* | https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/customize-the-agent-firewall | VERIFIED |
| S15 | GitHub Docs — *Customizing the development environment* (`copilot-setup-steps.yml`) | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment | VERIFIED |
| S16 | github/docs source — customize-the-agent-environment.md / customize-the-agent-firewall.md | https://github.com/github/docs/blob/main/content/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment.md | VERIFIED |
| S18 | GitHub Docs — Copilot cloud agent, repository configuration and security | https://docs.github.com/en/copilot | TITLE-ONLY |
| S19 | GitHub Docs — *Best practices for using GitHub Copilot to work on tasks* | https://docs.github.com/en/copilot | TITLE-ONLY |
| S25 | github/awesome-copilot — community instructions, agents, skills, prompts | https://github.com/github/awesome-copilot | VERIFIED |
| S26 | GitHub Docs — Copilot usage metrics | https://docs.github.com/en/copilot/concepts/copilot-usage-metrics/copilot-metrics | VERIFIED |

## Tooling

| ID | Source | URL | Status |
|---|---|---|---|
| S20 | github/spec-kit — spec-driven development toolkit | https://github.com/github/spec-kit | VERIFIED |
| S27 | modelcontextprotocol/servers — reference MCP servers | https://github.com/modelcontextprotocol/servers | TITLE-ONLY |
| S28 | github/copilot-cli-for-beginners | https://github.com/github/copilot-cli-for-beginners | VERIFIED |

## Evidence — cite these when making productivity claims

Treat this section as mandatory reading before writing the "expected value" part of any
report. The evidence is mixed and a report that presents only the optimistic side is not
credible to a senior engineering audience.

| ID | Source | URL | Status | What it actually says |
|---|---|---|---|---|
| S21 | METR — *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity* | https://arxiv.org/abs/2507.09089 | TITLE-ONLY | RCT, 16 experienced OSS developers, 246 real tasks in repos they knew well. Developers forecast ~24% speedup and afterwards estimated ~20% speedup; measured result was ~19% *slower*. METR frames it as a snapshot of early-2025 tooling, not a permanent verdict. |
| S22 | DORA — *State of AI-assisted Software Development* (2025) | https://dora.dev/research/ | TITLE-ONLY | AI acts as an amplifier of existing organizational strengths and dysfunctions; adoption is near-universal; trust is partial. Delivery outcomes depend on the surrounding system, not the tool. |
| S23 | Stack Overflow Developer Survey 2025 | https://survey.stackoverflow.co/2025/ | TITLE-ONLY | Usage high and rising; trust falling. The most-cited frustration is output that is almost right but not quite, with most respondents reporting time spent correcting it. |
| S24 | Microsoft DevBlogs — *Ten Months with Copilot Coding Agent in dotnet/runtime* | https://devblogs.microsoft.com/dotnet/ | TITLE-ONLY | Longitudinal single-org case study. Success rate rose from ~41.7% in month one to ~71%, attributed to repository preparation (instructions + setup steps + firewall allowlist), not model changes. Success varies sharply by task type: cleanup and test work highest, performance work lowest. Directional, not a benchmark — self-selected tasks, one ecosystem. |
| S14 | Trail of Bits — research on prompt injection against GitHub Copilot coding agent | https://blog.trailofbits.com/ | TITLE-ONLY | Demonstrated that a crafted GitHub issue could induce the coding agent to introduce malicious code. Establishes issue and comment content as an untrusted input channel. |
| S17 | (see S24) | — | — | Same case study; cited separately where change-size and task-type findings are used. |

### How to represent the evidence in a report

Do write: "Reported success rates for agent-authored PRs in one large public codebase rose
from roughly 42% to 71% after the repository was prepared with instructions and setup
steps [S24]. That is a single organization in one ecosystem and should be treated as
directional."

Do not write: "Copilot makes teams 55% faster." Single-task vendor benchmarks do not
generalize to enterprise codebases, and a senior audience will discount the whole report
on that sentence.

Always pair an optimistic figure with [S21] or [S22]. The defensible summary is: gains are
real but modest and highly dependent on preparation, task type, and review capacity; the
perception of speedup systematically exceeds the measured speedup, which is precisely why
a baseline matters.
