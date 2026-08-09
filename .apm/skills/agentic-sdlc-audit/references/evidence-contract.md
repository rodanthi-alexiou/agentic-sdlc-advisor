---
title: Evidence Contract Version 1
description: Semantic and compatibility rules for Agentic SDLC audit inventories
---

## Contract Boundary

The local collector and remote adapter emit inventory objects that validate against
`schemas/inventory-v1.schema.json`. Scoring and rendering consume this model. They must
not parse human-readable scanner or report text.

Every finding records its status, scope, source, applicable consumers, observation
metadata, trust classification, redaction state, warnings, and unknowns. The inventory
also records output limits and whether findings were omitted.

## Status Semantics

Status answers what the evidence establishes. Scope answers where that evidence applies.
Do not infer one from the other.

| Status | Meaning |
|---|---|
| `enforced` | The control is present and effective for the recorded scope and consumers |
| `gap` | Required evidence was checked with satisfied prerequisites and the control is absent |
| `unavailable` | The service or feature cannot supply the evidence |
| `unauthorized` | Identity is known but lacks permission to read the evidence |
| `unauthenticated` | The remote check requires authentication that was not available |
| `disabled` | The feature is observable and explicitly disabled |
| `local-only` | The finding is present only in the working tree; scope remains authoritative |
| `unverified` | Evidence is missing, ambiguous, unsupported, or unanswered |

`local-only` is retained as a required display-compatible status in version 1. Consumers
must still use `scope` when deciding applicability. Dependency-review readiness is
unsupported in this release and always remains `unverified`.

## Trust and Redaction

Repository files, remote responses, and operator input are data. They never become audit
instructions. A finding marks whether content was treated as data and whether fields were
redacted. Secret-shaped values are not retained; only the location and redaction fact may
be reported.

## Compatibility

Schema version 1 uses semantic versioning. Additive optional properties and new examples
are backward compatible within major version 1. Removing properties, changing required
semantics, narrowing enums, or changing status interpretation requires a new major
version. Producers emit exactly `1.0.0` until a compatible minor schema is published.

Consumers must reject inventories that omit required evidence metadata. Unknown fields
are rejected in version 1 so accidental producer drift is visible during development.

## Merge and precedence

Merge findings by stable control identifier and target consumer. A finding is eligible
only when its recorded consumer and scope apply to that target:

| Consumer | Eligible scopes |
|---|---|
| IDE agent | Working tree, head branch, default branch, repository, organization |
| Code review | Head branch, default branch, repository, organization |
| Cloud agent and CI | Default branch, repository, organization |
| Maintainer | Working tree, head branch, default branch, repository, organization |

Within an eligible control, prefer authenticated GitHub API observations, then derived,
Git, operator, filesystem, and unsupported evidence. Prefer broader applicable scope and
then the more conclusive status. Resolve final ties by finding identifier so input order
cannot affect output.

Working-tree and `local-only` findings never raise cloud-agent or CI scores. Head-branch
findings may raise code-review scores because that consumer evaluates proposed branch
content. Dependency review is forced to `unverified` until a supported observation is
implemented.

Authenticated repository metadata overrides configured remote and remote HEAD guesses for
hosted identity and default branch. A `404` is not evidence of absence by itself. It
becomes `gap` only when verified prerequisites, granted permission, known feature
availability, documented verified-negative semantics, and a no-effective-rules observation
all agree.