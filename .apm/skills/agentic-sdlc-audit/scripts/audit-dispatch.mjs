#!/usr/bin/env node

import process from "node:process";

const CONTRACT_VERSION = "1.0.0";

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function run() {
  const argumentsList = process.argv.slice(2);

  if (argumentsList.includes("--probe")) {
    writeJson({
      contractVersion: CONTRACT_VERSION,
      dispatcher: "node",
      platform: process.platform,
      architecture: process.arch,
      runtimeVersion: process.version,
    });
    return;
  }

  if (argumentsList.includes("--help")) {
    process.stdout.write(
      "Usage: apm run [audit] -- --probe\n" +
        "The audit collector is introduced in Implementation Phase 3.\n",
    );
    return;
  }

  process.stderr.write(
    "Audit collection is not implemented yet. Run with --probe to verify the Phase 2 dispatch contract.\n",
  );
  process.exitCode = 2;
}

run();