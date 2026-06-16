import Stripe from "stripe";
import { getStripeConfig, hasStripeCheckoutConfig } from "@/lib/env";
import type { MakerTrip } from "@/lib/trips";

export function canStartStripeCheckout() {
  return hasStripeCheckoutConfig();
}

export function getStripeSetupState() {
  const config = getStripeConfig();

  return {
    hasSecretKey: Boolean(config.secretKey),
    hasTripPriceId: Boolean(config.tripPriceId),
    hasWebhookSecret: Boolean(config.webhookSecret),
  };
}

export function createStripeClient() {
  const { secretKey } = getStripeConfig();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
  });
}

export async function createTripCheckoutSession(trip: MakerTrip) {
  const config = getStripeConfig();

  if (!config.tripPriceId) {
    throw new Error("STRIPE_TRIP_PRICE_ID is not configured.");
  }

  const stripe = createStripeClient();
  const appUrl = config.appUrl.replace(/\/$/, "");

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: config.tripPriceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    metadata: {
      trip_id: trip.id,
      trip_name: trip.name,
    },
    success_url: `${appUrl}/maker/trips/${trip.id}?checkout=success`,
    cancel_url: `${appUrl}/maker/trips/${trip.id}?checkout=cancelled`,
  });
}
