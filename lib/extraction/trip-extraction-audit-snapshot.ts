import type {
  DraftAuditSnapshot,
  DraftRecordSummary,
  DraftStaySummary,
  DraftTransportSummary,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  asArray,
  asRecord,
  findOpenAIUsage,
  getString,
  getStringFromKeys,
  titleFrom,
  truncate,
} from "@/lib/extraction/trip-extraction-audit-utils";

function summarizeActivity(value: unknown, index: number): DraftRecordSummary {
  const record = asRecord(value);

  const numberField = (key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return {
    address: getString(record, "address"),
    approxLatitude: numberField("approxLatitude"),
    approxLongitude: numberField("approxLongitude"),
    area: getString(record, "area"),
    category: getString(record, "category"),
    date: getString(record, "date"),
    description: truncate(getString(record, "description")),
    endTime: getString(record, "endTime"),
    evidence: truncate(getString(record, "evidence")),
    itemType: getString(record, "itemType"),
    locationName: getString(record, "locationName"),
    sourceFilename: getString(record, "sourceFilename"),
    sourceHeadingPath: Array.isArray(record.sourceHeadingPath)
      ? record.sourceHeadingPath.filter(
          (value): value is string => typeof value === "string"
        )
      : null,
    sourceSectionLabel: getString(record, "sourceSectionLabel"),
    startTime: getStringFromKeys(record, ["startTime", "time", "departureTime"]),
    title: titleFrom(record, ["title"], `Activity ${index + 1}`),
  };
}

function summarizeTransport(value: unknown, index: number): DraftTransportSummary {
  const record = asRecord(value);

  return {
    arrival: getString(record, "arrival"),
    arrivalTime: getString(record, "arrivalTime"),
    confirmation: getStringFromKeys(record, [
      "confirmation",
      "bookingNumber",
      "reservation",
      "ticketNumber",
    ]),
    date: getString(record, "date"),
    departureTime: getString(record, "departureTime"),
    description: truncate(getString(record, "description")),
    departure: getString(record, "departure"),
    provider: getStringFromKeys(record, ["provider", "operator"]),
    title: titleFrom(record, ["title", "routeLabel"], `Transport ${index + 1}`),
    type: getString(record, "type"),
  };
}

function summarizeStay(value: unknown, index: number): DraftStaySummary {
  const record = asRecord(value);

  return {
    address: getString(record, "address"),
    checkIn: getString(record, "checkIn"),
    checkInTime: getString(record, "checkInTime"),
    checkOut: getString(record, "checkOut"),
    checkOutTime: getString(record, "checkOutTime"),
    name: titleFrom(record, ["name", "title"], `Stay ${index + 1}`),
  };
}

function summarizeMissingDetail(value: unknown, index: number) {
  const record = asRecord(value);

  return {
    prompt: titleFrom(record, ["prompt"], `Missing detail ${index + 1}`),
    relatedTitle: getString(record, "relatedTitle"),
    subjectType: getString(record, "subjectType"),
    targetField: getString(record, "targetField"),
  };
}

export function createDraftAuditSnapshot(draft: unknown): DraftAuditSnapshot {
  const record = asRecord(draft);
  const activities = asArray(record.activities);
  const missingDetails = asArray(record.missingDetails);
  const places = asArray(record.places);
  const sensitiveDetails = asArray(record.sensitiveDetails);
  const stays = asArray(record.stays);
  const transport = asArray(record.transport);

  return {
    activities: activities.map(summarizeActivity),
    counts: {
      activities: activities.length,
      missingDetails: missingDetails.length,
      places: places.length,
      sensitiveDetails: sensitiveDetails.length,
      stays: stays.length,
      transport: transport.length,
    },
    missingDetails: missingDetails.map(summarizeMissingDetail),
    stays: stays.map(summarizeStay),
    transport: transport.map(summarizeTransport),
  };
}

export function createCanonicalizationSummary(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const evidence = asRecord(openai.evidence);
  const identityRecovery = asRecord(openai.identityRecovery);
  const identityRecoveryStatus =
    identityRecovery.status === "repaired"
      ? ("repaired" as const)
      : ("not_needed" as const);
  const observationCount = Number(evidence.observationCount) || 0;
  const dispositionCount = Number(evidence.dispositionCount) || 0;

  return {
    canonicalPieceCount: Number(evidence.canonicalPieceCount) || 0,
    clusteredObservationCount: Number(evidence.clusteredObservationCount) || 0,
    contextObservationCount: Number(evidence.contextObservationCount) || 0,
    dispositionCount,
    identityRepairCount: Array.isArray(identityRecovery.actions)
      ? identityRecovery.actions.length
      : 0,
    identityRecoveryStatus,
    observationCount,
    parserArtifactRepairCount: Number(evidence.parserArtifactRepairCount) || 0,
    rejectedObservationCount: Number(evidence.rejectedObservationCount) || 0,
    sourceAnchorObservationCount:
      Number(evidence.sourceAnchorObservationCount) || 0,
    suppressedStandaloneAnchorCount:
      Number(evidence.suppressedWeakAnchorCount) || 0,
    undisposedObservationCount: Math.max(0, observationCount - dispositionCount),
  };
}

export function createExtractionSummary(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const activityChunks = asRecord(openai.activityChunks);
  const sourceCoverage = asRecord(openai.sourceCoverage);

  return {
    activityChunks:
      Object.keys(activityChunks).length > 0
        ? {
            count: Number(activityChunks.count) || 0,
            failed: Number(activityChunks.failed) || 0,
            rescued: Number(activityChunks.rescued) || 0,
            succeeded: Number(activityChunks.succeeded) || 0,
          }
        : null,
    // Deterministic day-section coverage (wave 2 + Arc A calibration,
    // RW-EVD-001). The FULL residual uncovered list ships in the audit so
    // drops are verifiable from the QA bundle (run5 calibration item —
    // previously only counts plus 10 capped evidence lines were visible).
    sourceCoverage:
      Object.keys(sourceCoverage).length > 0
        ? {
            crossStageCoveredLineCount:
              Number(sourceCoverage.crossStageCoveredLineCount) || 0,
            daySectionCount: Number(sourceCoverage.daySectionCount) || 0,
            meaningfulLineCount:
              Number(sourceCoverage.meaningfulLineCount) || 0,
            uncoveredLineCount:
              Number(sourceCoverage.uncoveredLineCount) || 0,
            uncoveredLines: Array.isArray(sourceCoverage.stages)
              ? sourceCoverage.stages.flatMap((stage) => {
                  const record = asRecord(stage);
                  const lines = Array.isArray(record.uncoveredLines)
                    ? record.uncoveredLines
                    : [];

                  return lines.flatMap((line) => {
                    const lineRecord = asRecord(line);

                    return typeof lineRecord.excerpt === "string"
                      ? [
                          {
                            excerpt: lineRecord.excerpt,
                            label:
                              typeof record.label === "string"
                                ? record.label
                                : "",
                          },
                        ]
                      : [];
                  });
                })
              : [],
          }
        : null,
    // RW-EVD-001 bounded recovery call telemetry (separate usage lane).
    sourceRecovery: (() => {
      const sourceRecovery = asRecord(openai.sourceRecovery);

      return Object.keys(sourceRecovery).length > 0
        ? {
            batchedLineCount: Number(sourceRecovery.batchedLineCount) || 0,
            droppedLineCount: Number(sourceRecovery.droppedLineCount) || 0,
            model:
              typeof sourceRecovery.model === "string"
                ? sourceRecovery.model
                : null,
            outcome:
              typeof sourceRecovery.outcome === "string"
                ? sourceRecovery.outcome
                : "unknown",
            recoveredLineCount:
              Number(sourceRecovery.recoveredLineCount) || 0,
            residualUncoveredLineCount:
              Number(sourceRecovery.residualUncoveredLineCount) || 0,
          }
        : null;
    })(),
    // Geocoding verification lane telemetry (Arc B): env-keyed, budgeted,
    // fail-soft, proximity-only. Verifiable from the QA bundle.
    geocodeVerification: (() => {
      const geocode = asRecord(openai.geocodeVerification);

      return Object.keys(geocode).length > 0
        ? {
            budget: Number(geocode.budget) || 0,
            candidateCount: Number(geocode.candidateCount) || 0,
            failedCount: Number(geocode.failedCount) || 0,
            lookupCount: Number(geocode.lookupCount) || 0,
            outcome:
              typeof geocode.outcome === "string"
                ? geocode.outcome
                : "unknown",
            resolvedCount: Number(geocode.resolvedCount) || 0,
            skippedOverBudgetCount:
              Number(geocode.skippedOverBudgetCount) || 0,
          }
        : null;
    })(),
    staged: openai.staged === true,
  };
}

export function getAuditSnapshotFromUsage(usage: unknown, key: string) {
  const openai = findOpenAIUsage(usage);
  const audit = asRecord(openai.audit);
  const snapshot = audit[key];

  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as DraftAuditSnapshot)
    : null;
}
