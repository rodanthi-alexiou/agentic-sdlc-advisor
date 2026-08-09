---
title: Agentic SDLC Readiness Report
description: Deterministic compact output contract for repository readiness audit results
---

## Rendering contract

Render reports with `scripts/report-renderer.mjs`. The renderer accepts only a
schema-valid inventory, consumer-aware scoring, and the bounded model-assisted fields
described below. Do not reconstruct factual sections from prose or raw scanner output.

Strict and standard modes return equivalent report content. Standard mode may persist
that content to the caller-approved report path and may persist the inventory to a
separately approved path. Strict mode writes nothing.

## Deterministic sections

The renderer owns these sections and their ordering:

1. Report metadata, including repository, audit ID, consumer, and contract versions
2. Overall and pillar scores with the exact minimum calculation
3. Unsatisfied advancement gates for the next level
4. Compact evidence rows with stable `E##` citations
5. Recommendations
6. Pilot use cases
7. Unknowns
8. Warnings
9. Output budget and omission notice

Repository strings, remote strings, and model-assisted text are untrusted. The renderer
escapes Markdown and control characters before placing values into the report. Raw
scanner output, remote bodies, response headers, issue text, pull request text, tokens,
and secret-shaped values never appear.

## Bounded model-assisted fields

Model assistance may populate only these slots:

* Up to five recommendations, each with `action`, `rationale`, and inventory or source
	citations
* Up to three pilots, each with `name`, `task`, `successMetric`, and `stopCondition`

Every recommendation must be grounded in deterministic evidence and ordered by
`(impact x confidence) / effort`. Every pilot must fit the observed build and test
feedback loop. The renderer rejects inputs above either cap.

Model assistance must not change metadata, findings, scores, advancement gates,
unknowns, warnings, truncation facts, or citation identifiers.

## Output budget

The report includes the inventory's maximum finding count, maximum evidence byte count,
truncation state, and omitted finding or sample count. Full inventory persistence
requires a caller-approved inventory path in standard mode.
