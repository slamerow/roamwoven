import { NextRequest, NextResponse } from "next/server";
import { createStripeClient } from "@/lib/billing/stripe";
import {
  createCheckoutPaymentRecord,
  recordCheckoutPaymentAndMarkPaid,
} from "@/lib/billing/payment-events";
import { getStripeConfig } from "@/lib/env";

export async function POST(request: NextRequest) {
  const { webhookSecret } = getStripeConfig();

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  const body = await request.text();
  const stripe = createStripeClient();
  const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const record = createCheckoutPaymentRecord({
      eventId: event.id,
      rawEvent: event,
      session,
    });

    if (record) {
      await recordCheckoutPaymentAndMarkPaid(record);
    }
  }

  return NextResponse.json({ received: true });
}
