import { scoreEvidence } from "./evidence-scoring.mjs";

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

const MARKDOWN_CHARACTERS = /[\\`*_{}\[\]()<>#+\-.!|]/gu;
const SECRET_PATTERNS = Object.freeze([
  /(?:gh[pousr]_[A-Za-z0-9_]{20,})/giu,
  /(?:github_pat_[A-Za-z0-9_]{20,})/giu,
  /(?:sk-[A-Za-z0-9_-]{20,})/giu,
  /(?:AIza[0-9A-Za-z_-]{20,})/gu,
]);

function safeText(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/&/gu, "&amp;")
    .replace(MARKDOWN_CHARACTERS, (character) => `&#${character.codePointAt(0)};`)
    .replace(/\s+/gu, " ")
    .trim();
}

function boundedItems(value, name, limit) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  if (value.length > limit) throw new Error(`${name} cannot contain more than ${limit} items.`);
  return value;
}

function sourceLabel(source) {
  return `${source.kind}:${source.location}`;
}

function findingCitation(index) {
  return `E${String(index + 1).padStart(2, "0")}`;
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
  const findings = [...inventory.findings]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((finding, index) => ({
      citation: findingCitation(index),
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
    ([pillar, value]) => `| ${safeText(PILLAR_LABELS[pillar] ?? pillar)} | ${value}/4 |`,
  );
  const findingRows = view.findings.map((finding) =>
    `| ${finding.citation} | ${safeText(finding.control)} | ${safeText(finding.status)} | ` +
      `${safeText(finding.scope)} | ${safeText(finding.consumers.join(", "))} | ` +
      `${safeText(finding.source)} | ${safeText(finding.method)} |`,
  );
  const unknownRows = view.unknowns.map((unknown) =>
    `| ${safeText(unknown.control)} | ${safeText(unknown.reason)} | ${safeText(unknown.needed)} |`,
  );
  const warningRows = view.warnings.map((warning) =>
    `| ${safeText(warning.code)} | ${safeText(warning.message)} | ${safeText(warning.findingId)} |`,
  );
  const advancementGateRows = view.score.advancementGates.map((gate) =>
    `| ${safeText(gate.controls.join(" or "))} | ${gate.satisfied ? "yes" : "no"} |`,
  );
  const recommendationRows = view.recommendations.map((recommendation, index) =>
    `| ${index + 1} | ${safeText(recommendation.action)} | ${safeText(recommendation.rationale)} | ` +
      `${safeText((recommendation.citations ?? []).join(", "))} |`,
  );
  const pilotRows = view.pilots.map((pilot, index) =>
    `| ${index + 1} | ${safeText(pilot.name)} | ${safeText(pilot.task)} | ` +
      `${safeText(pilot.successMetric)} | ${safeText(pilot.stopCondition)} |`,
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
    `| Repository | ${safeText(view.metadata.repository)} |`,
    `| Audit ID | ${safeText(view.metadata.auditId)} |`,
    `| Consumer | ${safeText(view.metadata.consumer)} |`,
    `| Inventory schema | ${safeText(view.metadata.schemaVersion)} |`,
    `| Collector | ${safeText(view.metadata.collectorVersion)} |`,
    `| Scoring contract | ${safeText(view.metadata.scoringVersion)} |`,
    `| Report contract | ${safeText(view.contractVersion)} |`,
    `| Method | ${safeText(view.metadata.method)} |`,
    "",
    "## Score",
    "",
    `Overall level: **${view.score.overall}/4**`,
    "",
    `Exact calculation: ${safeText(view.score.calculation)}`,
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