import { NextRequest, NextResponse } from "next/server";
import {
  canStartStripeCheckout,
  createTripCheckoutSession,
} from "@/lib/billing/stripe";
import { getCurrentUser } from "@/lib/auth";
import { getTripBuildSettings } from "@/lib/build-settings";
import {
  getMakerNextAction,
  hasConfirmedBuildSettings,
  hasSavedStyleSettings,
} from "@/lib/maker-flow";
import { getTripStyleSettings } from "@/lib/style-settings";
import { getMakerTrip } from "@/lib/trips";
import { listTripUploads } from "@/lib/uploads";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const tripUrl = new URL(`/maker/trips/${tripId}`, request.url);
  const user = await getCurrentUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `/maker/trips/${tripId}`);
    return NextResponse.redirect(loginUrl, 303);
  }

  const trip = await getMakerTrip(tripId);

  if (trip.isDemo) {
    return NextResponse.redirect(tripUrl, 303);
  }

  const [uploads, buildSettings, styleSettings] = await Promise.all([
    listTripUploads(tripId),
    getTripBuildSettings(tripId),
    getTripStyleSettings({ fallbackAppName: trip.name, tripId }),
  ]);
  const nextAction = getMakerNextAction({
    hasBuildSettings: hasConfirmedBuildSettings(buildSettings),
    hasStyleSettings: hasSavedStyleSettings(styleSettings),
    isPaid: trip.paymentStatus === "paid",
    uploadCount: uploads.length,
  });

  if (trip.paymentStatus === "paid") {
    return NextResponse.redirect(
      new URL(`/maker/trips/${tripId}/${nextAction.href}`, request.url),
      303
    );
  }

  if (nextAction.kind === "link") {
    return NextResponse.redirect(
      new URL(`/maker/trips/${tripId}/${nextAction.href}`, request.url),
      303
    );
  }

  if (!canStartStripeCheckout()) {
    tripUrl.searchParams.set("checkout", "setup-required");
    return NextResponse.redirect(tripUrl, 303);
  }

  const session = await createTripCheckoutSession(trip, user);

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return NextResponse.redirect(session.url, 303);
}
