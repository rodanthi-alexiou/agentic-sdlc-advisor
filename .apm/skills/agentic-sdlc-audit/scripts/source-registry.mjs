import { readFile } from "node:fs/promises";

const SOURCE_REGISTRY_URL = new URL("../references/sources.md", import.meta.url);
const SECTION_CONTRACTS = Object.freeze({
  "Primary documentation": Object.freeze({
    section: "primary-documentation",
    header: Object.freeze(["ID", "Source", "URL", "Status"]),
  }),
  Tooling: Object.freeze({
    section: "tooling",
    header: Object.freeze(["ID", "Source", "URL", "Status"]),
  }),
  Evidence: Object.freeze({
    section: "evidence",
    header: Object.freeze(["ID", "Source", "URL", "Status", "What it actually says"]),
  }),
});
const SOURCE_ID = /^S[1-9][0-9]*$/u;
const KNOWN_STATUSES = new Set(["VERIFIED", "TITLE-ONLY"]);
const ALIAS_TITLE = /^\(see S[1-9][0-9]*\)$/u;
const EVIDENCE_HEADING = "Evidence — cite these when making productivity claims";

function sectionContract(heading) {
  if (heading === EVIDENCE_HEADING) return SECTION_CONTRACTS.Evidence;
  return SECTION_CONTRACTS[heading] ?? null;
}

function tableCells(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function immutableRecord(record) {
  return Object.freeze(record);
}

function parseRecord(cells, contract, lineNumber) {
  if (cells.length !== contract.header.length) {
    throw new Error(`Source registry row ${lineNumber} has ${cells.length} columns; expected ${contract.header.length}.`);
  }

  const [id, title, url, status] = cells;
  if (!SOURCE_ID.test(id)) throw new Error(`Source registry row ${lineNumber} has malformed ID '${id}'.`);
  if (!title) throw new Error(`Source registry row ${lineNumber} has an empty title.`);

  const alias = ALIAS_TITLE.test(title) && url === "—" && status === "—";
  if (!alias && !KNOWN_STATUSES.has(status)) {
    throw new Error(`Source registry row ${lineNumber} has unknown status '${status}'.`);
  }

  if (!alias) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Source registry row ${lineNumber} has malformed URL '${url}'.`);
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error(`Source registry row ${lineNumber} must use an HTTPS URL.`);
    }
  }

  return immutableRecord({
    id,
    title,
    url: alias ? null : url,
    status: alias ? null : status,
    section: contract.section,
    citable: !alias && status === "VERIFIED",
  });
}

export function parseTrustedSourceRegistry(markdown) {
  if (typeof markdown !== "string") throw new Error("Source registry Markdown must be a string.");

  const records = [];
  const seenIds = new Set();
  const lines = markdown.split(/\r?\n/u);
  let activeContract = null;
  let expectingHeader = false;
  let expectingSeparator = false;
  let parsingRows = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^## (.+)$/u.exec(line);
    if (heading) {
      activeContract = sectionContract(heading[1]);
      expectingHeader = activeContract !== null;
      expectingSeparator = false;
      parsingRows = false;
      continue;
    }
    if (!activeContract || line.trim() === "") {
      if (parsingRows) activeContract = null;
      continue;
    }

    const cells = tableCells(line);
    if (!cells) continue;
    if (expectingHeader) {
      if (cells.join("\u0000") !== activeContract.header.join("\u0000")) {
        throw new Error(`Source registry section '${activeContract.section}' has an unexpected table header.`);
      }
      expectingHeader = false;
      expectingSeparator = true;
      continue;
    }
    if (expectingSeparator) {
      if (cells.length !== activeContract.header.length || !isSeparator(cells)) {
        throw new Error(`Source registry section '${activeContract.section}' has an invalid table separator.`);
      }
      expectingSeparator = false;
      parsingRows = true;
      continue;
    }
    if (!parsingRows) continue;

    const record = parseRecord(cells, activeContract, index + 1);
    if (seenIds.has(record.id)) throw new Error(`Source registry contains duplicate ID '${record.id}'.`);
    seenIds.add(record.id);
    records.push(record);
  }

  for (const contract of Object.values(SECTION_CONTRACTS)) {
    if (!records.some(({ section }) => section === contract.section)) {
      throw new Error(`Source registry is missing section '${contract.section}'.`);
    }
  }

  return Object.freeze(records);
}

export async function loadTrustedSourceRegistry(...argumentsList) {
  if (argumentsList.length > 0) throw new Error("The trusted source registry path cannot be overridden.");
  return parseTrustedSourceRegistry(await readFile(SOURCE_REGISTRY_URL, "utf8"));
}

export async function loadCitableSources(sourceIds) {
  if (!Array.isArray(sourceIds)) throw new Error("sourceIds must be an array.");
  const registry = await loadTrustedSourceRegistry();
  const recordsById = new Map(registry.map((record) => [record.id, record]));

  return Object.freeze(sourceIds.map((sourceId) => {
    const record = recordsById.get(sourceId);
    if (!record) throw new Error(`Unknown source selector '${sourceId}'.`);
    if (!record.citable) throw new Error(`Source '${sourceId}' is not independently citable.`);
    return record;
  }));
}