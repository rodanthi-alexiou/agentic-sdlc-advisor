import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { normalizeRemoteObservation } from "../.apm/skills/agentic-sdlc-audit/scripts/github-remote-adapter.mjs";
import { scoreEvidence } from "../.apm/skills/agentic-sdlc-audit/scripts/evidence-scoring.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function parseArguments(argumentsList) {
  const result = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments, received '${key ?? ""}'.`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

async function writeApproved(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function buildReport(operatorInputPath) {
  const operatorInput = operatorInputPath
    ? JSON.parse(await readFile(resolve(operatorInputPath), "utf8"))
    : {};
  const requiredFields = [
    "teamSize",
    "copilotPlan",
    "regulatedDomain",
    "firewallState",
    "codingAgentUsed",
  ];
  const unanswered = requiredFields.filter((field) => operatorInput[field] == null);

  return {
    findings: [
      {
        id: "repository-instructions",
        status: "enforced",
        scope: "working-tree",
        source: ".github/copilot-instructions.md",
      },
      {
        id: "dependency-review",
        status: "unverified",
        scope: "unknown",
        source: "unsupported",
      },
    ],
    scores: {
      context: 1,
      guardrails: 0,
      overall: 0,
    },
    citations: ["S01"],
    unknowns: [
      ...unanswered.map((field) => ({
        control: field,
        reason: "operator input was not provided",
      })),
      {
        control: "dependency-review",
        reason: "unsupported in this release",
      },
    ],
    operatorInput: {
      groupedQuestionCount: unanswered.length > 0 ? 1 : 0,
      requestedFields: unanswered,
      independentChecksCompleted: true,
    },
  };
}

async function run() {
  const options = parseArguments(process.argv.slice(2));

  if (options["normalize-http"]) {
    const fixture = JSON.parse(
      await readFile(resolve(options["normalize-http"]), "utf8"),
    );
    const normalized = normalizeRemoteObservation(
      fixture,
      options["observed-at"] ?? "2026-08-08T00:00:00.000Z",
    );
    process.stdout.write(`${JSON.stringify(normalized)}\n`);
    return;
  }

  if (options["score-findings"]) {
    const findings = JSON.parse(
      await readFile(resolve(options["score-findings"]), "utf8"),
    );
    process.stdout.write(`${JSON.stringify(scoreEvidence(findings, { consumer: options.consumer }))}\n`);
    return;
  }

  const mode = options.mode ?? "strict";
  if (!new Set(["standard", "strict"]).has(mode)) {
    throw new Error(`Unsupported output mode '${mode}'.`);
  }

  const report = await buildReport(options["operator-input"]);
  if (mode === "standard") {
    if (!options["report-path"]) {
      throw new Error("Standard mode requires an approved --report-path.");
    }
    await writeApproved(options["report-path"], report);
    if (options["inventory-path"]) {
      const inventoryPath = resolve(
        SCRIPT_DIRECTORY,
        "../.apm/skills/agentic-sdlc-audit/schemas/examples/standard-inventory.json",
      );
      const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
      inventory.auditId = "contract-harness";
      inventory.mode = mode;
      await writeApproved(options["inventory-path"], inventory);
    }
  }

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});