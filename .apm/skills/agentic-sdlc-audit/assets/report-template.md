# Agentic SDLC Readiness Report — `<owner>/<repo>`

**Date:** <YYYY-MM-DD> · **Assessed by:** agentic-sdlc-audit v1.0 · **Method:** read-only
static inspection plus stated operator input. No repository changes were made.

---

## 1. Verdict

**Current level: <0–4> — <name>.** <One sentence on why, naming the limiting pillar.>

**The one thing to do first:** <single highest-leverage action, with the path of the file
or setting involved.>

| Pillar | Score | Limiting factor |
|---|---|---|
| A · Context | /4 | |
| B · Reusable assets | /4 | |
| C · Agent environment | /4 | |
| D · Guardrails | /4 | |
| E · Process & measurement | /4 | |

Overall level is the **minimum** pillar score, not the average: the weakest control
determines the realistic failure mode.

---

## 2. Repository profile

| Axis | Finding | Evidence |
|---|---|---|
| Scale | | tracked files, top languages |
| Build determinism | | commands found and whether verified |
| Test posture | | test runner, CI evidence |
| Network dependency | | private feeds? |
| Risk class | | |
| Current agent usage | | |
| Active committers (90d) | | `git log` |

---

## 3. Findings

For each: what was observed, why it matters, and the source.

### Pillar A — Context
| Check | Status | Evidence | Impact |
|---|---|---|---|

### Pillar B — Reusable assets
### Pillar C — Agent environment
### Pillar D — Guardrails
### Pillar E — Process & measurement

*(Repeat the table per pillar. `Status` ∈ PASS / GAP / RISK / UNVERIFIED.)*

---

## 4. Recommendations — ordered by (impact × confidence) ÷ effort

| # | Action | Artifact / path | Why | Effort | Acceptance criterion | Source |
|---|---|---|---|---|---|---|
| 1 | | | | S/M/L | | [S…] |

Each acceptance criterion must be something a reviewer can check, not "improves context".
Example: *"`copilot-setup-steps.yml` runs green from the Actions tab and the agent's
session log shows dependencies already installed."*

---

## 5. Pilot use cases — where value shows up first

### Pilot 1 — <name> *(recommended start)*
- **Task:** <specific; name real issue numbers where they exist>
- **Why this repo:** <tie to a finding above>
- **Depends on:** <which recommendations must land first>
- **Reviewer:** <named role or person>
- **Success metric:** <measurable, with the baseline value if known>
- **Stop condition:** <what makes you halt>

### Pilot 2 — <name>
### Pilot 3 — <name>

---

## 6. Advancement gates

To reach **Level <n+1>**, all of the following must be true:

- [ ] …
- [ ] …

---

## 7. Do not do yet

| Deferred | Why | Revisit at |
|---|---|---|

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

Include, where applicable: review-capacity saturation; prompt injection via issues and MCP
responses; agent-authored tests encoding current-but-wrong behaviour; context-file drift;
skill atrophy; architectural drift across many small agent PRs.

---

## 9. Not verified

| Item | Why not verified | How to verify |
|---|---|---|

Typical entries: branch protection (needs `gh` auth), firewall allowlist state (repo
settings), Advanced Security enablement, Copilot plan and org policy, review capacity.

---

## 10. Expected value — stated honestly

<2–4 sentences. Name the task categories targeted and the constraint that will replace the
current one. Pair any optimistic figure with the counter-evidence. Never quote a headline
productivity percentage as if it applied here.>

---

## 11. Sources

List only sources actually cited above, with their IDs and URLs from
`references/sources.md`. Note verification status where it is `TITLE-ONLY`.

---

## Appendix A — Raw scan output
```
<paste scan.sh output>
```
