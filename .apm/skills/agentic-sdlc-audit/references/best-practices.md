# Best practices by component (cited)

Reference for Phases 3 and 5. Each component gives: what it is, where it lives, what
"good" looks like, anti-patterns, and sources. Cite the sources when recommending.

**Contents**
- [A1. AGENTS.md](#a1-agentsmd)
- [A2. .github/copilot-instructions.md](#a2-githubcopilot-instructionsmd)
- [A3. Path-scoped instructions](#a3-path-scoped-instructions)
- [B1. Prompt files](#b1-prompt-files)
- [B2. Custom agents](#b2-custom-agents)
- [B3. Agent skills](#b3-agent-skills)
- [B4. MCP servers](#b4-mcp-servers)
- [C1. copilot-setup-steps.yml](#c1-copilot-setup-stepsyml)
- [C2. The agent firewall](#c2-the-agent-firewall)
- [D1. Branch protection, CODEOWNERS, required checks](#d1-branch-protection-codeowners-required-checks)
- [D2. Security scanning](#d2-security-scanning)
- [D3. Prompt injection posture](#d3-prompt-injection-posture)
- [E1. Issue hygiene](#e1-issue-hygiene)
- [E2. Spec-driven development](#e2-spec-driven-development)
- [E3. Measurement](#e3-measurement)

---

## A1. AGENTS.md

**What.** The cross-vendor, open-standard "README for agents" — a Markdown file at the
repo root that tells any coding agent how to build, test, and behave in this codebase.
It is deliberately *not* Copilot-specific: the same file is read by Copilot, Codex,
Claude Code, Cursor, Aider, and others. GitHub Copilot cloud agent reads it natively.

**Where.** `AGENTS.md` at the repo root. Nested files are supported: the file closest to
the edited code wins, which is the correct pattern for monorepos.

**Good looks like:**
- Exact commands, copy-pasteable and verified: build, test, lint, run a single test.
- Project structure and where things go — with real directory names.
- Tech stack including versions.
- Code style stated by example, not adjective. "Use `Result<T>` not exceptions, see
  `src/core/result.ts`" beats "write clean code".
- Explicit boundaries: what the agent must never touch (migrations, generated files,
  vendored code, `infra/prod/**`).
- Definition of done: what must pass before a PR is opened.
- Short. It competes for context with the actual code.

**Anti-patterns:**
- Generic advice that would apply to any repo. The GitHub analysis of 2,500+ agent files
  found the dominant failure is vagueness.
- Duplicating the README. `AGENTS.md` is for agents; the README is for humans.
- Letting it drift. It must be maintained as actively as the README, or it teaches the
  agent facts that are no longer true — which is worse than having no file.
- Commands that were never run. Verify each one.

**Sources:** [S1] [S2] [S3]

---

## A2. `.github/copilot-instructions.md`

**What.** Repository-wide standing instructions for Copilot specifically, applied to every
request in that repo across chat, agent mode, cloud agent, and code review.

**Where.** `.github/copilot-instructions.md`.

**Good looks like:**
- Complements `AGENTS.md` rather than duplicating it. Practical split: `AGENTS.md` holds
  vendor-neutral facts (build, test, structure, boundaries); `copilot-instructions.md`
  holds Copilot-specific conventions (preferred review depth, PR description format,
  which custom agent to hand off to).
- Under a few hundred lines. Everything you add dilutes everything else.
- Consistent with your linter and formatter config. Where they conflict, the linter wins
  and the instruction file should defer to it rather than restate it.

**Anti-patterns:**
- The kitchen-sink file. Long instruction files measurably reduce adherence to any single
  instruction.
- Instructions that contradict CI. The agent writes to the instruction, CI rejects it,
  the agent thrashes.
- Aspirational rules the team itself does not follow. The agent will follow them, and
  produce code inconsistent with the surrounding codebase.

**Sources:** [S4] [S2]

---

## A3. Path-scoped instructions

**What.** Instruction files that apply only to files matching a glob, via `applyTo:`
frontmatter. The mechanism for large repos and monorepos where one global rule set is
wrong for most of the tree.

**Where.** `.github/instructions/<topic>.instructions.md`

```markdown
---
applyTo: "src/api/**/*.ts"
description: API layer conventions
---
Every handler validates input with zod at the boundary...
```

**Good looks like:** one file per genuinely distinct area — frontend, API, data access,
infrastructure, tests. Globs that are narrow enough to be true.

**Anti-pattern:** `applyTo: "**"` — that is just a second global instructions file, and
now you have two sources of truth.

**Sources:** [S4]

---

## B1. Prompt files

**What.** Reusable, parameterized task templates invoked as slash commands in chat.
The unit of "we do this repeatedly, let's standardize it".

**Where.** `.github/prompts/<name>.prompt.md`. Frontmatter fields: `description`, `name`,
`argument-hint`, `agent` (`ask` | `agent` | `plan` | a custom agent name), `model`,
`tools`.

**Good looks like:** encoding a workflow with a defined output shape — "generate a
migration following our conventions", "write the release note for this diff", "run our
security review checklist". Reference other files with relative Markdown links to reuse
instructions rather than copy them.

**Anti-pattern:** prompts that are one sentence long. If it is not worth a file, type it.

**Sources:** [S5]

---

## B2. Custom agents

**What.** Named personas with their own system prompt, tool allowlist, model, and MCP
server bindings. The way to build a team of specialists — a test agent, a docs agent, a
security-review agent — instead of one generalist.

**Where.** `.github/agents/<name>.agent.md`. Available to Copilot cloud agent on
GitHub.com (agents tab, issue assignment, PRs), Copilot CLI, and agent mode in VS Code,
JetBrains, Eclipse, and Xcode. Also scopeable at user, organization, and enterprise level
(enterprise: `/agents/NAME.md` in a designated `.github-private` repo). Lowest-level
definition wins on name collision.

Frontmatter: `name`, `description` (required), `tools`, `model`, `target`
(`vscode` | `github-copilot`), `mcp-servers`, `handoffs`. Body is the system prompt, max
30,000 characters.

**Good looks like:**
- A tool allowlist scoped to the job. A review agent does not need `editFiles`. Omitting
  `tools` grants everything — do that deliberately, not by accident.
- Explicit negative constraints. "Never modify files under `src/generated/`."
- Concrete examples of the expected output format.
- MCP secrets referenced as `${{ secrets.COPILOT_MCP_* }}`, configured as Agents secrets
  at org or repo level — never inlined.

**Anti-pattern:** five agents that are the same agent with different names. Each should
have a distinct tool set or a distinct output contract, or it should be a prompt file.

**Sources:** [S6] [S7] [S8] [S9]

---

## B3. Agent skills

**What.** Folders of instructions plus bundled scripts, templates, and reference docs,
loaded on demand when the description matches the task. Skills are an open standard shared
across agents — the same `SKILL.md` works in Copilot, Claude Code, and others. Where an
agent is a *persona*, a skill is a *procedure*.

**Where.** `.github/skills/<skill-name>/SKILL.md` (project scope, committed and shared
with the team) or `~/.copilot/skills` / `~/.agents/skills` (personal). Works with Copilot
cloud agent, Copilot code review, Copilot CLI, the Copilot app, and agent mode in VS Code
and JetBrains.

Frontmatter: `name` (required, lowercase-hyphenated, matching the directory),
`description` (required — this is the trigger), `license` (optional).

**Good looks like:**
- A `description` written as *when to use this*, not just what it is. Triggering is
  description matching; a vague description means the skill never loads.
- Progressive disclosure: a short `SKILL.md` that points to `references/` for detail, so
  the bulk is loaded only when needed.
- Deterministic work pushed into `scripts/` rather than described in prose. A shell script
  that lists files is more reliable than asking the model to list files.

**Anti-pattern:** a skill that duplicates instructions. Instructions apply automatically
by file pattern; skills are invoked for tasks. If it should always apply, it is an
instruction file.

**Sources:** [S10] [S11] [S12]

---

## B4. MCP servers

**What.** Model Context Protocol servers give the agent tools beyond the repo — issue
trackers, databases, browsers, internal APIs.

**Good looks like:** an explicit allowlist of vetted servers; least-privilege credentials
per server; secrets via Agents secrets/variables, never in the config file; a documented
owner per server.

**Critical caveat.** The Copilot cloud agent firewall **does not apply to MCP servers** —
it only covers processes the agent starts via its Bash tool. An MCP server is an
unfiltered network path and must be treated as a trust boundary in its own right.

**Anti-pattern:** adding a community MCP server because it was convenient. Every server is
both a capability and an injection surface: content it returns enters the agent's context
as apparently-trusted input.

**Sources:** [S9] [S13] [S14]

---

## C1. `copilot-setup-steps.yml`

**What.** A GitHub Actions workflow that pre-provisions the cloud agent's ephemeral
environment before it starts work — installing toolchains, restoring private dependencies,
warming caches.

**Where.** `.github/workflows/copilot-setup-steps.yml`

**Hard requirements, each a common failure:**
- The job **must** be named `copilot-setup-steps` or it is silently ignored.
- The file **must** be on the default branch to trigger.
- Only that single job is allowed in the file.
- Set `permissions:` to the minimum needed (`contents: read` if you clone). Copilot gets
  its own separate token for its own operations.
- If a setup step exits non-zero, Copilot skips the remaining steps and starts anyway with
  a broken environment — so make failures loud and test the workflow via
  `workflow_dispatch`.

**Why it matters more than it looks.** Without it the agent must discover dependencies by
trial and error, which is slow and unreliable, and impossible for private feeds. Microsoft's
own long-running deployment of the coding agent on `dotnet/runtime` reported first-month
success around 41.7% — with no instructions and a firewall blocking the package feeds, the
agent was writing code it could not compile — rising to roughly 71% after the environment
and instructions were fixed. The delta came from repository preparation, not from a better
model.

**Sources:** [S15] [S16] [S17]

---

## C2. The agent firewall

**What.** A network allowlist around the cloud agent's ephemeral environment, on by
default with a recommended allowlist, configurable at repository and organization level.

**Good looks like:** keep it enabled; extend the allowlist with your specific package
registries rather than disabling it; if you need private feeds, prefer resolving them in
setup steps.

**Understand the limits** — these are documented, not hypothetical:
- It applies **only** to processes the agent starts via its Bash tool.
- It does **not** apply to MCP servers or to processes started in setup steps.
- It operates only within the Actions appliance.
- Sophisticated attacks may bypass it.
- It is incompatible with self-hosted runners, which is the one case where disabling it is
  expected — and that case needs compensating controls.

Disabling the firewall lets the agent reach any host and materially raises code-exfiltration
risk. Treat "firewall disabled" as a finding requiring written justification.

**Sources:** [S13] [S16]

---

## D1. Branch protection, CODEOWNERS, required checks

**What.** The controls that make agent output *proposals* rather than *changes*.

**Good looks like:**
- The agent never pushes to the default branch. All output arrives as a pull request.
- Required status checks include build, tests, and lint — the agent's own feedback loop is
  not sufficient evidence.
- Required human review, with CODEOWNERS routing sensitive paths (auth, payments,
  migrations, infrastructure) to the people who own them.
- Agent-authored PRs cannot approve other PRs or trigger privileged workflows.
- Hard human-approval gates on: authentication, secrets and key material, IAM, billing,
  data migrations, destructive operations, and anything touching customer data.

**Why this is the gate that outranks everything else.** If branch protection is missing,
the maturity level is 0 regardless of how good the context files are — the failure mode is
unreviewed generated code reaching production.

**Sources:** [S18] [S17]

---

## D2. Security scanning

**What.** Code scanning (CodeQL), secret scanning with push protection, and dependency
review, enforced as required checks.

**Good looks like:** these run on agent PRs identically to human PRs, and block merge on
new high-severity findings. Agent-generated code is not more secure than human code by
default and receives the same scrutiny.

**Sources:** [S18]

---

## D3. Prompt injection posture

**What.** Untrusted text reaching the agent as if it were instructions. This is
demonstrated, not theoretical: security researchers have shown a malicious GitHub *issue*
tricking the coding agent into introducing a backdoor.

**Threat surfaces to check in an audit:** issue bodies and comments, PR descriptions and
review comments, code comments and fixtures in the repo, dependency README/postinstall
content, MCP server responses, and fetched web content.

**Good looks like:**
- Agents run with least-privilege tokens scoped to the task.
- Firewall enabled; MCP servers allowlisted and owned.
- No workflow grants elevated permissions on `pull_request_target` for agent-authored
  branches without review.
- Humans review the *diff*, not the agent's summary of the diff.
- Public-repo issues from outside contributors are not auto-assigned to agents.

**Sources:** [S14] [S13]

---

## E1. Issue hygiene

**What.** For asynchronous delegation the issue *is* the prompt. Issue quality is now the
dominant controllable variable in agent success.

**A delegatable issue contains:** a problem statement; complete acceptance criteria
including whether tests are required; pointers to the files or modules likely involved;
the exact build and test commands; and an explicit out-of-scope boundary.

**Good looks like:** an issue template with these as required fields, and decomposition of
epics into ordered sub-issues sized to produce small, reviewable PRs. Reported success
rates fall as change size grows — small diffs succeed markedly more often than large ones.

**Anti-pattern:** assigning a two-line issue and concluding the agent is not ready.

**Sources:** [S19] [S17]

---

## E2. Spec-driven development

**What.** The spec, not the code, is the durable reviewed artifact; code is derived. GitHub
Spec Kit implements this with a `constitution → /specify → /plan → /tasks → /implement`
workflow and a `specify` CLI, and is agent-agnostic across 30+ agents including Copilot.

**Good looks like:** specs versioned in the repo; human review at the spec and plan
checkpoints *before* code is generated; tasks small enough to delegate individually.

**When to recommend it.** Level 3+. For a team that has not yet shipped one agent PR, this
is premature. Introduce it when agent output volume makes per-PR review the bottleneck.

**Sources:** [S20]

---

## E3. Measurement

**What.** Knowing whether any of this worked.

**Good looks like:**
- Baseline captured *before* rollout. Without it, no claim afterwards is defensible.
- System metrics plus self-reported metrics — DORA's four keys for delivery, DX Core 4 or
  SPACE for the developer-experience dimension.
- Copilot usage metrics (dashboard and API, generally available since February 2026) for
  adoption cohorts and engagement, used to drive enablement and license reclamation.
- Explicit tracking of review-queue health: PR wait time and reviewer load. This is where
  agent scale-up fails first.

**Do not measure:** lines of code accepted, or suggestion acceptance rate as a proxy for
value. They reward volume and are trivially gameable.

**The honest framing to put in every report.** The independent evidence is mixed. A 2025
randomized controlled trial of experienced open-source developers working in repositories
they knew well found they were about 19% *slower* with AI tooling while believing they had
been roughly 20% faster — a large perception gap that is itself the argument for measuring
rather than surveying. The 2025 DORA research, meanwhile, characterizes AI as an
*amplifier*: it magnifies the strengths of high-performing organizations and the
dysfunctions of struggling ones. Both findings point the same direction — fix the system
first, then add agents.

**Sources:** [S21] [S22] [S23] [S24]
