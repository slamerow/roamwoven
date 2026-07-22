import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { isDayHeadingLine } from "@/lib/extraction/parser-artifact-normalization";
import { comparableTokens } from "@/lib/extraction/traveler-text";

// Deterministic day-section source coverage (wave 2; RW-EVD-001).
//
// Live runs 7.18.0 and 7.18.1 each silently dropped day-section source lines
// the other run extracted (koscom, "maybe communism museum", Tour Rome,
// Szechenyi Baths, Watches in Rome, Vorosmarty Ter walk) — chunk-level parser
// nondeterminism on the same model and the same PDF. This module proves,
// deterministically, which meaningful lines inside a dated day section
// produced no extracted output at all.
//
// Posture (RW-QA-001 / RW-AUD-001): the result is a CANDIDATE finding for a
// quiet P2 diagnostic and internal telemetry. It never mutates output, never
// creates a maker Question by itself, and is the deterministic trigger
// evidence RW-EVD-001 requires before any future bounded excerpt-only
// recovery call.

export type SourceCoverageUncoveredLine = {
  excerpt: string;
  lineIndex: number;
  // The clause(s) inside the line whose distinctive tokens no stage's
  // output covers (version 3, run6 PB-3): "…koscom and maybe communism
  // museum" is uncovered BECAUSE of the koscom clause even when another
  // stage covers communism+museum.
  uncoveredClauses: string[];
};

export type SourceCoverageStageReport = {
  dayHeading: string | null;
  label: string;
  meaningfulLineCount: number;
  uncoveredLines: SourceCoverageUncoveredLine[];
};

export type SourceCoverageWeakCreditLine = {
  clauses: string[];
  excerpt: string;
  label: string;
};

export type SourceCoverageSummary = {
  // Lines whose tokens another stage's output covers (the spine, or a
  // different chunk) — cross-stage content, not a drop (run5 calibration:
  // "JFK -> FCO" was covered by the SPINE stage, "Catacombs tour" by a
  // different chunk; 121/393 flagged lines were mostly this noise).
  crossStageCoveredLineCount: number;
  daySectionCount: number;
  meaningfulLineCount: number;
  stages: SourceCoverageStageReport[];
  uncoveredLineCount: number;
  // Lines whose coverage credit comes ONLY from note/context-role output
  // (live-run 7.21.0, run7 PC-6: "go to koscom" counted covered because the
  // koscom token sat inside a city-note candidate's prose — which assembly
  // later stripped; koscom shipped nowhere and was unflagged for the 7th
  // run). Weak credit is not a drop, but it is the audit's tripwire.
  weakCreditLines: SourceCoverageWeakCreditLine[];
  version: 3;
};

const EXCERPT_MAX_CHARS = 120;

// Run5 coverage calibration: OCR page markers and ticket boilerplate are
// document plumbing, never meaningful day-section lines.
const BOILERPLATE_LINE_PATTERNS = [
  /^=+\s*page\s+\d+\s*=*$/i,
  /^page\s+\d+(?:\s+of\s+\d+)?$/i,
  /^order\s+(?:summary|number|total)\b/i,
  /^(?:booking|reservation|ticket)\s+(?:reference|number|code)\s*:/i,
];

export function isBoilerplateSourceLine(line: string) {
  return BOILERPLATE_LINE_PATTERNS.some((pattern) => pattern.test(line.trim()));
}

// Run 7.23.0r (approved ground truth: the Costs section is EXCLUDED trip
// content — planning artifacts, never activities, notes, legs, or maker
// fields). These lines are structurally uncovered BY DESIGN, so source
// recovery kept re-ingesting them: per-night price lines minted two
// phantom overnight legs, a "$15-$20" ledger line became a never-taken
// train card, and cost text reached two maker questions. Shapes are
// matched on the LINE (and cost-heading section labels), never on prose
// venues: "45.75 euro due upon arrival" (stay cost, due on arrival) and
// "funicular (HUF 1,200 one way)" deliberately do not match.
const PLANNING_COST_LINE_PATTERNS = [
  // The Costs heading itself.
  /^costs?$/i,
  // Per-night cost ledger lines / section headings:
  // "January 15th Prague - $56 (airbnb)".
  /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-zà-ÿ .'-]+[-–]\s*\$\d/i,
  // Budget lines: "(Budget: $470)", "Budget notes: $1200 total".
  /\bbudget:?\s*\$?\d/i,
  // Ledger label lines: "Flight to Rome: $300 (in points)", "Travel: $470".
  /^[a-zà-ÿ' /&-]{2,40}:\s*\$\d[\d,.]*(?:\s*\(|\s*\+|\s*$)/i,
  // Amount-first continuation lines: "$110 flight upgrade".
  /^\+?\s*\$\d[\d,.]*\b/,
  // Price-range-only tails: "Train to/from Cesky Krumlov ($15-$20)".
  /\(\s*\$\d[\d,.]*\s*[-–]\s*\$\d[\d,.]*\s*\)\s*$/,
];

export function isPlanningCostSectionLabel(label: string | null | undefined) {
  if (!label) return false;
  const trimmed = label.trim();
  return (
    /^costs?$/i.test(trimmed) ||
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-zà-ÿ .'-]+[-–]\s*\$\d/i.test(
      trimmed
    )
  );
}

export function isExcludedPlanningCostLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return PLANNING_COST_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

const LINE_STOPWORDS = new Set([
  "about",
  "after",
  "afternoon",
  "again",
  "around",
  "back",
  "before",
  "day",
  "early",
  "evening",
  "free",
  "from",
  "get",
  "getting",
  "have",
  "here",
  "into",
  "late",
  "maybe",
  "morning",
  "need",
  "night",
  "over",
  "some",
  "somewhere",
  "take",
  "that",
  "them",
  "then",
  "there",
  "this",
  "time",
  "today",
  "wake",
  "walk",
  "want",
  "well",
  "will",
  "with",
  "your",
]);

// Phase 1 (audit B5): the fold/tokenizer comes from the shared text module.
function tokensOf(value: string) {
  return comparableTokens(value);
}

export function distinctiveLineTokens(line: string) {
  return tokensOf(line).filter(
    (token) =>
      token.length >= 4 &&
      !/^\d+$/.test(token) &&
      !LINE_STOPWORDS.has(token)
  );
}

// Per-clause coverage (version 3; live-run 7.18.3 PB-3, an Arc A
// calibration regression): whole-line majority matching let a multi-entity
// line count as covered when ANOTHER clause's tokens were covered
// elsewhere — "Get back by 5 to go to koscom and maybe communism museum"
// passed because communism+museum were covered by a (misplaced) Jan 14
// card, while koscom vanished UNFLAGGED for the first time in three runs;
// "Szechenyi Baths or Gellert…" was masked the same way. A source line is
// split on and/or/commas into clauses, EACH clause's distinctive tokens
// must be covered, and cross-stage credit never spans clauses. This is the
// recovery lane's trigger integrity (RW-EVD-001).
const CLAUSE_SPLIT_PATTERN = /[,;]|\s+(?:and|or|&)\s+|\/(?!\d)/i;

export function splitLineClauses(line: string) {
  return line
    .split(CLAUSE_SPLIT_PATTERN)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function stripLineDecorations(line: string) {
  return line
    .trim()
    .replace(/^[-*•●▪◦>·]+\s*/, "")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .trim();
}

function collectStrings(value: unknown, into: string[], depth = 0) {
  if (depth > 6) {
    return;
  }

  if (typeof value === "string") {
    if (value.trim()) {
      into.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, into, depth + 1);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, into, depth + 1);
    }
  }
}

export function stageOutputTokenSet(stage: unknown) {
  const strings: string[] = [];
  collectStrings(stage, strings);
  const tokens = new Set<string>();

  for (const value of strings) {
    for (const token of tokensOf(value)) {
      tokens.add(token);
    }
  }

  return tokens;
}

// ANCHOR tokens: output that becomes (or supports) real traveler records —
// activities that are not note/context candidates, plus stays, transport,
// and places. Credit that exists ONLY outside this set (note prose, context
// sightings) is weak: assembly may legally strip or fold it, and the
// content then ships nowhere (run7 PC-6, the koscom shape).
export function stageAnchorTokenSet(stage: unknown) {
  const record =
    stage && typeof stage === "object" && !Array.isArray(stage)
      ? (stage as Record<string, unknown>)
      : {};
  const strings: string[] = [];
  const activities = Array.isArray(record.activities) ? record.activities : [];
  for (const item of activities) {
    const activity =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const itemType =
      typeof activity.itemType === "string" ? activity.itemType : null;
    const role =
      typeof activity.evidenceRole === "string" ? activity.evidenceRole : null;
    if (itemType === "note") continue;
    if (
      role === "city_note_candidate" ||
      role === "context" ||
      role === "rejected"
    ) {
      continue;
    }
    collectStrings(activity, strings);
  }
  for (const key of ["stays", "transport", "places"]) {
    collectStrings(record[key], strings);
  }
  const tokens = new Set<string>();
  for (const value of strings) {
    for (const token of tokensOf(value)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function stageHasRecoveryPlaceholder(stage: unknown) {
  const record =
    stage && typeof stage === "object" && !Array.isArray(stage)
      ? (stage as Record<string, unknown>)
      : {};
  const activities = Array.isArray(record.activities) ? record.activities : [];

  return activities.some(
    (activity) =>
      activity &&
      typeof activity === "object" &&
      (activity as Record<string, unknown>)._recoveryRequired === true
  );
}

// The bounded recovery call's own synthesized stage (RW-EVD-001) is never a
// day-section stage — judging it would re-flag the very excerpts it exists
// to repair.
function stageIsSourceRecovery(stage: unknown) {
  const record =
    stage && typeof stage === "object" && !Array.isArray(stage)
      ? (stage as Record<string, unknown>)
      : {};

  return record._sourceRecovery === true;
}

function findDaySection(stageInput: EvidenceStageInput) {
  const rawLines = (stageInput.sourceText ?? "").split(/\r?\n/);
  const lines = rawLines.map(stripLineDecorations);
  const headingIndex = lines.findIndex(
    (line) => line.length > 0 && isDayHeadingLine(line)
  );

  if (headingIndex === -1) {
    return null;
  }

  // Only lines that clearly sit under a day heading count as day-section
  // lines. A chunk whose heading appears late (a notes blob quoting a date)
  // still only has its post-heading lines judged.
  return {
    heading: lines[headingIndex],
    headingIndex,
    lines,
  };
}

export function computeDaySectionSourceCoverage(
  stages: EvidenceStageInput[]
): SourceCoverageSummary {
  const reports: SourceCoverageStageReport[] = [];
  let crossStageCoveredLineCount = 0;
  let daySectionCount = 0;
  let meaningfulLineCount = 0;
  let uncoveredLineCount = 0;

  // Run5 calibration: a line is only a DROP when NO stage's output covers
  // it. Per-chunk matching stays preferred (it proves the producing chunk
  // extracted the line); the cross-stage union (spine included) absorbs
  // content legitimately owned by another stage.
  const allStageTokens = new Set<string>();
  const allAnchorTokens = new Set<string>();
  for (const stageInput of stages) {
    for (const token of stageOutputTokenSet(stageInput.stage)) {
      allStageTokens.add(token);
    }
    for (const token of stageAnchorTokenSet(stageInput.stage)) {
      allAnchorTokens.add(token);
    }
  }
  const weakCreditLines: SourceCoverageWeakCreditLine[] = [];

  for (const stageInput of stages) {
    if (stageInput.source !== "model_chunk" || !stageInput.sourceText?.trim()) {
      continue;
    }

    // Sections that already failed extraction carry a recovery placeholder
    // and one maker question — re-flagging every line would be noise. The
    // recovery call's own stage is likewise never judged.
    if (
      stageHasRecoveryPlaceholder(stageInput.stage) ||
      stageIsSourceRecovery(stageInput.stage)
    ) {
      continue;
    }

    const daySection = findDaySection(stageInput);

    if (!daySection) {
      continue;
    }

    daySectionCount += 1;
    const outputTokens = stageOutputTokenSet(stageInput.stage);
    const uncoveredLines: SourceCoverageUncoveredLine[] = [];
    let stageMeaningfulLineCount = 0;

    daySection.lines.forEach((line, lineIndex) => {
      if (lineIndex <= daySection.headingIndex) {
        return;
      }

      if (!line || line.length < 4 || isDayHeadingLine(line)) {
        return;
      }

      // OCR page markers and ticket boilerplate are plumbing, not itinerary
      // content (run5: "=== Page 2 ===", "Order summary:").
      if (isBoilerplateSourceLine(line)) {
        return;
      }

      const distinctive = distinctiveLineTokens(line);

      if (distinctive.length === 0) {
        return;
      }

      stageMeaningfulLineCount += 1;

      // Judge each clause independently; a clause with no distinctive
      // tokens ("get back by 5") never gates the line.
      const clauses = splitLineClauses(line)
        .map((clause) => ({
          clause,
          distinctive: distinctiveLineTokens(clause),
        }))
        .filter((entry) => entry.distinctive.length > 0);
      const judged = clauses.length > 0
        ? clauses
        : [{ clause: line, distinctive }];

      let usedCrossStageCredit = false;
      const uncoveredClauses: string[] = [];
      const weakCreditClauses: string[] = [];

      for (const entry of judged) {
        // In a MULTI-entity line, a short clause ("Szechenyi Baths",
        // "go to koscom") must be fully covered — with only 1-2
        // distinctive tokens, majority matching lets a shared generic
        // token ("baths") mask the named entity, the exact PB-3 shape.
        // Single-clause lines and longer clauses keep majority matching so
        // paraphrased extractions ("Flight JFK -> FCO overnight" without
        // "overnight") do not re-raise the run5 noise class.
        const required =
          judged.length >= 2 && entry.distinctive.length <= 2
            ? entry.distinctive.length
            : Math.ceil(entry.distinctive.length / 2);
        const anchorCovered = entry.distinctive.filter((token) =>
          allAnchorTokens.has(token)
        );
        const ownCovered = entry.distinctive.filter((token) =>
          outputTokens.has(token)
        );
        if (ownCovered.length >= required) {
          if (anchorCovered.length < required) {
            weakCreditClauses.push(entry.clause);
          }
          continue;
        }
        // Cross-stage credit is granted per clause, never pooled across
        // the line's clauses.
        const crossCovered = entry.distinctive.filter((token) =>
          allStageTokens.has(token)
        );
        if (crossCovered.length >= required) {
          usedCrossStageCredit = true;
          if (anchorCovered.length < required) {
            weakCreditClauses.push(entry.clause);
          }
          continue;
        }
        uncoveredClauses.push(entry.clause);
      }

      if (weakCreditClauses.length > 0 && weakCreditLines.length < 30) {
        weakCreditLines.push({
          clauses: weakCreditClauses,
          excerpt:
            line.length > EXCERPT_MAX_CHARS
              ? `${line.slice(0, EXCERPT_MAX_CHARS - 1)}…`
              : line,
          label: stageInput.label,
        });
      }

      if (uncoveredClauses.length === 0) {
        if (usedCrossStageCredit) {
          crossStageCoveredLineCount += 1;
        }
        return;
      }

      uncoveredLines.push({
        excerpt:
          line.length > EXCERPT_MAX_CHARS
            ? `${line.slice(0, EXCERPT_MAX_CHARS - 1)}…`
            : line,
        lineIndex,
        uncoveredClauses,
      });
    });

    meaningfulLineCount += stageMeaningfulLineCount;
    uncoveredLineCount += uncoveredLines.length;

    if (uncoveredLines.length > 0) {
      reports.push({
        dayHeading: daySection.heading,
        label: stageInput.label,
        meaningfulLineCount: stageMeaningfulLineCount,
        uncoveredLines,
      });
    }
  }

  return {
    crossStageCoveredLineCount,
    daySectionCount,
    meaningfulLineCount,
    stages: reports,
    uncoveredLineCount,
    weakCreditLines,
    version: 3,
  };
}
