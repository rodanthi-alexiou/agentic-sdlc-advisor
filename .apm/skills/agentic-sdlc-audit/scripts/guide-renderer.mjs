import { REMEDIATION_CONTRACT } from "./remediation-view.mjs";
import { encodeMarkdownText } from "./rendering-safety.mjs";

const VALUE_TIER_LABELS = Object.freeze({
  "expected-value-hypothesis": "Expected value hypothesis",
  "observed-proxy": "Observed proxy",
  "measured-financial-roi": "Measured financial ROI",
});

function text(value) {
  return encodeMarkdownText(value);
}

function assertValidatedView(view) {
  if (!view || typeof view !== "object" || Array.isArray(view)) {
    throw new Error("A validated remediation view is required.");
  }
  if (view.schemaVersion !== REMEDIATION_CONTRACT.version) {
    throw new Error(`Unsupported remediation view version '${view.schemaVersion ?? "missing"}'.`);
  }
  for (const field of ["recommendations", "deferred", "unknowns", "sources"]) {
    if (!Array.isArray(view[field])) throw new Error(`Validated remediation view field '${field}' must be an array.`);
  }
  if (!view.scoreSummary || !view.repository || !view.outputBudget) {
    throw new Error("A validated remediation view is required.");
  }
  if (!new Set(["improvement-guide", "starter-guide"]).has(view.guideProfile)) {
    throw new Error("A validated remediation view is required.");
  }
  if (view.guideProfile === "starter-guide") {
    if (!view.starter || !Array.isArray(view.starter.flow) || !Array.isArray(view.starter.contextItems)) {
      throw new Error("A validated starter remediation view is required.");
    }
  }
  for (const [field, value] of Object.entries({
    maxRecommendations: REMEDIATION_CONTRACT.maxRecommendations,
    maxSteps: REMEDIATION_CONTRACT.maxSteps,
    maxAcceptanceCriteria: REMEDIATION_CONTRACT.maxAcceptanceCriteria,
    maxValidationChecks: REMEDIATION_CONTRACT.maxValidationChecks,
    maxMetrics: REMEDIATION_CONTRACT.maxMetrics,
    maxGuardrails: REMEDIATION_CONTRACT.maxGuardrails,
    maxSources: REMEDIATION_CONTRACT.maxSources,
  })) {
    if (view.outputBudget[field] !== value) throw new Error("A validated remediation view is required.");
  }
}

function renderTextList(items, emptyText = "None.") {
  if (items.length === 0) return [emptyText];
  return items.map((item) => `* ${text(item.value ?? item)}`);
}

function renderValueClaim(valueClaim) {
  if (valueClaim.tier === "expected-value-hypothesis") {
    return [
      `* Tier: ${VALUE_TIER_LABELS[valueClaim.tier]}`,
      `* Outcome: ${text(valueClaim.outcome)}`,
      `* Causal chain: ${text(valueClaim.causalChain)}`,
      `* Metric to test: ${text(valueClaim.metricToTest.name)} (${text(valueClaim.metricToTest.direction)}, ${text(valueClaim.metricToTest.unit)})`,
      `* External evidence limit: ${text(valueClaim.externalEvidenceLimits)}`,
      `* Assumptions: ${text(valueClaim.assumptions.join("; "))}`,
      `* Limitations: ${text(valueClaim.limitations.join("; "))}`,
    ];
  }
  if (valueClaim.tier === "observed-proxy") {
    return [
      `* Tier: ${VALUE_TIER_LABELS[valueClaim.tier]}`,
      `* Metric: ${text(valueClaim.metric.name)} (${text(valueClaim.metric.direction)}, ${text(valueClaim.metric.unit)})`,
      `* Baseline: ${text(valueClaim.baseline.value)} from ${text(valueClaim.baseline.window.start)} to ${text(valueClaim.baseline.window.end)} (sample ${text(valueClaim.baseline.sampleSize)})`,
      `* Observed: ${text(valueClaim.observed.value)} from ${text(valueClaim.observed.window.start)} to ${text(valueClaim.observed.window.end)} (sample ${text(valueClaim.observed.sampleSize)})`,
      `* Change: ${text(valueClaim.calculation.result)} using ${text(valueClaim.calculation.formulaId)}`,
      `* Attribution: ${text(valueClaim.attribution.method)}`,
      `* Attribution limitations: ${text(valueClaim.attribution.limitations.join("; "))}`,
    ];
  }
  return [
    `* Tier: ${VALUE_TIER_LABELS[valueClaim.tier]}`,
    `* Window: ${text(valueClaim.window.start)} to ${text(valueClaim.window.end)}`,
    `* Sample: ${text(valueClaim.sample.completed)} completed of ${text(valueClaim.sample.eligible)} eligible; ${text(valueClaim.sample.excluded)} excluded`,
    `* Attribution: ${text(valueClaim.attribution.method)}`,
    `* Benefits: ${text(valueClaim.currency)} ${text(valueClaim.result.benefitTotal)}`,
    `* Incremental costs: ${text(valueClaim.currency)} ${text(valueClaim.result.costTotal)}`,
    `* Measured ROI: ${text(valueClaim.result.roiPercent)}% using ${text(valueClaim.formulaId)}`,
    `* Uncertainty: ${text(valueClaim.uncertainty.low)} to ${text(valueClaim.uncertainty.high)} (${text(valueClaim.uncertainty.method)})`,
  ];
}

function renderReason(reason) {
  return [
    `* Observation: ${text(reason.observation.summary)} (${text(reason.observation.findingIds.join(", "))})`,
    `* Mechanism: ${text(reason.mechanism.summary)} (${text(reason.mechanism.sourceRefs.join(", "))})`,
    `* Applies to: ${text(reason.applicability.consumers.join(", "))}; scopes ${text(reason.applicability.scopes.join(", "))}; controls ${text(reason.applicability.controlIds.join(", "))}`,
    `* Prerequisites: ${text(reason.applicability.prerequisites.join("; "))}`,
    ...reason.assumptions.map((item) => `* Assumption: ${text(item.statement)} Verify: ${text(item.verification)}`),
    ...reason.limitations.map((item) => `* Limitation: ${text(item.statement)} Effect: ${text(item.effect)}`),
  ];
}

function renderMeasurement(plan) {
  const guardrails = plan.guardrails.length > 0
    ? plan.guardrails.map((metric) => `${metric.name} (${metric.direction}, ${metric.unit})`).join("; ")
    : "None";
  return [
    `* Decision: ${text(plan.decision)}`,
    `* Primary metric: ${text(plan.primaryMetric.name)} (${text(plan.primaryMetric.direction)}, ${text(plan.primaryMetric.unit)})`,
    `* Guardrails: ${text(guardrails)}`,
    `* Attribution: ${text(plan.attribution)}`,
  ];
}

function renderRecommendation(recommendation) {
  return [
    `### ${text(recommendation.id)}: ${text(recommendation.title.value)}`,
    "",
    `Action: ${text(recommendation.action.value)}`,
    "",
    `Target path: ${text(recommendation.target.path)}`,
    "",
    `Owner: ${text(recommendation.owner.role)}`,
    "",
    `Effort: ${text(recommendation.effort.label)}`,
    "",
    `Priority class: ${text(recommendation.priorityClass)}`,
    "",
    `Evidence: ${text(recommendation.findingRefs.join(", "))}`,
    "",
    "#### Steps",
    "",
    ...recommendation.steps.map((item, index) => `${index + 1}. ${text(item.value)}`),
    "",
    "#### Reason",
    "",
    ...renderReason(recommendation.reason),
    "",
    "#### Expected value",
    "",
    ...renderValueClaim(recommendation.valueClaim),
    "",
    "#### Dependencies",
    "",
    ...renderTextList(recommendation.dependencies),
    "",
    "#### Acceptance criteria",
    "",
    ...renderTextList(recommendation.acceptanceCriteria),
    "",
    "#### Validation",
    "",
    ...renderTextList(recommendation.validation),
    "",
    "#### Measurement",
    "",
    ...renderMeasurement(recommendation.measurementPlan),
    "",
    "#### Stop condition",
    "",
    text(recommendation.stopCondition.value),
    "",
  ];
}

function renderDeferred(deferred) {
  if (deferred.length === 0) return ["None."];
  return deferred.map((item) => {
    if (typeof item === "string") return `* ${text(item)}`;
    const label = item.action ?? item.title ?? item.id ?? "Deferred action";
    const reason = item.reason ?? item.prerequisite ?? "Prerequisite not yet satisfied.";
    return `* ${text(label)}: ${text(reason)}`;
  });
}

function renderUnknowns(unknowns) {
  if (unknowns.length === 0) return ["None."];
  return unknowns.map((unknown) =>
    `* ${text(unknown.control)}: ${text(unknown.reason)} Verify: ${text(unknown.needed)}`,
  );
}

function renderSources(sources) {
  if (sources.length === 0) return ["None."];
  return sources.map((source) =>
    `* ${text(source.id)}: [${text(source.title)}](${source.url}) (${text(source.status)})`,
  );
}

function renderRecommendationDetails(view) {
  return view.recommendations.length > 0
    ? view.recommendations.flatMap(renderRecommendation)
    : ["None.", ""];
}

function renderImprovementGuide(view) {
  const first = view.recommendations[0];
  const roadmapRows = view.recommendations.map((recommendation) =>
    `| ${text(recommendation.id)} | ${text(recommendation.action.value)} | ${text(recommendation.target.path)} | ` +
      `${text(recommendation.owner.role)} | ${text(recommendation.effort.label)} | ${text(VALUE_TIER_LABELS[recommendation.valueClaim.tier])} | ` +
      `${text(recommendation.findingRefs.join(", "))} |`,
  );

  return [
    "---",
    "title: Agentic SDLC Developer Improvement Guide",
    "description: Deterministic compact implementation guidance from a validated remediation view",
    "---",
    "",
    "## Verdict and next action",
    "",
    `Current readiness: **${text(view.scoreSummary.overall)}/4** for ${text(view.scoreSummary.consumer)}.`,
    "",
    first ? `Next action: ${text(first.action.value)} Target: ${text(first.target.path)}.` : "Next action: Resolve the listed unknowns before selecting implementation work.",
    "",
    "## Prioritized roadmap",
    "",
    "| ID | Action | Path | Owner | Effort | Expected-value tier | Evidence |",
    "|---|---|---|---|---|---|---|",
    ...(roadmapRows.length > 0 ? roadmapRows : ["| None | None | None | None | None | None | None |"]),
    "",
    "## Recommendation details",
    "",
    ...renderRecommendationDetails(view),
    "## Deferred actions and prerequisites",
    "",
    ...renderDeferred(view.deferred),
    "",
    "## Unknowns and verification steps",
    "",
    ...renderUnknowns(view.unknowns),
    "",
    "## Source registry",
    "",
    ...renderSources(view.sources),
    "",
  ].join("\n");
}

function renderStarterGuide(view) {
  const starter = view.starter;
  const flowRows = starter.flow.map((step, index) =>
    `| ${index + 1} | ${text(step.title)} | ${text(step.targetPaths.join(", "))} | ` +
      `${text(step.action)} | ${text(step.acceptanceCriterion)} |`,
  );
  const contextRows = starter.contextItems.map((item) =>
    `| ${text(item.label)} | ${text(item.status)} | ` +
      `${text(item.values.length > 0 ? item.values.join("; ") : item.needed)} |`,
  );

  return [
    "---",
    "title: Agentic SDLC Starter Guide",
    "description: Beginner-focused implementation flow from validated repository evidence",
    "---",
    "",
    "## Beginner verdict and one next action",
    "",
    `Beginner verdict: **${text(starter.verdict)}**`,
    "",
    `Next action: ${text(starter.nextAction.action)}`,
    "",
    `Target path: ${text(starter.nextAction.targetPath)}`,
    "",
    `Acceptance criterion: ${text(starter.nextAction.acceptanceCriterion)}`,
    "",
    "## Ordered starter flow",
    "",
    "| Step | Practice | Exact repository path(s) | Action | Acceptance criterion |",
    "|---|---|---|---|---|",
    ...flowRows,
    "",
    "## AGENTS.md vs .github/copilot-instructions.md",
    "",
    `Repository shape: ${text(starter.repositoryShape.classification)}.`,
    "",
    ...starter.repositoryShape.signals.map((signal) => `* ${text(signal)}`),
    "",
    `Decision status: ${text(starter.instructionDecision.status)}.`,
    "",
    `Use: ${text(starter.instructionDecision.choice)}.`,
    "",
    `Do not duplicate into: ${text(starter.instructionDecision.alternative)}.`,
    "",
    text(starter.instructionDecision.rationale),
    "",
    "## Cost per trusted merged outcome",
    "",
    text(starter.costModel.objective),
    "",
    `Cost boundary: ${text(starter.costModel.categories.join(" + "))}.`,
    "",
    ...starter.costModel.practices.map((practice) => `* ${text(practice)}`),
    "",
    "## What to share for implementation",
    "",
    "| Minimum context | Status | Supplied value or verification need |",
    "|---|---|---|",
    ...contextRows,
    "",
    "## Implementation recommendations",
    "",
    ...renderRecommendationDetails(view),
    "## Unknowns and verification steps",
    "",
    ...renderUnknowns(view.unknowns),
    "",
    "## Do not do yet",
    "",
    ...starter.doNotDoYet.map((item) => `* ${text(item)}`),
    "",
    "## Source registry",
    "",
    ...renderSources(view.sources),
    "",
  ].join("\n");
}

export function renderGuideMarkdown(view) {
  assertValidatedView(view);
  return view.guideProfile === "starter-guide"
    ? renderStarterGuide(view)
    : renderImprovementGuide(view);
}