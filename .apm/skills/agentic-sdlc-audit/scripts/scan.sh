#!/bin/sh
# agentic-sdlc-audit :: Phase 1 inventory
# Read-only. Emits a facts block for the audit. No network, no writes, no secret values.
#
# Usage:  sh <skill-dir>/scripts/scan.sh [repo-root]
# Exit:   0 always (absence of files is a finding, not an error)

set -u
ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || echo .)}"
cd "$ROOT" 2>/dev/null || { echo "cannot cd to $ROOT"; exit 0; }

hr() { printf '\n== %s ==\n' "$1"; }

# report(label, path) -> presence + line count, never contents
report() {
  if [ -f "$2" ]; then
    printf '%-42s PRESENT   lines=%s\n' "$1" "$(wc -l < "$2" | tr -d ' ')"
  else
    printf '%-42s MISSING\n' "$1"
  fi
}

count_glob() {
  # count_glob(label, dir, pattern)
  if [ -d "$2" ]; then
    n=$(find "$2" -name "$3" -type f 2>/dev/null | wc -l | tr -d ' ')
    printf '%-42s dir=PRESENT  matches=%s\n' "$1" "$n"
    find "$2" -name "$3" -type f 2>/dev/null | sed 's/^/      - /'
  else
    printf '%-42s dir=MISSING\n' "$1"
  fi
}

hr "REPO SHAPE"
printf 'root=%s\n' "$(pwd)"
printf 'default_branch=%s\n' "$(git symbolic-ref --short HEAD 2>/dev/null || echo UNKNOWN)"
printf 'tracked_files=%s\n' "$(git ls-files 2>/dev/null | wc -l | tr -d ' ')"
printf 'commits_last_90d=%s\n' "$(git log --since=90.days --oneline 2>/dev/null | wc -l | tr -d ' ')"
printf 'distinct_authors_last_90d=%s\n' "$(git log --since=90.days --format='%ae' 2>/dev/null | sort -u | wc -l | tr -d ' ')"
printf 'top_extensions:\n'
git ls-files 2>/dev/null | sed -n 's/.*\.\([A-Za-z0-9]\{1,10\}\)$/\1/p' \
  | sort | uniq -c | sort -rn | head -12 | sed 's/^/      /'

hr "PILLAR A :: CONTEXT"
report "AGENTS.md (root)"                        "AGENTS.md"
report "CLAUDE.md (root)"                        "CLAUDE.md"
report ".github/copilot-instructions.md"         ".github/copilot-instructions.md"
count_glob ".github/instructions/*.instructions.md" ".github/instructions" "*.instructions.md"
printf '%-42s %s\n' "nested AGENTS.md (monorepo pattern)" \
  "$(find . -name 'AGENTS.md' -not -path './.git/*' 2>/dev/null | wc -l | tr -d ' ') found"
find . -name 'AGENTS.md' -not -path './.git/*' 2>/dev/null | sed 's/^/      - /'

hr "PILLAR B :: REUSABLE ASSETS"
count_glob ".github/prompts/*.prompt.md"         ".github/prompts" "*.prompt.md"
count_glob ".github/agents/*.agent.md"           ".github/agents"  "*.agent.md"
count_glob ".github/skills/*/SKILL.md"           ".github/skills"  "SKILL.md"
count_glob ".github/chatmodes (legacy)"          ".github/chatmodes" "*.chatmode.md"
report "MCP config (.vscode/mcp.json)"           ".vscode/mcp.json"
report "MCP config (.github/workflows/copilot-mcp.json)" ".github/workflows/copilot-mcp.json"

hr "PILLAR C :: AGENT ENVIRONMENT"
report "copilot-setup-steps.yml"                 ".github/workflows/copilot-setup-steps.yml"
if [ -f .github/workflows/copilot-setup-steps.yml ]; then
  printf '   job named copilot-setup-steps? %s\n' \
    "$(grep -qE '^\s{2}copilot-setup-steps:' .github/workflows/copilot-setup-steps.yml && echo YES || echo 'NO <-- WILL NOT BE PICKED UP')"
  printf '   declares permissions? %s\n' \
    "$(grep -q 'permissions:' .github/workflows/copilot-setup-steps.yml && echo YES || echo 'NO <-- least-privilege gap')"
fi
report "devcontainer.json"                       ".devcontainer/devcontainer.json"
printf 'build/test entrypoints:\n'
for f in Makefile Taskfile.yml package.json pyproject.toml go.mod pom.xml build.gradle \
         build.gradle.kts Cargo.toml Gemfile composer.json; do
  [ -f "$f" ] && printf '      - %s\n' "$f"
done
if [ -f package.json ]; then
  printf '   npm scripts: %s\n' "$(sed -n '/"scripts"/,/}/p' package.json | grep -oE '"[a-z:_-]+":' | tr -d '":' | tr '\n' ' ')"
fi

hr "PILLAR D :: GUARDRAILS"
report "CODEOWNERS (.github)"                    ".github/CODEOWNERS"
report "CODEOWNERS (root)"                       "CODEOWNERS"
report "SECURITY.md"                             ".github/SECURITY.md"
report "dependabot.yml"                          ".github/dependabot.yml"
printf 'workflows:\n'
if [ -d .github/workflows ]; then
  find .github/workflows -name '*.y*ml' -type f 2>/dev/null | sed 's/^/      - /'
  printf '   code scanning (CodeQL) referenced? %s\n' \
    "$(grep -rqil 'codeql' .github/workflows 2>/dev/null && echo YES || echo NO)"
  printf '   dependency-review referenced?     %s\n' \
    "$(grep -rqil 'dependency-review' .github/workflows 2>/dev/null && echo YES || echo NO)"
  printf '   test job referenced?              %s\n' \
    "$(grep -rqilE '(npm|yarn|pnpm) (run )?test|pytest|go test|mvn .*test|gradle .*test|cargo test' .github/workflows 2>/dev/null && echo YES || echo NO)"
  printf '   pull_request_target used?         %s\n' \
    "$(grep -rqil 'pull_request_target' .github/workflows 2>/dev/null && echo 'YES <-- review for injection risk' || echo NO)"
else
  printf '      (no .github/workflows directory)\n'
fi

hr "PILLAR E :: PROCESS"
count_glob ".github/ISSUE_TEMPLATE"              ".github/ISSUE_TEMPLATE" "*"
report "pull_request_template.md"                ".github/pull_request_template.md"
report "CONTRIBUTING.md"                         "CONTRIBUTING.md"
printf '%-42s %s\n' "ADRs (docs/adr, docs/decisions)" \
  "$( { [ -d docs/adr ] || [ -d docs/decisions ] || [ -d doc/adr ]; } && echo PRESENT || echo MISSING)"
printf '%-42s %s\n' "spec-driven dev (.specify / specs/)" \
  "$( { [ -d .specify ] || [ -d specs ]; } && echo PRESENT || echo MISSING)"

hr "SIGNALS"
printf 'TODO/FIXME/HACK markers: %s\n' \
  "$(git grep -InE '(TODO|FIXME|HACK|XXX)' 2>/dev/null | wc -l | tr -d ' ')"
printf 'files > 800 lines (agent-hostile hotspots):\n'
git ls-files 2>/dev/null | while read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.lock|*.min.js|*.svg|*.png|*.jpg) continue;; esac
  n=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
  [ "${n:-0}" -gt 800 ] 2>/dev/null && printf '      %6s  %s\n' "$n" "$f"
done | head -15

hr "END OF SCAN"
printf 'Not visible from the filesystem — confirm with the user or `gh`:\n'
printf '  - branch protection / rulesets on the default branch\n'
printf '  - Copilot cloud agent firewall allowlist state (Settings > Copilot > Cloud agent)\n'
printf '  - GitHub Advanced Security enablement (code scanning, secret scanning)\n'
printf '  - Copilot plan (Business vs Enterprise) and org-level policies\n'
printf '  - team size, review capacity, and who owns agent output\n'
