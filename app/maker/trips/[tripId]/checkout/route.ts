import { NextRequest, NextResponse } from "next/server";
import {
  canStartStripeCheckout,
  createTripCheckoutSession,
} from "@/lib/billing/stripe";
import { getCurrentUser, hasSupabaseServerConfig } from "@/lib/auth";
import { getMakerTrip } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const tripUrl = new URL(`/maker/trips/${tripId}`, request.url);

  if (hasSupabaseServerConfig()) {
    const user = await getCurrentUser();

    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `/maker/trips/${tripId}`);
      return NextResponse.redirect(loginUrl, 303);
    }
  }

  const trip = await getMakerTrip(tripId);

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
