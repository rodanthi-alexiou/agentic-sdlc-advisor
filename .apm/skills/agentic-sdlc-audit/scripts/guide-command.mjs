#!/usr/bin/env node

import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderGuideMarkdown } from "./guide-renderer.mjs";
import { collectLocalInventory } from "./local-collector.mjs";
import { buildRemediationView, REMEDIATION_CONTRACT } from "./remediation-view.mjs";

const MAX_STDIN_BYTES = 64 * 1024;
const ARGUMENT_NAMES = new Set(["repo", "consumer", "observed-at", "profile"]);
const ENVELOPE_FIELDS = new Set(["contractVersion", "proposals", "operatorInputs"]);
const OPERATOR_INPUT_FIELDS = new Set([
  "businessObjectives",
  "ownerRoles",
  "claimEvidence",
  "starterContext",
]);
const STARTER_CONTEXT_FIELDS = new Set([
  "teamSizeReviewerCapacity",
  "copilotPlanSurfaces",
  "riskRegulatedStatus",
  "privateFeedsNetworkFirewall",
  "buildTestKnownFailures",
  "priorAgentUsage",
  "candidateTaskOwner",
  "baselineSignals",
]);

function assertClosedObject(value, name, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  const unknownField = Object.keys(value).find((field) => !allowedFields.has(field));
  if (unknownField) throw new Error(`${name} contains unknown field '${unknownField}'.`);
}

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--") || argumentsList[index + 1] === undefined) {
      throw new Error(`Expected --name value arguments, received '${argument}'.`);
    }
    const name = argument.slice(2);
    if (!ARGUMENT_NAMES.has(name)) throw new Error(`Unsupported argument '--${name}'.`);
    if (name in options) throw new Error(`Argument '--${name}' may be provided only once.`);
    options[name] = argumentsList[index + 1];
    index += 1;
  }
  return options;
}

async function readEnvelope(stdin) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAX_STDIN_BYTES) {
      throw new Error(`Standard input cannot exceed ${MAX_STDIN_BYTES} bytes.`);
    }
    chunks.push(buffer);
  }
  if (byteLength === 0) throw new Error("Standard input must contain one proposal envelope.");

  let envelope;
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Standard input must contain exactly one valid JSON proposal envelope.");
  }
  assertClosedObject(envelope, "Proposal envelope", ENVELOPE_FIELDS);
  if (envelope.contractVersion !== REMEDIATION_CONTRACT.version) {
    throw new Error(`Unsupported proposal contract version '${envelope.contractVersion ?? "missing"}'.`);
  }
  if (!Array.isArray(envelope.proposals)) throw new Error("Proposal envelope proposals must be an array.");
  if (envelope.operatorInputs !== undefined) {
    assertClosedObject(envelope.operatorInputs, "Proposal envelope operatorInputs", OPERATOR_INPUT_FIELDS);
    if (envelope.operatorInputs.starterContext !== undefined) {
      assertClosedObject(
        envelope.operatorInputs.starterContext,
        "Proposal envelope operatorInputs.starterContext",
        STARTER_CONTEXT_FIELDS,
      );
    }
  }
  return envelope;
}

export async function runGuideCommand({ argv, stdin, stdout }) {
  const options = parseArguments(argv);
  const profile = options.profile ?? "improvement-guide";
  if (!new Set(["improvement-guide", "starter-guide"]).has(profile)) {
    throw new Error(`Unsupported guide profile '${profile}'.`);
  }
  const envelope = await readEnvelope(stdin);
  const { inventory } = await collectLocalInventory({
    root: options.repo,
    mode: "strict",
    observedAt: options["observed-at"],
  });
  const view = await buildRemediationView(inventory, {
    consumer: options.consumer ?? "ide-agent",
    proposals: envelope.proposals,
    operatorInputs: envelope.operatorInputs,
    guideProfile: profile,
  });
  stdout.write(renderGuideMarkdown(view));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runGuideCommand({ argv: process.argv.slice(2), stdin: process.stdin, stdout: process.stdout }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}