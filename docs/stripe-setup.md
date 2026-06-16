# Stripe Setup

Roamwoven uses Stripe Checkout for a one-time trip build payment.

## Test Mode Setup

1. Create or sign into a Stripe account.
2. Stay in test mode while wiring the first end-to-end flow.
3. Create a product:
   - Name: `Roamwoven Trip App Build`
   - Price: `$25.00 USD`
   - Billing: one-time
4. Copy the price ID. It starts with `price_`.
5. Copy the secret API key. It starts with `sk_test_`.
6. Create a webhook endpoint:
   - URL: `https://roamwoven.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
7. Copy the webhook signing secret. It starts with `whsec_`.

## Vercel Environment Variables

Set these for Production and Preview:

```txt
STRIPE_SECRET_KEY=sk_test_...
STRIPE_TRIP_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://roamwoven.com
```

`SUPABASE_SERVICE_ROLE_KEY` is required because Stripe webhooks and successful
Checkout returns need a trusted server path to mark a trip paid.

After changing Vercel env vars, redeploy the app.

## Test Checkout

1. Sign in to `https://roamwoven.com/maker`.
2. Create a test trip.
3. Click `Continue to payment`.
4. Use Stripe test card `4242 4242 4242 4242`, any future expiration date, any
   CVC, and any ZIP.
5. After Stripe redirects back, the trip should show payment complete and unlock
   upload.
6. Upload a small test file or pasted note.
7. Refresh and confirm the saved material remains visible.

## Live Mode

Switch to live keys only after:

- Test checkout redirects correctly.
- The webhook marks trips paid.
- Uploads save after payment.
- Stripe branding and enabled payment methods look acceptable.
- Tax/account settings have been reviewed.
