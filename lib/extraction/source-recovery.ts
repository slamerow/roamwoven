import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { classifyRecoveredLineRole } from "@/lib/extraction/activity-classifier";
import { comparableTokens, normalizeTripDate } from "@/lib/extraction/traveler-text";
import {
  distinctiveLineTokens,
  isPlanningCostMaterial,
  stageOutputTokenSet,
  type SourceCoverageSummary,
} from "@/lib/extraction/source-coverage";
import { getOpenAIConfig } from "@/lib/env";

// RW-EVD-001 bounded recovery call (Arc A, 2026-07-18 CEO-approved).
//
// When the deterministic coverage diagnostic proves that meaningful
// day-section lines never became observations, Roamwoven may run AT MOST ONE
// excerpt-only, batched model recovery call for that build:
// - hard input and output caps (env-tunable, defaults in lib/env.ts);
// - its usage is recorded separately (usage.sourceRecovery);
// - it NEVER retries itself (one request, no incomplete-output retry);
// - recovered observations enter assembly as a normal late stage — a
//   synthesized EvidenceStageInput that flows through the same resolver,
//   clustering, and source-truth verification as every parser chunk;
// - on failure the usable draft survives and at most ONE precise maker
//   Question is created (the established targetField: "sourceRecovery"
//   confirm shape), never a technical recovery state (RW-QA-001/RW-OPS-001).
//
// The call can only be triggered by the coverage diagnostic — never by audit
// disagreement, grouping, classification, density, or presentation warnings.

export const SOURCE_RECOVERY_STAGE_LABEL = "source recovery";

export type SourceRecoveryOutcome =
  | "failed"
  | "no_uncovered_lines"
  | "recovered";

export type SourceRecoveryPlanSection = {
  dayHeading: string | null;
  excerpts: string[];
  label: string;
};

export type SourceRecoveryPlan = {
  batchedLineCount: number;
  // No silent caps (RW-OPS-001 telemetry honesty): lines beyond the batch
  // caps are counted, never silently dropped from the record.
  droppedLineCount: number;
  // Run 7.23.0r: Costs-section planning lines are EXCLUDED trip content
  // (approved ground truth) — recovery re-ingesting them minted two
  // phantom legs, a never-taken train card, and cost text inside maker
  // questions. Excluded lines are counted here, never silently skipped.
  excludedPlanningCostLineCount: number;
  input: string;
  sections: SourceRecoveryPlanSection[];
};

export type SourceRecoveryUsage = {
  batchedLineCount: number;
  droppedLineCount: number;
  excludedPlanningCostLineCount?: number;
  error: { message: string; name: string } | null;
  inputCharCount: number;
  model: string | null;
  outcome: SourceRecoveryOutcome;
  recoveredLineCount: number;
  residualUncoveredLineCount: number;
  tokenUsage: unknown;
  triggeredByUncoveredLineCount: number;
  version: 1;
};

export type SourceRecoveryRequest = {
  input: string;
  maxInputChars: number;
  maxOutputTokens: number;
  model: string;
};

export type SourceRecoveryResponse = {
  json: unknown;
  model: string;
  usage: unknown;
};

export const SOURCE_RECOVERY_SYSTEM_PROMPT = [
  "You recover itinerary lines that a previous structuring pass missed. You receive ONLY short excerpts of source lines, each under its original day heading.",
  "Extract each excerpt into the structured output: a concrete plan becomes an activity (an unknown proper noun like 'go to koscom' is still an activity when the source sequences or commits it), a hedged mention ('maybe X') becomes a city_note_candidate, venue options under a day title stay separate uncommitted entries, stays/transport/sensitive details go to their own arrays.",
  "Use the day heading for each excerpt's date. Do not invent details beyond the excerpt text; use null for anything the excerpt does not state.",
  "Never re-describe content you were not given, never merge excerpts, and never emit day-title or heading-fragment cards.",
].join("\n");

export function planSourceRecoveryBatch({
  coverage,
  maxInputChars,
  maxLines,
}: {
  coverage: SourceCoverageSummary;
  maxInputChars: number;
  maxLines: number;
}): SourceRecoveryPlan | null {
  if (coverage.uncoveredLineCount === 0 || coverage.stages.length === 0) {
    return null;
  }

  const sections: SourceRecoveryPlanSection[] = [];
  const parts: string[] = [];
  let batchedLineCount = 0;
  let droppedLineCount = 0;
  let excludedPlanningCostLineCount = 0;
  let charBudget = maxInputChars;

  for (const stageReport of coverage.stages) {
    // Run 7.23.0r: a whole section whose label is a cost heading
    // ("Costs", "January 15th Prague - $56 (airbnb)") is planning-artifact
    // material — excluded from trip content by the approved ground truth,
    // so recovery never re-ingests it. Arc F: judged by the SHARED
    // predicate (isPlanningCostMaterial) that canonical candidacy and the
    // audit detector also consume (chain 4 — one test, every path).
    const header = `Source section: ${stageReport.label}\nDay heading: ${
      stageReport.dayHeading ?? "(none)"
    }`;
    const sectionExcerpts: string[] = [];

    for (const line of stageReport.uncoveredLines) {
      if (
        isPlanningCostMaterial({
          label: stageReport.label,
          lines: [line.excerpt],
        })
      ) {
        excludedPlanningCostLineCount += 1;
        continue;
      }
      const lineText = `- ${line.excerpt}`;

      if (
        batchedLineCount >= maxLines ||
        charBudget - (header.length + lineText.length + 2) <= 0
      ) {
        droppedLineCount += 1;
        continue;
      }

      sectionExcerpts.push(line.excerpt);
      batchedLineCount += 1;
      charBudget -= lineText.length + 1;
    }

    if (sectionExcerpts.length === 0) {
      continue;
    }

    charBudget -= header.length + 2;
    sections.push({
      dayHeading: stageReport.dayHeading,
      excerpts: sectionExcerpts,
      label: stageReport.label,
    });
    parts.push(
      [header, ...sectionExcerpts.map((excerpt) => `- ${excerpt}`)].join("\n")
    );
  }

  if (sections.length === 0) {
    return null;
  }

  return {
    batchedLineCount,
    droppedLineCount,
    excludedPlanningCostLineCount,
    input: [
      "These source lines were not captured by the first structuring pass. Recover them.",
      ...parts,
    ].join("\n\n"),
    sections,
  };
}

// The recovery stage's sourceText carries the batched excerpts so the
// pipeline's source-truth verification judges recovered records against the
// exact text the model was shown — a recovered record with no excerpt
// support is suppressed like any other unsupported record.
function recoveryStageSourceText(plan: SourceRecoveryPlan) {
  return plan.sections
    .map((section) =>
      [
        `${section.label} — ${section.dayHeading ?? "(no day heading)"}`,
        ...section.excerpts,
      ].join("\n")
    )
    .join("\n\n");
}

export function buildSourceRecoveryStage(
  json: unknown,
  plan: SourceRecoveryPlan
): EvidenceStageInput {
  const record =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};

  // Recovery date bounds (Arc B, live-run 7.18.3 PB-9: the recovered
  // "Train to/from Cesky Krumlov" line shipped as a Jan 25 ROME-day
  // activity). Each recovered record is attributed to the plan section
  // whose excerpts share its distinctive tokens; its date is then BOUND to
  // that section's own day heading. A record no section supports keeps its
  // date only when SOME section heading carries that date; otherwise the
  // date clears and structural dating downstream re-derives placement.
  const sections = plan.sections.map((section) => {
    const excerptTokens = new Set(
      comparableTokens([section.label, ...section.excerpts].join(" "))
    );
    const headingCandidates = [section.dayHeading, section.label].filter(
      (value): value is string => Boolean(value)
    );
    return { excerptTokens, headingCandidates };
  });
  const yearHint = (() => {
    const raw = JSON.stringify(record);
    const match = /\b(20\d{2})-\d{2}-\d{2}\b/.exec(raw);
    return match ? Number(match[1]) : null;
  })();
  const headingDateFor = (candidates: string[]) => {
    for (const candidate of candidates) {
      const parsed = normalizeTripDate(candidate, yearHint);
      if (parsed) return parsed;
    }
    return null;
  };
  const allHeadingDates = new Set(
    sections
      .map((section) => headingDateFor(section.headingCandidates))
      .filter((value): value is string => Boolean(value))
  );
  const bindRecordDate = (card: Record<string, unknown>) => {
    const title = typeof card.title === "string" ? card.title : "";
    const description =
      typeof card.description === "string" ? card.description : "";
    const recordTokens = comparableTokens(`${title} ${description}`).filter(
      (token) => token.length >= 4
    );
    let best: { overlap: number; date: string | null } | null = null;
    for (const section of sections) {
      const overlap = recordTokens.filter((token) =>
        section.excerptTokens.has(token)
      ).length;
      if (overlap > 0 && (!best || overlap > best.overlap)) {
        best = { date: headingDateFor(section.headingCandidates), overlap };
      }
    }
    const currentDate = typeof card.date === "string" ? card.date : null;
    if (best?.date) {
      if (currentDate !== best.date) {
        return { ...card, date: best.date };
      }
      return card;
    }
    if (currentDate && allHeadingDates.size > 0 && !allHeadingDates.has(currentDate)) {
      // No excerpt attribution and the model-picked date matches no
      // excerpt's own day heading: clear it rather than trust it.
      return { ...card, date: null };
    }
    return card;
  };

  // Recovered-line classification (Arc B, live-run 7.18.3 PB-9/PB-4:
  // "Budapest food ideas" and "Eat some 'Za" shipped as loose-tip activity
  // cards). A recovered line is judged by the unified classifier exactly
  // like parser output: loose-tip vocabulary or a hedge with no standalone
  // anchor makes it a city-note candidate before it ever enters assembly.
  const activities = Array.isArray(record.activities)
    ? record.activities.map((activity) => {
        if (!activity || typeof activity !== "object" || Array.isArray(activity)) {
          return activity;
        }
        const boundCard = bindRecordDate(activity as Record<string, unknown>);
        const card = boundCard;
        if (typeof card.evidenceRole === "string" && card.evidenceRole) {
          return card;
        }
        const text = (value: unknown) =>
          typeof value === "string" ? value : null;
        const role = classifyRecoveredLineRole({
          category: text(card.category),
          confirmation: text(card.confirmation),
          date: text(card.date),
          description: text(card.description),
          endTime: text(card.endTime),
          itemType: text(card.itemType),
          startTime: text(card.startTime),
          title: text(card.title),
        });
        return role ? { ...card, evidenceRole: role } : card;
      })
    : [];

  return {
    label: SOURCE_RECOVERY_STAGE_LABEL,
    source: "model_chunk",
    sourceFilename: null,
    sourceProvenance: null,
    sourceText: recoveryStageSourceText(plan),
    sourceUploadId: null,
    stage: {
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      ...record,
      activities,
      _sourceRecovery: true,
    },
  };
}

// On failure the draft survives; ONE precise maker Question is allowed
// (RW-EVD-001), reusing the established sourceRecovery confirm shape from
// the failed-chunk lane.
export function buildSourceRecoveryFailureStage(
  coverage: SourceCoverageSummary
): EvidenceStageInput {
  const exampleExcerpts = coverage.stages
    .flatMap((stageReport) =>
      stageReport.uncoveredLines.map((line) => line.excerpt)
    )
    .slice(0, 3);
  const dayLabels = Array.from(
    new Set(
      coverage.stages.map(
        (stageReport) => stageReport.dayHeading ?? stageReport.label
      )
    )
  ).slice(0, 5);

  return {
    label: `${SOURCE_RECOVERY_STAGE_LABEL} (failed)`,
    source: "model_chunk",
    sourceFilename: null,
    sourceProvenance: null,
    sourceText: null,
    sourceUploadId: null,
    stage: {
      _sourceRecovery: true,
      activities: [],
      missingDetails: [
        {
          answerType: "confirm",
          confidence: "low",
          evidence: exampleExcerpts.join(" · ") || null,
          guessedValue: null,
          prompt: `Roamwoven couldn't confidently read ${coverage.uncoveredLineCount} line${
            coverage.uncoveredLineCount === 1 ? "" : "s"
          } from your documents (for example: ${
            exampleExcerpts[0] ?? "an itinerary line"
          }). Check ${dayLabels.join(", ")} and add anything missing.`,
          reason:
            "The bounded source-recovery call could not repair these lines, so Roamwoven kept the usable draft and is asking one precise question instead of dropping content silently (RW-EVD-001).",
          relatedTitle: null,
          subjectType: "trip",
          targetField: "sourceRecovery",
        },
      ],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

// After the recovery call, the pre-recovery coverage is reconciled against
// the recovery output: a previously-uncovered line whose distinctive tokens
// the recovery output covers is RECOVERED; the rest stay flagged (the quiet
// P2 advisory keeps firing on the residual — "precisely flagged", never
// silent).
export function applySourceRecoveryToCoverage(
  coverage: SourceCoverageSummary,
  recoveryStage: EvidenceStageInput
): { coverage: SourceCoverageSummary; recoveredLineCount: number } {
  const recoveryTokens = stageOutputTokenSet(recoveryStage.stage);
  let recoveredLineCount = 0;
  const stages = coverage.stages
    .map((stageReport) => {
      const residual = stageReport.uncoveredLines.filter((line) => {
        const distinctive = distinctiveLineTokens(line.excerpt);

        if (distinctive.length === 0) {
          return true;
        }

        const covered = distinctive.filter((token) =>
          recoveryTokens.has(token)
        );

        if (covered.length >= Math.ceil(distinctive.length / 2)) {
          recoveredLineCount += 1;
          return false;
        }

        return true;
      });

      return { ...stageReport, uncoveredLines: residual };
    })
    .filter((stageReport) => stageReport.uncoveredLines.length > 0);

  return {
    coverage: {
      ...coverage,
      stages,
      uncoveredLineCount: Math.max(
        0,
        coverage.uncoveredLineCount - recoveredLineCount
      ),
    },
    recoveredLineCount,
  };
}

export async function runBoundedSourceRecovery({
  caps,
  coverage,
  requestRecovery,
  stages,
}: {
  caps?: {
    maxInputChars: number;
    maxLines: number;
    maxOutputTokens: number;
    model: string;
  };
  coverage: SourceCoverageSummary;
  requestRecovery: (
    request: SourceRecoveryRequest
  ) => Promise<SourceRecoveryResponse>;
  stages: EvidenceStageInput[];
}): Promise<{
  coverage: SourceCoverageSummary;
  stage: EvidenceStageInput | null;
  usage: SourceRecoveryUsage;
}> {
  const baseUsage = {
    batchedLineCount: 0,
    droppedLineCount: 0,
    error: null,
    inputCharCount: 0,
    model: null,
    recoveredLineCount: 0,
    residualUncoveredLineCount: coverage.uncoveredLineCount,
    tokenUsage: null,
    triggeredByUncoveredLineCount: coverage.uncoveredLineCount,
    version: 1 as const,
  };

  // One per build: a stage from a prior recovery attempt (resumed builds)
  // means this build has already spent its one call.
  const alreadyRan = stages.some((stageInput) => {
    const record =
      stageInput.stage &&
      typeof stageInput.stage === "object" &&
      !Array.isArray(stageInput.stage)
        ? (stageInput.stage as Record<string, unknown>)
        : {};

    return record._sourceRecovery === true;
  });

  const config = getOpenAIConfig();
  const effectiveCaps = caps ?? {
    maxInputChars: config.recoveryMaxInputChars,
    maxLines: config.recoveryMaxLines,
    maxOutputTokens: config.recoveryMaxOutputTokens,
    model: config.recoveryModel,
  };
  const plan = alreadyRan
    ? null
    : planSourceRecoveryBatch({
        coverage,
        maxInputChars: effectiveCaps.maxInputChars,
        maxLines: effectiveCaps.maxLines,
      });

  if (!plan) {
    return {
      coverage,
      stage: null,
      usage: { ...baseUsage, outcome: "no_uncovered_lines" },
    };
  }

  try {
    const response = await requestRecovery({
      input: plan.input,
      maxInputChars: effectiveCaps.maxInputChars,
      maxOutputTokens: effectiveCaps.maxOutputTokens,
      model: effectiveCaps.model,
    });
    const stage = buildSourceRecoveryStage(response.json, plan);
    const reconciled = applySourceRecoveryToCoverage(coverage, stage);

    return {
      coverage: reconciled.coverage,
      stage,
      usage: {
        ...baseUsage,
        batchedLineCount: plan.batchedLineCount,
        droppedLineCount: plan.droppedLineCount,
        excludedPlanningCostLineCount: plan.excludedPlanningCostLineCount,
        inputCharCount: plan.input.length,
        model: response.model,
        outcome: "recovered",
        recoveredLineCount: reconciled.recoveredLineCount,
        residualUncoveredLineCount: reconciled.coverage.uncoveredLineCount,
        tokenUsage: response.usage ?? null,
      },
    };
  } catch (error) {
    // Fail-soft (RW-QA-001): the usable draft survives; the failure ships
    // one precise maker Question and separate telemetry, nothing else.
    return {
      coverage,
      stage: buildSourceRecoveryFailureStage(coverage),
      usage: {
        ...baseUsage,
        batchedLineCount: plan.batchedLineCount,
        droppedLineCount: plan.droppedLineCount,
        excludedPlanningCostLineCount: plan.excludedPlanningCostLineCount,
        error: {
          message: error instanceof Error ? error.message : "Unknown error.",
          name: error instanceof Error ? error.name : "UnknownError",
        },
        inputCharCount: plan.input.length,
        model: effectiveCaps.model,
        outcome: "failed",
      },
    };
  }
}
