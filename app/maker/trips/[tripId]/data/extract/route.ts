import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIConfig,
  hasOpenAIExtractionConfig,
  isTripAllowedForOpenAIExtraction,
} from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { persistEvidenceArtifacts } from "@/lib/extraction/evidence-artifacts";
import {
  assessTripDraftQuality,
  attachTripQualityAssessment,
} from "@/lib/extraction/trip-quality-assessment";
import {
  completeTripProcessingRun,
  createTripProcessingRun,
  DuplicateProcessingRunError,
  failTripProcessingRun,
  getLatestTripDraftSnapshot,
  getLatestTripProcessingRun,
} from "@/lib/extraction/processing-runs";
import { recordTripProcessingEvent } from "@/lib/extraction/processing-events";
import { prepareTripDraftForReview } from "@/lib/extraction/trip-spine-validation";
import {
  createTripExtractionMaterialsIdempotencyKey,
  getTripExtractionMaterialsWithSummary,
  getTripExtractionMaterialSourceUploadIds,
} from "@/lib/extraction/trip-materials";
import {
  optimizeTripExtractionMaterials,
  type MaterialBudgetSummary,
} from "@/lib/extraction/material-budget";
import {
  getMaterialExtractionReadinessIssue,
  listMaterialExtractionCheckpoints,
} from "@/lib/extraction/material-extractions";
import { processTripOcrNeededMaterials } from "@/lib/extraction/ocr-processor";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 300;

function redirectToData(
  request: NextRequest,
  tripId: string,
  params: Record<string, string>
) {
  const url = new URL(`/maker/trips/${tripId}/data`, request.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, 303);
}

function getEstimatedInputPassCount(usage: unknown) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return 1;
  }

  const record = usage as Record<string, unknown>;

  if (record.staged !== true) {
    return 1;
  }

  return record.activities || record.activityFailure ? 2 : 1;
}

function withRunInputEstimate(
  summary: MaterialBudgetSummary,
  usage?: unknown
) {
  const estimatedInputPassCount = getEstimatedInputPassCount(usage);

  return {
    ...summary,
    estimatedInputPassCount,
    estimatedRunInputTokens:
      summary.estimatedInputTokens * estimatedInputPassCount,
  };
}

function summarizeMaterialCheckpoints(
  checkpoints: Awaited<ReturnType<typeof listMaterialExtractionCheckpoints>>
) {
  return checkpoints.reduce(
    (summary, checkpoint) => {
      summary.byStatus[checkpoint.status] =
        (summary.byStatus[checkpoint.status] ?? 0) + 1;
      summary.extractedCharCount += checkpoint.extractedCharCount;
      summary.materialCount += 1;

      if (checkpoint.failureClass) {
        summary.failureClasses[checkpoint.failureClass] =
          (summary.failureClasses[checkpoint.failureClass] ?? 0) + 1;
      }

      return summary;
    },
    {
      byStatus: {} as Record<string, number>,
      extractedCharCount: 0,
      failureClasses: {} as Record<string, number>,
      materialCount: 0,
    }
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function countArrayField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value) ? value.length : 0;
}

function summarizeAssemblyUsage(usage: unknown) {
  const usageRecord = asRecord(usage);
  const consolidation = asRecord(usageRecord?.consolidation);

  if (!consolidation) {
    return null;
  }

  const overproductionRetry = asRecord(consolidation.overproductionRetry);

  return {
    foldedLodgingNotes: countArrayField(consolidation, "foldedLodgingNotes"),
    mergedCityNotes: countArrayField(consolidation, "mergedCityNotes"),
    normalizedOptionalActivities: countArrayField(
      consolidation,
      "normalizedOptionalActivities"
    ),
    normalizedRentalCarPickups: countArrayField(
      consolidation,
      "normalizedRentalCarPickups"
    ),
    overproductionRetry: overproductionRetry
      ? {
          averagePlansPerDay: overproductionRetry.averagePlansPerDay ?? null,
          maxPlansPerDay: overproductionRetry.maxPlansPerDay ?? null,
          triggered: overproductionRetry.triggered ?? null,
        }
      : null,
    promotedTravelActivities: countArrayField(
      consolidation,
      "promotedTravelActivities"
    ),
    removedDuplicateParents: countArrayField(
      consolidation,
      "removedDuplicateParents"
    ),
    removedGroupedChildren: countArrayField(
      consolidation,
      "removedGroupedChildren"
    ),
    suppressedDayOverviews: countArrayField(
      consolidation,
      "suppressedDayOverviews"
    ),
    suppressedTransportActivities: countArrayField(
      consolidation,
      "suppressedTransportActivities"
    ),
    wrongCityPlacements: countArrayField(consolidation, "wrongCityPlacements"),
  };
}

function getNoMaterialErrorCode(
  summary: ReturnType<typeof summarizeMaterialCheckpoints>
) {
  if ((summary.byStatus.ocr_needed ?? 0) > 0) {
    return "ocr-needed";
  }

  if ((summary.byStatus.pending ?? 0) > 0) {
    return "material-incomplete";
  }

  return "no-text-materials";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);

  if (trip.isDemo) {
    return redirectToData(request, tripId, { extraction: "demo" });
  }

  if (trip.paymentStatus !== "paid") {
    return redirectToData(request, tripId, { error: "checkout-required" });
  }

  if (trip.processingStatus === "processing") {
    return redirectToData(request, tripId, { error: "processing-active" });
  }

  if (!hasOpenAIExtractionConfig()) {
    return redirectToData(request, tripId, { error: "extraction-disabled" });
  }

  if (!isTripAllowedForOpenAIExtraction(tripId)) {
    return redirectToData(request, tripId, { error: "extraction-not-allowed" });
  }

  const uploads = await listTripUploads(tripId);
  const [latestDraft, latestRun] = await Promise.all([
    getLatestTripDraftSnapshot(tripId),
    getLatestTripProcessingRun(tripId),
  ]);

  if (latestDraft || ["parsed", "generated", "publishing", "published"].includes(trip.processingStatus)) {
    return redirectToData(request, tripId, { error: "spine-exists" });
  }

  let preparedMaterials = await getTripExtractionMaterialsWithSummary(uploads);
  let materials = preparedMaterials.materials;
  let materialCheckpoints = await listMaterialExtractionCheckpoints(tripId);
  let materialCheckpointSummary =
    summarizeMaterialCheckpoints(materialCheckpoints);
  let ocrSummary: Awaited<ReturnType<typeof processTripOcrNeededMaterials>> | null = null;

  if ((materialCheckpointSummary.byStatus.ocr_needed ?? 0) > 0) {
    ocrSummary = await processTripOcrNeededMaterials({ tripId, uploads });
    materialCheckpoints = await listMaterialExtractionCheckpoints(tripId);
    materialCheckpointSummary =
      summarizeMaterialCheckpoints(materialCheckpoints);
  }

  const readinessIssue =
    getMaterialExtractionReadinessIssue(materialCheckpoints);

  if (readinessIssue) {
    console.warn("trip_extraction_materials_not_ready", {
      materialDedupe: preparedMaterials.dedupeSummary,
      ocrSummary,
      statusCounts: materialCheckpointSummary.byStatus,
      failureClasses: materialCheckpointSummary.failureClasses,
      tripId,
    });
    await recordTripProcessingEvent({
      details: {
        failureClasses: materialCheckpointSummary.failureClasses,
        materialDedupe: preparedMaterials.dedupeSummary,
        ocrSummary,
        statusCounts: materialCheckpointSummary.byStatus,
      },
      errorMessage: readinessIssue,
      stage: readinessIssue.startsWith("ocr-") ? "ocr" : "material_checkpoint",
      status: readinessIssue === "ocr-failed" ? "failed" : "blocked",
      tripId,
    });

    return redirectToData(request, tripId, { error: readinessIssue });
  }

  if (ocrSummary) {
    preparedMaterials = await getTripExtractionMaterialsWithSummary(uploads);
    materials = preparedMaterials.materials;
    materialCheckpoints = await listMaterialExtractionCheckpoints(tripId);
    materialCheckpointSummary =
      summarizeMaterialCheckpoints(materialCheckpoints);
  }

  if (materials.length === 0) {
    await recordTripProcessingEvent({
      details: {
        failureClasses: materialCheckpointSummary.failureClasses,
        materialDedupe: preparedMaterials.dedupeSummary,
        statusCounts: materialCheckpointSummary.byStatus,
      },
      errorMessage: getNoMaterialErrorCode(materialCheckpointSummary),
      stage: "material_checkpoint",
      status: "blocked",
      tripId,
    });

    return redirectToData(request, tripId, {
      error: getNoMaterialErrorCode(materialCheckpointSummary),
    });
  }

  const optimizedMaterials = optimizeTripExtractionMaterials({
    materials,
    totalCharBudget: getOpenAIConfig().maxInputChars,
  });
  const inputCharCount = optimizedMaterials.summary.rawCharCount;

  if (materials.length === 0 || inputCharCount === 0) {
    await recordTripProcessingEvent({
      details: {
        materialDedupe: preparedMaterials.dedupeSummary,
        materialCount: materials.length,
        rawCharCount: inputCharCount,
        statusCounts: materialCheckpointSummary.byStatus,
      },
      errorMessage: getNoMaterialErrorCode(materialCheckpointSummary),
      stage: "material_budget",
      status: "blocked",
      tripId,
    });

    return redirectToData(request, tripId, {
      error: getNoMaterialErrorCode(materialCheckpointSummary),
    });
  }

  console.info("trip_extraction_materials_ready", {
    estimatedInputTokens: optimizedMaterials.summary.estimatedInputTokens,
    materialDedupe: preparedMaterials.dedupeSummary,
    materialCount: optimizedMaterials.summary.materialCount,
    materialTypes: Array.from(new Set(optimizedMaterials.materials.map((material) => material.type))),
    rawCharCount: optimizedMaterials.summary.rawCharCount,
    ocrSummary,
    statusCounts: materialCheckpointSummary.byStatus,
    budgetedSpineCharCount: optimizedMaterials.summary.submittedCharCount,
    truncatedMaterialCount: optimizedMaterials.summary.truncatedMaterialCount,
    tripId,
  });
  await recordTripProcessingEvent({
    details: {
      estimatedInputTokens: optimizedMaterials.summary.estimatedInputTokens,
      materialDedupe: preparedMaterials.dedupeSummary,
      materialCount: optimizedMaterials.summary.materialCount,
      materialTypes: Array.from(new Set(optimizedMaterials.materials.map((material) => material.type))),
      rawCharCount: optimizedMaterials.summary.rawCharCount,
      statusCounts: materialCheckpointSummary.byStatus,
      truncatedMaterialCount: optimizedMaterials.summary.truncatedMaterialCount,
    },
    stage: "material_checkpoint",
    status: "completed",
    tripId,
  });
  let run: Awaited<ReturnType<typeof createTripProcessingRun>> | null = null;
  let extractionUsage: unknown = null;
  const representedSourceUploadIds =
    getTripExtractionMaterialSourceUploadIds(materials);

  try {
    run = await createTripProcessingRun({
      idempotencyKey: createTripExtractionMaterialsIdempotencyKey({
        failedRunId: latestRun?.status === "failed" ? latestRun.id : undefined,
        materials,
      }),
      inputCharCount,
      sourceUploadIds: representedSourceUploadIds,
      tripId,
    });
    await recordTripProcessingEvent({
      details: {
        inputCharCount,
        materialDedupe: preparedMaterials.dedupeSummary,
        representedSourceUploadCount: representedSourceUploadIds.length,
        uploadedSourceCount: uploads.length,
      },
      processingRunId: run.id,
      stage: "run",
      status: "started",
      tripId,
    });
    await recordTripProcessingEvent({
      details: {
        materialDedupe: preparedMaterials.dedupeSummary,
        materialCount: materials.length,
        tripName: trip.name,
      },
      processingRunId: run.id,
      stage: "model_extraction",
      status: "started",
      tripId,
    });
    const result = await extractTripDraftWithOpenAI({
      materials,
      tripName: trip.name,
    });
    extractionUsage = result.usage;
    await recordTripProcessingEvent({
      details: {
        model: result.model,
      },
      processingRunId: run.id,
      stage: "model_extraction",
      status: "completed",
      tripId,
    });

    const evidenceSummary = await persistEvidenceArtifacts({
      observations: result.evidenceArtifacts.observations,
      pieces: result.evidenceArtifacts.pieces,
      processingRunId: run.id,
      tripId,
    });
    await recordTripProcessingEvent({
      details: evidenceSummary,
      processingRunId: run.id,
      stage: "evidence_cluster",
      status: "completed",
      tripId,
    });

    const assemblySummary = summarizeAssemblyUsage(result.usage);

    await recordTripProcessingEvent({
      details: assemblySummary ?? {},
      processingRunId: run.id,
      stage: "assembly",
      status: "completed",
      tripId,
    });

    const reviewableDraft = prepareTripDraftForReview(result.draft);
    const qualityRecords = createStructuredTripRecordsFromDraft({
      draft: reviewableDraft,
      fallbackTripName: trip.name,
      tripId,
    });
    const qualityAssessment = assessTripDraftQuality({
      draft: reviewableDraft,
      records: qualityRecords,
      usage: result.usage,
    });
    const completedDraft = attachTripQualityAssessment({
      assessment: qualityAssessment,
      draft: reviewableDraft,
    });
    await recordTripProcessingEvent({
      details: {
        diagnosticCount: qualityAssessment.report.diagnostics.length,
        disposition: qualityAssessment.disposition,
        fingerprintHash: qualityAssessment.report.fingerprints.hash,
        p0DiagnosticCount: qualityAssessment.p0Diagnostics.length,
        structured: qualityAssessment.report.structured,
      },
      processingRunId: run.id,
      stage: "quality_assessment",
      status: "completed",
      tripId,
    });

    await completeTripProcessingRun({
      draftJson: completedDraft,
      model: result.model,
      runId: run.id,
      tripId,
      usage: {
        materialBudget: withRunInputEstimate(
          optimizedMaterials.summary,
          result.usage
        ),
        materialCheckpoints: materialCheckpointSummary,
        materialDedupe: preparedMaterials.dedupeSummary,
        ocr: ocrSummary,
        openai: result.usage,
        qualityAssessment: {
          diagnosticCount: qualityAssessment.report.diagnostics.length,
          diagnostics: qualityAssessment.report.diagnostics,
          disposition: qualityAssessment.disposition,
          p0DiagnosticCount: qualityAssessment.p0Diagnostics.length,
        },
      },
    });

    return redirectToData(request, tripId, {
      extraction:
        qualityAssessment.disposition === "needs_review"
          ? "completed-with-review"
          : "completed",
    });
  } catch (error) {
    if (error instanceof DuplicateProcessingRunError) {
      const existingStatus = error.existingRun?.status;

      return redirectToData(request, tripId, {
        error:
          existingStatus === "completed"
            ? "spine-exists"
            : existingStatus === "processing" || existingStatus === "pending"
              ? "processing-active"
              : "duplicate-build-blocked",
      });
    }

    const message =
      error instanceof Error ? error.message : "Trip extraction failed.";
    console.error("trip_extraction_failed", {
      message,
      name: error instanceof Error ? error.name : "UnknownError",
      runId: run?.id ?? null,
      tripId,
    });
    const errorCode = "extraction-failed";

    if (run) {
      const failureDetails =
        error && typeof error === "object" && "details" in error
          ? {
              materialBudget: withRunInputEstimate(
                optimizedMaterials.summary,
                extractionUsage
              ),
              materialCheckpoints: materialCheckpointSummary,
              materialDedupe: preparedMaterials.dedupeSummary,
              ocr: ocrSummary,
              openaiError: (error as { details?: unknown }).details,
            }
          : {
              materialBudget: withRunInputEstimate(
                optimizedMaterials.summary,
                extractionUsage
              ),
              materialCheckpoints: materialCheckpointSummary,
              materialDedupe: preparedMaterials.dedupeSummary,
              ocr: ocrSummary,
            };

      await recordTripProcessingEvent({
        details: failureDetails,
        errorMessage: message,
        processingRunId: run.id,
        stage: "extraction",
        status: "failed",
        tripId,
      });

      try {
        await failTripProcessingRun({
          errorMessage: message,
          failureDetails,
          runId: run.id,
          tripId,
        });
      } catch (failError) {
        console.error("trip_extraction_fail_mark_failed", {
          message:
            failError instanceof Error
              ? failError.message
              : "Unknown failure-state error.",
          runId: run.id,
          tripId,
        });
      }
    }

    return redirectToData(request, tripId, { error: errorCode });
  }
}
