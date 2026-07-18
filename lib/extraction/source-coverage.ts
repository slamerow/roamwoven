import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { isDayHeadingLine } from "@/lib/extraction/parser-artifact-normalization";

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
};

export type SourceCoverageStageReport = {
  dayHeading: string | null;
  label: string;
  meaningfulLineCount: number;
  uncoveredLines: SourceCoverageUncoveredLine[];
};

export type SourceCoverageSummary = {
  daySectionCount: number;
  meaningfulLineCount: number;
  stages: SourceCoverageStageReport[];
  uncoveredLineCount: number;
  version: 1;
};

const EXCERPT_MAX_CHARS = 120;

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

function foldText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokensOf(value: string) {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function distinctiveLineTokens(line: string) {
  return tokensOf(line).filter(
    (token) =>
      token.length >= 4 &&
      !/^\d+$/.test(token) &&
      !LINE_STOPWORDS.has(token)
  );
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

function stageOutputTokenSet(stage: unknown) {
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
  let daySectionCount = 0;
  let meaningfulLineCount = 0;
  let uncoveredLineCount = 0;

  for (const stageInput of stages) {
    if (stageInput.source !== "model_chunk" || !stageInput.sourceText?.trim()) {
      continue;
    }

    // Sections that already failed extraction carry a recovery placeholder
    // and one maker question — re-flagging every line would be noise.
    if (stageHasRecoveryPlaceholder(stageInput.stage)) {
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

      const distinctive = distinctiveLineTokens(line);

      if (distinctive.length === 0) {
        return;
      }

      stageMeaningfulLineCount += 1;
      const covered = distinctive.filter((token) => outputTokens.has(token));
      const requiredCoverage = Math.ceil(distinctive.length / 2);

      if (covered.length >= requiredCoverage) {
        return;
      }

      uncoveredLines.push({
        excerpt:
          line.length > EXCERPT_MAX_CHARS
            ? `${line.slice(0, EXCERPT_MAX_CHARS - 1)}…`
            : line,
        lineIndex,
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
    daySectionCount,
    meaningfulLineCount,
    stages: reports,
    uncoveredLineCount,
    version: 1,
  };
}
