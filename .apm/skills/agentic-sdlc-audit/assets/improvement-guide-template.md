---
title: Agentic SDLC Developer Improvement Guide
description: Deterministic compact output contract for validated remediation guidance
---

## Rendering contract

Render guides with `scripts/guide-renderer.mjs`. The renderer accepts only the
validated remediation view returned by `scripts/remediation-view.mjs`. Do not render
proposals, inventories, scanner output, or unvalidated model text directly.

The guide is Markdown-only output. Dynamic repository and recommendation values are
untrusted data. The renderer redacts credential-shaped values and encodes Markdown,
HTML, and control characters before insertion.

## Deterministic sections

The renderer owns these sections and their ordering:

1. Verdict and next action
2. Prioritized roadmap
3. Recommendation details
4. Deferred actions and prerequisites
5. Unknowns and verification steps
6. Source registry

Empty sections use a controlled `None.` value. The roadmap and recommendation details
preserve the validated remediation order.

## Implementation fields

Each roadmap row includes the recommendation ID, action, repository-relative target
path, accountable owner role, effort label, expected-value tier, and stable `E##`
finding references.

Each recommendation detail includes these bounded fields:

* Up to five implementation steps
* Observation, mechanism, applicability, assumptions, and limitations
* One validated expected-value claim
* Dependencies and prerequisites
* Up to three acceptance criteria
* Up to three validation checks
* One primary metric and up to two guardrails
* One stop condition

The renderer never exposes `relativePriority`, `priorityInputs`, or any numeric internal
priority value. Priority calculations only determine the validated recommendation order.

## Expected-value tiers

An expected value hypothesis states an outcome, causal chain, metric to test,
assumptions, limitations, and the boundary of external evidence. It does not claim a
numeric repository benefit.

An observed proxy reports the local metric, baseline and observation windows, sample
sizes, code-derived change, formula identifier, attribution method, and attribution
limitations. Its local-evidence identities, locations, timestamps, values, sample sizes,
and observation dates must match fresh inventory records, or its complete proposed claim
must match structured `operatorInputs.claimEvidence` exactly.

A measured financial ROI claim reports the approved observation window, completed and
eligible sample counts, currency, realized benefits, incremental costs, code-derived
ROI, formula identifier, attribution method, and uncertainty range. The validated view
must carry operator-supplied financial evidence and approval before this tier can render.
Every local-evidence record and the complete pre-calculation claim must match a closed
`operatorInputs.claimEvidence` record exactly, so fabricated costs, benefits, approval,
or evidence locations fail closed.

## Provenance boundary

Finding references use stable `E##` identifiers from the deterministic evidence index.
The source registry contains only used sources that the authoritative trusted source
registry marks `VERIFIED` and independently citable. Local evidence supports observed
proxy and measured ROI claims but does not become an external source registry entry.

Unknown organizational inputs remain explicit verification work. Missing business
objectives, accountable role policy, local baselines, costs, attribution, and decision
thresholds must not be inferred.