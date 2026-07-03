import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";

type DraftObject = Record<string, unknown>;

type DraftRecordSummary = {
  category: string | null;
  date: string | null;
  itemType: string | null;
  sourceFilename: string | null;
  title: string;
};

type DraftTransportSummary = {
  date: string | null;
  departure: string | null;
  arrival: string | null;
  title: string;
  type: string | null;
};

type DraftStaySummary = {
  checkIn: string | null;
  checkOut: string | null;
  name: string;
};

export type DraftAuditSnapshot = {
  activities: DraftRecordSummary[];
  counts: {
    activities: number;
    missingDetails: number;
    places: number;
    sensitiveDetails: number;
    stays: number;
    transport: number;
  };
  missingDetails: Array<{
    prompt: string;
    relatedTitle: string | null;
    subjectType: string | null;
    targetField: string | null;
  }>;
  stays: DraftStaySummary[];
  transport: DraftTransportSummary[];
};

export type TripExtractionAuditReport = {
  assembly: {
    foldedLodgingNotes: number;
    mergedCityNotes: number;
    removedDuplicateParents: number;
    removedGroupedChildren: number;
    suppressedDayOverviews: number;
    suppressedTransportActivities: number;
    wrongCityPlacements: number;
  };
  draft: DraftAuditSnapshot;
  extraction: {
    activityChunks: {
      count: number;
      failed: number;
      rescued: number;
      succeeded: number;
    } | null;
    staged: boolean;
  };
  sourceComparison: {
    assembledOnlyTitles: string[];
    rawOnlyTitles: string[];
    sharedTitles: string[];
  } | null;
  structured: {
    activeActivities: number;
    activeNotes: number;
    hardWarnings: number;
    openQuestions: number;
    quietWarnings: number;
    stays: number;
    transport: number;
  };
  warnings: Array<{
    severity: "hard" | "quiet";
    subjectId: string;
    subjectType: string;
    title: string;
  }>;
};

function asRecord(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(record: DraftObject, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function titleFrom(record: DraftObject, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = getString(record, key);

    if (value) {
      return value;
    }
  }

  return fallback;
}

function summarizeActivity(value: unknown, index: number): DraftRecordSummary {
  const record = asRecord(value);

  return {
    category: getString(record, "category"),
    date: getString(record, "date"),
    itemType: getString(record, "itemType"),
    sourceFilename: getString(record, "sourceFilename"),
    title: titleFrom(record, ["title"], `Activity ${index + 1}`),
  };
}

function summarizeTransport(value: unknown, index: number): DraftTransportSummary {
  const record = asRecord(value);

  return {
    arrival: getString(record, "arrival"),
    date: getString(record, "date"),
    departure: getString(record, "departure"),
    title: titleFrom(record, ["title", "routeLabel"], `Transport ${index + 1}`),
    type: getString(record, "type"),
  };
}

function summarizeStay(value: unknown, index: number): DraftStaySummary {
  const record = asRecord(value);

  return {
    checkIn: getString(record, "checkIn"),
    checkOut: getString(record, "checkOut"),
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

function findOpenAIUsage(usage: unknown) {
  const record = asRecord(usage);

  return asRecord(record.openai ?? usage);
}

function getArrayCount(record: DraftObject, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value.length : 0;
}

function createAssemblySummary(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const consolidation = asRecord(openai.consolidation);

  return {
    foldedLodgingNotes: getArrayCount(consolidation, "foldedLodgingNotes"),
    mergedCityNotes: getArrayCount(consolidation, "mergedCityNotes"),
    removedDuplicateParents: getArrayCount(consolidation, "removedDuplicateParents"),
    removedGroupedChildren: getArrayCount(consolidation, "removedGroupedChildren"),
    suppressedDayOverviews: getArrayCount(consolidation, "suppressedDayOverviews"),
    suppressedTransportActivities: getArrayCount(
      consolidation,
      "suppressedTransportActivities"
    ),
    wrongCityPlacements: getArrayCount(consolidation, "wrongCityPlacements"),
  };
}

function createExtractionSummary(usage: unknown) {
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

function getAuditSnapshotFromUsage(usage: unknown, key: string) {
  const openai = findOpenAIUsage(usage);
  const audit = asRecord(openai.audit);
  const snapshot = audit[key];

  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as DraftAuditSnapshot)
    : null;
}

function compareRawAndAssembledTitles(usage: unknown) {
  const raw = getAuditSnapshotFromUsage(usage, "preAssemblyDraft");
  const assembled = getAuditSnapshotFromUsage(usage, "assembledDraft");

  if (!raw || !assembled) {
    return null;
  }

  const rawTitles = new Set(raw.activities.map((item) => item.title));
  const assembledTitles = new Set(assembled.activities.map((item) => item.title));

  return {
    assembledOnlyTitles: [...assembledTitles].filter((title) => !rawTitles.has(title)),
    rawOnlyTitles: [...rawTitles].filter((title) => !assembledTitles.has(title)),
    sharedTitles: [...assembledTitles].filter((title) => rawTitles.has(title)),
  };
}

export function createTripExtractionAuditReport({
  draft,
  records,
  usage,
}: {
  draft: unknown;
  records: StructuredTripRecords;
  usage?: unknown;
}): TripExtractionAuditReport {
  const summary = createGeneratedTripSummaryView(records);
  const activeItems = records.items.filter((item) => item.status !== "ignored");
  const warnings = summary.warnings.map((warning) => ({
    severity: warning.severity,
    subjectId: warning.subjectId,
    subjectType: warning.subjectType,
    title: warning.title,
  }));

  return {
    assembly: createAssemblySummary(usage),
    draft: createDraftAuditSnapshot(draft),
    extraction: createExtractionSummary(usage),
    sourceComparison: usage ? compareRawAndAssembledTitles(usage) : null,
    structured: {
      activeActivities: activeItems.filter((item) => item.itemType === "activity")
        .length,
      activeNotes: activeItems.filter((item) => item.itemType === "note").length,
      hardWarnings: warnings.filter((warning) => warning.severity === "hard")
        .length,
      openQuestions: records.reviewQuestions.filter(
        (question) => question.status === "open"
      ).length,
      quietWarnings: warnings.filter((warning) => warning.severity === "quiet")
        .length,
      stays: records.stays.filter((stay) => stay.status !== "ignored").length,
      transport: records.transport.filter((item) => item.status !== "ignored")
        .length,
    },
    warnings,
  };
}
