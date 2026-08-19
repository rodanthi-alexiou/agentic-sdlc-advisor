import { SCORING_CONTRACT, scoreEvidence } from "./evidence-scoring.mjs";
import { assignEvidenceReferences } from "./evidence-references.mjs";
import { loadTrustedSourceRegistry } from "./source-registry.mjs";
import { isDeepStrictEqual } from "node:util";

const PROVENANCE = new Set(["code-derived", "catalogue-derived", "model-proposed", "operator-supplied", "unknown"]);
const INCONCLUSIVE_STATUSES = new Set(["unavailable", "unauthorized", "unauthenticated", "disabled", "unverified"]);
const PRIORITY_ORDER = Object.freeze({ mandatory: 0, "advancement-gate": 1, optimization: 2, "verify-first": 3 });
const GUIDE_PROFILES = new Set(["improvement-guide", "starter-guide"]);
const STARTER_CONTEXT_FIELDS = Object.freeze([
  "teamSizeReviewerCapacity",
  "copilotPlanSurfaces",
  "riskRegulatedStatus",
  "privateFeedsNetworkFirewall",
  "buildTestKnownFailures",
  "priorAgentUsage",
  "candidateTaskOwner",
  "baselineSignals",
]);
const STARTER_CONTEXT_LABELS = Object.freeze({
  teamSizeReviewerCapacity: "Team size and reviewer capacity",
  copilotPlanSurfaces: "Copilot plan and enabled surfaces",
  riskRegulatedStatus: "Risk class or regulated status",
  privateFeedsNetworkFirewall: "Private feeds, network, and firewall constraints",
  buildTestKnownFailures: "Build and test commands plus known failures",
  priorAgentUsage: "Prior agent usage and observed failure modes",
  candidateTaskOwner: "One bounded candidate task and its human owner",
  baselineSignals: "Baseline review, rework, and CI signals",
});
const CONFIDENCE_VALUES = new Set([0.25, 0.5, 0.75, 1]);
const JOB_SIZES = new Set([1, 2, 3, 5, 8]);
const DIRECTIONS = new Set(["increase", "decrease", "maintain"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const QUANTIFIED_VALUE_TEXT = /(?:\b\d+(?:\.\d+)?(?:\s*[x×])?\b|\b(?:double|triple|quadruple|twice|thrice)\b|[$€£¥]|\b(?:usd|eur|gbp|jpy|currency|savings?|roi|return multiple|payback|baseline value|target value|result value)\b)/iu;
const CAUSAL_TEXT = /\b(?:caused|produced|saved|improved|resulted in|led to)\b/iu;
const REPOSITORY_FACT_TEXT = /\b(?:repository|repo|file|path|observed|present|missing|absent|detected|found)\b/iu;
const TRUSTED_INVENTORY_METHODS = new Set(["local-scan", "git-query", "remote-query", "normalization"]);
const STARTER_UNSAFE_CONTROLS = new Set([
  "async-delegation",
  "agent-fan-out",
  "agent-swarm",
  "multi-agent-orchestration",
  "parallel-agent-execution",
]);
const STARTER_UNSAFE_IDENTIFIER = /(?:^|-)(?:async-delegation|agent-(?:fan-?out|swarm)|fan-?out|multi-?agent(?:-orchestration)?|orchestrat(?:e|ion|or)|parallel-agents?)(?:-|$)/iu;
const STARTER_UNSAFE_NARRATIVE = /\b(?:agent\s+(?:fan[\s-]*out|swarm)|fan[\s-]*out|multi[\s-]*agent|orchestrat(?:e|ed|es|ing|ion)\s+(?:multiple|parallel|specialized\s+)?agents?|parallel(?:ize|ized|izing)?\s+(?:agent|worker)s?|(?:agent|worker)s?\b.{0,40}\b(?:in\s+parallel|concurrent(?:ly)?))\b/iu;

export const REMEDIATION_CONTRACT = Object.freeze({
  version: "1.0.0",
  maxRecommendations: 5,
  maxSteps: 5,
  maxAcceptanceCriteria: 3,
  maxValidationChecks: 3,
  maxMetrics: 1,
  maxGuardrails: 2,
  maxSources: 10,
  maxReasonItems: 5,
  maxDependencies: 5,
  maxFinancialEntries: 10,
});

function assertClosedObject(value, name, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${name} contains unknown field '${unknown[0]}'.`);
  const missing = required.filter((key) => !(key in value));
  if (missing.length > 0) throw new Error(`${name} is missing required field '${missing[0]}'.`);
}

function assertArray(value, name, maximum, minimum = 0) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  if (value.length < minimum) throw new Error(`${name} must contain at least ${minimum} item(s).`);
  if (value.length > maximum) throw new Error(`${name} cannot contain more than ${maximum} items.`);
}

function assertText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be a non-empty string.`);
}

function assertUniqueStrings(value, name, maximum, minimum = 0) {
  assertArray(value, name, maximum, minimum);
  value.forEach((item, index) => assertText(item, `${name}[${index}]`));
  if (new Set(value).size !== value.length) throw new Error(`${name} must contain unique values.`);
}

function assertProvenance(value, name, allowed = PROVENANCE) {
  if (!allowed.has(value)) throw new Error(`${name} has unsupported provenance '${value}'.`);
}

function validateProvenancedText(value, name, allowed = PROVENANCE) {
  assertClosedObject(value, name, ["value", "provenance"]);
  assertText(value.value, `${name}.value`);
  assertProvenance(value.provenance, `${name}.provenance`, allowed);
  return { value: value.value.trim(), provenance: value.provenance };
}

function validateProvenancedNumber(value, name, allowedValues) {
  assertClosedObject(value, name, ["value", "provenance"]);
  if (!allowedValues.has(value.value)) throw new Error(`${name}.value is outside the allowed ordinal anchors.`);
  assertProvenance(value.provenance, `${name}.provenance`, new Set(["model-proposed", "operator-supplied"]));
  return { value: value.value, provenance: value.provenance };
}

function validateDate(value, name) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    throw new Error(`${name} must be an ISO date.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    throw new Error(`${name} must be an ISO date.`);
  }
}

function validateWindow(value, name) {
  assertClosedObject(value, name, ["start", "end"]);
  validateDate(value.start, `${name}.start`);
  validateDate(value.end, `${name}.end`);
  if (value.start > value.end) throw new Error(`${name}.start must not be after end.`);
}

function validateTarget(value, name) {
  assertClosedObject(value, name, ["path", "provenance", "canonical"]);
  assertText(value.path, `${name}.path`);
  assertProvenance(value.provenance, `${name}.provenance`, new Set(["model-proposed", "catalogue-derived"]));
  if (value.provenance === "model-proposed" && value.canonical !== false) throw new Error(`${name} model-proposed paths must be noncanonical.`);
  if (value.provenance === "catalogue-derived" && value.canonical !== true) throw new Error(`${name} catalogue-derived paths must be canonical.`);
  const normalized = value.path.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (/^(?:[A-Za-z]:|\/)/u.test(normalized) || normalized.split("/").includes("..") || normalized === "") {
    throw new Error(`${name}.path must be repository-relative.`);
  }
  return { path: normalized, provenance: value.provenance, canonical: value.canonical };
}

function validateOwner(value, name, operatorRoles) {
  assertClosedObject(value, name, ["role", "provenance"]);
  assertText(value.role, `${name}.role`);
  assertProvenance(value.provenance, `${name}.provenance`, new Set(["model-proposed", "operator-supplied", "unknown"]));
  if (/@|\b(?:mr|ms|mrs|dr)\.?\s+[A-Z]/iu.test(value.role)) throw new Error(`${name}.role must be an accountable role, never an individual.`);
  if (operatorRoles.length > 0 && (value.provenance !== "operator-supplied" || !operatorRoles.includes(value.role))) {
    throw new Error(`${name}.role must match the operator-supplied owner-role policy.`);
  }
  return { role: value.role.trim(), provenance: value.provenance };
}

function sameMembers(left, right) {
  const sortedRight = [...right].sort();
  return left.length === right.length && [...left].sort().every((value, index) => value === sortedRight[index]);
}

function validateReason(value, name, context) {
  assertClosedObject(value, name, ["observation", "mechanism", "applicability", "assumptions", "limitations"]);
  assertClosedObject(value.observation, `${name}.observation`, ["summary", "findingIds"]);
  assertText(value.observation.summary, `${name}.observation.summary`);
  if (CAUSAL_TEXT.test(value.observation.summary)) throw new Error(`${name}.observation.summary must contain repository facts only.`);
  assertUniqueStrings(value.observation.findingIds, `${name}.observation.findingIds`, REMEDIATION_CONTRACT.maxRecommendations, 1);
  if (!sameMembers(value.observation.findingIds, context.findingIds)) throw new Error(`${name}.observation.findingIds must equal recommendation findingIds.`);

  assertClosedObject(value.mechanism, `${name}.mechanism`, ["summary", "sourceRefs"]);
  assertText(value.mechanism.summary, `${name}.mechanism.summary`);
  if (REPOSITORY_FACT_TEXT.test(value.mechanism.summary)) throw new Error(`${name}.mechanism.summary must not assert repository facts.`);
  assertUniqueStrings(value.mechanism.sourceRefs, `${name}.mechanism.sourceRefs`, REMEDIATION_CONTRACT.maxSources, 1);
  if (!sameMembers(value.mechanism.sourceRefs, context.sourceRefs)) throw new Error(`${name}.mechanism.sourceRefs must equal recommendation sourceRefs.`);

  assertClosedObject(value.applicability, `${name}.applicability`, ["consumers", "scopes", "controlIds", "prerequisites"]);
  assertUniqueStrings(value.applicability.consumers, `${name}.applicability.consumers`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.applicability.scopes, `${name}.applicability.scopes`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.applicability.controlIds, `${name}.applicability.controlIds`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.applicability.prerequisites, `${name}.applicability.prerequisites`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  if (!sameMembers(value.applicability.controlIds, context.controlIds)) throw new Error(`${name}.applicability.controlIds must equal recommendation controlIds.`);
  const selectedFindings = context.findingIds.map((id) => context.findingById.get(id));
  if (value.applicability.consumers.some((consumer) => !selectedFindings.some((finding) => finding.consumer.includes(consumer)))) {
    throw new Error(`${name}.applicability.consumers must intersect selected findings.`);
  }
  if (value.applicability.scopes.some((scope) => !selectedFindings.some((finding) => finding.scope === scope))) {
    throw new Error(`${name}.applicability.scopes must intersect selected findings.`);
  }

  assertArray(value.assumptions, `${name}.assumptions`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  value.assumptions.forEach((assumption, index) => {
    const itemName = `${name}.assumptions[${index}]`;
    assertClosedObject(assumption, itemName, ["statement", "provenance", "verification"]);
    assertText(assumption.statement, `${itemName}.statement`);
    assertProvenance(assumption.provenance, `${itemName}.provenance`, new Set(["model-proposed", "operator-supplied", "unknown"]));
    assertText(assumption.verification, `${itemName}.verification`);
  });
  assertArray(value.limitations, `${name}.limitations`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  value.limitations.forEach((limitation, index) => {
    const itemName = `${name}.limitations[${index}]`;
    assertClosedObject(limitation, itemName, ["statement", "effect"]);
    assertText(limitation.statement, `${itemName}.statement`);
    assertText(limitation.effect, `${itemName}.effect`);
  });
  return value;
}

function validatePriorityInputs(value, name) {
  assertClosedObject(value, name, ["businessValue", "timeCriticality", "riskReduction", "confidence", "jobSize"]);
  return {
    businessValue: validateProvenancedNumber(value.businessValue, `${name}.businessValue`, new Set([1, 2, 3, 4, 5])),
    timeCriticality: validateProvenancedNumber(value.timeCriticality, `${name}.timeCriticality`, new Set([1, 2, 3, 4, 5])),
    riskReduction: validateProvenancedNumber(value.riskReduction, `${name}.riskReduction`, new Set([1, 2, 3, 4, 5])),
    confidence: validateProvenancedNumber(value.confidence, `${name}.confidence`, CONFIDENCE_VALUES),
    jobSize: validateProvenancedNumber(value.jobSize, `${name}.jobSize`, JOB_SIZES),
  };
}

function validateMetric(value, name) {
  assertClosedObject(value, name, ["name", "direction", "unit"]);
  assertText(value.name, `${name}.name`);
  if (!DIRECTIONS.has(value.direction)) throw new Error(`${name}.direction is unsupported.`);
  assertText(value.unit, `${name}.unit`);
  if (/[$€£¥]|\b(?:usd|eur|gbp|jpy|currency|cost|savings|roi)\b/iu.test(value.unit)) throw new Error(`${name}.unit must be nonfinancial.`);
}

function validateExpectedClaim(value, name, trustedSourceIds) {
  assertClosedObject(value, name, ["tier", "outcome", "causalChain", "metricToTest", "assumptions", "limitations", "externalEvidenceLimits", "sourceRefs", "provenance"]);
  ["outcome", "causalChain", "externalEvidenceLimits"].forEach((field) => assertText(value[field], `${name}.${field}`));
  validateMetric(value.metricToTest, `${name}.metricToTest`);
  assertUniqueStrings(value.assumptions, `${name}.assumptions`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.limitations, `${name}.limitations`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.sourceRefs, `${name}.sourceRefs`, REMEDIATION_CONTRACT.maxSources, 1);
  if (value.sourceRefs.some((id) => !trustedSourceIds.has(id))) throw new Error(`${name}.sourceRefs contains an untrusted source.`);
  if (value.provenance !== "model-proposed") throw new Error(`${name}.provenance must be model-proposed.`);
  const narrative = [value.outcome, value.causalChain, value.externalEvidenceLimits, ...value.assumptions, ...value.limitations].join(" ");
  if (QUANTIFIED_VALUE_TEXT.test(narrative)) throw new Error(`${name} cannot contain numeric benefit, financial, baseline, target, or result claims.`);
  return value;
}

function validateEvidenceWindow(value, name) {
  assertClosedObject(value, name, ["value", "window", "sampleSize", "evidenceRefs"]);
  if (typeof value.value !== "number" || !Number.isFinite(value.value)) throw new Error(`${name}.value must be finite.`);
  validateWindow(value.window, `${name}.window`);
  if (!Number.isInteger(value.sampleSize) || value.sampleSize <= 0) throw new Error(`${name}.sampleSize must be positive.`);
  assertUniqueStrings(value.evidenceRefs, `${name}.evidenceRefs`, REMEDIATION_CONTRACT.maxReasonItems, 1);
}

function validateLocalEvidence(value, name) {
  assertClosedObject(value, name, ["id", "kind", "location", "observedAt", "provenance"]);
  assertText(value.id, `${name}.id`);
  if (!new Set(["local-telemetry", "operator-supplied"]).has(value.kind)) throw new Error(`${name}.kind is unsupported.`);
  assertText(value.location, `${name}.location`);
  if (Number.isNaN(Date.parse(value.observedAt))) throw new Error(`${name}.observedAt must be an ISO date-time.`);
  assertProvenance(value.provenance, `${name}.provenance`, new Set(["code-derived", "operator-supplied"]));
  return value;
}

function validateClaimEvidence(value, name) {
  assertArray(value, name, REMEDIATION_CONTRACT.maxSources);
  const normalized = value.map((item, index) => {
    const itemName = `${name}[${index}]`;
    assertClosedObject(item, itemName, ["localEvidence", "valueClaim"]);
    validateLocalEvidence(item.localEvidence, `${itemName}.localEvidence`);
    if (!item.valueClaim || typeof item.valueClaim !== "object" || Array.isArray(item.valueClaim)) {
      throw new Error(`${itemName}.valueClaim must be an object.`);
    }
    return item;
  });
  const serialized = normalized.map((item) => JSON.stringify(item));
  if (new Set(serialized).size !== serialized.length) throw new Error(`${name} must contain unique values.`);
  return normalized;
}

function inventoryEvidenceRecord(localEvidence, inventory) {
  if (localEvidence.kind !== "local-telemetry" || localEvidence.provenance !== "code-derived") return null;
  const finding = inventory.findings.find(({ id }) => id === localEvidence.id);
  if (
    !finding ||
    !TRUSTED_INVENTORY_METHODS.has(finding.observation?.method) ||
    finding.trust?.contentTreatedAsData !== true
  ) return null;
  const expectedIdentity = {
    id: finding.id,
    kind: "local-telemetry",
    location: finding.source.location,
    observedAt: finding.observation.observedAt,
    provenance: "code-derived",
  };
  if (!isDeepStrictEqual(localEvidence, expectedIdentity)) return null;
  return {
    numericValues: Object.values(finding.discovery ?? {}).filter((item) => typeof item === "number" && Number.isFinite(item)),
    observedDate: finding.observation.observedAt.slice(0, 10),
  };
}

function validateTrustedLocalEvidence(localEvidence, valueClaim, name, inventory, claimEvidence) {
  const ids = localEvidence.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new Error(`${name} must contain unique evidence IDs.`);
  return localEvidence.map((item, index) => {
    const operatorBacked = claimEvidence.some((record) =>
      isDeepStrictEqual(record.localEvidence, item) &&
      isDeepStrictEqual(record.valueClaim, valueClaim));
    const inventoryRecord = inventoryEvidenceRecord(item, inventory);
    if (!operatorBacked && !inventoryRecord) {
      throw new Error(
        `${name}[${index}] must match a fresh inventory record or operatorInputs.claimEvidence exactly.`,
      );
    }
    return { item, operatorBacked, inventoryRecord };
  });
}

function validateInventoryEvidenceWindow(value, name, trustedEvidence) {
  const referenced = trustedEvidence.filter(({ item }) => value.evidenceRefs.includes(item.id));
  const numericValues = referenced.flatMap(({ inventoryRecord }) => inventoryRecord?.numericValues ?? []);
  if (!numericValues.includes(value.value) || !numericValues.includes(value.sampleSize)) {
    throw new Error(`${name} value and sampleSize must match referenced fresh inventory values.`);
  }
  if (!referenced.some(({ inventoryRecord }) =>
    inventoryRecord &&
    inventoryRecord.observedDate >= value.window.start &&
    inventoryRecord.observedDate <= value.window.end)) {
    throw new Error(`${name}.window must contain the referenced fresh inventory observation date.`);
  }
}

function validateProxyClaim(value, name, guardrailCount, context) {
  assertClosedObject(value, name, ["tier", "metric", "baseline", "observed", "calculation", "attribution", "localEvidence", "provenance"]);
  assertClosedObject(value.metric, `${name}.metric`, ["name", "category", "unit", "direction"]);
  assertText(value.metric.name, `${name}.metric.name`);
  if (!new Set(["flow", "quality-risk", "devex", "adoption"]).has(value.metric.category)) throw new Error(`${name}.metric.category is unsupported.`);
  assertText(value.metric.unit, `${name}.metric.unit`);
  if (/[$€£¥]|\b(?:currency|savings|roi|payback)\b/iu.test(value.metric.unit)) throw new Error(`${name}.metric.unit must be nonfinancial.`);
  if (!DIRECTIONS.has(value.metric.direction)) throw new Error(`${name}.metric.direction is unsupported.`);
  validateEvidenceWindow(value.baseline, `${name}.baseline`);
  validateEvidenceWindow(value.observed, `${name}.observed`);
  if (value.baseline.window.end >= value.observed.window.start) throw new Error(`${name} baseline and observed windows must not overlap.`);
  assertClosedObject(value.calculation, `${name}.calculation`, ["formulaId"]);
  if (!new Set(["relative-change-v1", "absolute-change-v1"]).has(value.calculation.formulaId)) throw new Error(`${name}.calculation.formulaId is unsupported.`);
  if (value.calculation.formulaId === "relative-change-v1" && value.baseline.value === 0) throw new Error(`${name} relative change requires a nonzero baseline.`);
  assertClosedObject(value.attribution, `${name}.attribution`, ["method", "concurrentChanges", "limitations"]);
  if (!new Set(["descriptive", "matched-before-after", "controlled"]).has(value.attribution.method)) throw new Error(`${name}.attribution.method is unsupported.`);
  assertUniqueStrings(value.attribution.concurrentChanges, `${name}.attribution.concurrentChanges`, REMEDIATION_CONTRACT.maxReasonItems);
  assertUniqueStrings(value.attribution.limitations, `${name}.attribution.limitations`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  if (value.attribution.method === "descriptive" && CAUSAL_TEXT.test(value.attribution.limitations.join(" "))) throw new Error(`${name} descriptive attribution cannot make causal claims.`);
  assertArray(value.localEvidence, `${name}.localEvidence`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  value.localEvidence.forEach((item, index) => validateLocalEvidence(item, `${name}.localEvidence[${index}]`));
  const evidenceIds = new Set(value.localEvidence.map(({ id }) => id));
  if ([...value.baseline.evidenceRefs, ...value.observed.evidenceRefs].some((id) => !evidenceIds.has(id))) throw new Error(`${name} evidenceRefs must reference localEvidence records.`);
  if (value.metric.category === "adoption" && guardrailCount === 0) throw new Error(`${name} adoption requires a counter-metric guardrail.`);
  if (!new Set(["operator-supplied", "code-derived"]).has(value.provenance)) throw new Error(`${name}.provenance is unsupported.`);
  const trustedEvidence = validateTrustedLocalEvidence(
    value.localEvidence,
    value,
    `${name}.localEvidence`,
    context.inventory,
    context.claimEvidence,
  );
  if (!trustedEvidence.some(({ operatorBacked }) => operatorBacked)) {
    validateInventoryEvidenceWindow(value.baseline, `${name}.baseline`, trustedEvidence);
    validateInventoryEvidenceWindow(value.observed, `${name}.observed`, trustedEvidence);
  }
  const result = value.calculation.formulaId === "relative-change-v1"
    ? (value.observed.value - value.baseline.value) / Math.abs(value.baseline.value)
    : value.observed.value - value.baseline.value;
  return { ...value, calculation: { ...value.calculation, result, provenance: "code-derived" } };
}

const COST_FIELDS = ["licensesOrCredits", "compute", "implementation", "enablement", "measurement", "reviewAndRework", "maintenance", "learningPeriod"];

function validateMoneyEntry(value, name, evidenceIds) {
  assertClosedObject(value, name, ["amount", "evidenceRefs"]);
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount < 0) throw new Error(`${name}.amount must be nonnegative.`);
  assertUniqueStrings(value.evidenceRefs, `${name}.evidenceRefs`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  if (value.evidenceRefs.some((id) => !evidenceIds.has(id))) throw new Error(`${name}.evidenceRefs must reference local evidence.`);
}

function validateFinancialClaim(value, name, context) {
  assertClosedObject(value, name, ["tier", "currency", "window", "sample", "realizedBenefits", "incrementalCosts", "attribution", "uncertainty", "financeApproval", "localEvidence", "formulaId", "provenance"]);
  if (!/^[A-Z]{3}$/u.test(value.currency)) throw new Error(`${name}.currency must be an ISO 4217 code.`);
  validateWindow(value.window, `${name}.window`);
  assertClosedObject(value.sample, `${name}.sample`, ["eligible", "completed", "excluded", "exclusionNotes"]);
  for (const field of ["eligible", "completed", "excluded"]) {
    if (!Number.isInteger(value.sample[field]) || value.sample[field] < 0) throw new Error(`${name}.sample.${field} must be a nonnegative integer.`);
  }
  if (value.sample.eligible <= 0 || value.sample.completed <= 0 || value.sample.completed + value.sample.excluded > value.sample.eligible) throw new Error(`${name}.sample counts are inconsistent.`);
  assertUniqueStrings(value.sample.exclusionNotes, `${name}.sample.exclusionNotes`, REMEDIATION_CONTRACT.maxReasonItems);
  assertArray(value.localEvidence, `${name}.localEvidence`, REMEDIATION_CONTRACT.maxFinancialEntries, 1);
  value.localEvidence.forEach((item, index) => validateLocalEvidence(item, `${name}.localEvidence[${index}]`));
  const evidenceIds = new Set(value.localEvidence.map(({ id }) => id));
  assertArray(value.realizedBenefits, `${name}.realizedBenefits`, REMEDIATION_CONTRACT.maxFinancialEntries, 1);
  value.realizedBenefits.forEach((benefit, index) => {
    const itemName = `${name}.realizedBenefits[${index}]`;
    assertClosedObject(benefit, itemName, ["category", "amount", "evidenceRefs"], ["completedWorkEvidenceRef"]);
    if (!new Set(["avoided-contractor-spend", "avoided-incident-cost", "redeployed-capacity-value"]).has(benefit.category)) throw new Error(`${itemName}.category is unsupported.`);
    validateMoneyEntry({ amount: benefit.amount, evidenceRefs: benefit.evidenceRefs }, itemName, evidenceIds);
    if (benefit.category === "redeployed-capacity-value" && (!benefit.completedWorkEvidenceRef || !evidenceIds.has(benefit.completedWorkEvidenceRef))) throw new Error(`${itemName} requires completed-work evidence.`);
  });
  assertClosedObject(value.incrementalCosts, `${name}.incrementalCosts`, [...COST_FIELDS, "other", "total"]);
  COST_FIELDS.forEach((field) => validateMoneyEntry(value.incrementalCosts[field], `${name}.incrementalCosts.${field}`, evidenceIds));
  assertArray(value.incrementalCosts.other, `${name}.incrementalCosts.other`, REMEDIATION_CONTRACT.maxReasonItems);
  value.incrementalCosts.other.forEach((entry, index) => {
    assertClosedObject(entry, `${name}.incrementalCosts.other[${index}]`, ["label", "amount", "evidenceRefs"]);
    assertText(entry.label, `${name}.incrementalCosts.other[${index}].label`);
    validateMoneyEntry({ amount: entry.amount, evidenceRefs: entry.evidenceRefs }, `${name}.incrementalCosts.other[${index}]`, evidenceIds);
  });
  const costTotal = [...COST_FIELDS.map((field) => value.incrementalCosts[field]), ...value.incrementalCosts.other].reduce((sum, entry) => sum + entry.amount, 0);
  if (costTotal <= 0) throw new Error(`${name} total incremental cost must be greater than zero.`);
  if (value.incrementalCosts.total !== costTotal) throw new Error(`${name}.incrementalCosts.total does not match code-derived costs.`);
  assertClosedObject(value.attribution, `${name}.attribution`, ["method", "counterfactual", "concurrentChanges", "limitations", "evidenceRefs"]);
  if (!new Set(["matched-before-after", "controlled"]).has(value.attribution.method)) throw new Error(`${name}.attribution.method is unsupported for financial ROI.`);
  assertText(value.attribution.counterfactual, `${name}.attribution.counterfactual`);
  assertUniqueStrings(value.attribution.concurrentChanges, `${name}.attribution.concurrentChanges`, REMEDIATION_CONTRACT.maxReasonItems);
  assertUniqueStrings(value.attribution.limitations, `${name}.attribution.limitations`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertUniqueStrings(value.attribution.evidenceRefs, `${name}.attribution.evidenceRefs`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  if (value.attribution.evidenceRefs.some((id) => !evidenceIds.has(id))) throw new Error(`${name}.attribution.evidenceRefs must be local.`);
  assertClosedObject(value.uncertainty, `${name}.uncertainty`, ["method", "low", "high", "sensitivityAssumptions"]);
  assertText(value.uncertainty.method, `${name}.uncertainty.method`);
  if (![value.uncertainty.low, value.uncertainty.high].every(Number.isFinite) || value.uncertainty.low > value.uncertainty.high) throw new Error(`${name}.uncertainty bounds are invalid.`);
  assertUniqueStrings(value.uncertainty.sensitivityAssumptions, `${name}.uncertainty.sensitivityAssumptions`, REMEDIATION_CONTRACT.maxReasonItems, 1);
  assertClosedObject(value.financeApproval, `${name}.financeApproval`, ["accountableRole", "approvalDate", "valuationMethod", "evidenceRef"]);
  assertText(value.financeApproval.accountableRole, `${name}.financeApproval.accountableRole`);
  validateDate(value.financeApproval.approvalDate, `${name}.financeApproval.approvalDate`);
  assertText(value.financeApproval.valuationMethod, `${name}.financeApproval.valuationMethod`);
  if (!evidenceIds.has(value.financeApproval.evidenceRef)) throw new Error(`${name}.financeApproval.evidenceRef must be local.`);
  if (value.formulaId !== "measured-financial-roi-v1") throw new Error(`${name}.formulaId is unsupported.`);
  if (value.provenance !== "operator-supplied") throw new Error(`${name}.provenance must be operator-supplied.`);
  const trustedEvidence = validateTrustedLocalEvidence(
    value.localEvidence,
    value,
    `${name}.localEvidence`,
    context.inventory,
    context.claimEvidence,
  );
  if (trustedEvidence.some(({ operatorBacked }) => !operatorBacked)) {
    throw new Error(`${name} financial evidence must match operatorInputs.claimEvidence exactly.`);
  }
  const benefitTotal = value.realizedBenefits.reduce((sum, benefit) => sum + benefit.amount, 0);
  return { ...value, result: { benefitTotal, costTotal, roiPercent: ((benefitTotal - costTotal) / costTotal) * 100, provenance: "code-derived" } };
}

function validateValueClaim(value, name, trustedSourceIds, guardrailCount, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  if (value.tier === "expected-value-hypothesis") return validateExpectedClaim(value, name, trustedSourceIds);
  if (value.tier === "observed-proxy") return validateProxyClaim(value, name, guardrailCount, context);
  if (value.tier === "measured-financial-roi") return validateFinancialClaim(value, name, context);
  throw new Error(`${name}.tier '${value.tier}' is unsupported.`);
}

function validateMeasurementPlan(value, name) {
  assertClosedObject(value, name, ["decision", "primaryMetric", "guardrails", "attribution", "provenance"]);
  assertText(value.decision, `${name}.decision`);
  validateMetric(value.primaryMetric, `${name}.primaryMetric`);
  assertArray(value.guardrails, `${name}.guardrails`, REMEDIATION_CONTRACT.maxGuardrails);
  value.guardrails.forEach((metric, index) => validateMetric(metric, `${name}.guardrails[${index}]`));
  if (!new Set(["descriptive", "matched-before-after", "controlled", "unknown"]).has(value.attribution)) throw new Error(`${name}.attribution is unsupported.`);
  assertProvenance(value.provenance, `${name}.provenance`, new Set(["model-proposed", "operator-supplied", "unknown"]));
  return value;
}

function validateTextItems(value, name, maximum) {
  assertArray(value, name, maximum, 1);
  return value.map((item, index) => validateProvenancedText(item, `${name}[${index}]`, new Set(["model-proposed", "catalogue-derived", "operator-supplied"])));
}

function scoringControls() {
  const controls = new Set();
  for (const levels of Object.values(SCORING_CONTRACT.pillars)) {
    for (const requirement of levels) {
      for (const group of requirement.all ?? requirement.any ?? []) group.forEach((control) => controls.add(control));
    }
  }
  for (const gates of Object.values(SCORING_CONTRACT.advancementGates)) gates.forEach((group) => group.forEach((control) => controls.add(control)));
  return controls;
}

function validateDependencies(recommendations) {
  const ids = new Set(recommendations.map(({ id }) => id));
  if (ids.size !== recommendations.length) throw new Error("Recommendation IDs must be unique.");
  for (const recommendation of recommendations) {
    const unknown = recommendation.dependencies.find((id) => !ids.has(id));
    if (unknown) throw new Error(`Recommendation '${recommendation.id}' has unknown dependency '${unknown}'.`);
    if (recommendation.dependencies.includes(recommendation.id)) throw new Error(`Recommendation '${recommendation.id}' cannot depend on itself.`);
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(recommendations.map((item) => [item.id, item]));
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Recommendation dependency cycle detected at '${id}'.`);
    if (visited.has(id)) return;
    visiting.add(id);
    byId.get(id).dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  recommendations.forEach(({ id }) => visit(id));
}

function validateOperatorInputs(value) {
  const inputs = value ?? {};
  assertClosedObject(inputs, "operatorInputs", [], [
    "businessObjectives",
    "ownerRoles",
    "claimEvidence",
    "mandatoryControlIds",
    "starterContext",
  ]);
  const starterContext = inputs.starterContext ?? {};
  assertClosedObject(starterContext, "operatorInputs.starterContext", [], STARTER_CONTEXT_FIELDS);
  const normalized = {
    businessObjectives: inputs.businessObjectives ?? [],
    ownerRoles: inputs.ownerRoles ?? [],
    claimEvidence: validateClaimEvidence(inputs.claimEvidence ?? [], "operatorInputs.claimEvidence"),
    mandatoryControlIds: inputs.mandatoryControlIds ?? [],
    starterContext: Object.fromEntries(
      STARTER_CONTEXT_FIELDS.map((field) => [field, starterContext[field] ?? []]),
    ),
  };
  for (const [key, items] of Object.entries(normalized)) {
    if (key === "starterContext") {
      Object.entries(items).forEach(([field, values]) =>
        assertUniqueStrings(
          values,
          `operatorInputs.starterContext.${field}`,
          REMEDIATION_CONTRACT.maxReasonItems,
        ),
      );
      continue;
    }
    if (key === "claimEvidence") continue;
    assertUniqueStrings(items, `operatorInputs.${key}`, REMEDIATION_CONTRACT.maxSources);
  }
  return normalized;
}

function validateStarterProposalSafety(value, name) {
  if (
    STARTER_UNSAFE_IDENTIFIER.test(value.id) ||
    value.controlIds.some((control) =>
      STARTER_UNSAFE_CONTROLS.has(control) || STARTER_UNSAFE_IDENTIFIER.test(control))
  ) {
    throw new Error(`${name} cannot recommend multi-agent orchestration or fan-out in the starter guide.`);
  }
  const narrativeValues = [];
  const collectNarrativeValues = (item) => {
    if (typeof item === "string") {
      narrativeValues.push(item);
    } else if (Array.isArray(item)) {
      item.forEach(collectNarrativeValues);
    } else if (item && typeof item === "object") {
      Object.values(item).forEach(collectNarrativeValues);
    }
  };
  collectNarrativeValues(value);
  const narrative = narrativeValues.join(" ");
  if (STARTER_UNSAFE_NARRATIVE.test(narrative)) {
    throw new Error(`${name} cannot recommend multi-agent orchestration or fan-out in the starter guide.`);
  }
}

function aggregateUnknowns(inventory, operatorInputs) {
  const unknowns = [
    ...inventory.unknowns,
    ...inventory.findings.flatMap((finding) => finding.unknowns.map((unknown) => ({ ...unknown, findingId: finding.id }))),
  ];
  const organizational = [
    ["business-objectives", operatorInputs.businessObjectives, "Provide the objectives the roadmap should optimize."],
    ["owner-role-policy", operatorInputs.ownerRoles, "Provide the allowed accountable role vocabulary."],
    ["claim-evidence", operatorInputs.claimEvidence, "Provide local baselines, costs, attribution, and thresholds."],
  ];
  for (const [control, values, needed] of organizational) {
    if (values.length === 0) unknowns.push({ control, reason: "No operator-supplied organizational input was provided.", needed });
  }
  return unknowns;
}

function derivePriorityClass(findings, controlIds, score, mandatoryControlIds) {
  if (controlIds.some((control) => mandatoryControlIds.includes(control))) return "mandatory";
  if (findings.every(({ status }) => INCONCLUSIVE_STATUSES.has(status))) return "verify-first";
  const gateControls = new Set(score.advancementGates.flatMap(({ controls }) => controls));
  return controlIds.some((control) => gateControls.has(control)) ? "advancement-gate" : "optimization";
}

function compareRecommendations(left, right) {
  return PRIORITY_ORDER[left.priorityClass] - PRIORITY_ORDER[right.priorityClass]
    || right.relativePriority.value - left.relativePriority.value
    || left.id.localeCompare(right.id);
}

function findingFor(inventory, control) {
  return inventory.findings.find((finding) => finding.control === control);
}

function observedPaths(finding) {
  if (!finding) return [];
  const sampled = finding.discovery?.sampledPaths ?? [];
  if (sampled.length > 0) return sampled;
  const location = finding.source?.location;
  return location && !location.startsWith("repository-scan:") ? [location] : [];
}

function firstObservedPath(inventory, control, fallback) {
  return observedPaths(findingFor(inventory, control))[0] ?? fallback;
}

function parentPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const separator = normalized.lastIndexOf("/");
  return separator === -1 ? "." : normalized.slice(0, separator);
}

function deriveRepositoryShape(inventory) {
  const manifestPaths = observedPaths(findingFor(inventory, "build-manifests"));
  const nestedAgentPaths = observedPaths(findingFor(inventory, "nested-agents"));
  const scopedInstructionPaths = observedPaths(findingFor(inventory, "path-instructions"));
  const nonRootManifestParents = new Set(
    manifestPaths.map(parentPath).filter((path) => path !== "."),
  );
  const traversalTruncated = inventory.collection?.traversalTruncated === true;
  const multiProject =
    nestedAgentPaths.length > 0 ||
    scopedInstructionPaths.length > 0 ||
    nonRootManifestParents.size > 1;
  const classification = traversalTruncated
    ? "UNVERIFIED"
    : multiProject
      ? "multi-project or monorepo-shaped"
      : "single-project or not yet proven multi-project";
  const signals = [
    manifestPaths.length > 0
      ? `Observed build manifest paths: ${manifestPaths.join(", ")}.`
      : "No build manifest path was discovered by the local inventory.",
    nestedAgentPaths.length > 0
      ? `Observed nested AGENTS.md paths: ${nestedAgentPaths.join(", ")}.`
      : "No nested AGENTS.md path was discovered.",
    scopedInstructionPaths.length > 0
      ? `Observed path-scoped instruction paths: ${scopedInstructionPaths.join(", ")}.`
      : "No path-scoped Copilot instruction path was discovered.",
  ];
  if (traversalTruncated) {
    signals.push("Repository traversal was truncated, so repository shape remains UNVERIFIED.");
  }
  return { classification, multiProject, traversalTruncated, signals };
}

function deriveInstructionDecision(inventory, shape) {
  const rootAgentsPath = observedPaths(findingFor(inventory, "root-agents"))[0];
  const copilotInstructionsPath = observedPaths(findingFor(inventory, "copilot-instructions"))[0];
  if (rootAgentsPath && copilotInstructionsPath) {
    return {
      status: "OBSERVED",
      choice: rootAgentsPath,
      alternative: copilotInstructionsPath,
      rationale:
        `Use ${rootAgentsPath} as the concise shared source for repository commands and boundaries. ` +
        `Keep ${copilotInstructionsPath} only for Copilot-specific behavior and remove duplicated guidance.`,
    };
  }
  if (rootAgentsPath) {
    return {
      status: "OBSERVED",
      choice: rootAgentsPath,
      alternative: ".github/copilot-instructions.md",
      rationale:
        `The repository already has ${rootAgentsPath}. Improve that observed shared instruction surface ` +
        "instead of creating a second file with overlapping commands.",
    };
  }
  if (copilotInstructionsPath) {
    return {
      status: "OBSERVED",
      choice: copilotInstructionsPath,
      alternative: "AGENTS.md",
      rationale:
        `The repository already has ${copilotInstructionsPath} and no root AGENTS.md was discovered. ` +
        "Improve the existing Copilot surface; add AGENTS.md only when another agent surface or shared nested boundary is confirmed.",
    };
  }
  if (shape.multiProject) {
    return {
      status: "CODE-DERIVED",
      choice: "AGENTS.md",
      alternative: ".github/copilot-instructions.md",
      rationale:
        "Observed multi-project signals favor one concise root AGENTS.md for shared navigation, verified commands, and boundaries. " +
        "Add scoped instructions later only for confirmed subtree differences.",
    };
  }
  return {
    status: shape.traversalTruncated ? "UNVERIFIED" : "CODE-DERIVED",
    choice: ".github/copilot-instructions.md",
    alternative: "AGENTS.md",
    rationale:
      "No existing root instruction file or multi-project signal was discovered. Start with the smallest Copilot-specific file; " +
      "switch to AGENTS.md if another agent surface or repository-wide nested boundary is confirmed.",
  };
}

function deriveStarterGuide(inventory, operatorInputs, score) {
  const shape = deriveRepositoryShape(inventory);
  const instructionDecision = deriveInstructionDecision(inventory, shape);
  const issuePath = firstObservedPath(
    inventory,
    "issue-templates",
    ".github/ISSUE_TEMPLATE/agent-task.yml",
  );
  const pullRequestPath = firstObservedPath(
    inventory,
    "pull-request-templates",
    ".github/pull_request_template.md",
  );
  const setupPath = firstObservedPath(
    inventory,
    "copilot-setup-steps",
    ".github/workflows/copilot-setup-steps.yml",
  );
  const contextPath = instructionDecision.choice;
  const contextItems = STARTER_CONTEXT_FIELDS.map((field) => {
    const values = operatorInputs.starterContext[field];
    return {
      field,
      label: STARTER_CONTEXT_LABELS[field],
      status: values.length > 0 ? "SHARED" : "UNVERIFIED",
      values,
      needed: values.length > 0
        ? "Use only for this starter implementation and re-verify when conditions change."
        : `Provide ${STARTER_CONTEXT_LABELS[field].toLowerCase()} before implementation.`,
    };
  });

  return {
    verdict:
      `Begin with one bounded, review-owned pilot. Current readiness is ${score.overall}/4 for ${score.consumer}; ` +
      "do not scale agent concurrency until one task can reach a trusted merged outcome.",
    nextAction: {
      action:
        `Frame one candidate task in ${issuePath} with a human review owner before starting an agent run.`,
      targetPath: issuePath,
      acceptanceCriterion:
        "One issue states the goal, in-scope and out-of-scope paths, definition of done, focused checks, owner role, and stop condition.",
    },
    repositoryShape: shape,
    instructionDecision,
    flow: [
      {
        title: "Frame one bounded task",
        targetPaths: [issuePath],
        action:
          "Capture the user-visible outcome, exact in-scope and excluded repository paths, constraints, definition of done, human owner, and stop condition.",
        acceptanceCriterion:
          `A reviewer can decide whether the task is agent-sized using only ${issuePath} and linked repository paths.`,
      },
      {
        title: "Start with narrow context",
        targetPaths: [issuePath],
        action:
          "Begin from the issue, exact diagnostic, and named files. Expand context only after read-only research identifies a dependency; hand off a concise file map and unresolved risks.",
        acceptanceCriterion:
          "The implementation handoff lists only relevant paths, approved decisions, risks, and UNVERIFIED unknowns; discarded exploration is omitted.",
      },
      {
        title: "Add concise repository instructions",
        targetPaths: [contextPath],
        action:
          `Put only verified commands, non-obvious boundaries, definition of done, and recurring failure prevention in ${contextPath}. Do not copy a generic template.`,
        acceptanceCriterion:
          `Every command and path named in ${contextPath} is verified in this repository, and ${instructionDecision.alternative} contains no duplicated guidance.`,
      },
      {
        title: "Make setup and validation deterministic",
        targetPaths: [contextPath, setupPath],
        action:
          `Verify clean setup plus the smallest relevant build, test, lint, or type check. Create ${setupPath} only if Copilot coding agent is a confirmed surface; stop before coding when setup fails.`,
        acceptanceCriterion:
          "A clean run reaches the focused checks with documented commands, and known failures remain explicitly UNVERIFIED or are assigned an owner.",
      },
      {
        title: "Keep review human-owned and PRs bounded",
        targetPaths: [pullRequestPath],
        action:
          "Require an accountable reviewer role, cohesive scope, changed-path summary, validation evidence, risks, rollback note, and a split when ownership or rollback boundaries differ.",
        acceptanceCriterion:
          `Each pilot PR satisfies ${pullRequestPath}, has one human review owner, and can be reviewed without unrelated generated changes.`,
      },
      {
        title: "Measure the trusted merged outcome",
        targetPaths: [pullRequestPath],
        action:
          "Record agent interactions and retries, AI usage when available, CI runs and failures, review wait and effort, review comments, rework, operational-risk exceptions, and merged, abandoned, reverted, or reopened outcome.",
        acceptanceCriterion:
          "The pilot has a pre-task baseline and post-task record sufficient to compare total delivery cost per trusted merged outcome without claiming numeric ROI.",
      },
    ],
    costModel: {
      objective: "Optimize cost per trusted merged outcome, not minimum token usage.",
      categories: [
        "AI usage",
        "CI and runner usage",
        "developer interaction",
        "human review",
        "rework",
        "operational risk",
      ],
      practices: [
        "Use narrow context and expand only when evidence identifies another dependency.",
        "Separate research, plan, implementation, and validation with concise handoffs.",
        "Grant the minimum tool authority needed for the current phase.",
        "Run focused deterministic checks before broad CI.",
        "Produce small, cohesive PRs that fit available reviewer capacity.",
        "Treat external productivity evidence as a hypothesis; make no numeric ROI claim without local evidence.",
      ],
    },
    contextItems,
    doNotDoYet: [
      "Do not recommend multi-agent orchestration for the starter flow.",
      "Do not enable broad MCP or write authority when read-only or narrower tools are sufficient.",
      "Do not create a large instruction hierarchy before a real bounded task proves a scoped need.",
      "Do not optimize tokens by removing context that prevents CI retries, review effort, or rework.",
      "Do not publish numeric ROI, savings, or productivity claims without local baseline, cost, attribution, and outcome evidence.",
    ],
  };
}

export async function buildRemediationView(inventory, options = {}) {
  if (!inventory || !Array.isArray(inventory.findings) || !inventory.outputBudget) {
    throw new Error("A schema-valid inventory is required.");
  }
  assertClosedObject(options, "options", [], [
    "consumer",
    "proposals",
    "operatorInputs",
    "guideProfile",
  ]);
  const guideProfile = options.guideProfile ?? "improvement-guide";
  if (!GUIDE_PROFILES.has(guideProfile)) {
    throw new Error(`Unsupported guide profile '${guideProfile}'.`);
  }
  const consumer = options.consumer ?? "cloud-agent";
  const proposals = options.proposals ?? [];
  assertArray(proposals, "proposals", REMEDIATION_CONTRACT.maxRecommendations);
  const operatorInputs = validateOperatorInputs(options.operatorInputs);
  const evidence = assignEvidenceReferences(inventory.findings);
  const findingById = new Map(evidence.map(({ finding }) => [finding.id, finding]));
  const findingReferences = new Map(evidence.map(({ finding, citation }) => [finding.id, citation]));
  const score = scoreEvidence(inventory.findings, { consumer });
  const validControls = scoringControls();
  inventory.findings.forEach(({ control }) => validControls.add(control));
  const sourceRegistry = await loadTrustedSourceRegistry();
  const sourceById = new Map(sourceRegistry.map((source) => [source.id, source]));
  const trustedSourceIds = new Set(sourceRegistry.filter(({ citable, status }) => citable && status === "VERIFIED").map(({ id }) => id));

  const recommendations = proposals.map((proposal, index) => {
    const name = `proposals[${index}]`;
    assertClosedObject(proposal, name, [
      "id", "title", "action", "target", "steps", "findingIds", "controlIds", "sourceRefs",
      "reason", "priorityInputs", "effort", "owner", "dependencies", "acceptanceCriteria",
      "validation", "measurementPlan", "stopCondition", "valueClaim",
    ]);
    assertText(proposal.id, `${name}.id`);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(proposal.id)) throw new Error(`${name}.id must be a stable slug.`);
    const title = validateProvenancedText(proposal.title, `${name}.title`, new Set(["model-proposed", "catalogue-derived"]));
    const action = validateProvenancedText(proposal.action, `${name}.action`, new Set(["model-proposed", "catalogue-derived"]));
    const target = validateTarget(proposal.target, `${name}.target`);
    const steps = validateTextItems(proposal.steps, `${name}.steps`, REMEDIATION_CONTRACT.maxSteps);
    assertUniqueStrings(proposal.findingIds, `${name}.findingIds`, REMEDIATION_CONTRACT.maxRecommendations, 1);
    const selectedFindings = proposal.findingIds.map((id) => {
      const finding = findingById.get(id);
      if (!finding) throw new Error(`${name}.findingIds contains unknown finding '${id}'.`);
      return finding;
    });
    assertUniqueStrings(proposal.controlIds, `${name}.controlIds`, REMEDIATION_CONTRACT.maxRecommendations, 1);
    if (guideProfile === "starter-guide") {
      validateStarterProposalSafety({ ...proposal, title, action, steps }, name);
    }
    const selectedFindingControls = new Set(selectedFindings.map(({ control }) => control));
    for (const control of proposal.controlIds) {
      if (!validControls.has(control)) throw new Error(`${name}.controlIds contains unknown control '${control}'.`);
      if (!selectedFindingControls.has(control) && !score.advancementGates.some(({ controls }) => controls.includes(control))) {
        throw new Error(`${name}.controlIds contains control '${control}' unrelated to selected evidence or scoring gates.`);
      }
    }
    assertUniqueStrings(proposal.sourceRefs, `${name}.sourceRefs`, REMEDIATION_CONTRACT.maxSources, 1);
    for (const sourceRef of proposal.sourceRefs) {
      const source = sourceById.get(sourceRef);
      if (!source) throw new Error(`${name}.sourceRefs contains unknown source '${sourceRef}'.`);
      if (!trustedSourceIds.has(sourceRef)) throw new Error(`${name}.sourceRefs contains source '${sourceRef}' that is not independently citable and VERIFIED.`);
    }
    const reason = validateReason(proposal.reason, `${name}.reason`, { findingIds: proposal.findingIds, controlIds: proposal.controlIds, sourceRefs: proposal.sourceRefs, findingById });
    const priorityInputs = validatePriorityInputs(proposal.priorityInputs, `${name}.priorityInputs`);
    assertClosedObject(proposal.effort, `${name}.effort`, ["label", "jobSize", "provenance"]);
    if (!new Set(["S", "M", "L"]).has(proposal.effort.label)) throw new Error(`${name}.effort.label is unsupported.`);
    if (proposal.effort.jobSize !== priorityInputs.jobSize.value) throw new Error(`${name}.effort.jobSize must equal priorityInputs.jobSize.value.`);
    assertProvenance(proposal.effort.provenance, `${name}.effort.provenance`, new Set(["model-proposed", "operator-supplied"]));
    const owner = validateOwner(proposal.owner, `${name}.owner`, operatorInputs.ownerRoles);
    assertUniqueStrings(proposal.dependencies, `${name}.dependencies`, REMEDIATION_CONTRACT.maxDependencies);
    const acceptanceCriteria = validateTextItems(proposal.acceptanceCriteria, `${name}.acceptanceCriteria`, REMEDIATION_CONTRACT.maxAcceptanceCriteria);
    const validation = validateTextItems(proposal.validation, `${name}.validation`, REMEDIATION_CONTRACT.maxValidationChecks);
    const measurementPlan = validateMeasurementPlan(proposal.measurementPlan, `${name}.measurementPlan`);
    const stopCondition = validateProvenancedText(proposal.stopCondition, `${name}.stopCondition`, new Set(["model-proposed", "operator-supplied", "unknown"]));
    const valueClaim = validateValueClaim(
      proposal.valueClaim,
      `${name}.valueClaim`,
      trustedSourceIds,
      measurementPlan.guardrails.length,
      { inventory, claimEvidence: operatorInputs.claimEvidence },
    );
    if (!sameMembers(valueClaim.sourceRefs ?? proposal.sourceRefs, proposal.sourceRefs)) throw new Error(`${name}.valueClaim.sourceRefs must equal recommendation sourceRefs.`);
    const priorityClass = derivePriorityClass(selectedFindings, proposal.controlIds, score, operatorInputs.mandatoryControlIds);
    if (priorityClass === "verify-first" && !/verif|confirm|determin/iu.test(action.value)) throw new Error(`${name} supported only by inconclusive evidence must be a verification action.`);
    const relativePriorityValue = (priorityInputs.businessValue.value + priorityInputs.timeCriticality.value + priorityInputs.riskReduction.value)
      * priorityInputs.confidence.value / priorityInputs.jobSize.value;
    return {
      id: proposal.id,
      title,
      action,
      target,
      steps,
      findingIds: [...proposal.findingIds],
      findingRefs: proposal.findingIds.map((id) => findingReferences.get(id)),
      controlIds: [...proposal.controlIds],
      sourceRefs: [...proposal.sourceRefs],
      reason,
      priorityClass,
      priorityInputs,
      relativePriority: { value: relativePriorityValue, provenance: "code-derived" },
      effort: { ...proposal.effort },
      owner,
      dependencies: [...proposal.dependencies],
      acceptanceCriteria,
      validation,
      measurementPlan,
      stopCondition,
      valueClaim,
    };
  });
  validateDependencies(recommendations);
  const sortedRecommendations = [...recommendations].sort(compareRecommendations);
  const usedSourceIds = new Set(sortedRecommendations.flatMap(({ sourceRefs }) => sourceRefs));
  if (usedSourceIds.size > REMEDIATION_CONTRACT.maxSources) throw new Error(`sources cannot contain more than ${REMEDIATION_CONTRACT.maxSources} items.`);

  return {
    schemaVersion: REMEDIATION_CONTRACT.version,
    guideProfile,
    auditId: inventory.auditId,
    generatedAt: evidence.map(({ finding }) => finding.observation.observedAt).sort().at(-1) ?? null,
    repository: {
      identity: inventory.repository.identity,
      root: inventory.repository.root,
    },
    scoreSummary: {
      contractVersion: score.contractVersion,
      consumer: score.consumer,
      pillars: score.pillars,
      overall: score.overall,
      nextLevel: score.nextLevel,
      advancementGates: score.advancementGates,
      provenance: "code-derived",
    },
    recommendations: sortedRecommendations,
    starter: guideProfile === "starter-guide"
      ? deriveStarterGuide(inventory, operatorInputs, score)
      : null,
    deferred: [],
    unknowns: aggregateUnknowns(inventory, operatorInputs),
    sources: sourceRegistry.filter(({ id }) => usedSourceIds.has(id)),
    outputBudget: {
      maxRecommendations: REMEDIATION_CONTRACT.maxRecommendations,
      maxSteps: REMEDIATION_CONTRACT.maxSteps,
      maxAcceptanceCriteria: REMEDIATION_CONTRACT.maxAcceptanceCriteria,
      maxValidationChecks: REMEDIATION_CONTRACT.maxValidationChecks,
      maxMetrics: REMEDIATION_CONTRACT.maxMetrics,
      maxGuardrails: REMEDIATION_CONTRACT.maxGuardrails,
      maxSources: REMEDIATION_CONTRACT.maxSources,
    },
  };
}