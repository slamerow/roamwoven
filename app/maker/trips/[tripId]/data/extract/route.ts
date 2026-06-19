import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getOpenAIConfig,
  hasOpenAIExtractionConfig,
  isTripAllowedForOpenAIExtraction,
} from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import {
  completeTripProcessingRun,
  createTripProcessingRun,
  DuplicateProcessingRunError,
  failTripProcessingRun,
  getLatestTripDraftSnapshot,
  getLatestTripProcessingRun,
} from "@/lib/extraction/processing-runs";
import {
  assertTripSpineBasics,
  MissingTripSpineBasicsError,
} from "@/lib/extraction/trip-spine-validation";
import { getTripExtractionMaterials } from "@/lib/extraction/trip-materials";
import {
  optimizeTripExtractionMaterials,
  type MaterialBudgetSummary,
} from "@/lib/extraction/material-budget";
import { listMaterialExtractionCheckpoints } from "@/lib/extraction/material-extractions";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads, type TripUpload } from "@/lib/uploads";

export const runtime = "nodejs";

function getInitialParseIdempotencyKey({
  failedRunId,
  uploads,
}: {
  failedRunId?: string;
  uploads: TripUpload[];
}) {
  const identity = uploads
    .map((upload) => ({
      hash: upload.contentSha256,
      id: upload.id,
      name: upload.originalFilename,
      size: upload.fileSizeBytes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha256")
    .update(JSON.stringify({ failedRunId: failedRunId ?? null, identity }))
    .digest("hex");
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

  const materials = await getTripExtractionMaterials(uploads);
  const materialCheckpoints = await listMaterialExtractionCheckpoints(tripId);
  const materialCheckpointSummary =
    summarizeMaterialCheckpoints(materialCheckpoints);

  if (materials.length === 0) {
    return redirectToData(request, tripId, { error: "no-text-materials" });
  }

  const optimizedMaterials = optimizeTripExtractionMaterials({
    materials,
    totalCharBudget: getOpenAIConfig().maxInputChars,
  });
  const inputCharCount = optimizedMaterials.summary.submittedCharCount;

  if (optimizedMaterials.materials.length === 0 || inputCharCount === 0) {
    return redirectToData(request, tripId, { error: "no-text-materials" });
  }

  console.info("trip_extraction_materials_ready", {
    estimatedInputTokens: optimizedMaterials.summary.estimatedInputTokens,
    materialCount: optimizedMaterials.summary.materialCount,
    materialTypes: Array.from(new Set(optimizedMaterials.materials.map((material) => material.type))),
    rawCharCount: optimizedMaterials.summary.rawCharCount,
    statusCounts: materialCheckpointSummary.byStatus,
    submittedCharCount: optimizedMaterials.summary.submittedCharCount,
    truncatedMaterialCount: optimizedMaterials.summary.truncatedMaterialCount,
    tripId,
  });
  let run: Awaited<ReturnType<typeof createTripProcessingRun>> | null = null;
  let extractionUsage: unknown = null;

  try {
    run = await createTripProcessingRun({
      idempotencyKey: getInitialParseIdempotencyKey({
        failedRunId: latestRun?.status === "failed" ? latestRun.id : undefined,
        uploads,
      }),
      inputCharCount,
      sourceUploadIds: uploads.map((upload) => upload.id),
      tripId,
    });
    const result = await extractTripDraftWithOpenAI({
      materials: optimizedMaterials.materials,
      tripName: trip.name,
    });
    extractionUsage = result.usage;

    assertTripSpineBasics(result.draft);

    await completeTripProcessingRun({
      draftJson: result.draft,
      model: result.model,
      runId: run.id,
      tripId,
      usage: {
        materialBudget: withRunInputEstimate(
          optimizedMaterials.summary,
          result.usage
        ),
        materialCheckpoints: materialCheckpointSummary,
        openai: result.usage,
      },
    });

    return redirectToData(request, tripId, { extraction: "completed" });
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
      error instanceof MissingTripSpineBasicsError
        ? "missing-spine-basics"
        : "extraction-failed";

    if (run) {
      await failTripProcessingRun({
        errorMessage: message,
        failureDetails:
          error && typeof error === "object" && "details" in error
            ? {
                materialBudget: withRunInputEstimate(
                  optimizedMaterials.summary,
                  extractionUsage
                ),
                materialCheckpoints: materialCheckpointSummary,
                openaiError: (error as { details?: unknown }).details,
              }
            : {
                materialBudget: withRunInputEstimate(
                  optimizedMaterials.summary,
                  extractionUsage
                ),
                materialCheckpoints: materialCheckpointSummary,
              },
        runId: run.id,
        tripId,
      });
    }

    return redirectToData(request, tripId, { error: errorCode });
  }
}
