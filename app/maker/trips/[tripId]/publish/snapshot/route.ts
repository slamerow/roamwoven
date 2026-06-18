import { NextRequest, NextResponse } from "next/server";
import { getAppliedTripRecords } from "@/lib/applied-trip-records";
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
      dataUrl.searchParams.set("error", "missing-spine-basics");
      return NextResponse.redirect(dataUrl, 303);
    }

    if (getStructuredReviewCount(records) > 0) {
      dataUrl.searchParams.set("error", "review-required");
      return NextResponse.redirect(dataUrl, 303);
    }

    await publishTripSnapshot({ records, tripId });
    publishUrl.searchParams.set("published", "saved");
    return NextResponse.redirect(publishUrl, 303);
  } catch {
    publishUrl.searchParams.set("error", "publish-failed");
    return NextResponse.redirect(publishUrl, 303);
  }
}
