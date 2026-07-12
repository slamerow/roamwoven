import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import {
  getMaterialOcrReadinessIssue,
  listMaterialExtractionCheckpoints,
  materialFromCheckpoint,
  type MaterialExtractionRecord,
} from "@/lib/extraction/material-extractions";
import { createRedactedTripProcessingEvent } from "@/lib/extraction/processing-events";
import {
  listTripOcrBatchCheckpoints,
  type OcrBatchCheckpoint,
} from "@/lib/extraction/ocr-batches";
import { getEvidenceArtifactSummary } from "@/lib/extraction/evidence-artifacts";
import {
  extractSourceTransportAnchorsFromMaterials,
  sourceTransportAnchorMatchesRecord,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import {
  getTripExtractionAuditPayload,
  type TripExtractionAuditPayload,
} from "@/lib/extraction/trip-extraction-audit-view";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  getStructuredReviewCount,
  getStructuredReviewSections,
} from "@/lib/generated-trip-review";
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

function summarizeOcrBatches(
  batches: OcrBatchCheckpoint[],
  includePrivate: boolean
) {
  return {
    byStatus: countBy(batches.map((batch) => batch.status)),
    completedPageCount: new Set(
      batches
        .filter((batch) => batch.status === "completed")
        .flatMap((batch) =>
          Array.from(
            { length: batch.pageEnd - batch.pageStart + 1 },
            (_, index) => `${batch.uploadId}:${batch.pageStart + index}`
          )
        )
    ).size,
    rows: batches.map((batch) => ({
      attemptCount: batch.attemptCount,
      completedAt: batch.completedAt,
      errorMessage: redactSensitiveText(batch.errorMessage, includePrivate),
      id: batch.id,
      incompleteReason: batch.incompleteReason,
      maxOutputTokens: batch.maxOutputTokens,
      model: batch.model,
      outputCharCount: batch.outputCharCount,
      pageEnd: batch.pageEnd,
      pageStart: batch.pageStart,
      promptVersion: batch.promptVersion,
      status: batch.status,
      textPreview: includePrivate
        ? truncateText(batch.textContent, PRIVATE_TEXT_LIMIT)
        : null,
      textPreviewRedacted: !includePrivate && Boolean(batch.textContent),
      uploadId: batch.uploadId,
    })),
    total: batches.length,
  };
}

function materialTypeForUpload(upload: TripUpload | undefined) {
  if (upload?.sourceKind === "note" || upload?.userNote?.trim()) {
    return "note" as const;
  }

  return upload?.fileType === "application/pdf"
    ? "pdf_text" as const
    : "file_text" as const;
}

function transportTypeForAnchor(anchor: SourceTransportAnchor) {
  return anchor.kind === "transfer" ? "transfer" : anchor.kind;
}

function recordLikeAnchor(anchor: SourceTransportAnchor) {
  return {
    arrivalLocation: anchor.arrivalLocation,
    confirmationLabel: anchor.confirmation,
    date: anchor.date,
    departureLocation: anchor.departureLocation,
    provider: anchor.provider,
    routeLabel: anchor.routeLabel,
    transportType: transportTypeForAnchor(anchor),
  };
}

function anchorsMatch(left: SourceTransportAnchor, right: SourceTransportAnchor) {
  return sourceTransportAnchorMatchesRecord(left, recordLikeAnchor(right));
}

function summarizeTransportAnchor(
  anchor: SourceTransportAnchor,
  includePrivate: boolean
) {
  return {
    arrivalLocation: anchor.arrivalLocation,
    arrivalTime: anchor.arrivalTime,
    confidence: anchor.confidence,
    confirmation: redactPrivateValue(
      anchor.confirmation,
      includePrivate,
      "confirmation"
    ),
    date: anchor.date,
    departureLocation: anchor.departureLocation,
    departureTime: anchor.departureTime,
    evidence: redactSensitiveText(anchor.evidence, includePrivate),
    kind: anchor.kind,
    number: anchor.number,
    provider: anchor.provider,
    provenance: anchor.provenance,
    routeLabel: anchor.routeLabel,
    sourceFilename: anchor.sourceFilename,
    sourceUploadId: anchor.sourceUploadId,
  };
}

function createMaterialAnchorCoverage({
  auditPayload,
  includePrivate,
  records,
  sourceTransportAnchors,
}: {
  auditPayload: TripExtractionAuditPayload;
  includePrivate: boolean;
  records: StructuredTripRecords | null;
  sourceTransportAnchors: SourceTransportAnchor[];
}) {
  const activeTransport = records?.transport.filter((record) => record.status !== "ignored") ?? [];
  const reportTransportAnchors = auditPayload.report?.sourceAnchors.transport ?? null;
  const missingFromFinalRecords = sourceTransportAnchors.filter(
    (anchor) =>
      !activeTransport.some((record) =>
        sourceTransportAnchorMatchesRecord(anchor, record)
      )
  );
  const missingFromRunAudit = reportTransportAnchors
    ? sourceTransportAnchors.filter(
        (anchor) =>
          !reportTransportAnchors.some((candidate) => anchorsMatch(anchor, candidate))
      )
    : null;
  const diagnostics = [
    ...(missingFromFinalRecords.length > 0
      ? [
          {
            code: "material_transport_anchor_missing_final",
            detail:
              "Material checkpoint text includes critical travel anchors that are not present in final Travel records.",
            evidence: missingFromFinalRecords
              .slice(0, 10)
              .map((anchor) => summarizeTransportAnchor(anchor, includePrivate)),
            severity: "p0" as const,
            title: "Material transport anchors missing from final records",
          },
        ]
      : []),
    ...(missingFromRunAudit && missingFromRunAudit.length > 0
      ? [
          {
            code: "material_transport_anchor_missing_run_audit",
            detail:
              "Material checkpoint text includes travel anchors that are absent from the extraction run audit anchors.",
            evidence: missingFromRunAudit
              .slice(0, 10)
              .map((anchor) => summarizeTransportAnchor(anchor, includePrivate)),
            severity: "p0" as const,
            title: "Material transport anchors missing from run audit",
          },
        ]
      : []),
  ];

  return {
    diagnostics,
    finalMatchedTransportAnchors:
      sourceTransportAnchors.length - missingFromFinalRecords.length,
    materialTransportAnchors: sourceTransportAnchors.length,
    missingFromFinalRecords: missingFromFinalRecords.map((anchor) =>
      summarizeTransportAnchor(anchor, includePrivate)
    ),
    missingFromRunAudit: missingFromRunAudit
      ? missingFromRunAudit.map((anchor) =>
          summarizeTransportAnchor(anchor, includePrivate)
        )
      : null,
    runAuditAvailable: Boolean(reportTransportAnchors),
    runAuditMatchedTransportAnchors: reportTransportAnchors
      ? sourceTransportAnchors.length - (missingFromRunAudit?.length ?? 0)
      : null,
  };
}

function summarizeMaterialCheckpoints({
  auditPayload,
  checkpoints,
  includePrivate,
  records,
  uploads,
}: {
  auditPayload: TripExtractionAuditPayload;
  checkpoints: MaterialExtractionRecord[];
  includePrivate: boolean;
  records: StructuredTripRecords | null;
  uploads: TripUpload[];
}) {
  const uploadById = new Map(uploads.map((upload) => [upload.id, upload]));
  const byStatus = countBy(checkpoints.map((record) => record.status));
  const byMethod = countBy(
    checkpoints.map((record) => record.extractionMethod ?? "unknown")
  );
  const materials = checkpoints.flatMap((record) => {
    const upload = uploadById.get(record.uploadId);
    const material = materialFromCheckpoint({
      filename: upload?.originalFilename ?? "source material",
      record,
      type: materialTypeForUpload(upload),
    });

    return material ? [material] : [];
  });
  const sourceTransportAnchors =
    extractSourceTransportAnchorsFromMaterials(materials);
  const coverage = createMaterialAnchorCoverage({
    auditPayload,
    includePrivate,
    records,
    sourceTransportAnchors,
  });

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
    diagnostics: coverage.diagnostics,
    ocrReadinessIssue: getMaterialOcrReadinessIssue(checkpoints),
    sourceAnchors: {
      coverage,
      transport: sourceTransportAnchors.map((anchor) =>
        summarizeTransportAnchor(anchor, includePrivate)
      ),
    },
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
  const actionRequiredReviewItems = getStructuredReviewCount(records);
  const rawReviewRequiredRecords = [
    ...records.legs,
    ...records.stays,
    ...records.transport,
    ...records.items,
  ].filter((record) => record.reviewRequired && isActiveStatus(record)).length;

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
      actionRequiredReviewItems,
      openQuestions: openQuestions.length,
      privateDetails: records.privateDetails.length,
      reviewRequiredRecords: rawReviewRequiredRecords,
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
      internalSignals: {
        privateDetailsNeedingReview: records.privateDetails.filter(
          (detail) => detail.reviewRequired
        ).length,
        rawReviewRequiredRecords,
      },
      openQuestions: openQuestions.map((question) =>
        summarizeReviewQuestion(question, includePrivate)
      ),
      reviewPageActionCount: actionRequiredReviewItems,
      reviewPageSections: getStructuredReviewSections(records).map((section) => ({
        foundItems: section.count,
        id: section.id,
        title: section.title,
        visibleItems: section.items.length,
      })),
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
      .filter((row) => row.status !== "compiled")
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
    canonicalization: report?.canonicalization ?? null,
    extraction: report?.extraction ?? null,
    fingerprints: report?.fingerprints ?? null,
    lineage: {
      includedRows: lineageRows.length,
      rows: lineageRows.map((row) => ({
        actions: row.actions.map((action) => ({
          absorbedTitles: action.absorbedTitles.map((title) =>
            redactSensitiveText(title, includePrivate)
          ),
          reason: redactSensitiveText(action.reason, includePrivate),
          type: action.type,
        })),
        canonicalPieceId: row.canonicalPieceId,
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
        mergeReasons: row.mergeReasons,
        observations: row.observations.map((observation) => ({
          date: observation.date,
          id: observation.id,
          kind: observation.kind,
          role: observation.role,
          source: observation.source,
          sourceLabel: redactSensitiveText(
            observation.sourceLabel,
            includePrivate
          ),
          title: redactSensitiveText(observation.title, includePrivate),
        })),
        outputEligible: row.outputEligible,
        status: row.status,
        title: row.title,
      })),
      totalRows: report?.lineage.length ?? 0,
      truncated: (report?.lineage.length ?? 0) > MAX_LINEAGE_ROWS,
    },
    notices: auditPayload.notices,
    processingEvents: auditPayload.processingEvents.map((event) =>
      createRedactedTripProcessingEvent(event, { includePrivate })
    ),
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
    structured: report?.structured ?? null,
    warnings: report?.warnings ?? [],
  };
}

export function createTripExtractionQaBundlePayload({
  auditPayload,
  checkpoints,
  evidenceArtifacts = null,
  includePrivate = false,
  ocrBatches = [],
  records,
  uploads,
}: {
  auditPayload: TripExtractionAuditPayload;
  checkpoints: MaterialExtractionRecord[];
  evidenceArtifacts?: Awaited<ReturnType<typeof getEvidenceArtifactSummary>>;
  includePrivate?: boolean;
  ocrBatches?: OcrBatchCheckpoint[];
  records: StructuredTripRecords | null;
  uploads: TripUpload[];
}) {
  return {
    audit: createAuditSummary({ auditPayload, includePrivate }),
    generatedAt: new Date().toISOString(),
    evidenceArtifacts,
    materialPipeline: summarizeMaterialCheckpoints({
      auditPayload,
      checkpoints,
      includePrivate,
      records,
      uploads,
    }),
    ocrBatches: summarizeOcrBatches(ocrBatches, includePrivate),
    records: createRecordSummaries({ includePrivate, records }),
    redaction: {
      includePrivate,
      privateDetailValues: includePrivate ? "included" : "redacted",
      sourceTextPreviews: includePrivate ? "included" : "redacted",
    },
    schemaVersion: 2,
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
  const [appliedRecords, uploads, checkpoints, ocrBatches] = await Promise.all([
    getAppliedTripRecords({
      fallbackTripName: auditPayload.trip.name,
      tripId,
    }),
    listTripUploads(tripId),
    listMaterialExtractionCheckpoints(tripId),
    listTripOcrBatchCheckpoints(tripId),
  ]);
  const evidenceArtifacts = auditPayload.reportRun?.id
    ? await getEvidenceArtifactSummary({
        processingRunId: auditPayload.reportRun.id,
        tripId,
      })
    : null;

  return createTripExtractionQaBundlePayload({
    auditPayload,
    checkpoints,
    evidenceArtifacts,
    includePrivate,
    ocrBatches,
    records: appliedRecords.records,
    uploads,
  });
}
