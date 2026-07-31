#!/usr/bin/env bash
# Blast-radius check for a field you are about to change (Gate 2).
#
# Usage:  scripts/blast-radius.sh startTime [more fields...]
#
# Why this exists: a "cosmetic" fix that turned the literal string "null" into a
# real null on startTime silently reclassified 31 cards, because
# trip-card-taxonomy.ts does `Boolean(input.startTime || input.endTime)` and the
# string "null" is truthy. That shipped as an unflagged second variable in a
# one-variable run. One grep would have caught it.
#
# Run from the repo root. Read every hit before you edit.

set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <field> [field...]" >&2
  exit 64
fi

if [ ! -d lib ]; then
  echo "run this from the repo root (no ./lib here)" >&2
  exit 66
fi

SEARCH_PATHS=(lib app components types)
EXCLUDES=(--glob '!node_modules' --glob '!_to_delete' --glob '!*.tsbuildinfo')

# Prefer ripgrep; fall back to grep so this works on a bare machine.
if command -v rg >/dev/null 2>&1; then
  finder() { rg -n --no-heading "${EXCLUDES[@]}" -e "$1" "${SEARCH_PATHS[@]}" 2>/dev/null; }
else
  finder() {
    grep -rn --include='*.ts' --include='*.tsx' --include='*.mjs' \
      --exclude-dir=node_modules --exclude-dir=_to_delete \
      -E "$1" "${SEARCH_PATHS[@]}" 2>/dev/null
  }
fi

for FIELD in "$@"; do
  echo "════════════════════════════════════════════════════════════════"
  echo "FIELD: $FIELD"
  echo "════════════════════════════════════════════════════════════════"

  echo
  echo "── ALL references ──────────────────────────────────────────────"
  finder "\b${FIELD}\b" | sed 's/^/  /'

  echo
  echo "── TRUTHINESS CHECKS (a literal \"null\" string passes these) ───"
  finder "(Boolean\([^)]*${FIELD}|${FIELD}[^=!<>]*\|\||if \([^)]*${FIELD}\)|\!${FIELD}|\?\?[^;]*${FIELD})" \
    | sed 's/^/  /'

  echo
  echo "── WRITES (assignment / object literal) ────────────────────────"
  finder "(${FIELD}\s*[:=][^=]|${FIELD}\s*=\s*null)" | sed 's/^/  /'

  echo
  echo "── USED AS A MAP OR SET KEY (a null here silently drops the row) ─"
  # No ${VAR^} here on purpose: macOS ships bash 3.2, which cannot parse it.
  finder "(Map|Set|group|byDate|Dates|ByDate)[^\n]*${FIELD}|${FIELD}[^\n]*(\.set\(|\.get\(|\.has\(|\.add\()" \
    | sed 's/^/  /'

  echo
  echo "── TESTS that assert on it ─────────────────────────────────────"
  if command -v rg >/dev/null 2>&1; then
    rg -n --no-heading --glob '!node_modules' -e "\b${FIELD}\b" tests 2>/dev/null | sed 's/^/  /'
  else
    grep -rn --include='*.ts' --exclude-dir=node_modules -E "\b${FIELD}\b" tests 2>/dev/null | sed 's/^/  /'
  fi

  echo
  echo "── SERVED SURFACES (does it reach the audit snapshot / bundle?) ─"
  if command -v rg >/dev/null 2>&1; then
    rg -n --no-heading -e "\b${FIELD}\b" \
      lib/extraction/trip-extraction-audit-snapshot.ts \
      lib/extraction/trip-extraction-audit-types.ts \
      lib/extraction/trip-extraction-qa-bundle.ts 2>/dev/null | sed 's/^/  /'
  else
    grep -n -E "\b${FIELD}\b" \
      lib/extraction/trip-extraction-audit-snapshot.ts \
      lib/extraction/trip-extraction-audit-types.ts \
      lib/extraction/trip-extraction-qa-bundle.ts 2>/dev/null | sed 's/^/  /'
  fi
  echo "  (empty means the field is NOT observable in a run — Gate 3 fails)"
  echo
done

cat <<'EOF'
────────────────────────────────────────────────────────────────
Now answer, in the conversation, before editing:

  1. Which of the consumers above change behaviour?
  2. Does any of them decide what a record IS (timed-ness, itemType,
     evidenceRole, outputEligible) rather than how it renders?
  3. Is the field used as a map/set key anywhere? A null there removes the
     record from that grouping silently.
  4. Can the change be observed in a run? If not, Gate 3 is unsatisfied.

An empty answer to (1) is a finding, not a formality — say so explicitly.
EOF

# A section finding no matches is normal and is not a failure of this check.
exit 0
