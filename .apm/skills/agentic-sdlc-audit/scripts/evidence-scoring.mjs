const CONSUMER_SCOPES = Object.freeze({
  "ide-agent": ["working-tree", "head-branch", "default-branch", "repository", "organization"],
  "code-review": ["head-branch", "default-branch", "repository", "organization"],
  "cloud-agent": ["default-branch", "repository", "organization"],
  maintainer: ["working-tree", "head-branch", "default-branch", "repository", "organization"],
  ci: ["default-branch", "repository", "organization"],
  unknown: [],
});

const SOURCE_PRECEDENCE = Object.freeze({
  "github-api": 6,
  derived: 5,
  git: 4,
  operator: 3,
  filesystem: 2,
  unsupported: 1,
});

const STATUS_PRECEDENCE = Object.freeze({
  enforced: 8,
  gap: 7,
  disabled: 6,
  unauthorized: 5,
  unauthenticated: 4,
  unavailable: 3,
  "local-only": 2,
  unverified: 1,
});

const CONTROL = Object.freeze({
  rootContext: ["root-agents", "copilot-instructions"],
  contextAccurate: ["context-accurate"],
  contextCommands: ["context-commands-verified"],
  contextBoundaries: ["context-boundaries"],
  contextMaintained: ["context-maintained"],
  contextScoped: ["path-instructions", "nested-agents"],
  prompts: ["prompt-files"],
  agents: ["custom-agents"],
  skills: ["agent-skills"],
  assetsOwned: ["reusable-assets-owned"],
  setup: ["copilot-setup-steps"],
  setupValid: ["copilot-setup-valid"],
  privateDependencies: ["private-dependencies-resolve"],
  firewall: ["agent-firewall"],
  build: ["build-command-verified"],
  tests: ["test-feedback-loop"],
  reproducible: ["environment-reproducible"],
  protection: ["default-branch-protection"],
  review: ["required-human-review"],
  checks: ["required-status-checks"],
  codeowners: ["codeowners-sensitive-paths"],
  codeScanning: ["code-scanning-blocking"],
  secretScanning: ["secret-scanning-push-protection"],
  injection: ["prompt-injection-posture"],
  tokens: ["least-privilege-agent-tokens"],
  issueTemplate: ["issue-templates"],
  metrics: ["baseline-metrics"],
  decomposition: ["agent-sized-decomposition"],
  reviewCapacity: ["review-capacity"],
  specFlow: ["spec-driven-development"],
  metricsReview: ["metrics-review-changed-decision"],
});

export const SCORING_CONTRACT = Object.freeze({
  version: "1.0.0",
  pillars: {
    context: [
      { level: 1, all: [CONTROL.rootContext] },
      { level: 2, all: [CONTROL.contextAccurate] },
      { level: 3, all: [CONTROL.contextCommands, CONTROL.contextBoundaries, CONTROL.contextMaintained] },
      { level: 4, all: [CONTROL.contextScoped] },
    ],
    reusableAssets: [
      { level: 1, any: [CONTROL.prompts, CONTROL.agents, CONTROL.skills] },
      { level: 2, all: [CONTROL.prompts] },
      { level: 3, any: [CONTROL.agents, CONTROL.skills] },
      { level: 4, all: [CONTROL.assetsOwned] },
    ],
    agentEnvironment: [
      { level: 1, all: [CONTROL.setup] },
      { level: 2, all: [CONTROL.setupValid] },
      { level: 3, all: [CONTROL.privateDependencies, CONTROL.firewall, CONTROL.build, CONTROL.tests] },
      { level: 4, all: [CONTROL.reproducible] },
    ],
    guardrails: [
      { level: 1, all: [CONTROL.protection, CONTROL.review, CONTROL.checks, CONTROL.secretScanning] },
      { level: 2, all: [CONTROL.protection, CONTROL.review, CONTROL.checks] },
      { level: 3, all: [CONTROL.codeowners, CONTROL.codeScanning, CONTROL.secretScanning] },
      { level: 4, all: [CONTROL.injection, CONTROL.tokens] },
    ],
    processMeasurement: [
      { level: 1, all: [CONTROL.issueTemplate] },
      { level: 2, all: [CONTROL.issueTemplate, CONTROL.metrics] },
      { level: 3, all: [CONTROL.decomposition, CONTROL.reviewCapacity] },
      { level: 4, all: [CONTROL.specFlow, CONTROL.metricsReview] },
    ],
  },
  advancementGates: {
    1: [CONTROL.protection, CONTROL.review, CONTROL.build, CONTROL.tests, CONTROL.secretScanning],
    2: [CONTROL.rootContext, CONTROL.contextCommands, CONTROL.contextBoundaries, CONTROL.contextMaintained, CONTROL.codeScanning, CONTROL.codeowners],
    3: [CONTROL.setupValid, CONTROL.privateDependencies, CONTROL.firewall, CONTROL.issueTemplate, CONTROL.metrics, CONTROL.reviewCapacity],
    4: [["agent-pr-merge-rate"], ["agent-pr-revert-rate"], ["review-wait-time-stable"], CONTROL.injection, CONTROL.metricsReview],
  },
});

function appliesToConsumer(finding, consumer) {
  if (!finding.consumer?.includes(consumer)) return false;
  if (finding.status === "local-only") return consumer === "ide-agent" || consumer === "maintainer";
  return CONSUMER_SCOPES[consumer]?.includes(finding.scope) === true;
}

function compareEvidence(left, right, consumer) {
  const scopes = CONSUMER_SCOPES[consumer] ?? [];
  const leftScope = scopes.indexOf(left.scope);
  const rightScope = scopes.indexOf(right.scope);
  return (
    (SOURCE_PRECEDENCE[right.source.kind] ?? 0) - (SOURCE_PRECEDENCE[left.source.kind] ?? 0) ||
    rightScope - leftScope ||
    (STATUS_PRECEDENCE[right.status] ?? 0) - (STATUS_PRECEDENCE[left.status] ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

export function mergeEvidence(findings, consumer) {
  if (!(consumer in CONSUMER_SCOPES)) throw new Error(`Unsupported consumer '${consumer}'.`);
  const byControl = new Map();
  for (const finding of findings) {
    if (!appliesToConsumer(finding, consumer)) continue;
    const normalized = finding.control === "dependency-review"
      ? { ...finding, status: "unverified" }
      : finding;
    const candidates = byControl.get(normalized.control) ?? [];
    candidates.push(normalized);
    byControl.set(normalized.control, candidates);
  }
  return [...byControl.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([control, candidates]) => ({
      control,
      finding: [...candidates].sort((left, right) => compareEvidence(left, right, consumer))[0],
      candidatesConsidered: candidates.length,
    }));
}

function hasEnforcedControl(evidenceByControl, alternatives) {
  return alternatives.some((control) => evidenceByControl.get(control)?.status === "enforced");
}

function requirementSatisfied(evidenceByControl, requirement) {
  const groups = requirement.all ?? requirement.any ?? [];
  const results = groups.map((alternatives) => hasEnforcedControl(evidenceByControl, alternatives));
  return requirement.all ? results.every(Boolean) : results.some(Boolean);
}

export function scoreEvidence(findings, options = {}) {
  const consumer = options.consumer ?? "cloud-agent";
  const contract = options.contract ?? SCORING_CONTRACT;
  const merged = mergeEvidence(findings, consumer);
  const evidenceByControl = new Map(merged.map(({ control, finding }) => [control, finding]));
  const pillars = {};

  for (const [pillar, levels] of Object.entries(contract.pillars)) {
    let score = 0;
    for (const requirement of levels) {
      if (!requirementSatisfied(evidenceByControl, requirement)) break;
      score = requirement.level;
    }
    pillars[pillar] = score;
  }

  const overall = Math.min(...Object.values(pillars));
  const nextLevel = Math.min(overall + 1, 4);
  const advancementGates = (contract.advancementGates[nextLevel] ?? [])
    .map((alternatives) => ({
      controls: [...alternatives],
      satisfied: hasEnforcedControl(evidenceByControl, alternatives),
    }))
    .filter((gate) => !gate.satisfied);

  return {
    contractVersion: contract.version,
    consumer,
    pillars,
    overall,
    nextLevel,
    advancementGates,
    evidence: merged,
  };
}