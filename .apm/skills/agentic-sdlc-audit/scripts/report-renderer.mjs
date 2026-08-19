import { scoreEvidence } from "./evidence-scoring.mjs";
import { assignEvidenceReferences } from "./evidence-references.mjs";
import { encodeMarkdownText } from "./rendering-safety.mjs";

export const REPORT_CONTRACT = Object.freeze({
  version: "1.0.0",
  collectorVersion: "1.0.0",
  maxRecommendations: 5,
  maxPilots: 3,
});

const PILLAR_LABELS = Object.freeze({
  context: "Context",
  reusableAssets: "Reusable assets",
  agentEnvironment: "Agent environment",
  guardrails: "Guardrails",
  processMeasurement: "Process and measurement",
});

function boundedItems(value, name, limit) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  if (value.length > limit) throw new Error(`${name} cannot contain more than ${limit} items.`);
  return value;
}

function sourceLabel(source) {
  return `${source.kind}:${source.location}`;
}

function reportUnknowns(inventory) {
  return [
    ...inventory.unknowns,
    ...inventory.findings.flatMap((finding) =>
      finding.unknowns.map((unknown) => ({ ...unknown, findingId: finding.id })),
    ),
  ];
}

function reportWarnings(inventory) {
  return [
    ...inventory.warnings,
    ...inventory.findings.flatMap((finding) =>
      finding.warnings.map((warning) => ({ ...warning, findingId: finding.id })),
    ),
  ];
}

export function buildReportView(inventory, options = {}) {
  if (!inventory || !Array.isArray(inventory.findings) || !inventory.outputBudget) {
    throw new Error("A schema-valid inventory is required.");
  }
  const recommendations = boundedItems(
    options.recommendations,
    "recommendations",
    REPORT_CONTRACT.maxRecommendations,
  );
  const pilots = boundedItems(options.pilots, "pilots", REPORT_CONTRACT.maxPilots);
  const consumer = options.consumer ?? "cloud-agent";
  const score = scoreEvidence(inventory.findings, { consumer });
  const findings = assignEvidenceReferences(inventory.findings)
    .map(({ finding, citation }) => ({
      citation,
      id: finding.id,
      control: finding.control,
      status: finding.status,
      scope: finding.scope,
      consumers: [...finding.consumer].sort(),
      source: sourceLabel(finding.source),
      observedAt: finding.observation.observedAt,
      method: finding.observation.method,
      commit: finding.observation.commit,
      truncated: finding.discovery?.truncated === true,
    }));

  return {
    contractVersion: REPORT_CONTRACT.version,
    metadata: {
      schemaVersion: inventory.schemaVersion,
      collectorVersion: options.collectorVersion ?? REPORT_CONTRACT.collectorVersion,
      scoringVersion: score.contractVersion,
      auditId: inventory.auditId,
      repository: inventory.repository.identity ?? inventory.repository.root,
      consumer,
      method: "Deterministic rendering from schema-valid inventory and consumer-aware scoring.",
    },
    score: {
      ...score,
      calculation: `min(${Object.entries(score.pillars)
        .map(([pillar, value]) => `${pillar}=${value}`)
        .join(", ")})=${score.overall}`,
    },
    findings,
    unknowns: reportUnknowns(inventory),
    warnings: reportWarnings(inventory),
    truncation: {
      truncated: inventory.outputBudget.truncated,
      omittedFindingCount: inventory.outputBudget.omittedFindingCount,
      maxFindings: inventory.outputBudget.maxFindings,
      maxEvidenceBytes: inventory.outputBudget.maxEvidenceBytes,
    },
    recommendations,
    pilots,
  };
}

function renderRows(rows, columnCount) {
  return rows.length > 0
    ? rows.join("\n")
    : `| None ${"| ".repeat(columnCount - 1)}|`;
}

export function renderCompactReport(inventory, options = {}) {
  const view = buildReportView(inventory, options);
  const scoreRows = Object.entries(view.score.pillars).map(
    ([pillar, value]) => `| ${encodeMarkdownText(PILLAR_LABELS[pillar] ?? pillar)} | ${value}/4 |`,
  );
  const findingRows = view.findings.map((finding) =>
    `| ${finding.citation} | ${encodeMarkdownText(finding.control)} | ${encodeMarkdownText(finding.status)} | ` +
      `${encodeMarkdownText(finding.scope)} | ${encodeMarkdownText(finding.consumers.join(", "))} | ` +
      `${encodeMarkdownText(finding.source)} | ${encodeMarkdownText(finding.method)} |`,
  );
  const unknownRows = view.unknowns.map((unknown) =>
    `| ${encodeMarkdownText(unknown.control)} | ${encodeMarkdownText(unknown.reason)} | ${encodeMarkdownText(unknown.needed)} |`,
  );
  const warningRows = view.warnings.map((warning) =>
    `| ${encodeMarkdownText(warning.code)} | ${encodeMarkdownText(warning.message)} | ${encodeMarkdownText(warning.findingId)} |`,
  );
  const advancementGateRows = view.score.advancementGates.map((gate) =>
    `| ${encodeMarkdownText(gate.controls.join(" or "))} | ${gate.satisfied ? "yes" : "no"} |`,
  );
  const recommendationRows = view.recommendations.map((recommendation, index) =>
    `| ${index + 1} | ${encodeMarkdownText(recommendation.action)} | ${encodeMarkdownText(recommendation.rationale)} | ` +
      `${encodeMarkdownText((recommendation.citations ?? []).join(", "))} |`,
  );
  const pilotRows = view.pilots.map((pilot, index) =>
    `| ${index + 1} | ${encodeMarkdownText(pilot.name)} | ${encodeMarkdownText(pilot.task)} | ` +
      `${encodeMarkdownText(pilot.successMetric)} | ${encodeMarkdownText(pilot.stopCondition)} |`,
  );

  return [
    "---",
    "title: Agentic SDLC Readiness Report",
    "description: Deterministic compact repository readiness evidence and scores",
    "---",
    "",
    "## Report metadata",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Repository | ${encodeMarkdownText(view.metadata.repository)} |`,
    `| Audit ID | ${encodeMarkdownText(view.metadata.auditId)} |`,
    `| Consumer | ${encodeMarkdownText(view.metadata.consumer)} |`,
    `| Inventory schema | ${encodeMarkdownText(view.metadata.schemaVersion)} |`,
    `| Collector | ${encodeMarkdownText(view.metadata.collectorVersion)} |`,
    `| Scoring contract | ${encodeMarkdownText(view.metadata.scoringVersion)} |`,
    `| Report contract | ${encodeMarkdownText(view.contractVersion)} |`,
    `| Method | ${encodeMarkdownText(view.metadata.method)} |`,
    "",
    "## Score",
    "",
    `Overall level: **${view.score.overall}/4**`,
    "",
    `Exact calculation: ${encodeMarkdownText(view.score.calculation)}`,
    "",
    "| Pillar | Score |",
    "|---|---:|",
    ...scoreRows,
    "",
    `## Advancement gates for level ${view.score.nextLevel}`,
    "",
    "| Required control | Satisfied |",
    "|---|---|",
    ...renderRows(advancementGateRows, 2).split("\n"),
    "",
    "## Evidence",
    "",
    "| Citation | Control | Status | Scope | Consumer applicability | Source | Method |",
    "|---|---|---|---|---|---|---|",
    ...findingRows,
    "",
    "## Recommendations",
    "",
    "| Priority | Action | Rationale | Citations |",
    "|---:|---|---|---|",
    ...renderRows(recommendationRows, 4).split("\n"),
    "",
    "## Pilot use cases",
    "",
    "| Rank | Name | Task | Success metric | Stop condition |",
    "|---:|---|---|---|---|",
    ...renderRows(pilotRows, 5).split("\n"),
    "",
    "## Unknowns",
    "",
    "| Control | Reason | Needed to verify |",
    "|---|---|---|",
    ...renderRows(unknownRows, 3).split("\n"),
    "",
    "## Warnings",
    "",
    "| Code | Message | Finding |",
    "|---|---|---|",
    ...renderRows(warningRows, 3).split("\n"),
    "",
    "## Output budget",
    "",
    "| Limit | Value |",
    "|---|---:|",
    `| Maximum findings | ${view.truncation.maxFindings} |`,
    `| Maximum evidence bytes | ${view.truncation.maxEvidenceBytes} |`,
    `| Truncated | ${view.truncation.truncated ? "yes" : "no"} |`,
    `| Omitted findings or samples | ${view.truncation.omittedFindingCount} |`,
    "",
    "Raw scanner output is omitted. Full inventory persistence requires an explicit approved path.",
    "",
  ].join("\n");
}