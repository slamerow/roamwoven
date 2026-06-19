import type Stripe from "stripe";
import { getStripeConfig } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { markTripPaid } from "@/lib/trips";

export type CheckoutPaymentRecord = {
  amountTotal: number | null;
  checkoutSessionId: string;
  currency: string | null;
  customerEmail: string | null;
  eventId: string | null;
  ownerUserId: string;
  paymentIntentId: string | null;
  rawEvent: unknown;
  status: string;
  tripId: string;
};

function getPaymentIntentId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export function validateCheckoutSessionPaymentContract({
  amountSubtotal,
  amountTotal,
  currency,
  expectedAmountTotal,
  expectedCurrency,
  expectedPriceId,
  configuredPriceId,
}: {
  amountSubtotal: number | null;
  amountTotal: number | null;
  configuredPriceId: string | null;
  currency: string | null;
  expectedAmountTotal: number;
  expectedCurrency: string | null;
  expectedPriceId: string | null;
}) {
  if (configuredPriceId && expectedPriceId !== configuredPriceId) {
    return false;
  }

  if (!Number.isInteger(expectedAmountTotal)) {
    return false;
  }

  if (amountSubtotal !== expectedAmountTotal) {
    return false;
  }

  if (typeof amountTotal === "number" && amountTotal > expectedAmountTotal) {
    return false;
  }

  if (expectedCurrency && currency !== expectedCurrency) {
    return false;
  }

  return true;
}

function assertCheckoutSessionMatchesRoamwovenPrice(
  session: Stripe.Checkout.Session
) {
  const { tripPriceId } = getStripeConfig();
  const valid = validateCheckoutSessionPaymentContract({
    amountSubtotal: session.amount_subtotal ?? null,
    amountTotal: session.amount_total ?? null,
    configuredPriceId: tripPriceId,
    currency: session.currency ?? null,
    expectedAmountTotal: Number(session.metadata?.expected_amount_total),
    expectedCurrency: session.metadata?.expected_currency ?? null,
    expectedPriceId: session.metadata?.price_id ?? null,
  });

  if (!valid) {
    throw new Error("Checkout session does not match the expected Roamwoven payment contract.");
  }
}

export function createCheckoutPaymentRecord({
  eventId,
  rawEvent,
  session,
}: {
  eventId?: string | null;
  rawEvent: unknown;
  session: Stripe.Checkout.Session;
}): CheckoutPaymentRecord | null {
  const tripId = session.metadata?.trip_id ?? null;
  const ownerUserId = session.metadata?.user_id ?? session.client_reference_id ?? null;

  if (!tripId || !ownerUserId || session.mode !== "payment") {
    return null;
  }

  assertCheckoutSessionMatchesRoamwovenPrice(session);

  return {
    amountTotal: session.amount_total ?? null,
    checkoutSessionId: session.id,
    currency: session.currency ?? null,
    customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
    eventId: eventId ?? null,
    ownerUserId,
    paymentIntentId: getPaymentIntentId(session.payment_intent),
    rawEvent,
    status: session.payment_status,
    tripId,
  };
}

export async function recordCheckoutPaymentAndMarkPaid(
  record: CheckoutPaymentRecord
) {
  if (record.status !== "paid") {
    throw new Error("Checkout session is not paid.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("trip_payment_events").upsert(
    {
      amount_total: record.amountTotal,
      checkout_session_id: record.checkoutSessionId,
      currency: record.currency,
      customer_email: record.customerEmail,
      event_id: record.eventId,
      owner_user_id: record.ownerUserId,
      payment_intent_id: record.paymentIntentId,
      raw_event: record.rawEvent,
      status: record.status,
      trip_id: record.tripId,
    },
    {
      onConflict: record.eventId ? "event_id" : "checkout_session_id",
    }
  );

  if (error) {
    throw new Error(`Unable to record payment event: ${error.message}`);
  }

  await markTripPaid({
    ownerUserId: record.ownerUserId,
    tripId: record.tripId,
  });
}
