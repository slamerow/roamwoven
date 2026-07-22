import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIConfig,
  hasOpenAIExtractionConfig,
  isTripAllowedForOpenAIExtraction,
} from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import {
  computeExtractionParseKey,
  createExtractionParseCache,
  fingerprintExtractionMaterials,
  resolveExtractionPinningEnv,
  runWithExtractionParseCache,
  type ExtractionParseCache,
} from "@/lib/extraction/extraction-pinning";
import {
  loadPinnedExtractionParse,
  savePinnedExtractionParse,
} from "@/lib/extraction/extraction-pinning-store";
import { resolveExtractionSamplingParams } from "@/lib/ai/openai";
import {
  assembleCanonicalTripDraft,
  CanonicalAssemblyRecoveryError,
  materializeCanonicalEvidenceObservations,
  prepareCanonicalEvidencePieces,
} from "@/lib/extraction/canonical-trip-assembly";
import { reapplyCanonicalOutputInvariants } from "@/lib/extraction/evidence-clustering";
import { attachStructuredTripSnapshot } from "@/lib/extraction/structured-trip-snapshot";
import { persistEvidenceArtifacts } from "@/lib/extraction/evidence-artifacts";
import {
  assessTripDraftQuality,
  attachTripQualityAssessment,
  createTripQualityAssessmentSnapshot,
} from "@/lib/extraction/trip-quality-assessment";
import {
  createTripQualityOutcomes,
} from "@/lib/extraction/trip-quality-outcomes";
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
// Run9: gpt-5.6-luna's extraction cannot finish ~30 chunk calls inside
// 300 s (mini took ~180 s; two luna runs were platform-killed mid
// model_extraction and surfaced as browser 405s, runs stuck 'processing').
// 800 s requires Vercel Fluid/Pro; if the build rejects it, the plan is the
// constraint and extraction must move to a background job before luna ships.
export const maxDuration = 800;

function hasSeriousQualityFindings(
  assessment: ReturnType<typeof assessTripDraftQuality>
) {
  return Boolean(
    assessment.p0Diagnostics.length ||
      assessment.p1Diagnostics.length ||
      assessment.hardWarnings.length ||
      assessment.quietWarnings.some(
        (warning) => warning.code === "activity_bloat"
      )
  );
}

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
    // Arc E extraction pinning (env-gated OFF by default; RW-OPS-001:
    // fail-soft — pinning machinery never blocks or alters the run).
    const pinning = resolveExtractionPinningEnv();
    let parseCache: ExtractionParseCache | null = null;
    let parseKey: string | null = null;
    let materialFingerprints: string[] = [];
    const samplingParams = resolveExtractionSamplingParams();
    if (pinning.reuse || pinning.write) {
      materialFingerprints = fingerprintExtractionMaterials(materials);
      parseKey = computeExtractionParseKey({
        materialFingerprints,
        model: getOpenAIConfig().extractionModel,
        samplingParams,
      });
      const pinned = pinning.reuse
        ? await loadPinnedExtractionParse({ parseKey, tripId })
        : null;
      parseCache = createExtractionParseCache(pinned?.calls ?? []);
    }
    const result = parseCache
      ? await runWithExtractionParseCache(parseCache, () =>
          extractTripDraftWithOpenAI({
            materials,
            tripName: trip.name,
          })
        )
      : await extractTripDraftWithOpenAI({
          materials,
          tripName: trip.name,
        });
    extractionUsage = result.usage;
    let pinningOutcome: Record<string, unknown> | null = null;
    if (parseCache && parseKey) {
      pinningOutcome = {
        hits: parseCache.hits,
        misses: parseCache.misses,
        parseKey,
        reuse: pinning.reuse,
        samplingParams,
        seededEntryCount: parseCache.seededEntryCount,
        write: pinning.write,
      };
      if (pinning.write) {
        const saved = await savePinnedExtractionParse({
          calls: [...parseCache.entries.entries()].map(([h, v]) => ({ h, v })),
          materialFingerprints,
          model: getOpenAIConfig().extractionModel,
          parseKey,
          samplingParams,
          stats: pinningOutcome,
          tripId,
        });
        pinningOutcome.saved = saved;
      }
      if (
        extractionUsage &&
        typeof extractionUsage === "object" &&
        !Array.isArray(extractionUsage)
      ) {
        (extractionUsage as Record<string, unknown>).extractionPinning =
          pinningOutcome;
      }
    }
    await recordTripProcessingEvent({
      details: {
        model: result.model,
        // Env-surgery protocol: the values the run ACTUALLY used are run
        // telemetry — sampling params and pin hit/miss ride the event.
        pinning: pinningOutcome,
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
    await recordTripProcessingEvent({
      details: {},
      processingRunId: run.id,
      stage: "evidence_cluster",
      status: "started",
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
    const initialPieces = preparedEvidence.pieces;
    let currentPieces = initialPieces;
    let assembly = assembleCanonicalTripDraft({
      draft: result.draft,
      evidencePieces: currentPieces,
      fallbackTripName: trip.name,
      priorRecoveryActions: preparedEvidence.recoveryActions,
      tripId,
    });
    failureStage = "quality_assessment";
    await recordTripProcessingEvent({
      details: { maxCanonicalInvariantRetries: 1 },
      processingRunId: run.id,
      stage: "quality_remediation",
      status: "started",
      tripId,
    });
    failureStage = "evidence_cluster";
    const initialObservations = materializeCanonicalEvidenceObservations({
      draft: assembly.draft,
      observations: result.evidenceArtifacts.observations,
      pieces: currentPieces,
    });
    const initialRecoveredObservationCount = initialObservations.filter(
      (observation) =>
        observation.sourceProvenance === "canonical_assembly_recovery"
    ).length;
    failureStage = "quality_assessment";
    const initialUsage = {
      ...(asRecord(result.usage) ?? {}),
      evidence: {
        ...(asRecord(asRecord(result.usage)?.evidence) ?? {}),
        canonicalPieceCount: currentPieces.filter((piece) => piece.outputEligible)
          .length,
        dispositionCount: initialObservations.length,
        recoveredObservationCount: initialRecoveredObservationCount,
      },
      finalization: assembly.finalization,
      identityRecovery: assembly.recovery,
    };
    const initialAssessment = assessTripDraftQuality({
      draft: assembly.draft,
      evidenceArtifacts: {
        observations: initialObservations,
        pieces: currentPieces,
      },
      records: assembly.records,
      usage: initialUsage,
    });
    const retryAttempted = hasSeriousQualityFindings(initialAssessment);
    let retryChanged = false;

    if (retryAttempted) {
      const retry = reapplyCanonicalOutputInvariants({ pieces: currentPieces });
      retryChanged = retry.changed;

      if (retryChanged) {
        currentPieces = retry.pieces;
        failureStage = "assembly";
        assembly = assembleCanonicalTripDraft({
          draft: assembly.draft,
          evidencePieces: currentPieces,
          fallbackTripName: trip.name,
          priorRecoveryActions: [
            ...preparedEvidence.recoveryActions,
            "reapplied_canonical_output_invariants",
          ],
          tripId,
        });
      }
    }

    failureStage = "evidence_cluster";
    const persistedObservations = materializeCanonicalEvidenceObservations({
      draft: assembly.draft,
      observations: result.evidenceArtifacts.observations,
      pieces: currentPieces,
    });
    const recoveredObservationCount = persistedObservations.filter(
      (observation) =>
        observation.sourceProvenance === "canonical_assembly_recovery"
    ).length;
    const assemblyUsage = {
      ...(asRecord(result.usage) ?? {}),
      evidence: {
        ...(asRecord(asRecord(result.usage)?.evidence) ?? {}),
        canonicalPieceCount: currentPieces.filter(
          (piece) => piece.outputEligible
        ).length,
        dispositionCount: persistedObservations.length,
        recoveredObservationCount,
      },
      finalization: assembly.finalization,
      identityRecovery: assembly.recovery,
      qualityRemediation: {
        retryAttempted,
        retryChanged,
      },
    };
    const qualityAssessment = assessTripDraftQuality({
      draft: assembly.draft,
      evidenceArtifacts: {
        observations: persistedObservations,
        pieces: currentPieces,
      },
      records: assembly.records,
      usage: assemblyUsage,
    });
    const remediationOutcomes = createTripQualityOutcomes({
      finalPieces: currentPieces,
      finalReport: qualityAssessment.report,
      initialPieces,
      initialReport: initialAssessment.report,
      records: assembly.records,
    });
    const finalAssemblyUsage = {
      ...assemblyUsage,
      qualityRemediation: {
        outcomes: remediationOutcomes,
        retryAttempted,
        retryChanged,
      },
    };
    extractionUsage = finalAssemblyUsage;
    failureStage = "evidence_cluster";
    const evidenceSummary = await persistEvidenceArtifacts({
      observations: persistedObservations,
      pieces: currentPieces,
      processingRunId: run.id,
      tripId,
    });
    await recordTripProcessingEvent({
      details: { ...evidenceSummary, recoveredObservationCount },
      processingRunId: run.id,
      stage: "evidence_cluster",
      status: "completed",
      tripId,
    });
    failureStage = "assembly";
    const finalizationSummary = summarizeFinalizationUsage(finalAssemblyUsage);
    await recordTripProcessingEvent({
      details: finalizationSummary ?? {},
      processingRunId: run.id,
      stage: "assembly",
      status: "completed",
      tripId,
    });

    failureStage = "quality_assessment";
    await recordTripProcessingEvent({
      details: {
        detectorIncidents: qualityAssessment.report.detectorIncidents,
        outcomes: remediationOutcomes,
        retryAttempted,
        retryChanged,
      },
      processingRunId: run.id,
      stage: "quality_remediation",
      status: "completed",
      tripId,
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
        detectorIncidentCount:
          qualityAssessment.report.detectorIncidents.length,
        fingerprintHash: qualityAssessment.report.fingerprints.hash,
        remediationOutcomeCount: remediationOutcomes.length,
        remediationRetryAttempted: retryAttempted,
        remediationRetryChanged: retryChanged,
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
          finalAssemblyUsage
        ),
        materialCheckpoints: materialCheckpointSummary,
        materialDedupe: preparedMaterials.dedupeSummary,
        ocr: ocrSummary,
        openai: finalAssemblyUsage,
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
