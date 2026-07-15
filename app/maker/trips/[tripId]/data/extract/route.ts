import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIConfig,
  hasOpenAIExtractionConfig,
  isTripAllowedForOpenAIExtraction,
} from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import {
  assembleCanonicalTripDraft,
  CanonicalAssemblyRecoveryError,
  prepareCanonicalEvidencePieces,
} from "@/lib/extraction/canonical-trip-assembly";
import { attachStructuredTripSnapshot } from "@/lib/extraction/structured-trip-snapshot";
import { persistEvidenceArtifacts } from "@/lib/extraction/evidence-artifacts";
import {
  assessTripDraftQuality,
  attachTripQualityAssessment,
  createTripQualityAssessmentSnapshot,
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

function summarizeFinalizationUsage(usage: unknown) {
  const usageRecord = asRecord(usage);
  const finalization = asRecord(usageRecord?.finalization);
  const identityRecovery = asRecord(usageRecord?.identityRecovery);

  if (!finalization) {
    return null;
  }

  return {
    canonicalEntityCount: finalization.canonicalEntityCount ?? null,
    canonicalEvidenceVersion: finalization.canonicalEvidenceVersion ?? null,
    canonicalIdentityVersion: finalization.canonicalIdentityVersion ?? null,
    canonicalReviewCount: finalization.canonicalReviewCount ?? null,
    identityRecoveryActions: Array.isArray(identityRecovery?.actions)
      ? identityRecovery.actions
      : [],
    identityRecoveryAttempted: identityRecovery?.attempted === true,
    identityRecoveryStatus: identityRecovery?.status ?? "not_needed",
    status: finalization.status ?? null,
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
    preparedMaterials = await getTripExtractionMaterialsWithSummary(uploads, {
      retryFailedOcr: false,
    });
    materials = preparedMaterials.materials;
    materialCheckpoints = await listMaterialExtractionCheckpoints(tripId);
    materialCheckpointSummary =
      summarizeMaterialCheckpoints(materialCheckpoints);
  }

  const readinessIssue =
    getMaterialExtractionReadinessIssue(materialCheckpoints, {
      hasUsableMaterials: materials.length > 0,
    });

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
    spineSubmittedCharCount: optimizedMaterials.summary.submittedCharCount,
    spineTruncatedMaterialCount:
      optimizedMaterials.summary.truncatedMaterialCount,
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
      spineSubmittedCharCount: optimizedMaterials.summary.submittedCharCount,
      spineTruncatedMaterialCount:
        optimizedMaterials.summary.truncatedMaterialCount,
    },
    stage: "material_checkpoint",
    status: "completed",
    tripId,
  });
  let run: Awaited<ReturnType<typeof createTripProcessingRun>> | null = null;
  let extractionUsage: unknown = null;
  let failureStage = "run";
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
    failureStage = "model_extraction";
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

    failureStage = "canonical_validation";
    await recordTripProcessingEvent({
      details: {},
      processingRunId: run.id,
      stage: "canonical_validation",
      status: "started",
      tripId,
    });
    const preparedEvidence = prepareCanonicalEvidencePieces(
      result.evidenceArtifacts.pieces
    );
    await recordTripProcessingEvent({
      details: {
        recoveryActions: preparedEvidence.recoveryActions,
        status:
          preparedEvidence.recoveryActions.length > 0
            ? "repaired"
            : "not_needed",
      },
      processingRunId: run.id,
      stage: "canonical_validation",
      status: "completed",
      tripId,
    });

    failureStage = "evidence_cluster";
    const evidenceSummary = await persistEvidenceArtifacts({
      observations: result.evidenceArtifacts.observations,
      pieces: preparedEvidence.pieces,
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

    failureStage = "assembly";
    await recordTripProcessingEvent({
      details: {},
      processingRunId: run.id,
      stage: "assembly",
      status: "started",
      tripId,
    });
    const assembly = assembleCanonicalTripDraft({
      draft: result.draft,
      evidencePieces: preparedEvidence.pieces,
      fallbackTripName: trip.name,
      priorRecoveryActions: preparedEvidence.recoveryActions,
      tripId,
    });
    const assemblyUsage = {
      ...(asRecord(result.usage) ?? {}),
      evidence: {
        ...(asRecord(asRecord(result.usage)?.evidence) ?? {}),
        canonicalPieceCount: preparedEvidence.pieces.length,
      },
      finalization: assembly.finalization,
      identityRecovery: assembly.recovery,
    };
    extractionUsage = assemblyUsage;
    const finalizationSummary = summarizeFinalizationUsage(assemblyUsage);
    await recordTripProcessingEvent({
      details: finalizationSummary ?? {},
      processingRunId: run.id,
      stage: "assembly",
      status: "completed",
      tripId,
    });

    failureStage = "quality_assessment";
    const qualityAssessment = assessTripDraftQuality({
      draft: assembly.draft,
      evidenceArtifacts: {
        observations: result.evidenceArtifacts.observations,
        pieces: preparedEvidence.pieces,
      },
      records: assembly.records,
      usage: assemblyUsage,
    });
    const completedDraft = attachTripQualityAssessment({
      assessment: qualityAssessment,
      draft: assembly.draft,
    });
    const qualityAssessmentSnapshot =
      createTripQualityAssessmentSnapshot(qualityAssessment);
    await recordTripProcessingEvent({
      details: {
        ...qualityAssessmentSnapshot,
        fingerprintHash: qualityAssessment.report.fingerprints.hash,
        structured: qualityAssessment.report.structured,
      },
      processingRunId: run.id,
      stage: "quality_assessment",
      status: "completed",
      tripId,
    });

    const persistedDraft = attachStructuredTripSnapshot({
      draft: completedDraft,
      records: assembly.records,
    });

    failureStage = "persistence";
    await completeTripProcessingRun({
      draftJson: persistedDraft,
      model: result.model,
      runId: run.id,
      tripId,
      usage: {
        materialBudget: withRunInputEstimate(
          optimizedMaterials.summary,
          assemblyUsage
        ),
        materialCheckpoints: materialCheckpointSummary,
        materialDedupe: preparedMaterials.dedupeSummary,
        ocr: ocrSummary,
        openai: assemblyUsage,
        qualityAssessment: qualityAssessmentSnapshot,
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
    const errorCode =
      error instanceof CanonicalAssemblyRecoveryError
        ? "assembly-recovery-required"
        : "extraction-failed";

    if (run) {
      const baseFailureDetails =
        error && typeof error === "object" && "details" in error
          ? {
              materialBudget: withRunInputEstimate(
                optimizedMaterials.summary,
                extractionUsage
              ),
              materialCheckpoints: materialCheckpointSummary,
              materialDedupe: preparedMaterials.dedupeSummary,
              ocr: ocrSummary,
              ...(error instanceof CanonicalAssemblyRecoveryError
                ? { assemblyRecovery: error.details }
                : { openaiError: (error as { details?: unknown }).details }),
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
      const failureDetails = {
        ...baseFailureDetails,
        errorName: error instanceof Error ? error.name : "UnknownError",
        stage: failureStage,
      };

      await recordTripProcessingEvent({
        details: failureDetails,
        errorMessage: message,
        processingRunId: run.id,
        stage: failureStage,
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
