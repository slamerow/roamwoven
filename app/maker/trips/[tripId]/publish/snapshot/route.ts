import { NextRequest, NextResponse } from "next/server";
import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import { recordTripProcessingEvent } from "@/lib/extraction/processing-events";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import { getStructuredReviewCount } from "@/lib/generated-trip-review";
import { publishTripSnapshot } from "@/lib/published-snapshots";
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

    if (!records) {
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

    const reviewCount = getStructuredReviewCount(records);

    if (reviewCount > 0) {
      await recordTripProcessingEvent({
        details: { reviewCount },
        errorMessage: "Open review items block publishing.",
        stage: "publish",
        status: "blocked",
        tripId,
      });
      dataUrl.searchParams.set("error", "review-required");
      return NextResponse.redirect(dataUrl, 303);
    }

    const summary = createGeneratedTripSummaryView(records);

    if (!summary.isReadyForPublishReview) {
      await recordTripProcessingEvent({
        details: {
          counts: summary.counts,
          warningCount: summary.warnings.length,
          warnings: summary.warnings.map((warning) => ({
            id: warning.id,
            severity: warning.severity,
            subjectId: warning.subjectId,
            subjectType: warning.subjectType,
            title: warning.title,
          })),
        },
        errorMessage: "Summary warnings block publishing.",
        stage: "publish",
        status: "blocked",
        tripId,
      });
      const summaryUrl = new URL(`/maker/trips/${tripId}/summary`, request.url);
      summaryUrl.searchParams.set("error", "summary-warning-required");
      return NextResponse.redirect(summaryUrl, 303);
    }

    await recordTripProcessingEvent({
      details: {
        counts: summary.counts,
        dayCount: summary.days.length,
        privateDetailCount: records.privateDetails.length,
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
