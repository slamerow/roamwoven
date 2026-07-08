import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import {
  getMaterialOcrReadinessIssue,
  listMaterialExtractionCheckpoints,
  type MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";
import {
  getTripExtractionAuditPayload,
  type TripExtractionAuditPayload,
} from "@/lib/extraction/trip-extraction-audit-view";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { listTripUploads, type TripUpload } from "@/lib/uploads";

const DEFAULT_TEXT_LIMIT = 700;
const PRIVATE_TEXT_LIMIT = 2000;
const MAX_LINEAGE_ROWS = 150;

export type TripExtractionQaBundleOptions = {
  includePrivate?: boolean;
};

export type TripExtractionQaBundle = ReturnType<
  typeof createTripExtractionQaBundlePayload
>;

function countBy<T extends string>(values: T[]) {
  return values.reduce(
    (counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>
  );
}

function truncateText(value: string | null | undefined, limit: number) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trim()}...`;
}

function redactSensitiveText(
  value: string | null | undefined,
  includePrivate: boolean
) {
  const limit = includePrivate ? PRIVATE_TEXT_LIMIT : DEFAULT_TEXT_LIMIT;
  const truncated = truncateText(value, limit);

  if (!truncated || includePrivate) {
    return truncated;
  }

  return truncated
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[redacted email]"
    )
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted phone]")
    .replace(
      /\b(password|passcode|access code|door code|lockbox|wifi|wi-fi|confirmation|booking reference|reservation code|pnr)\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{2,}\b/gi,
      "$1 [redacted]"
    );
}

function redactPrivateValue(
  value: string | null | undefined,
  includePrivate: boolean,
  label = "private detail"
) {
  if (!value) {
    return null;
  }

  return includePrivate ? truncateText(value, PRIVATE_TEXT_LIMIT) : `[redacted ${label}]`;
}

function redactVisibilityValue({
  includePrivate,
  label,
  value,
  visibility,
}: {
  includePrivate: boolean;
  label: string;
  value: string | null;
  visibility: string;
}) {
  if (!value) {
    return null;
  }

  if (includePrivate || visibility === "public") {
    return redactSensitiveText(value, includePrivate);
  }

  return `[redacted ${label}]`;
}

function compactMetadata(
  metadata: Record<string, unknown>,
  includePrivate: boolean
) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/(raw|text|content|secret|token|password|key)$/i.test(key))
      .map(([key, value]) => [
        key,
        typeof value === "string"
          ? redactSensitiveText(value, includePrivate)
          : value,
      ])
  );
}

function summarizeUploads(uploads: TripUpload[]) {
  return uploads.map((upload) => ({
    createdAt: upload.createdAt,
    fileSizeBytes: upload.fileSizeBytes,
    fileType: upload.fileType,
    hasNote: Boolean(upload.userNote?.trim()),
    hasStoredFile: Boolean(upload.storagePath),
    id: upload.id,
    originalFilename: upload.originalFilename,
    processingStatus: upload.processingStatus,
    sourceKind: upload.sourceKind,
  }));
}

function summarizeMaterialCheckpoints({
  checkpoints,
  includePrivate,
  uploads,
}: {
  checkpoints: MaterialExtractionRecord[];
  includePrivate: boolean;
  uploads: TripUpload[];
}) {
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
  const byStatus = countBy(checkpoints.map((record) => record.status));
  const byMethod = countBy(
    checkpoints.map((record) => record.extractionMethod ?? "unknown")
  );

  return {
    byMethod,
    byStatus,
    checkpoints: checkpoints.map((record) => {
      const upload = uploadById.get(record.uploadId);

      return {
        completedAt: record.completedAt,
        createdAt: record.createdAt,
        errorMessage: redactSensitiveText(record.errorMessage, includePrivate),
        extractedCharCount: record.extractedCharCount,
        extractionMethod: record.extractionMethod,
        failureClass: record.failureClass,
        filename: upload?.originalFilename ?? null,
        id: record.id,
        metadata: compactMetadata(record.metadata, includePrivate),
        status: record.status,
        textPreview: includePrivate
          ? truncateText(record.textContent, PRIVATE_TEXT_LIMIT)
          : null,
        textPreviewRedacted: !includePrivate && Boolean(record.textContent),
        updatedAt: record.updatedAt,
        uploadId: record.uploadId,
      };
    }),
    ocrReadinessIssue: getMaterialOcrReadinessIssue(checkpoints),
    totalExtractedChars: checkpoints.reduce(
      (sum, record) => sum + record.extractedCharCount,
      0
    ),
  };
}

function isActiveStatus(record: { status: string }) {
  return record.status !== "ignored";
}

function createRecordSummaries({
  includePrivate,
  records,
}: {
  includePrivate: boolean;
  records: StructuredTripRecords | null;
}) {
  if (!records) {
    return null;
  }

  const activeItems = records.items.filter(isActiveStatus);
  const activeTransport = records.transport.filter(isActiveStatus);
  const activeStays = records.stays.filter(isActiveStatus);
  const openQuestions = records.reviewQuestions.filter(
    (question) => question.status === "open"
  );
  const calls = records.reviewQuestions.filter(
    (question) => question.status === "noted"
  );

  return {
    counts: {
      activeActivities: activeItems.filter((item) => item.itemType !== "note")
        .length,
      activeNotes: activeItems.filter((item) => item.itemType === "note").length,
      calls: calls.length,
      dismissedQuestions: records.reviewQuestions.filter(
        (question) => question.status === "dismissed"
      ).length,
      legs: records.legs.filter(isActiveStatus).length,
      openQuestions: openQuestions.length,
      privateDetails: records.privateDetails.length,
      reviewRequiredRecords: [
        ...records.legs,
        ...records.stays,
        ...records.transport,
        ...records.items,
      ].filter((record) => record.reviewRequired && isActiveStatus(record))
        .length,
      stays: activeStays.length,
      transport: activeTransport.length,
    },
    items: activeItems.map((item) => ({
      address: redactSensitiveText(item.address, includePrivate),
      categoryId: item.categoryId,
      date: item.date,
      description: redactSensitiveText(item.description, includePrivate),
      endTime: item.endTime,
      id: item.id,
      itemType: item.itemType,
      legId: item.legId,
      locationName: item.locationName,
      parentItemId: item.parentItemId,
      reviewRequired: item.reviewRequired,
      startTime: item.startTime,
      status: item.status,
      title: item.title,
    })),
    legs: records.legs.filter(isActiveStatus).map((leg) => ({
      arriveDate: leg.arriveDate,
      city: leg.city,
      country: leg.country,
      displayName: leg.displayName,
      id: leg.id,
      leaveDate: leg.leaveDate,
      reviewRequired: leg.reviewRequired,
      status: leg.status,
    })),
    privateDetails: records.privateDetails.map((detail) => ({
      detailType: detail.detailType,
      id: detail.id,
      label: detail.label,
      reason: redactSensitiveText(detail.reason, includePrivate),
      reviewRequired: detail.reviewRequired,
      subjectId: detail.subjectId,
      subjectType: detail.subjectType,
      value: redactPrivateValue(detail.value, includePrivate),
      visibility: detail.visibility,
    })),
    review: {
      calls: calls.map((question) => summarizeReviewQuestion(question, includePrivate)),
      openQuestions: openQuestions.map((question) =>
        summarizeReviewQuestion(question, includePrivate)
      ),
    },
    stays: activeStays.map((stay) => ({
      address: redactVisibilityValue({
        includePrivate,
        label: "stay address",
        value: stay.address,
        visibility: stay.addressVisibility,
      }),
      addressVisibility: stay.addressVisibility,
      checkInDate: stay.checkInDate,
      checkInTime: stay.checkInTime,
      checkOutDate: stay.checkOutDate,
      checkOutTime: stay.checkOutTime,
      confirmationLabel: redactVisibilityValue({
        includePrivate,
        label: "confirmation",
        value: stay.confirmationLabel,
        visibility: stay.confirmationVisibility,
      }),
      id: stay.id,
      legId: stay.legId,
      name: stay.name,
      publicLocationLabel: stay.publicLocationLabel,
      reviewRequired: stay.reviewRequired,
      status: stay.status,
    })),
    transport: activeTransport.map((transport) => ({
      arrivalLocation: transport.arrivalLocation,
      arrivalTime: transport.arrivalTime,
      confirmationLabel: redactVisibilityValue({
        includePrivate,
        label: "confirmation",
        value: transport.confirmationLabel,
        visibility: transport.confirmationVisibility,
      }),
      date: transport.date,
      departureLocation: transport.departureLocation,
      departureTime: transport.departureTime,
      description: redactSensitiveText(transport.description, includePrivate),
      id: transport.id,
      provider: transport.provider,
      reviewRequired: transport.reviewRequired,
      routeLabel: transport.routeLabel,
      status: transport.status,
      transportType: transport.transportType,
    })),
    trip: records.trip,
  };
}

function summarizeReviewQuestion(
  question: StructuredTripRecords["reviewQuestions"][number],
  includePrivate: boolean
) {
  return {
    answerType: question.answerType,
    evidence: redactSensitiveText(question.evidence, includePrivate),
    guessedValue: redactSensitiveText(question.guessedValue, includePrivate),
    id: question.id,
    prompt: redactSensitiveText(question.prompt, includePrivate),
    reason: redactSensitiveText(question.reason, includePrivate),
    status: question.status,
    subjectId: question.subjectId,
    subjectType: question.subjectType,
    targetField: question.targetField,
  };
}

function createAuditSummary({
  auditPayload,
  includePrivate,
}: {
  auditPayload: TripExtractionAuditPayload;
  includePrivate: boolean;
}) {
  const report = auditPayload.report;
  const lineageRows =
    report?.lineage
      .filter((row) => row.status !== "survived")
      .slice(0, MAX_LINEAGE_ROWS) ?? [];

  return {
    diagnostics:
      report?.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        detail: redactSensitiveText(diagnostic.detail, includePrivate),
        evidence: diagnostic.evidence.map((item) =>
          redactSensitiveText(item, includePrivate)
        ),
        severity: diagnostic.severity,
        title: diagnostic.title,
      })) ?? [],
    extraction: report?.extraction ?? null,
    lineage: {
      includedRows: lineageRows.length,
      rows: lineageRows.map((row) => ({
        assemblyActions: row.assemblyActions.map((action) => ({
          action: action.action,
          detail: redactSensitiveText(action.detail, includePrivate),
        })),
        date: row.date,
        diagnostics: row.diagnostics.map((item) =>
          redactSensitiveText(item, includePrivate)
        ),
        finalRecords: row.finalRecords.map((record) => ({
          date: record.date,
          id: record.id,
          recordType: record.recordType,
          status: record.status,
          title: record.title,
          type: record.type,
        })),
        identityKey: row.identityKey,
        status: row.status,
        title: row.title,
      })),
      totalRows: report?.lineage.length ?? 0,
      truncated: (report?.lineage.length ?? 0) > MAX_LINEAGE_ROWS,
    },
    notices: auditPayload.notices,
    sourceAnchors: {
      transport:
        report?.sourceAnchors.transport.map((anchor) => ({
          ...anchor,
          confirmation: redactPrivateValue(
            anchor.confirmation,
            includePrivate,
            "confirmation"
          ),
          evidence: redactSensitiveText(anchor.evidence, includePrivate),
        })) ?? [],
    },
    sourceComparison: report?.sourceComparison ?? null,
    structured: report?.structured ?? null,
    warnings: report?.warnings ?? [],
  };
}

export function createTripExtractionQaBundlePayload({
  auditPayload,
  checkpoints,
  includePrivate = false,
  records,
  uploads,
}: {
  auditPayload: TripExtractionAuditPayload;
  checkpoints: MaterialExtractionRecord[];
  includePrivate?: boolean;
  records: StructuredTripRecords | null;
  uploads: TripUpload[];
}) {
  return {
    audit: createAuditSummary({ auditPayload, includePrivate }),
    generatedAt: new Date().toISOString(),
    materialPipeline: summarizeMaterialCheckpoints({
      checkpoints,
      includePrivate,
      uploads,
    }),
    records: createRecordSummaries({ includePrivate, records }),
    redaction: {
      includePrivate,
      privateDetailValues: includePrivate ? "included" : "redacted",
      sourceTextPreviews: includePrivate ? "included" : "redacted",
    },
    schemaVersion: 1,
    trip: auditPayload.trip,
    uploads: summarizeUploads(uploads),
  };
}

export async function getTripExtractionQaBundle(
  tripId: string,
  options: TripExtractionQaBundleOptions = {}
) {
  const includePrivate = options.includePrivate === true;
  const auditPayload = await getTripExtractionAuditPayload(tripId);
  const [appliedRecords, uploads, checkpoints] = await Promise.all([
    getAppliedTripRecords({
      fallbackTripName: auditPayload.trip.name,
      tripId,
    }),
    listTripUploads(tripId),
    listMaterialExtractionCheckpoints(tripId),
  ]);

  return createTripExtractionQaBundlePayload({
    auditPayload,
    checkpoints,
    includePrivate,
    records: appliedRecords.records,
    uploads,
  });
}
