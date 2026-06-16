import { NextRequest, NextResponse } from "next/server";
import {
  canStartStripeCheckout,
  createTripCheckoutSession,
} from "@/lib/billing/stripe";
import { getMakerTrip } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const tripUrl = new URL(`/maker/trips/${tripId}`, request.url);

  if (trip.isDemo) {
    return NextResponse.redirect(tripUrl, 303);
  }

  if (trip.paymentStatus === "paid") {
    return NextResponse.redirect(
      new URL(`/maker/trips/${tripId}/upload`, request.url),
      303
    );
  }

  if (!canStartStripeCheckout()) {
    tripUrl.searchParams.set("checkout", "setup-required");
    return NextResponse.redirect(tripUrl, 303);
  }

  const session = await createTripCheckoutSession(trip);

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return NextResponse.redirect(session.url, 303);
}
