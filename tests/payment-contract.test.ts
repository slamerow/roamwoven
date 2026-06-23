import assert from "node:assert/strict";
import {
  createCheckoutPaymentEventPayload,
  PAYMENT_EVENT_CONFLICT_TARGET,
  validateCheckoutSessionPaymentContract,
} from "@/lib/billing/payment-events";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("payment contract accepts Stripe promotion discounts", () => {
  assert.equal(
    validateCheckoutSessionPaymentContract({
      amountSubtotal: 2500,
      amountTotal: 0,
      configuredPriceId: "price_trip",
      currency: "usd",
      expectedAmountTotal: 2500,
      expectedCurrency: "usd",
      expectedPriceId: "price_trip",
    }),
    true
  );
});

test("payment contract rejects unexpected subtotal", () => {
  assert.equal(
    validateCheckoutSessionPaymentContract({
      amountSubtotal: 0,
      amountTotal: 0,
      configuredPriceId: "price_trip",
      currency: "usd",
      expectedAmountTotal: 2500,
      expectedCurrency: "usd",
      expectedPriceId: "price_trip",
    }),
    false
  );
});

test("payment contract rejects wrong price id", () => {
  assert.equal(
    validateCheckoutSessionPaymentContract({
      amountSubtotal: 2500,
      amountTotal: 2500,
      configuredPriceId: "price_trip",
      currency: "usd",
      expectedAmountTotal: 2500,
      expectedCurrency: "usd",
      expectedPriceId: "price_other",
    }),
    false
  );
});

test("payment event writes use checkout session as the canonical idempotency key", () => {
  assert.equal(PAYMENT_EVENT_CONFLICT_TARGET, "checkout_session_id");
});

test("checkout-return payment payload cannot erase webhook event metadata", () => {
  const payload = createCheckoutPaymentEventPayload({
    amountTotal: 2500,
    checkoutSessionId: "cs_test_123",
    currency: "usd",
    customerEmail: "traveler@example.com",
    eventId: null,
    ownerUserId: "user_123",
    paymentIntentId: "pi_123",
    rawEvent: { source: "checkout_return" },
    status: "paid",
    tripId: "trip_123",
  });

  assert.equal(payload.checkout_session_id, "cs_test_123");
  assert.equal("event_id" in payload, false);
  assert.equal("raw_event" in payload, false);
});

test("webhook payment payload preserves Stripe event metadata", () => {
  const rawEvent = { id: "evt_123", type: "checkout.session.completed" };
  const payload = createCheckoutPaymentEventPayload({
    amountTotal: 2500,
    checkoutSessionId: "cs_test_123",
    currency: "usd",
    customerEmail: "traveler@example.com",
    eventId: "evt_123",
    ownerUserId: "user_123",
    paymentIntentId: "pi_123",
    rawEvent,
    status: "paid",
    tripId: "trip_123",
  });

  assert.equal(payload.checkout_session_id, "cs_test_123");
  assert.equal(payload.event_id, "evt_123");
  assert.deepEqual(payload.raw_event, rawEvent);
});
