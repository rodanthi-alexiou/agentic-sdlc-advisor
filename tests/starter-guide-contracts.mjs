import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { REMEDIATION_CONTRACT } from "../.apm/skills/agentic-sdlc-audit/scripts/remediation-view.mjs";

const observedAt = "2026-08-18T00:00:00.000Z";
const guideCommandPath = resolve(".apm/skills/agentic-sdlc-audit/scripts/guide-command.mjs");
const auditDispatcherPath = resolve(".apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs");
const baselineRepository = resolve("tests/fixtures/repositories/baseline");
const promptPath = resolve(".apm/prompts/agentic-sdlc-audit.prompt.md");

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

function spawnStarterGuide(envelope, extraArguments = []) {
  return spawnSync(
    process.execPath,
    [
      guideCommandPath,
      "--repo",
      baselineRepository,
      "--consumer",
      "ide-agent",
      "--observed-at",
      observedAt,
      "--profile",
      "starter-guide",
      ...extraArguments,
    ],
    {
      encoding: "utf8",
      input: JSON.stringify(envelope),
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

const proposal = {
  id: "copilot-instructions-tighten",
  title: { value: "Tighten starter repository instructions", provenance: "model-proposed" },
  action: {
    value: "Update .github/copilot-instructions.md with verified commands and boundaries.",
    provenance: "model-proposed",
  },
  target: {
    path: ".github/copilot-instructions.md",
    provenance: "model-proposed",
    canonical: false,
  },
  steps: [
    { value: "Run and record the supported setup and focused validation commands.", provenance: "model-proposed" },
    { value: "Keep only non-obvious repository boundaries and definition of done.", provenance: "model-proposed" },
  ],
  findingIds: ["copilot-instructions"],
  controlIds: ["copilot-instructions"],
  sourceRefs: ["S1"],
  reason: {
    observation: {
      summary: "The local inventory found Copilot instructions on the head branch.",
      findingIds: ["copilot-instructions"],
    },
    mechanism: {
      summary: "Concise verified instructions reduce ambiguous command and boundary selection.",
      sourceRefs: ["S1"],
    },
    applicability: {
      consumers: ["ide-agent"],
      scopes: ["working-tree"],
      controlIds: ["copilot-instructions"],
      prerequisites: ["Verify every documented command in a clean checkout."],
    },
    assumptions: [{
      statement: "The existing Copilot instruction surface is the intended starter surface.",
      provenance: "model-proposed",
      verification: "Confirm the enabled Copilot surfaces with the operator.",
    }],
    limitations: [{
      statement: "Reviewer capacity and current command failures were not supplied.",
      effect: "Rollout size and validation breadth remain unverified.",
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
  acceptanceCriteria: [{
    value: "A reviewer confirms every command and repository path in .github/copilot-instructions.md.",
    provenance: "model-proposed",
  }],
  validation: [{
    value: "Run the documented focused checks from a clean checkout.",
    provenance: "model-proposed",
  }],
  measurementPlan: {
    decision: "Keep the instructions when retries decline without lower focused-check pass rate.",
    primaryMetric: { name: "agent retries", direction: "decrease", unit: "retry count" },
    guardrails: [{ name: "focused-check pass rate", direction: "maintain", unit: "ratio" }],
    attribution: "unknown",
    provenance: "model-proposed",
  },
  stopCondition: {
    value: "Stop the pilot when setup cannot reach the documented focused checks.",
    provenance: "model-proposed",
  },
  valueClaim: {
    tier: "expected-value-hypothesis",
    outcome: "Fewer avoidable retries and less reviewer correction",
    causalChain: "Verified context and commands should reduce ambiguity before implementation and review.",
    metricToTest: { name: "agent retries", direction: "decrease", unit: "retry count" },
    assumptions: ["The bounded task has an accountable human reviewer."],
    limitations: ["External evidence does not establish a local financial return."],
    externalEvidenceLimits: "The source supports the mechanism, not a repository-specific outcome.",
    sourceRefs: ["S1"],
    provenance: "model-proposed",
  },
};

const envelope = {
  contractVersion: REMEDIATION_CONTRACT.version,
  proposals: [proposal],
  operatorInputs: {
    starterContext: {
      teamSizeReviewerCapacity: ["Four engineers; one reviewer can own the pilot."],
      candidateTaskOwner: ["One documentation-and-test task owned by the repository maintainer."],
    },
  },
};

const before = await snapshotDirectory(baselineRepository);
const prompt = await readFile(promptPath, "utf8");
assert.match(prompt, /argument-hint: 'Optional focus: starter-guide,/u);
assert.match(prompt, /Add `--profile starter-guide` only for the beginner flow/u);
assert.match(prompt, /do not recommend multi-agent\s+orchestration/u);

const result = spawnStarterGuide(envelope);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stderr, "");
assert.deepEqual(await snapshotDirectory(baselineRepository), before);

const headings = [
  "## Beginner verdict and one next action",
  "## Ordered starter flow",
  "## AGENTS.md vs .github/copilot-instructions.md",
  "## Cost per trusted merged outcome",
  "## What to share for implementation",
  "## Implementation recommendations",
  "## Unknowns and verification steps",
  "## Do not do yet",
  "## Source registry",
];
assert.deepEqual(
  [...result.stdout.matchAll(/^## .+$/gmu)].map(([heading]) => heading),
  headings,
);

for (const expected of [
  "Beginner verdict:",
  "Frame one bounded task",
  "Start with narrow context",
  "Add concise repository instructions",
  "Make setup and validation deterministic",
  "Keep review human&#45;owned and PRs bounded",
  "Measure the trusted merged outcome",
  "Use: &#46;github/copilot&#45;instructions&#46;md",
  "AI usage &#43; CI and runner usage &#43; developer interaction &#43; human review &#43; rework &#43; operational risk",
  "Team size and reviewer capacity | SHARED",
  "Copilot plan and enabled surfaces | UNVERIFIED",
  "Private feeds, network, and firewall constraints | UNVERIFIED",
  "Build and test commands plus known failures | UNVERIFIED",
  "Prior agent usage and observed failure modes | UNVERIFIED",
  "One bounded candidate task and its human owner | SHARED",
  "Baseline review, rework, and CI signals | UNVERIFIED",
  "### copilot&#45;instructions&#45;tighten",
  "Acceptance criteria",
  "Do not recommend multi&#45;agent orchestration",
]) {
  assert.equal(result.stdout.includes(expected), true, `Missing starter guide text: ${expected}`);
}

assert.doesNotMatch(result.stdout, /\b\d+(?:\.\d+)?\s*%|\bROI:\s*\d/iu);
assert.doesNotMatch(result.stdout, /relativePriority|priorityInputs/u);

const unsupportedProfile = spawnStarterGuide(envelope, ["--profile", "unknown"]);
assert.notEqual(unsupportedProfile.status, 0);
assert.match(unsupportedProfile.stderr, /Argument '--profile' may be provided only once/u);
assert.equal(unsupportedProfile.stdout, "");

const directUnsupportedProfile = spawnSync(
  process.execPath,
  [
    guideCommandPath,
    "--repo",
    baselineRepository,
    "--profile",
    "unknown",
  ],
  { encoding: "utf8", input: JSON.stringify(envelope) },
);
assert.notEqual(directUnsupportedProfile.status, 0);
assert.match(directUnsupportedProfile.stderr, /Unsupported guide profile 'unknown'/u);
assert.equal(directUnsupportedProfile.stdout, "");

const unknownStarterContext = structuredClone(envelope);
unknownStarterContext.operatorInputs.starterContext.unboundedAuthority = ["enabled"];
const closedEnvelopeResult = spawnStarterGuide(unknownStarterContext);
assert.notEqual(closedEnvelopeResult.status, 0);
assert.match(closedEnvelopeResult.stderr, /starterContext contains unknown field 'unboundedAuthority'/u);
assert.equal(closedEnvelopeResult.stdout, "");

function unsafeNarrativeProposal(mutate) {
  const value = structuredClone(proposal);
  mutate(value);
  return value;
}

for (const unsafeProposal of [
  {
    ...structuredClone(proposal),
    id: "agent-fanout-enable",
    title: { value: "Coordinate specialist workers", provenance: "model-proposed" },
    action: {
      value: "Dispatch specialist workers concurrently and combine their changes.",
      provenance: "model-proposed",
    },
  },
  {
    ...structuredClone(proposal),
    id: "specialist-workers-enable",
    controlIds: ["multi-agent-orchestration"],
    reason: {
      ...structuredClone(proposal.reason),
      applicability: {
        ...structuredClone(proposal.reason.applicability),
        controlIds: ["multi-agent-orchestration"],
      },
    },
  },
  unsafeNarrativeProposal((value) => {
    value.acceptanceCriteria[0].value = "Specialized agents work in parallel before review.";
  }),
  unsafeNarrativeProposal((value) => {
    value.validation[0].value = "Validate the output from multi-agent orchestration.";
  }),
  unsafeNarrativeProposal((value) => {
    value.measurementPlan.decision = "Retain agent fan-out when throughput improves.";
  }),
  unsafeNarrativeProposal((value) => {
    value.stopCondition.value = "Stop when parallel agents produce conflicting changes.";
  }),
]) {
  const unsafeStarter = spawnStarterGuide({
    ...envelope,
    proposals: [unsafeProposal],
  });
  assert.notEqual(unsafeStarter.status, 0);
  assert.match(unsafeStarter.stderr, /cannot recommend multi-agent orchestration or fan-out in the starter guide/u);
  assert.equal(unsafeStarter.stdout, "");
}

const publicStarterFormat = spawnSync(
  process.execPath,
  [
    auditDispatcherPath,
    "--repo",
    baselineRepository,
    "--mode",
    "strict",
    "--format",
    "starter-guide",
  ],
  { encoding: "utf8" },
);
assert.notEqual(publicStarterFormat.status, 0);
assert.match(publicStarterFormat.stderr, /Unsupported output format 'starter-guide'/u);
assert.equal(publicStarterFormat.stdout, "");

process.stdout.write("Starter guide contracts passed.\n");
