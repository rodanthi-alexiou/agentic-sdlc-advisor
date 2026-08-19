function findingCitation(index) {
  return `E${String(index + 1).padStart(2, "0")}`;
}

export function assignEvidenceReferences(findings) {
  if (!Array.isArray(findings)) throw new Error("findings must be an array.");

  return [...findings]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((finding, index) => ({
      finding,
      citation: findingCitation(index),
    }));
}