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