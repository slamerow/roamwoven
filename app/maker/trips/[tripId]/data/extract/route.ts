import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  hasOpenAIExtractionConfig,
  isTripAllowedForOpenAIExtraction,
} from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import {
  completeTripProcessingRun,
  createTripProcessingRun,
  failTripProcessingRun,
  getLatestTripDraftSnapshot,
} from "@/lib/extraction/processing-runs";
import {
  assertTripSpineBasics,
  MissingTripSpineBasicsError,
} from "@/lib/extraction/trip-spine-validation";
import { getTripExtractionMaterials } from "@/lib/extraction/trip-materials";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads, type TripUpload } from "@/lib/uploads";

export const runtime = "nodejs";

function getInitialParseIdempotencyKey(uploads: TripUpload[]) {
  const identity = uploads
    .map((upload) => ({
      hash: upload.contentSha256,
      id: upload.id,
      name: upload.originalFilename,
      size: upload.fileSizeBytes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
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
  const latestDraft = await getLatestTripDraftSnapshot(tripId);

  if (latestDraft || ["parsed", "generated", "publishing", "published"].includes(trip.processingStatus)) {
    return redirectToData(request, tripId, { error: "spine-exists" });
  }

  const materials = await getTripExtractionMaterials(uploads);

  if (materials.length === 0) {
    return redirectToData(request, tripId, { error: "no-text-materials" });
  }

  const inputCharCount = materials.reduce(
    (sum, material) => sum + material.text.length,
    0
  );
  let run: Awaited<ReturnType<typeof createTripProcessingRun>> | null = null;

  try {
    run = await createTripProcessingRun({
      idempotencyKey: getInitialParseIdempotencyKey(uploads),
      inputCharCount,
      sourceUploadIds: uploads.map((upload) => upload.id),
      tripId,
    });
    const result = await extractTripDraftWithOpenAI({
      materials,
      tripName: trip.name,
    });

    assertTripSpineBasics(result.draft);

    await completeTripProcessingRun({
      draftJson: result.draft,
      model: result.model,
      runId: run.id,
      tripId,
      usage: result.usage,
    });

    return redirectToData(request, tripId, { extraction: "completed" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Trip extraction failed.";
    const errorCode =
      error instanceof MissingTripSpineBasicsError
        ? "missing-spine-basics"
        : "extraction-failed";

    if (run) {
      await failTripProcessingRun({
        errorMessage: message,
        runId: run.id,
        tripId,
      });
    }

    return redirectToData(request, tripId, { error: errorCode });
  }
}
