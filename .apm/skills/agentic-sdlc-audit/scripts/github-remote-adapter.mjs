const SECRET_PATTERNS = [
  /(?:authorization|proxy-authorization|x-auth-token)/iu,
  /(?:gh[pousr]_[A-Za-z0-9_]{20,})/giu,
  /(?:github_pat_[A-Za-z0-9_]{20,})/giu,
];

const RESPONSE_CLASSES = new Set([
  "success",
  "unauthenticated",
  "unauthorized",
  "not-found",
  "rate-limited",
  "transient-error",
  "unavailable",
]);

function decodeSegment(value) {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes("/") || decoded.includes("\\") ? null : decoded;
  } catch {
    return null;
  }
}

function identityFromParts(host, path) {
  const segments = path.replace(/^\/+|\/+$/gu, "").split("/");
  if (segments.length !== 2) return null;
  const owner = decodeSegment(segments[0]);
  const repository = decodeSegment(segments[1].replace(/\.git$/iu, ""));
  if (!owner || !repository || owner === "." || repository === ".") return null;
  const normalizedHost = host.toLowerCase();
  return {
    host: normalizedHost,
    owner,
    repository,
    identity: `${normalizedHost}/${owner}/${repository}`,
    apiBaseUrl:
      normalizedHost === "github.com"
        ? "https://api.github.com"
        : `https://${normalizedHost}/api/v3`,
  };
}

export function parseGitHubRemote(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") return null;
  const value = remoteUrl.trim();

  const scpMatch = /^(?:[^@/:\s]+@)?([^/:\s]+):(.+)$/u.exec(value);
  if (scpMatch && !value.includes("://")) {
    return identityFromParts(scpMatch[1], scpMatch[2]);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!new Set(["https:", "ssh:"]).has(parsed.protocol)) return null;
  if (parsed.search || parsed.hash || !parsed.hostname) return null;
  return identityFromParts(parsed.host, parsed.pathname);
}

function remoteTrust() {
  return {
    classification: "untrusted-remote",
    contentTreatedAsData: true,
    redaction: { applied: false, fields: [] },
  };
}

function source(endpoint, httpStatus, prerequisite) {
  return {
    kind: "github-api",
    location: endpoint,
    ...(Number.isInteger(httpStatus) ? { httpStatus } : {}),
    prerequisite: prerequisite ?? null,
  };
}

export function resolveRepositoryEvidence(options) {
  const observedAt = options.observedAt;
  const remoteIdentity = parseGitHubRemote(options.remoteUrl);
  const metadata = options.metadata ?? null;
  const metadataSucceeded =
    metadata?.authenticated === true &&
    metadata.responseClass === "success" &&
    metadata.httpStatus >= 200 &&
    metadata.httpStatus < 300 &&
    typeof metadata.defaultBranch === "string" &&
    metadata.defaultBranch.trim() !== "";
  const metadataIdentity = metadataSucceeded
    ? identityFromParts(metadata.host ?? remoteIdentity?.host ?? "github.com", `${metadata.owner ?? ""}/${metadata.repository ?? ""}`)
    : null;
  const identity = metadataIdentity ?? remoteIdentity;

  const defaultBranch = metadataSucceeded
    ? {
        name: metadata.defaultBranch.trim(),
        status: "enforced",
        source: source("repository-metadata", metadata.httpStatus, "authenticated repository read"),
        observation: { observedAt, method: "remote-query", commit: null },
      }
    : options.remoteHead?.name
      ? {
          name: options.remoteHead.name,
          status: "unverified",
          source: {
            kind: "git",
            location: `refs/remotes/${options.remoteHead.remote ?? "origin"}/HEAD`,
            prerequisite: "authenticated repository metadata",
          },
          observation: { observedAt, method: "normalization", commit: null },
        }
      : {
          name: null,
          status: "unverified",
          source: {
            kind: "unsupported",
            location: "hosted-repository-metadata",
            prerequisite: identity ? "authenticated repository read" : "recognized GitHub remote",
          },
          observation: { observedAt, method: "normalization", commit: null },
        };

  return {
    identity: identity?.identity ?? null,
    identityEvidence: {
      status: metadataIdentity ? "enforced" : "unverified",
      source: metadataIdentity
        ? source("repository-metadata", metadata.httpStatus, "authenticated repository read")
        : identity
        ? { kind: "git", location: "configured-remote", prerequisite: null }
        : { kind: "unsupported", location: "configured-remote", prerequisite: "recognized GitHub remote" },
      observation: { observedAt, method: "normalization", commit: null },
    },
    defaultBranch,
    trust: remoteTrust(),
  };
}

function assertSafeFixture(fixture) {
  const serialized = JSON.stringify(fixture);
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(serialized)) {
      throw new Error("Remote fixture contains a forbidden authentication field or secret value.");
    }
  }
  const forbiddenFields = new Set(["authorization", "body", "headers", "issuebody", "pullrequestbody", "rawbody", "token"]);
  const containsForbiddenField = (value) => {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, child]) =>
      forbiddenFields.has(key.toLowerCase()) || containsForbiddenField(child));
  };
  if (containsForbiddenField(fixture)) {
    throw new Error("Remote fixtures must contain normalized fields, not headers or raw response bodies.");
  }
}

export function normalizeRemoteObservation(fixture, observedAt) {
  assertSafeFixture(fixture);
  if (!RESPONSE_CLASSES.has(fixture.responseClass)) {
    throw new Error(`Unsupported response class '${fixture.responseClass ?? ""}'.`);
  }

  const prerequisitesVerified = fixture.prerequisite?.verified === true;
  const permission = fixture.permission ?? { required: "unknown", granted: null };
  const feature = fixture.feature ?? { availability: "unknown", enabled: null };
  let status = "unverified";
  let interpretation = "The observation did not establish presence or absence.";

  if (fixture.responseClass === "unauthenticated" || fixture.httpStatus === 401) {
    status = "unauthenticated";
    interpretation = "Authentication was not available for the requested capability.";
  } else if (fixture.responseClass === "unauthorized" || fixture.httpStatus === 403) {
    status = "unauthorized";
    interpretation = "The authenticated identity lacks the required read permission.";
  } else if (new Set(["rate-limited", "transient-error", "unavailable"]).has(fixture.responseClass)) {
    status = "unavailable";
    interpretation = "The remote service could not provide a conclusive observation.";
  } else if (feature.availability === "unavailable") {
    status = "unavailable";
    interpretation = "The feature is unavailable for this repository or plan.";
  } else if (fixture.responseClass === "not-found") {
    const corroboratedAbsence =
      prerequisitesVerified &&
      permission.granted === true &&
      feature.availability === "available" &&
      fixture.notFoundSemantics === "verified-negative" &&
      fixture.corroboration === "no-effective-rules";
    status = corroboratedAbsence ? "gap" : "unverified";
    interpretation = corroboratedAbsence
      ? "Verified repository and branch access plus no effective rules establish absence."
      : "Not-found is ambiguous without verified access, endpoint semantics, and corroboration.";
  } else if (fixture.responseClass === "success" && prerequisitesVerified) {
    if (feature.enabled === false) {
      status = "disabled";
      interpretation = "The available feature was observed explicitly disabled.";
    } else if (fixture.observed === true) {
      status = "enforced";
      interpretation = "The requested control was observed effective.";
    } else if (fixture.observed === false && permission.granted === true) {
      status = "gap";
      interpretation = "A successful authorized observation established control absence.";
    }
  }

  return {
    endpoint: fixture.endpoint,
    prerequisite: fixture.prerequisite ?? { name: "unspecified", verified: false },
    permission: { required: permission.required ?? "unknown", granted: permission.granted ?? null },
    feature: {
      availability: feature.availability ?? "unknown",
      enabled: feature.enabled ?? null,
    },
    responseClass: fixture.responseClass,
    interpretation,
    finding: {
      id: fixture.control,
      control: fixture.control,
      status,
      scope: fixture.scope ?? "repository",
      source: source(fixture.endpoint, fixture.httpStatus, fixture.prerequisite?.name),
      consumer: fixture.consumer ?? ["cloud-agent", "code-review", "maintainer", "ci"],
      observation: { observedAt, method: "normalization", commit: null },
      trust: remoteTrust(),
      warnings: [],
      unknowns:
        status === "unverified" || status === "unavailable" || status === "unauthorized" || status === "unauthenticated"
          ? [{ control: fixture.control, reason: interpretation, needed: fixture.needed ?? "A conclusive read-only observation is required." }]
          : [],
    },
  };
}