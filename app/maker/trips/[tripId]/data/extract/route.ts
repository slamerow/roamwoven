import { NextRequest, NextResponse } from "next/server";
import { hasOpenAIExtractionConfig } from "@/lib/env";
import { extractTripDraftWithOpenAI } from "@/lib/extraction/openai-trip-parser";
import {
  completeTripProcessingRun,
  createTripProcessingRun,
  failTripProcessingRun,
} from "@/lib/extraction/processing-runs";
import { getTripExtractionMaterials } from "@/lib/extraction/trip-materials";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

export const runtime = "nodejs";

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

  if (!hasOpenAIExtractionConfig()) {
    return redirectToData(request, tripId, { error: "extraction-disabled" });
  }

  const uploads = await listTripUploads(tripId);
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
    run = await createTripProcessingRun({ inputCharCount, tripId });
    const result = await extractTripDraftWithOpenAI({
      materials,
      tripName: trip.name,
    });

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

    if (run) {
      await failTripProcessingRun({
        errorMessage: message,
        runId: run.id,
        tripId,
      });
    }

    return redirectToData(request, tripId, { error: "extraction-failed" });
  }
}
