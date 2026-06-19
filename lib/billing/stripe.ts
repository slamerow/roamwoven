import Stripe from "stripe";
import { getStripeConfig, hasStripeCheckoutConfig } from "@/lib/env";
import type { AuthUser } from "@/lib/auth";
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

export async function createTripCheckoutSession(trip: MakerTrip, user: AuthUser) {
  const config = getStripeConfig();

  if (!config.tripPriceId) {
    throw new Error("STRIPE_TRIP_PRICE_ID is not configured.");
  }

  const stripe = createStripeClient();
  const appUrl = config.appUrl.replace(/\/$/, "");
  const price = await stripe.prices.retrieve(config.tripPriceId);
  const expectedAmountTotal = price.unit_amount;
  const expectedCurrency = price.currency;

  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price: config.tripPriceId,
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: {
      expected_amount_total:
        typeof expectedAmountTotal === "number" ? String(expectedAmountTotal) : "",
      expected_currency: expectedCurrency,
      price_id: config.tripPriceId,
      trip_id: trip.id,
      trip_name: trip.name,
      user_id: user.id,
    },
    payment_intent_data: {
      receipt_email: user.email ?? undefined,
      metadata: {
        trip_id: trip.id,
        user_id: user.id,
      },
    },
    success_url: `${appUrl}/maker/trips/${trip.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/maker/trips/${trip.id}?checkout=cancelled`,
  });
}

export async function getPaidCheckoutTripId(sessionId: string) {
  const config = getStripeConfig();
  const stripe = createStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return null;
  }

  const expectedAmountTotal = Number(session.metadata?.expected_amount_total);
  const expectedCurrency = session.metadata?.expected_currency ?? null;
  const expectedPriceId = session.metadata?.price_id ?? null;

  if (
    config.tripPriceId &&
    (!expectedPriceId || expectedPriceId !== config.tripPriceId)
  ) {
    return null;
  }

  if (
    !Number.isInteger(expectedAmountTotal) ||
    session.amount_total !== expectedAmountTotal
  ) {
    return null;
  }

  if (!expectedCurrency || session.currency !== expectedCurrency) {
    return null;
  }

  return {
    amountTotal: session.amount_total ?? null,
    checkoutSessionId: session.id,
    currency: session.currency ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    tripId: session.metadata?.trip_id ?? null,
    userId: session.metadata?.user_id ?? session.client_reference_id ?? null,
  };
}
