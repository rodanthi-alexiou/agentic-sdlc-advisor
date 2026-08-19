const MARKDOWN_CHARACTERS = /[\\`*_{}\[\]()<>#+\-.!|]/gu;
const SECRET_PATTERNS = Object.freeze([
  /(?:gh[pousr]_[A-Za-z0-9_]{20,})/giu,
  /(?:github_pat_[A-Za-z0-9_]{20,})/giu,
  /(?:sk-[A-Za-z0-9_-]{20,})/giu,
  /(?:AIza[0-9A-Za-z_-]{20,})/gu,
]);

export function redactCredentialValues(value) {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

export function encodeMarkdownText(value) {
  return redactCredentialValues(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/&/gu, "&amp;")
    .replace(MARKDOWN_CHARACTERS, (character) => `&#${character.codePointAt(0)};`)
    .replace(/\s+/gu, " ")
    .trim();
}