#!/usr/bin/env node

import process from "node:process";

import { collectLocalInventory, writeInventory } from "./local-collector.mjs";
import { renderCompactReport } from "./report-renderer.mjs";

const CONTRACT_VERSION = "1.0.0";

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--probe" || argument === "--help") {
      options[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith("--") || argumentsList[index + 1] === undefined) {
      throw new Error(`Expected --name value arguments, received '${argument}'.`);
    }
    options[argument.slice(2)] = argumentsList[index + 1];
    index += 1;
  }
  return options;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));

  if (options.probe) {
    writeJson({
      contractVersion: CONTRACT_VERSION,
      dispatcher: "node",
      platform: process.platform,
      architecture: process.arch,
      runtimeVersion: process.version,
    });
    return;
  }

  if (options.help) {
    process.stdout.write(
      "Usage: apm run [audit] -- [--repo PATH] [--mode strict|standard] " +
        "[--report-path PATH] [--inventory-path PATH] [--format report|inventory]\n" +
        "Use --probe to verify the dispatch contract. Standard mode requires an approved " +
        "report path; inventory persistence is optional and separately approved.\n",
    );
    return;
  }

  const mode = options.mode ?? "strict";
  const format = options.format ?? "report";
  if (!new Set(["strict", "standard"]).has(mode)) {
    throw new Error(`Unsupported output mode '${mode}'.`);
  }
  if (!new Set(["report", "inventory"]).has(format)) {
    throw new Error(`Unsupported output format '${format}'.`);
  }
  if (mode === "strict" && (options["report-path"] || options["inventory-path"])) {
    throw new Error("Strict mode does not permit report or inventory write paths.");
  }
  if (mode === "standard" && !options["report-path"]) {
    throw new Error("Standard mode requires an approved --report-path.");
  }

  const { inventory, serialized } = await collectLocalInventory({
    root: options.repo,
    mode,
    observedAt: options["observed-at"],
    maxFindings: options["max-findings"] ? Number(options["max-findings"]) : undefined,
    maxEvidenceBytes: options["max-evidence-bytes"]
      ? Number(options["max-evidence-bytes"])
      : undefined,
  });
  if (options["inventory-path"]) {
    await writeInventory(options["inventory-path"], serialized);
  }
  const report = renderCompactReport(inventory, {
    consumer: options.consumer ?? "ide-agent",
  });
  if (options["report-path"]) {
    await writeInventory(options["report-path"], report);
  }
  process.stdout.write(format === "inventory" ? serialized : report);
}

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});