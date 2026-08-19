import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildReportView,
  renderCompactReport,
  REPORT_CONTRACT,
} from "../.apm/skills/agentic-sdlc-audit/scripts/report-renderer.mjs";

const inventory = JSON.parse(
  await readFile(new URL("../.apm/skills/agentic-sdlc-audit/schemas/examples/standard-inventory.json", import.meta.url)),
);
const secretCanary = "github_pat_123456789012345678901234567890";
inventory.repository.identity = "example/repository\n## INJECTED";
inventory.findings[0].control = "Repository | instructions\n# override";
inventory.findings[0].source.location = ".github/copilot-instructions.md`\n<!-- control -->";
inventory.unknowns.push({
  control: "remote-policy",
  reason: "not observed\n## false section",
  needed: "read-only metadata",
});
inventory.warnings.push({ code: "fixture-warning", message: `warning | data ${secretCanary}` });
inventory.outputBudget.truncated = true;
inventory.outputBudget.omittedFindingCount = 7;

const recommendations = Array.from({ length: REPORT_CONTRACT.maxRecommendations }, (_, index) => ({
  action: `Action ${index + 1}`,
  rationale: `Bounded model-assisted rationale ${secretCanary}.`,
  citations: ["S01", "E01"],
}));
const pilots = Array.from({ length: REPORT_CONTRACT.maxPilots }, (_, index) => ({
  name: `Pilot ${index + 1}`,
  task: "Bounded task",
  successMetric: "One measurable outcome",
  stopCondition: "Stop on failed validation",
}));

const view = buildReportView(inventory, { consumer: "ide-agent", recommendations, pilots });
const report = renderCompactReport(inventory, { consumer: "ide-agent", recommendations, pilots });
const reversedView = buildReportView(
  { ...inventory, findings: [...inventory.findings].reverse() },
  { consumer: "ide-agent", recommendations, pilots },
);

assert.equal(view.metadata.schemaVersion, "1.0.0");
assert.equal(view.metadata.collectorVersion, "1.0.0");
assert.equal(view.metadata.scoringVersion, "1.0.0");
assert.equal(view.findings[0].citation, "E01");
assert.deepEqual(
  view.findings.map(({ citation, id }) => ({ citation, id })),
  reversedView.findings.map(({ citation, id }) => ({ citation, id })),
);
assert.equal(view.findings[0].scope, "working-tree");
assert.deepEqual(view.findings[0].consumers, ["cloud-agent", "code-review", "ide-agent"]);
assert.equal(view.score.overall, Math.min(...Object.values(view.score.pillars)));
assert.match(view.score.calculation, /^min\(.+\)=\d$/u);
assert.equal(view.score.advancementGates.length > 0, true);
assert.equal(view.recommendations.length, 5);
assert.equal(view.pilots.length, 3);
assert.equal(view.truncation.truncated, true);
assert.equal(view.truncation.omittedFindingCount, 7);
assert.equal(view.unknowns.some(({ control }) => control === "remote-policy"), true);
assert.match(report, /Inventory schema \| 1&#46;0&#46;0/u);
assert.match(report, /E01/u);
assert.match(report, /working&#45;tree/u);
assert.match(report, /cloud&#45;agent/u);
assert.match(report, /## Advancement gates for level \d/u);
assert.match(report, /fixture&#45;warning \| warning &#124; data &#91;REDACTED&#93; \|/u);
assert.match(report, /Raw scanner output is omitted/u);
assert.doesNotMatch(report, /^## INJECTED$/mu);
assert.doesNotMatch(report, /^# override$/mu);
assert.doesNotMatch(report, /^## false section$/mu);
assert.doesNotMatch(report, /<!-- control -->/u);
assert.doesNotMatch(report, new RegExp(secretCanary, "u"));
assert.match(report, /REDACTED/u);
assert.equal(report, renderCompactReport(inventory, { consumer: "ide-agent", recommendations, pilots }));

assert.throws(
  () => buildReportView(inventory, { recommendations: [...recommendations, {}] }),
  /more than 5/u,
);
assert.throws(
  () => buildReportView(inventory, { pilots: [...pilots, {}] }),
  /more than 3/u,
);

process.stdout.write(
  "Compact report renderer contracts passed: adversarial Markdown injection and secret canary redaction.\n",
);