import { NextRequest, NextResponse } from "next/server";
import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import { recordTripProcessingEvent } from "@/lib/extraction/processing-events";
import { publishTripSnapshot } from "@/lib/published-snapshots";
import { assessTripPublishability } from "@/lib/trip-publish-policy";
import { getMakerTrip } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const publishUrl = new URL(`/maker/trips/${tripId}/publish`, request.url);
  const dataUrl = new URL(`/maker/trips/${tripId}/data`, request.url);

  if (trip.isDemo) {
    publishUrl.searchParams.set("published", "demo");
    return NextResponse.redirect(publishUrl, 303);
  }

  if (trip.paymentStatus !== "paid") {
    publishUrl.searchParams.set("error", "checkout-required");
    return NextResponse.redirect(publishUrl, 303);
  }

  try {
    const { records } = await getAppliedTripRecords({
      fallbackTripName: trip.name,
      tripId,
    });

    const publishAssessment = assessTripPublishability(records);

    if (!publishAssessment.canPublish || !records) {
      await recordTripProcessingEvent({
        details: { reason: "records_missing" },
        errorMessage: "Structured records are not available for publishing.",
        stage: "publish",
        status: "blocked",
        tripId,
      });
      dataUrl.searchParams.set("error", "missing-spine-basics");
      return NextResponse.redirect(dataUrl, 303);
    }

    await recordTripProcessingEvent({
      details: {
        counts: publishAssessment.summary.counts,
        dayCount: publishAssessment.summary.days.length,
        hardWarningCount: publishAssessment.hardWarningCount,
        privateDetailCount: records.privateDetails.length,
        reviewCount: publishAssessment.reviewCount,
        semanticDisposition: publishAssessment.semanticDisposition,
      },
      stage: "publish",
      status: "started",
      tripId,
    });
    await publishTripSnapshot({ records, tripId });
    publishUrl.searchParams.set("published", "saved");
    return NextResponse.redirect(publishUrl, 303);
  } catch (error) {
    await recordTripProcessingEvent({
      errorMessage:
        error instanceof Error ? error.message : "Unable to publish trip.",
      stage: "publish",
      status: "failed",
      tripId,
    });
    publishUrl.searchParams.set("error", "publish-failed");
    return NextResponse.redirect(publishUrl, 303);
  }
}
