# Pilot use-case catalogue

Phase 4 reference. Select **three** ranked pilots. The ordering below reflects observed
agent success rates by task type in a large longitudinal deployment [S24]: cleanup and
test work succeed most often, performance and architectural work least. Start where the
evidence is strongest, not where the excitement is.

Each entry: what it is · why it works · prerequisites · success metric · stop condition.

---

## Tier 1 — Start here (highest observed success, lowest blast radius)

### 1. Test backfill on an untested module
- **What.** Pick one module with low coverage and a clear public contract. Delegate test
  authoring, one PR per file or small group.
- **Why it works.** Bounded, verifiable, no production behaviour change, and the test suite
  itself validates the output.
- **Prerequisites.** Working test runner in the agent environment; a test example the agent
  can pattern-match; a reviewer who knows the module's intended behaviour.
- **Success metric.** Coverage delta on the target module; agent PR merge rate; reviewer
  time per PR.
- **Stop condition.** Tests that assert current behaviour rather than intended behaviour.
  This is the specific danger of delegated test writing — a bug encoded as an expected
  result is worse than no test, because it now blocks the fix. Reviewers must check intent,
  not just green CI.

### 2. Mechanical cleanup and deprecation removal
- **What.** Remove a deprecated API, migrate a call pattern, delete dead code, apply a
  consistent lint rule across the tree.
- **Why it works.** The definition of done is objective and the compiler or linter checks it.
- **Prerequisites.** The rule or target pattern stated precisely in the issue; a build that
  fails loudly.
- **Success metric.** PRs merged without rework; time saved versus a manual estimate.
- **Stop condition.** Diffs exceeding a few hundred lines — review value drops sharply and
  so does success rate.

### 3. Documentation that is checkable
- **What.** API reference from source, runbook drafts, changelog entries, ADR drafts from
  a decision thread.
- **Why it works.** Low risk, immediately useful, and it exercises the context files —
  which surfaces gaps in `AGENTS.md` cheaply.
- **Prerequisites.** A documentation convention the agent can see an example of.
- **Success metric.** Docs merged; number of `AGENTS.md` corrections discovered.
- **Stop condition.** Confidently wrong documentation. Anything describing behaviour must
  be checked against the code, not accepted as plausible.

---

## Tier 2 — After the loop is proven

### 4. Well-specified bug fixes from the backlog
- **What.** Bugs with a reproduction, expected behaviour, and a failing test or clear
  acceptance criteria. Name real issue numbers when recommending this.
- **Why it works.** The reproduction gives the agent a verifiable target.
- **Prerequisites.** Issue hygiene in place; the bug is genuinely reproducible in CI.
- **Success metric.** Cycle time from issue to merged fix versus the historical baseline.
- **Stop condition.** Bugs whose root cause is architectural — the agent will patch the
  symptom convincingly.

### 5. Dependency upgrades with test coverage
- **What.** Minor and patch upgrades, framework migrations where a codemod exists.
- **Why it works.** Objective success criterion — the build and tests pass.
- **Prerequisites.** Meaningful test coverage on the affected paths; dependency review in CI.
- **Success metric.** Upgrade lead time; reduction in outdated-dependency count.
- **Stop condition.** Major upgrades with behavioural changes not covered by tests.

### 6. Security finding remediation
- **What.** Fix code-scanning alerts with a clear remediation pattern.
- **Why it works.** The scanner provides both the target and the verification.
- **Prerequisites.** Code scanning enabled; a security reviewer in the loop — mandatory,
  not optional.
- **Success metric.** Mean time to remediate; alert backlog burn-down.
- **Stop condition.** Anything touching authentication, authorization, cryptography, or
  secret handling — those need a human author, not a human reviewer.

---

## Tier 3 — Only at Level 3+

### 7. Greenfield module behind a spec
- **What.** A new, isolated module developed spec-first with review at the spec and plan
  checkpoints before code generation.
- **Prerequisites.** Spec-driven flow adopted; clear interface boundary; no production data
  path.
- **Stop condition.** Scope creep into existing modules.

### 8. Parallel independent work
- **What.** Several unrelated issues delegated simultaneously.
- **Prerequisites.** Proven single-agent loop; review capacity measured and sufficient;
  branch strategy that avoids collisions.
- **Stop condition.** Review wait time rising. Throttle immediately — the queue is the
  failure mode, not the code quality.

---

## Never delegate without a human author

Regardless of maturity level:

- Authentication, authorization, session handling, cryptography
- Secret and key management
- IAM and infrastructure permissions
- Billing and payment logic
- Data migrations and destructive operations
- Anything on a customer-data path
- Safety-critical or regulated-control code

These are human-authored, human-reviewed. Agents may assist with tests and documentation
around them.

---

## Fit filter — run every candidate through this

1. Can the agent build and test this code? If no, disqualify.
2. Is "done" objectively checkable? If no, demote a tier.
3. Is there a named reviewer with the domain knowledge to catch a plausible-but-wrong
   answer? If no, disqualify.
4. Is the blast radius bounded — no production data, no auth, no secrets, no migration?
   If no, disqualify.
5. Does a real backlog item exist for it? If yes, name it in the report. If no, prefer a
   candidate that does.
6. Will the resulting PR be small enough to review properly? If no, decompose first.

---

## Presenting expected value honestly

Do not promise a percentage. The defensible framing for a report:

> These pilots target the task categories where agent success has been observed to be
> highest, in a repository configured for it. Expect meaningful gains on bounded,
> checkable work, and expect the constraint to move to review capacity rather than
> disappear. Independent research finds that perceived speedup consistently exceeds
> measured speedup [S21], which is why the baseline captured in the Level 2 gate matters
> more than any vendor figure. [S22]
