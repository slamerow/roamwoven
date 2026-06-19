import assert from "node:assert/strict";
import { validateCheckoutSessionPaymentContract } from "@/lib/billing/payment-events";

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
