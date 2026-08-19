import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";

import {
  loadCitableSources,
  loadTrustedSourceRegistry,
  parseTrustedSourceRegistry,
} from "../.apm/skills/agentic-sdlc-audit/scripts/source-registry.mjs";
import {
  buildRemediationView,
  REMEDIATION_CONTRACT,
} from "../.apm/skills/agentic-sdlc-audit/scripts/remediation-view.mjs";
import { renderGuideMarkdown } from "../.apm/skills/agentic-sdlc-audit/scripts/guide-renderer.mjs";
import { runGuideCommand } from "../.apm/skills/agentic-sdlc-audit/scripts/guide-command.mjs";
import { collectLocalInventory } from "../.apm/skills/agentic-sdlc-audit/scripts/local-collector.mjs";

const registry = await loadTrustedSourceRegistry();
assert.equal(registry.length, 28);
assert.deepEqual(
  registry.map(({ id, status, section, citable }) => ({ id, status, section, citable })),
  [
    ["S1", "VERIFIED", "primary-documentation", true],
    ["S2", "VERIFIED", "primary-documentation", true],
    ["S3", "TITLE-ONLY", "primary-documentation", false],
    ["S4", "TITLE-ONLY", "primary-documentation", false],
    ["S5", "VERIFIED", "primary-documentation", true],
    ["S6", "VERIFIED", "primary-documentation", true],
    ["S7", "VERIFIED", "primary-documentation", true],
    ["S8", "VERIFIED", "primary-documentation", true],
    ["S9", "VERIFIED", "primary-documentation", true],
    ["S10", "VERIFIED", "primary-documentation", true],
    ["S11", "VERIFIED", "primary-documentation", true],
    ["S12", "VERIFIED", "primary-documentation", true],
    ["S13", "VERIFIED", "primary-documentation", true],
    ["S15", "VERIFIED", "primary-documentation", true],
    ["S16", "VERIFIED", "primary-documentation", true],
    ["S18", "TITLE-ONLY", "primary-documentation", false],
    ["S19", "TITLE-ONLY", "primary-documentation", false],
    ["S25", "VERIFIED", "primary-documentation", true],
    ["S26", "VERIFIED", "primary-documentation", true],
    ["S20", "VERIFIED", "tooling", true],
    ["S27", "TITLE-ONLY", "tooling", false],
    ["S28", "VERIFIED", "tooling", true],
    ["S21", "TITLE-ONLY", "evidence", false],
    ["S22", "TITLE-ONLY", "evidence", false],
    ["S23", "TITLE-ONLY", "evidence", false],
    ["S24", "TITLE-ONLY", "evidence", false],
    ["S14", "TITLE-ONLY", "evidence", false],
    ["S17", null, "evidence", false],
  ].map(([id, status, section, citable]) => ({ id, status, section, citable })),
);
assert.equal(Object.isFrozen(registry), true);
assert.equal(registry.every(Object.isFrozen), true);
await assert.rejects(() => loadTrustedSourceRegistry("./alternate-sources.md"), /cannot be overridden/u);
assert.deepEqual((await loadCitableSources(["S1", "S5"])).map(({ id }) => id), ["S1", "S5"]);
await assert.rejects(() => loadCitableSources(["S3"]), /not independently citable/u);
await assert.rejects(() => loadCitableSources(["S999"]), /Unknown source selector/u);

const validRegistry = `## Primary documentation

| ID | Source | URL | Status |
|---|---|---|---|
| S1 | Primary | https://example.com/primary | VERIFIED |

## Tooling

| ID | Source | URL | Status |
|---|---|---|---|
| S2 | Tool | https://example.com/tool | TITLE-ONLY |

## Evidence

| ID | Source | URL | Status | What it actually says |
|---|---|---|---|---|
| S3 | Evidence | https://example.com/evidence | VERIFIED | Supported statement. |
`;

assert.equal(parseTrustedSourceRegistry(validRegistry).length, 3);
assert.throws(() => parseTrustedSourceRegistry(validRegistry.replace("S2", "S1")), /duplicate ID/u);
assert.throws(() => parseTrustedSourceRegistry(validRegistry.replace("S2", "source-2")), /malformed ID/u);
assert.throws(() => parseTrustedSourceRegistry(validRegistry.replace("TITLE-ONLY", "UNKNOWN")), /unknown status/u);
assert.throws(() => parseTrustedSourceRegistry(validRegistry.replace("https://example.com/tool", "http://example.com/tool")), /HTTPS URL/u);
assert.throws(() => parseTrustedSourceRegistry(validRegistry.replace("| S2 | Tool |", "| S2 | Tool | extra |")), /columns/u);

const observedAt = "2026-08-10T00:00:00.000Z";
const finding = {
  id: "missing-root-agents",
  control: "root-agents",
  status: "gap",
  scope: "repository",
  source: { kind: "filesystem", location: "AGENTS.md" },
  consumer: ["cloud-agent", "ide-agent"],
  observation: { observedAt, method: "local-scan", commit: null },
  trust: {
    classification: "trusted-tool",
    contentTreatedAsData: true,
    redaction: { applied: false, fields: [] },
  },
  warnings: [],
  unknowns: [],
};
const inventory = {
  schemaVersion: "1.0.0",
  auditId: "audit-phase-2",
  mode: "strict",
  repository: {
    root: ".",
    identity: "example/project",
    currentBranch: "main",
    defaultBranch: {
      name: "main",
      status: "enforced",
      source: { kind: "git", location: "refs/remotes/origin/HEAD" },
      observation: { observedAt, method: "git-query", commit: null },
    },
  },
  findings: [finding],
  warnings: [],
  unknowns: [],
  outputBudget: {
    maxFindings: 100,
    maxEvidenceBytes: 262144,
    truncated: false,
    omittedFindingCount: 0,
  },
};
const proposal = {
  id: "root-agents-create",
  title: { value: "Create repository agent context", provenance: "model-proposed" },
  action: { value: "Create AGENTS.md with verified commands and boundaries.", provenance: "model-proposed" },
  target: { path: ".\\AGENTS.md", provenance: "model-proposed", canonical: false },
  steps: [
    { value: "Document verified setup and test commands.", provenance: "model-proposed" },
    { value: "Document repository boundaries.", provenance: "model-proposed" },
  ],
  findingIds: [finding.id],
  controlIds: [finding.control],
  sourceRefs: ["S1"],
  reason: {
    observation: {
      summary: "The root agent context control is a gap in the local scan.",
      findingIds: [finding.id],
    },
    mechanism: {
      summary: "Explicit instructions provide stable execution context to coding agents.",
      sourceRefs: ["S1"],
    },
    applicability: {
      consumers: ["cloud-agent"],
      scopes: ["repository"],
      controlIds: [finding.control],
      prerequisites: ["Verify documented commands before publishing."],
    },
    assumptions: [{
      statement: "The documented commands represent supported workflows.",
      provenance: "model-proposed",
      verification: "Run every command in a clean checkout.",
    }],
    limitations: [{
      statement: "No owner-role policy was supplied.",
      effect: "The proposed accountable role remains unconfirmed.",
    }],
  },
  priorityInputs: {
    businessValue: { value: 3, provenance: "model-proposed" },
    timeCriticality: { value: 2, provenance: "model-proposed" },
    riskReduction: { value: 4, provenance: "model-proposed" },
    confidence: { value: 0.75, provenance: "model-proposed" },
    jobSize: { value: 2, provenance: "model-proposed" },
  },
  effort: { label: "S", jobSize: 2, provenance: "model-proposed" },
  owner: { role: "Repository maintainer", provenance: "model-proposed" },
  dependencies: [],
  acceptanceCriteria: [{ value: "A reviewer confirms every command succeeds.", provenance: "model-proposed" }],
  validation: [{ value: "Run each documented command.", provenance: "model-proposed" }],
  measurementPlan: {
    decision: "Retain the context when agent task completion improves without lower test pass rate.",
    primaryMetric: { name: "agent task completion", direction: "increase", unit: "completed tasks" },
    guardrails: [{ name: "test pass rate", direction: "maintain", unit: "ratio" }],
    attribution: "unknown",
    provenance: "model-proposed",
  },
  stopCondition: { value: "Pause rollout if the test pass rate decreases.", provenance: "model-proposed" },
  valueClaim: {
    tier: "expected-value-hypothesis",
    outcome: "More consistent agent task completion",
    causalChain: "Stable context should reduce command selection ambiguity.",
    metricToTest: { name: "agent task completion", direction: "increase", unit: "completed tasks" },
    assumptions: ["Contributors keep the instructions current."],
    limitations: ["External guidance does not predict a local effect size."],
    externalEvidenceLimits: "The source supports the mechanism, not a repository forecast.",
    sourceRefs: ["S1"],
    provenance: "model-proposed",
  },
};

const guideCommandPath = resolve(".apm/skills/agentic-sdlc-audit/scripts/guide-command.mjs");
const auditDispatcherPath = resolve(".apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs");
const baselineRepository = resolve("tests/fixtures/repositories/baseline");

async function snapshotDirectory(root) {
  const snapshot = [];
  async function visit(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name).replaceAll("\\", "/");
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        snapshot.push({ path: `${relativePath}/`, kind: "directory" });
        await visit(path, relativePath);
      } else {
        const metadata = await stat(path);
        snapshot.push({
          path: relativePath,
          kind: "file",
          size: metadata.size,
          content: (await readFile(path)).toString("base64"),
        });
      }
    }
  }
  await visit(root);
  return snapshot;
}

function spawnGuide(envelope, argumentsList = [], options = {}) {
  return spawnSync(
    process.execPath,
    [guideCommandPath, "--repo", baselineRepository, "--consumer", "ide-agent", "--observed-at", observedAt, ...argumentsList],
    {
      cwd: options.cwd,
      encoding: "utf8",
      input: typeof envelope === "string" ? envelope : JSON.stringify(envelope),
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

const dispatcherHelp = spawnSync(process.execPath, [auditDispatcherPath, "--help"], { encoding: "utf8" });
assert.equal(dispatcherHelp.status, 0, dispatcherHelp.stderr);
assert.match(dispatcherHelp.stdout, /--format report\|inventory/u);
assert.doesNotMatch(dispatcherHelp.stdout, /report\|inventory\|guide/u);

const unsupportedGuideFormat = spawnSync(
  process.execPath,
  [auditDispatcherPath, "--repo", baselineRepository, "--mode", "strict", "--format", "guide"],
  { encoding: "utf8" },
);
assert.notEqual(unsupportedGuideFormat.status, 0);
assert.equal(unsupportedGuideFormat.stdout, "");
assert.match(unsupportedGuideFormat.stderr, /Unsupported output format 'guide'/u);

const emptyEnvelope = { contractVersion: REMEDIATION_CONTRACT.version, proposals: [] };
let directOutput = "";
await runGuideCommand({
  argv: ["--repo", baselineRepository, "--consumer", "ide-agent", "--observed-at", observedAt],
  stdin: Readable.from([JSON.stringify(emptyEnvelope)]),
  stdout: new Writable({ write(chunk, _encoding, callback) { directOutput += chunk.toString(); callback(); } }),
});
assert.match(directOutput, /^---\ntitle: Agentic SDLC Developer Improvement Guide\n/u);
assert.doesNotMatch(directOutput, /"schemaVersion"|"findings"/u);

const beforeRepository = await snapshotDirectory(baselineRepository);
const workingDirectory = await mkdtemp(join(tmpdir(), "agentic-sdlc-guide-"));
try {
  const beforeWorkingDirectory = await snapshotDirectory(workingDirectory);
  const { inventory: baselineInventory } = await collectLocalInventory({
    root: baselineRepository,
    mode: "strict",
    observedAt,
  });
  const baselineInstructionScope = baselineInventory.findings.find(
    ({ id }) => id === "copilot-instructions",
  )?.scope;
  assert.ok(baselineInstructionScope, "The baseline fixture must expose Copilot instructions.");
  const processProposal = structuredClone(proposal);
  processProposal.id = "copilot-instructions-improve";
  processProposal.findingIds = ["copilot-instructions"];
  processProposal.controlIds = ["copilot-instructions"];
  processProposal.reason.observation = {
    summary: "The local scan found repository Copilot instructions on the head branch.",
    findingIds: processProposal.findingIds,
  };
  processProposal.reason.applicability = {
    consumers: ["ide-agent"],
    scopes: [baselineInstructionScope],
    controlIds: processProposal.controlIds,
    prerequisites: ["Verify documented commands before publishing."],
  };
  const validEnvelope = { contractVersion: REMEDIATION_CONTRACT.version, proposals: [processProposal] };
  const validProcess = spawnGuide(validEnvelope, [], { cwd: workingDirectory });
  assert.equal(validProcess.status, 0, validProcess.stderr);
  assert.equal(validProcess.stderr, "");
  assert.match(validProcess.stdout, /^---\ntitle: Agentic SDLC Developer Improvement Guide\n/u);
  assert.match(validProcess.stdout, /### copilot&#45;instructions&#45;improve/u);
  assert.doesNotMatch(validProcess.stdout, /"schemaVersion"|"findings"/u);
  assert.deepEqual(await snapshotDirectory(baselineRepository), beforeRepository);
  assert.deepEqual(await snapshotDirectory(workingDirectory), beforeWorkingDirectory);

  const reorderedProcess = spawnGuide({ proposals: [processProposal], contractVersion: REMEDIATION_CONTRACT.version }, [], { cwd: workingDirectory });
  assert.equal(reorderedProcess.status, 0, reorderedProcess.stderr);
  assert.equal(reorderedProcess.stdout, validProcess.stdout);
} finally {
  await rm(workingDirectory, { recursive: true, force: true });
}

for (const [input, argumentsList, expected] of [
  ["", [], /must contain one proposal envelope/u],
  ["{", [], /exactly one valid JSON/u],
  [`${JSON.stringify(emptyEnvelope)} {}`, [], /exactly one valid JSON/u],
  [{ ...emptyEnvelope, inventory: {} }, [], /unknown field 'inventory'/u],
  [{ ...emptyEnvelope, operatorInputs: { mandatoryControlIds: [] } }, [], /unknown field 'mandatoryControlIds'/u],
  [emptyEnvelope, ["--format", "guide"], /Unsupported argument '--format'/u],
  [emptyEnvelope, ["--output-path", "guide.md"], /Unsupported argument '--output-path'/u],
  [emptyEnvelope, ["--mode", "strict"], /Unsupported argument '--mode'/u],
  [" ".repeat(64 * 1024 + 1), [], /cannot exceed 65536 bytes/u],
]) {
  const result = spawnGuide(input, argumentsList);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, expected);
  assert.equal(result.stdout, "");
}

const staleProposal = structuredClone(proposal);
staleProposal.findingIds = ["stale-finding-id"];
staleProposal.reason.observation.findingIds = staleProposal.findingIds;
const staleResult = spawnGuide({ contractVersion: REMEDIATION_CONTRACT.version, proposals: [staleProposal] });
assert.notEqual(staleResult.status, 0);
assert.match(staleResult.stderr, /unknown finding 'stale-finding-id'/u);
assert.equal(staleResult.stdout, "");

const initialView = await buildRemediationView(inventory, { proposals: [proposal] });
assert.equal(REMEDIATION_CONTRACT.version, "1.0.0");
assert.deepEqual(initialView.recommendations[0].findingRefs, ["E01"]);
assert.equal(initialView.recommendations[0].target.path, "AGENTS.md");
assert.equal(initialView.recommendations[0].priorityClass, "optimization");
assert.equal(initialView.recommendations[0].relativePriority.value, 3.375);
assert.equal(initialView.recommendations[0].relativePriority.provenance, "code-derived");
assert.deepEqual(initialView.sources.map(({ id }) => id), ["S1"]);
assert.equal(initialView.unknowns.some(({ control }) => control === "business-objectives"), true);
assert.deepEqual(initialView, await buildRemediationView(inventory, { proposals: [structuredClone(proposal)] }));
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [{ ...proposal, relativePriority: 99 }] }),
  /unknown field 'relativePriority'/u,
);

function mutated(mutator) {
  const value = structuredClone(proposal);
  mutator(value);
  return value;
}

const rejectionCases = [
  [mutated((value) => { value.title.extra = true; }), /title contains unknown field 'extra'/u],
  [mutated((value) => { value.steps = Array.from({ length: 6 }, () => value.steps[0]); }), /steps cannot contain more than 5/u],
  [mutated((value) => { value.acceptanceCriteria = Array.from({ length: 4 }, () => value.acceptanceCriteria[0]); }), /acceptanceCriteria cannot contain more than 3/u],
  [mutated((value) => { value.validation = Array.from({ length: 4 }, () => value.validation[0]); }), /validation cannot contain more than 3/u],
  [mutated((value) => { value.measurementPlan.guardrails = Array.from({ length: 3 }, () => value.measurementPlan.guardrails[0]); }), /guardrails cannot contain more than 2/u],
  [mutated((value) => { value.title.provenance = "invented"; }), /unsupported provenance/u],
  [mutated((value) => { value.findingIds = ["missing-finding"]; value.reason.observation.findingIds = value.findingIds; }), /unknown finding/u],
  [mutated((value) => { value.controlIds = ["unknown-control"]; value.reason.applicability.controlIds = value.controlIds; }), /unknown control/u],
  [mutated((value) => { value.sourceRefs = ["S999"]; value.reason.mechanism.sourceRefs = value.sourceRefs; value.valueClaim.sourceRefs = value.sourceRefs; }), /unknown source/u],
  [mutated((value) => { value.sourceRefs = ["S3"]; value.reason.mechanism.sourceRefs = value.sourceRefs; value.valueClaim.sourceRefs = value.sourceRefs; }), /not independently citable and VERIFIED/u],
  [mutated((value) => { value.target.path = "../AGENTS.md"; }), /repository-relative/u],
  [mutated((value) => { value.target.canonical = true; }), /model-proposed paths must be noncanonical/u],
  [mutated((value) => { value.owner.role = "Dr Jane Developer"; }), /never an individual/u],
  [mutated((value) => { delete value.reason.limitations; }), /missing required field 'limitations'/u],
  [mutated((value) => { value.reason.extra = true; }), /reason contains unknown field 'extra'/u],
  [mutated((value) => { value.reason.observation.summary = "The change improved task completion."; }), /repository facts only/u],
  [mutated((value) => { value.reason.mechanism.summary = "The repository is missing a root file."; }), /must not assert repository facts/u],
  [mutated((value) => { value.reason.assumptions[0].verification = ""; }), /verification must be a non-empty string/u],
  [mutated((value) => { value.reason.limitations[0].effect = ""; }), /effect must be a non-empty string/u],
  [mutated((value) => { value.priorityInputs.confidence.value = 0.6; }), /outside the allowed ordinal anchors/u],
  [mutated((value) => { value.valueClaim.outcome = "Save 20% of developer hours"; }), /cannot contain numeric benefit/u],
  [mutated((value) => { value.valueClaim.outcome = "Reduce review time by 3 days"; }), /cannot contain numeric benefit/u],
  [mutated((value) => { value.valueClaim.outcome = "Improve throughput 2x"; }), /cannot contain numeric benefit/u],
  [mutated((value) => { value.valueClaim.outcome = "Double throughput"; }), /cannot contain numeric benefit/u],
  [mutated((value) => { value.valueClaim.result = 20; }), /unknown field 'result'/u],
];

for (const [invalidProposal, expected] of rejectionCases) {
  await assert.rejects(() => buildRemediationView(inventory, { proposals: [invalidProposal] }), expected);
}

await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [mutated((value) => { value.dependencies = ["missing-recommendation"]; })] }),
  /unknown dependency/u,
);
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [mutated((value) => { value.dependencies = [value.id]; })] }),
  /cannot depend on itself/u,
);
const cycleA = mutated((value) => { value.id = "cycle-a"; value.dependencies = ["cycle-b"]; });
const cycleB = mutated((value) => { value.id = "cycle-b"; value.dependencies = ["cycle-a"]; });
await assert.rejects(() => buildRemediationView(inventory, { proposals: [cycleA, cycleB] }), /dependency cycle/u);

const unverifiedFinding = { ...structuredClone(finding), id: "root-agents-unverified", status: "unverified" };
const verifyProposal = mutated((value) => {
  value.id = "root-agents-verify";
  value.action.value = "Verify whether AGENTS.md is present on the default branch.";
  value.findingIds = [unverifiedFinding.id];
  value.reason.observation.findingIds = value.findingIds;
});
const verifyView = await buildRemediationView({ ...inventory, findings: [unverifiedFinding] }, { proposals: [verifyProposal] });
assert.equal(verifyView.recommendations[0].priorityClass, "verify-first");
await assert.rejects(
  () => buildRemediationView({ ...inventory, findings: [unverifiedFinding] }, { proposals: [mutated((value) => {
    value.action.value = "Create AGENTS.md with repository commands and boundaries.";
    value.findingIds = [unverifiedFinding.id];
    value.reason.observation.findingIds = value.findingIds;
  })] }),
  /must be a verification action/u,
);

const gateProposal = mutated((value) => {
  value.id = "required-review-enable";
  value.controlIds = ["required-human-review"];
  value.reason.applicability.controlIds = value.controlIds;
});
const orderedView = await buildRemediationView(inventory, { proposals: [proposal, gateProposal] });
assert.deepEqual(orderedView.recommendations.map(({ id }) => id), ["required-review-enable", "root-agents-create"]);
assert.equal(orderedView.recommendations[0].priorityClass, "advancement-gate");

const proxyProposal = mutated((value) => {
  value.id = "root-agents-proxy";
  value.valueClaim = {
    tier: "observed-proxy",
    metric: { name: "review time", category: "flow", unit: "hours", direction: "decrease" },
    baseline: { value: 10, window: { start: "2026-06-01", end: "2026-06-30" }, sampleSize: 20, evidenceRefs: ["L1"] },
    observed: { value: 8, window: { start: "2026-07-01", end: "2026-07-31" }, sampleSize: 22, evidenceRefs: ["L2"] },
    calculation: { formulaId: "relative-change-v1" },
    attribution: { method: "descriptive", concurrentChanges: [], limitations: ["The result is descriptive and not causal."] },
    localEvidence: [
      { id: "review-time-baseline", kind: "local-telemetry", location: "metrics/june.json", observedAt: "2026-06-15T00:00:00.000Z", provenance: "code-derived" },
      { id: "review-time-observed", kind: "local-telemetry", location: "metrics/july.json", observedAt: "2026-07-15T00:00:00.000Z", provenance: "code-derived" },
    ],
    provenance: "code-derived",
  };
  value.valueClaim.baseline.evidenceRefs = ["review-time-baseline"];
  value.valueClaim.observed.evidenceRefs = ["review-time-observed"];
});
const telemetryFinding = (id, location, findingObservedAt, metricValue, sampleSize) => ({
  id,
  control: "baseline-metrics",
  status: "enforced",
  scope: "repository",
  source: { kind: "derived", location },
  consumer: ["cloud-agent", "ide-agent"],
  observation: { observedAt: findingObservedAt, method: "local-scan", commit: null },
  trust: {
    classification: "trusted-tool",
    contentTreatedAsData: true,
    redaction: { applied: false, fields: [] },
  },
  discovery: {
    totalCount: sampleSize,
    sampledPaths: [location],
    sampleCount: 1,
    truncated: true,
    workingTreeCount: 0,
    indexCount: metricValue,
    headCount: metricValue,
  },
  warnings: [],
  unknowns: [],
});
const proxyInventory = {
  ...inventory,
  findings: [
    finding,
    telemetryFinding("review-time-baseline", "metrics/june.json", "2026-06-15T00:00:00.000Z", 10, 20),
    telemetryFinding("review-time-observed", "metrics/july.json", "2026-07-15T00:00:00.000Z", 8, 22),
  ],
};
const proxyView = await buildRemediationView(proxyInventory, { proposals: [proxyProposal] });
assert.equal(proxyView.recommendations[0].valueClaim.calculation.result, -0.2);
assert.equal(proxyView.recommendations[0].valueClaim.calculation.provenance, "code-derived");
await assert.rejects(
  () => buildRemediationView(proxyInventory, { proposals: [mutated((value) => { value.valueClaim = { ...proxyProposal.valueClaim, result: 0.2 }; })] }),
  /unknown field 'result'/u,
);
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [proxyProposal] }),
  /must match a fresh inventory record or operatorInputs\.claimEvidence exactly/u,
);
await assert.rejects(
  () => buildRemediationView(proxyInventory, { proposals: [mutated((value) => {
    value.valueClaim = structuredClone(proxyProposal.valueClaim);
    value.valueClaim.observed.value = 7;
  })] }),
  /value and sampleSize must match referenced fresh inventory values/u,
);
await assert.rejects(
  () => buildRemediationView(proxyInventory, { proposals: [mutated((value) => {
    value.valueClaim = structuredClone(proxyProposal.valueClaim);
    value.valueClaim.localEvidence[1].location = "metrics/fabricated.json";
  })] }),
  /must match a fresh inventory record or operatorInputs\.claimEvidence exactly/u,
);

const localFinancialEvidence = { id: "F1", kind: "operator-supplied", location: "finance/approval", observedAt, provenance: "operator-supplied" };
const zeroCostEntry = { amount: 0, evidenceRefs: ["F1"] };
const financialProposal = mutated((value) => {
  value.id = "root-agents-roi";
  value.valueClaim = {
    tier: "measured-financial-roi",
    currency: "USD",
    window: { start: "2026-01-01", end: "2026-06-30" },
    sample: { eligible: 10, completed: 8, excluded: 2, exclusionNotes: ["Two tasks lacked complete telemetry."] },
    realizedBenefits: [{ category: "avoided-contractor-spend", amount: 1500, evidenceRefs: ["F1"] }],
    incrementalCosts: {
      licensesOrCredits: { amount: 100, evidenceRefs: ["F1"] },
      compute: structuredClone(zeroCostEntry),
      implementation: { amount: 200, evidenceRefs: ["F1"] },
      enablement: structuredClone(zeroCostEntry),
      measurement: { amount: 100, evidenceRefs: ["F1"] },
      reviewAndRework: { amount: 100, evidenceRefs: ["F1"] },
      maintenance: structuredClone(zeroCostEntry),
      learningPeriod: structuredClone(zeroCostEntry),
      other: [],
      total: 500,
    },
    attribution: {
      method: "matched-before-after",
      counterfactual: "Contractor spend would have continued without completed internal work.",
      concurrentChanges: [],
      limitations: ["The observation window is limited."],
      evidenceRefs: ["F1"],
    },
    uncertainty: { method: "scenario range", low: 1000, high: 1700, sensitivityAssumptions: ["Benefit is recognized only for completed work."] },
    financeApproval: { accountableRole: "Finance controller", approvalDate: "2026-08-10", valuationMethod: "invoice avoidance", evidenceRef: "F1" },
    localEvidence: [localFinancialEvidence],
    formulaId: "measured-financial-roi-v1",
    provenance: "operator-supplied",
  };
});
const financialClaimEvidence = [{
  localEvidence: structuredClone(localFinancialEvidence),
  valueClaim: structuredClone(financialProposal.valueClaim),
}];
const financialOptions = {
  proposals: [financialProposal],
  operatorInputs: { claimEvidence: financialClaimEvidence },
};
const financialView = await buildRemediationView(inventory, financialOptions);
assert.deepEqual(financialView.recommendations[0].valueClaim.result, {
  benefitTotal: 1500,
  costTotal: 500,
  roiPercent: 200,
  provenance: "code-derived",
});
for (const invalidApprovalDate of ["2026-02-29", "2026-02-30"]) {
  const invalidDateProposal = structuredClone(financialProposal);
  invalidDateProposal.valueClaim.financeApproval.approvalDate = invalidApprovalDate;
  const invalidDateEvidence = structuredClone(financialClaimEvidence);
  invalidDateEvidence[0].valueClaim.financeApproval.approvalDate = invalidApprovalDate;
  await assert.rejects(
    () => buildRemediationView(inventory, {
      proposals: [invalidDateProposal],
      operatorInputs: { claimEvidence: invalidDateEvidence },
    }),
    /must be an ISO date/u,
  );
}
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [financialProposal] }),
  /must match a fresh inventory record or operatorInputs\.claimEvidence exactly/u,
);
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [mutated((value) => {
    value.valueClaim = structuredClone(financialProposal.valueClaim);
    value.valueClaim.incrementalCosts.total = 499;
  })], operatorInputs: { claimEvidence: financialClaimEvidence } }),
  /does not match code-derived costs/u,
);
await assert.rejects(
  () => buildRemediationView(inventory, { proposals: [mutated((value) => {
    value.valueClaim = structuredClone(financialProposal.valueClaim);
    for (const entry of Object.values(value.valueClaim.incrementalCosts)) {
      if (entry && typeof entry === "object" && "amount" in entry) entry.amount = 0;
    }
    value.valueClaim.incrementalCosts.total = 0;
  })], operatorInputs: { claimEvidence: financialClaimEvidence } }),
  /greater than zero/u,
);
for (const mutateFinancialClaim of [
  (value) => {
    value.incrementalCosts.implementation.amount = 250;
    value.incrementalCosts.total = 550;
  },
  (value) => { value.realizedBenefits[0].amount = 1600; },
  (value) => { value.financeApproval.valuationMethod = "fabricated estimate"; },
  (value) => { value.localEvidence[0].location = "finance/fabricated-approval"; },
]) {
  await assert.rejects(
    () => buildRemediationView(inventory, {
      proposals: [mutated((value) => {
        value.valueClaim = structuredClone(financialProposal.valueClaim);
        mutateFinancialClaim(value.valueClaim);
      })],
      operatorInputs: { claimEvidence: financialClaimEvidence },
    }),
    /must match a fresh inventory record or operatorInputs\.claimEvidence exactly/u,
  );
}

const guide = renderGuideMarkdown(initialView);
assert.equal(guide, renderGuideMarkdown(initialView));
const sectionHeadings = [
  "## Verdict and next action",
  "## Prioritized roadmap",
  "## Recommendation details",
  "## Deferred actions and prerequisites",
  "## Unknowns and verification steps",
  "## Source registry",
];
assert.deepEqual(
  [...guide.matchAll(/^## .+$/gmu)].map(([heading]) => heading),
  sectionHeadings,
);
for (const required of [
  "root&#45;agents&#45;create",
  "AGENTS&#46;md",
  "Repository maintainer",
  "Expected value hypothesis",
  "E01",
  "#### Steps",
  "#### Reason",
  "#### Dependencies",
  "#### Acceptance criteria",
  "#### Validation",
  "#### Measurement",
  "#### Stop condition",
]) assert.match(guide, new RegExp(required, "u"));
assert.doesNotMatch(guide, /3\.375|relativePriority|priorityInputs/u);
assert.match(guide, /## Deferred actions and prerequisites\n\nNone\./u);
assert.match(guide, /S1: \[AGENTS&#46;md/u);

const proxyGuide = renderGuideMarkdown(proxyView);
for (const required of [
  "Tier: Observed proxy",
  "Baseline: 10 from 2026&#45;06&#45;01 to 2026&#45;06&#45;30 (sample 20)",
  "Observed: 8 from 2026&#45;07&#45;01 to 2026&#45;07&#45;31 (sample 22)",
  "Change: &#45;0&#46;2 using relative&#45;change&#45;v1",
  "Attribution: descriptive",
]) assert.equal(proxyGuide.includes(required), true);

const financialGuide = renderGuideMarkdown(financialView);
for (const required of [
  "Tier: Measured financial ROI",
  "Window: 2026&#45;01&#45;01 to 2026&#45;06&#45;30",
  "Sample: 8 completed of 10 eligible; 2 excluded",
  "Benefits: USD 1500",
  "Incremental costs: USD 500",
  "Measured ROI: 200% using measured&#45;financial&#45;roi&#45;v1",
]) assert.equal(financialGuide.includes(required), true);

const adversarialProposal = mutated((value) => {
  value.title.value = "Unsafe\n## Injected heading <!-- comment -->";
  value.action.value = "Use ghp_abcdefghijklmnopqrstuvwxyz1234567890 safely.";
  value.steps[0].value = "First\n1. injected item";
});
const adversarialGuide = renderGuideMarkdown(await buildRemediationView(inventory, { proposals: [adversarialProposal] }));
assert.doesNotMatch(adversarialGuide, /^## Injected heading$/mu);
assert.doesNotMatch(adversarialGuide, /<!-- comment -->/u);
assert.doesNotMatch(adversarialGuide, /ghp_abcdefghijklmnopqrstuvwxyz1234567890/u);
assert.match(adversarialGuide, /&#91;REDACTED&#93;/u);
assert.equal([...adversarialGuide.matchAll(/^## .+$/gmu)].length, sectionHeadings.length);

assert.throws(() => renderGuideMarkdown(inventory), /validated remediation view/iu);
assert.throws(
  () => renderGuideMarkdown({ ...initialView, schemaVersion: "2.0.0" }),
  /Unsupported remediation view version/u,
);
assert.throws(
  () => renderGuideMarkdown({ ...initialView, outputBudget: { ...initialView.outputBudget, maxSteps: 99 } }),
  /validated remediation view/u,
);

process.stdout.write("Developer improvement guide contracts passed.\n");