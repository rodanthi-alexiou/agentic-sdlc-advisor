#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, opendir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_FINDINGS = 100;
const DEFAULT_MAX_EVIDENCE_BYTES = 262144;
const MAX_SAMPLE_PATHS = 20;
const MAX_WALK_ENTRIES = 20000;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".apm",
  ".git",
  ".hg",
  ".svn",
  ".cache",
  ".gradle",
  ".mypy_cache",
  ".next",
  ".nuxt",
  ".pytest_cache",
  ".terraform",
  ".tox",
  ".venv",
  "__pycache__",
  "apm_modules",
  "bin",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "obj",
  "out",
  "target",
  "vendor",
  "venv",
]);
const BUILD_MANIFEST_NAMES = new Set([
  "build.gradle",
  "build.gradle.kts",
  "cargo.toml",
  "composer.json",
  "deno.json",
  "deno.jsonc",
  "gemfile",
  "go.mod",
  "makefile",
  "package.json",
  "pom.xml",
  "pyproject.toml",
  "taskfile.yml",
  "taskfile.yaml",
  "workspace.json",
]);
const SECRET_PATTERNS = [
  /(?:gh[pousr]_[A-Za-z0-9_]{20,})/gi,
  /(?:github_pat_[A-Za-z0-9_]{20,})/gi,
  /(?:sk-[A-Za-z0-9_-]{20,})/gi,
  /(?:AIza[0-9A-Za-z_-]{20,})/g,
];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function redactValue(value) {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return { value: redacted, applied: redacted !== value };
}

async function runGit(root, argumentsList) {
  try {
    const result = await execFileAsync("git", ["-C", root, ...argumentsList], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    return { available: true, ok: true, stdout: result.stdout };
  } catch (error) {
    return {
      available: error.code !== "ENOENT",
      ok: false,
      stdout: typeof error.stdout === "string" ? error.stdout : "",
    };
  }
}

function parseNullSeparated(value) {
  return new Set(
    value
      .split("\0")
      .map((item) => normalizePath(item.trim()))
      .filter(Boolean),
  );
}

async function collectGitFacts(root, observedAt) {
  const repositoryCheck = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!repositoryCheck.available) {
    return emptyGitFacts("git-unavailable", [
      {
        code: "git-unavailable",
        message: "Git was not found on PATH; Git scope evidence is unavailable.",
      },
    ]);
  }
  if (!repositoryCheck.ok || repositoryCheck.stdout.trim() !== "true") {
    return emptyGitFacts("no-repository");
  }

  const branch = await runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const head = await runGit(root, ["rev-parse", "--verify", "HEAD"]);
  const index = await runGit(root, ["ls-files", "-z"]);
  const headTree = head.ok
    ? await runGit(root, ["ls-tree", "-r", "--name-only", "-z", "HEAD"])
    : { ok: false, stdout: "" };
  const status = await runGit(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const remoteHeads = await runGit(root, [
    "for-each-ref",
    "--format=%(refname)|%(symref:short)",
    "refs/remotes",
  ]);

  const branchValue = redactValue(branch.ok ? branch.stdout.trim() : "");
  const remoteHeadCandidates = remoteHeads.ok
    ? remoteHeads.stdout.trim()
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => {
          const [reference, symbolicTarget] = line.split("|");
          if (!reference.endsWith("/HEAD") || !symbolicTarget) return null;
          const remote = reference
            .slice("refs/remotes/".length, -"/HEAD".length);
          const name = symbolicTarget.startsWith(`${remote}/`)
            ? symbolicTarget.slice(remote.length + 1)
            : symbolicTarget;
          return { remote, name };
        })
        .filter((item) => item?.name)
        .sort((left, right) => {
          if (left.remote === "origin") return -1;
          if (right.remote === "origin") return 1;
          return left.remote.localeCompare(right.remote);
        })
    : [];
  const remoteHeadCandidate = remoteHeadCandidates[0] ?? null;
  const remoteHeadName = remoteHeadCandidate
    ? redactValue(remoteHeadCandidate.name)
    : { value: "", applied: false };
  const changedPaths = parseStatusPaths(status.ok ? status.stdout : "");

  return {
    state: head.ok ? (branch.ok ? "branch" : "detached") : "unborn",
    currentBranch: branchValue.value || null,
    headCommit: head.ok ? head.stdout.trim() : null,
    indexPaths: index.ok ? parseNullSeparated(index.stdout) : new Set(),
    headPaths: headTree.ok ? parseNullSeparated(headTree.stdout) : new Set(),
    changedPaths,
    remoteHead: remoteHeadCandidate
      ? {
          name: remoteHeadName.value,
          remote: remoteHeadCandidate.remote,
          status: "unverified",
          source: {
            kind: "git",
            location: `refs/remotes/${remoteHeadCandidate.remote}/HEAD`,
          },
          observation: {
            observedAt,
            method: "git-query",
            commit: null,
          },
          confidence: "local-fallback",
        }
      : null,
    warnings:
      branchValue.applied || remoteHeadName.applied
        ? [
            {
              code: "git-value-redacted",
              message: "A secret-shaped Git identity value was redacted.",
            },
          ]
        : [],
  };
}

function emptyGitFacts(state, warnings = []) {
  return {
    state,
    currentBranch: null,
    headCommit: null,
    indexPaths: new Set(),
    headPaths: new Set(),
    changedPaths: new Set(),
    remoteHead: null,
    warnings,
  };
}

function parseStatusPaths(value) {
  const paths = new Set();
  const entries = value.split("\0").filter(Boolean);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const path = normalizePath(entry.slice(3));
    if (path) paths.add(path);
    if (entry[0] === "R" || entry[1] === "R" || entry[0] === "C" || entry[1] === "C") {
      index += 1;
      const destination = normalizePath(entries[index] ?? "");
      if (destination) paths.add(destination);
    }
  }
  return paths;
}

async function isIgnored(root, relativePath, gitState) {
  if (!new Set(["branch", "detached", "unborn"]).has(gitState)) return false;
  const result = await runGit(root, ["check-ignore", "--quiet", "--", relativePath]);
  return result.ok;
}

function classifyPath(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  const segments = lowerPath.split("/");
  const name = segments.at(-1);
  const controls = [];

  if (name === "agents.md") controls.push(segments.length === 1 ? "root-agents" : "nested-agents");
  if (lowerPath === ".github/copilot-instructions.md") controls.push("copilot-instructions");
  if (lowerPath.startsWith(".github/instructions/") && name.endsWith(".instructions.md")) controls.push("path-instructions");
  if (lowerPath.startsWith(".github/prompts/") && name.endsWith(".prompt.md")) controls.push("prompt-files");
  if (lowerPath.startsWith(".github/agents/") && name.endsWith(".agent.md")) controls.push("custom-agents");
  if (
    name === "skill.md" &&
    (lowerPath.startsWith(".github/skills/") ||
      lowerPath.startsWith(".agents/skills/") ||
      lowerPath.startsWith(".claude/skills/"))
  ) controls.push("agent-skills");
  if (BUILD_MANIFEST_NAMES.has(name)) controls.push("build-manifests");
  if (lowerPath === "security.md" || lowerPath === ".github/security.md") controls.push("security-policy");
  if (
    lowerPath === "pull_request_template.md" ||
    lowerPath === ".github/pull_request_template.md" ||
    lowerPath.startsWith(".github/pull_request_template/")
  ) controls.push("pull-request-templates");
  if (name === "codeowners" && (segments.length === 1 || lowerPath === ".github/codeowners" || lowerPath === "docs/codeowners")) controls.push("codeowners");
  if (lowerPath.startsWith(".github/workflows/") && (name.endsWith(".yml") || name.endsWith(".yaml"))) controls.push("workflows");
  if (lowerPath === ".github/workflows/copilot-setup-steps.yml" || lowerPath === ".github/workflows/copilot-setup-steps.yaml") controls.push("copilot-setup-steps");
  if (lowerPath.startsWith(".github/issue_template/")) controls.push("issue-templates");
  if (lowerPath === ".vscode/mcp.json" || lowerPath === ".github/workflows/copilot-mcp.json") controls.push("mcp-configuration");
  if (lowerPath === ".devcontainer/devcontainer.json" || name === "devcontainer.json") controls.push("devcontainer");
  if (lowerPath === ".github/dependabot.yml" || lowerPath === ".github/dependabot.yaml") controls.push("dependabot-configuration");
  if (lowerPath === "contributing.md" || lowerPath === ".github/contributing.md") controls.push("contributing-guide");
  if (lowerPath.startsWith("docs/adr/") || lowerPath.startsWith("docs/decisions/") || lowerPath.startsWith("doc/adr/")) controls.push("architecture-decisions");
  if (lowerPath.startsWith(".specify/") || lowerPath.startsWith("specs/")) controls.push("specification-assets");

  return controls;
}

async function discoverPaths(root, gitState) {
  const collections = new Map();
  const queue = [{ absolutePath: root, relativePath: "" }];
  let visitedEntries = 0;
  let excludedDirectoryCount = 0;
  let ignoredDirectoryCount = 0;
  let traversalTruncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    const directory = await opendir(current.absolutePath);
    const entries = [];
    for await (const entry of directory) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      visitedEntries += 1;
      if (visitedEntries > MAX_WALK_ENTRIES) {
        traversalTruncated = true;
        queue.length = 0;
        break;
      }
      const relativePath = normalizePath(
        current.relativePath ? `${current.relativePath}/${entry.name}` : entry.name,
      );
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
          excludedDirectoryCount += 1;
          continue;
        }
        if (await isIgnored(root, relativePath, gitState)) {
          ignoredDirectoryCount += 1;
          continue;
        }
        queue.push({ absolutePath: resolve(current.absolutePath, entry.name), relativePath });
        continue;
      }
      if (!entry.isFile() || (await isIgnored(root, relativePath, gitState))) continue;
      for (const control of classifyPath(relativePath)) {
        const paths = collections.get(control) ?? [];
        paths.push(relativePath);
        collections.set(control, paths);
      }
    }
  }

  return {
    collections,
    visitedEntries,
    excludedDirectoryCount,
    ignoredDirectoryCount,
    traversalTruncated,
  };
}

function consumersFor(control) {
  if (new Set(["workflows", "copilot-setup-steps", "codeowners", "dependabot-configuration"]).has(control)) {
    return ["cloud-agent", "code-review", "maintainer", "ci"];
  }
  if (new Set(["issue-templates", "pull-request-templates", "contributing-guide", "architecture-decisions", "specification-assets"]).has(control)) {
    return ["maintainer", "code-review"];
  }
  return ["ide-agent", "cloud-agent", "code-review", "maintainer"];
}

function buildFinding(control, paths, gitFacts, observedAt) {
  const sortedPaths = [...paths].sort((left, right) => left.localeCompare(right));
  const sanitizedPaths = sortedPaths.map((path) => redactValue(path));
  const indexCount = sortedPaths.filter((path) => gitFacts.indexPaths.has(path)).length;
  const headCount = sortedPaths.filter((path) => gitFacts.headPaths.has(path)).length;
  const workingTreeCount = sortedPaths.filter(
    (path) => gitFacts.changedPaths.has(path) || !gitFacts.indexPaths.has(path),
  ).length;
  const hasRedaction = sanitizedPaths.some((path) => path.applied);
  const sampledPaths = sanitizedPaths.slice(0, MAX_SAMPLE_PATHS).map((path) => path.value);
  const scope = workingTreeCount > 0
    ? "working-tree"
    : headCount === sortedPaths.length && sortedPaths.length > 0
      ? "head-branch"
      : "working-tree";

  return {
    id: control,
    control,
    status: scope === "head-branch" ? "enforced" : "local-only",
    scope,
    source: {
      kind: "filesystem",
      location: sampledPaths[0] ?? `repository-scan:${control}`,
      prerequisite: null,
    },
    consumer: consumersFor(control),
    observation: {
      observedAt,
      method: "local-scan",
      commit: scope === "head-branch" ? gitFacts.headCommit : null,
    },
    trust: {
      classification: "untrusted-repository",
      contentTreatedAsData: true,
      redaction: {
        applied: hasRedaction,
        fields: hasRedaction ? ["source.location", "discovery.sampledPaths"] : [],
      },
    },
    discovery: {
      totalCount: sortedPaths.length,
      sampledPaths,
      sampleCount: sampledPaths.length,
      truncated: sortedPaths.length > sampledPaths.length,
      workingTreeCount,
      indexCount,
      headCount,
    },
    warnings: [],
    unknowns: [],
  };
}

function serializeWithinBudget(inventory) {
  let serialized = `${JSON.stringify(inventory)}\n`;
  if (Buffer.byteLength(serialized, "utf8") <= inventory.outputBudget.maxEvidenceBytes) {
    return serialized;
  }

  for (const finding of inventory.findings) {
    inventory.outputBudget.omittedFindingCount += finding.discovery.sampledPaths.length;
    finding.discovery.sampledPaths = [];
    finding.discovery.sampleCount = 0;
    finding.discovery.truncated = finding.discovery.totalCount > 0;
  }
  inventory.outputBudget.truncated = true;
  inventory.warnings.push({
    code: "evidence-byte-budget",
    message: "Path samples were omitted to satisfy the evidence byte budget.",
  });
  serialized = `${JSON.stringify(inventory)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > inventory.outputBudget.maxEvidenceBytes) {
    throw new Error("Inventory cannot be serialized within maxEvidenceBytes.");
  }
  return serialized;
}

export async function collectLocalInventory(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error(`Repository root is not a directory: ${root}`);

  const mode = options.mode ?? "strict";
  if (!new Set(["standard", "strict"]).has(mode)) {
    throw new Error(`Unsupported output mode '${mode}'.`);
  }
  const observedAt = options.observedAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(observedAt))) throw new Error("observedAt must be an ISO date-time.");
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const maxEvidenceBytes = options.maxEvidenceBytes ?? DEFAULT_MAX_EVIDENCE_BYTES;
  if (!Number.isInteger(maxFindings) || maxFindings < 1) throw new Error("maxFindings must be a positive integer.");
  if (!Number.isInteger(maxEvidenceBytes) || maxEvidenceBytes < 1) throw new Error("maxEvidenceBytes must be a positive integer.");

  const gitFacts = await collectGitFacts(root, observedAt);
  const discovery = await discoverPaths(root, gitFacts.state);
  const controls = [...discovery.collections.keys()].sort((left, right) => left.localeCompare(right));
  const allFindings = controls.map((control) =>
    buildFinding(control, discovery.collections.get(control), gitFacts, observedAt),
  );
  const findings = allFindings.slice(0, maxFindings);
  const omittedByFindingBudget = allFindings.length - findings.length;
  const omittedBySamples = findings.reduce(
    (total, finding) => total + finding.discovery.totalCount - finding.discovery.sampleCount,
    0,
  );
  const inventory = {
    schemaVersion: "1.0.0",
    auditId: createHash("sha256")
      .update(`${gitFacts.headCommit ?? "no-head"}|${observedAt}`)
      .digest("hex")
      .slice(0, 24),
    mode,
    repository: {
      root: ".",
      identity: null,
      currentBranch: gitFacts.currentBranch,
      defaultBranch: {
        name: null,
        status: "unverified",
        source: {
          kind: "unsupported",
          location: "hosted-repository-metadata",
          prerequisite: "remote enrichment",
        },
        observation: { observedAt, method: "local-scan", commit: null },
      },
      git: {
        state: gitFacts.state,
        headCommit: gitFacts.headCommit,
        indexAvailable: new Set(["branch", "detached", "unborn"]).has(gitFacts.state),
        remoteHead: gitFacts.remoteHead,
      },
    },
    findings,
    warnings: [
      ...gitFacts.warnings,
      ...(discovery.traversalTruncated
        ? [
            {
              code: "traversal-budget",
              message: `Repository traversal stopped after ${MAX_WALK_ENTRIES} entries.`,
            },
          ]
        : []),
    ],
    unknowns: [
      {
        control: "hosted-default-branch",
        reason: "Hosted repository metadata is outside local collection.",
        needed: "Remote enrichment with repository metadata is required.",
      },
    ],
    collection: {
      visitedEntryCount: discovery.visitedEntries,
      excludedDirectoryCount: discovery.excludedDirectoryCount,
      ignoredDirectoryCount: discovery.ignoredDirectoryCount,
      traversalTruncated: discovery.traversalTruncated,
    },
    outputBudget: {
      maxFindings,
      maxEvidenceBytes,
      truncated:
        omittedByFindingBudget > 0 ||
        omittedBySamples > 0 ||
        discovery.traversalTruncated,
      omittedFindingCount: omittedByFindingBudget + omittedBySamples,
    },
  };

  return { inventory, serialized: serializeWithinBudget(inventory) };
}

export async function writeInventory(path, serialized) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serialized, "utf8");
}