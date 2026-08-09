import assert from "node:assert/strict";

import {
  normalizeRemoteObservation,
  parseGitHubRemote,
  resolveRepositoryEvidence,
} from "../.apm/skills/agentic-sdlc-audit/scripts/github-remote-adapter.mjs";
import {
  mergeEvidence,
  scoreEvidence,
} from "../.apm/skills/agentic-sdlc-audit/scripts/evidence-scoring.mjs";

const observedAt = "2026-08-09T00:00:00.000Z";

const remoteCases = new Map([
  ["https://github.com/example/project.git", "github.com/example/project"],
  ["git@github.com:example/project.git", "github.com/example/project"],
  ["ssh://git@github.example.test/example/project.git", "github.example.test/example/project"],
  ["https://github.example.test/example/project", "github.example.test/example/project"],
]);
for (const [remote, expected] of remoteCases) {
  assert.equal(parseGitHubRemote(remote)?.identity, expected);
}
for (const remote of ["", "not-a-remote", "file:///tmp/repo", "https://github.com/only-owner", "https://github.com/a/b/c"]) {
  assert.equal(parseGitHubRemote(remote), null);
}

const repository = resolveRepositoryEvidence({
  remoteUrl: "git@github.com:example/project.git",
  remoteHead: { remote: "origin", name: "master" },
  metadata: {
    authenticated: true,
    responseClass: "success",
    httpStatus: 200,
    host: "github.com",
    owner: "example",
    repository: "project",
    defaultBranch: "main",
  },
  observedAt,
});
assert.equal(repository.defaultBranch.name, "main");
assert.equal(repository.defaultBranch.source.kind, "github-api");

const ambiguous = normalizeRemoteObservation({
  control: "default-branch-protection",
  endpoint: "legacy-branch-protection",
  httpStatus: 404,
  responseClass: "not-found",
  prerequisite: { name: "repository and branch access", verified: true },
  permission: { required: "administration:read", granted: true },
  feature: { availability: "available", enabled: null },
}, observedAt);
assert.equal(ambiguous.finding.status, "unverified");

const verifiedNegative = normalizeRemoteObservation({
  control: "default-branch-protection",
  endpoint: "legacy-branch-protection",
  httpStatus: 404,
  responseClass: "not-found",
  prerequisite: { name: "repository and branch access", verified: true },
  permission: { required: "administration:read", granted: true },
  feature: { availability: "available", enabled: null },
  notFoundSemantics: "verified-negative",
  corroboration: "no-effective-rules",
}, observedAt);
assert.equal(verifiedNegative.finding.status, "gap");
assert.equal("body" in verifiedNegative, false);
assert.equal("headers" in verifiedNegative, false);

assert.throws(() => normalizeRemoteObservation({
  control: "secret-scanning",
  endpoint: "repository-metadata",
  responseClass: "success",
  prerequisite: { name: "repository access", verified: true },
  permission: { required: "metadata:read", granted: true },
  feature: { availability: "available", enabled: true },
  observed: true,
  headers: { authorization: "Bearer github_pat_123456789012345678901234567890" },
}, observedAt), /forbidden|raw response/iu);

function finding(control, status, scope, sourceKind, consumers) {
  return {
    id: `${control}-${scope}`,
    control,
    status,
    scope,
    source: { kind: sourceKind, location: `${sourceKind}:${control}` },
    consumer: consumers,
    observation: { observedAt, method: "normalization", commit: null },
    trust: {
      classification: "trusted-tool",
      contentTreatedAsData: true,
      redaction: { applied: false, fields: [] },
    },
    warnings: [],
    unknowns: [],
  };
}

const scopedFindings = [
  finding("copilot-instructions", "local-only", "working-tree", "filesystem", ["ide-agent", "cloud-agent", "code-review"]),
  finding("copilot-instructions", "enforced", "head-branch", "git", ["ide-agent", "cloud-agent", "code-review"]),
  finding("dependency-review", "enforced", "repository", "github-api", ["cloud-agent", "code-review"]),
];
assert.equal(mergeEvidence(scopedFindings, "cloud-agent").some(({ control }) => control === "copilot-instructions"), false);
assert.equal(mergeEvidence(scopedFindings, "code-review").find(({ control }) => control === "copilot-instructions")?.finding.status, "enforced");
assert.equal(mergeEvidence(scopedFindings, "cloud-agent").find(({ control }) => control === "dependency-review")?.finding.status, "unverified");

const complete = [];
const contract = {
  version: "test",
  pillars: {
    context: [{ level: 1, all: [["context"]] }],
    reusableAssets: [{ level: 1, all: [["assets"]] }],
    agentEnvironment: [{ level: 1, all: [["environment"]] }],
    guardrails: [{ level: 1, all: [["guardrails"]] }],
    processMeasurement: [{ level: 1, all: [["process"]] }],
  },
  advancementGates: { 2: [["next-gate"]] },
};
for (const control of ["context", "assets", "environment", "guardrails", "process"]) {
  complete.push(finding(control, "enforced", "repository", "github-api", ["cloud-agent"]));
}
const score = scoreEvidence(complete, { consumer: "cloud-agent", contract });
assert.deepEqual(score.pillars, {
  context: 1,
  reusableAssets: 1,
  agentEnvironment: 1,
  guardrails: 1,
  processMeasurement: 1,
});
assert.equal(score.overall, 1);
assert.deepEqual(score.advancementGates, [{ controls: ["next-gate"], satisfied: false }]);
assert.deepEqual(score, scoreEvidence([...complete].reverse(), { consumer: "cloud-agent", contract }));

process.stdout.write("Phase 4 remote adapter contracts passed.\n");