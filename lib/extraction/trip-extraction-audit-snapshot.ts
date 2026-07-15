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

  return {
    address: getString(record, "address"),
    category: getString(record, "category"),
    date: getString(record, "date"),
    description: truncate(getString(record, "description")),
    endTime: getString(record, "endTime"),
    evidence: truncate(getString(record, "evidence")),
    itemType: getString(record, "itemType"),
    locationName: getString(record, "locationName"),
    sourceFilename: getString(record, "sourceFilename"),
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
