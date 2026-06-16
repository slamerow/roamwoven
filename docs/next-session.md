# Next Session Notes

## Current State

Roamwoven has a static beta flow plus the first backend-ready trip lifecycle:

`/maker` -> `/maker/trips/demo-trip` -> upload -> review -> clean data -> style -> publish -> `/t/demo`

The app uses the Asia workbook as seed data:

- 25 trip legs.
- 313 activity/cards.
- Real seed file: `data/asia-trip-seed.json`.
- Importer: `scripts/import-asia-workbook.py`.

Interactive local-only UI exists for:

- Upload intake.
- Review questions.
- Style settings.
- Publish actions.

Backend-ready pieces now exist:

- `db/schema.sql` includes V1 trip fields for payment status, theme pack, password flags, photo metrics, and sensitive-field visibility.
- `db/schema.sql` also includes owner-scoped RLS policies and owner/trip/date indexes for scale.
- Magic-link auth scaffold exists at `/login`, `/auth/magic-link`, `/auth/callback`, and `/auth/sign-out`.
- Maker pages require auth when Supabase env vars are configured.
- `lib/trips.ts` lists, loads, and creates trips through Supabase when env vars are configured.
- Real trip queries and inserts are scoped by `owner_user_id`.
- Without Supabase env vars, the maker flow falls back to the Wren's Adventure demo trip.
- Real trip upload is gated behind payment status.
- Stripe Checkout scaffolding exists with promotion-code support and env placeholders.
- The Stripe webhook route can mark trips paid after `checkout.session.completed` through a narrow service-role backend path.

Live Supabase dev setup is partially complete:

- Supabase project created: `roamwoven-dev`.
- Project ref: `zijriyeydlupaqpxhiyb`.
- Project URL: `https://zijriyeydlupaqpxhiyb.supabase.co`.
- Local `.env.local` exists and is gitignored.
- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is still blank because clipboard access from the Codex browser was blocked; it is only needed for trusted backend jobs like the Stripe webhook payment update.
- `NEXT_PUBLIC_APP_URL` is set to `http://localhost:3000` because the current local dev server is running on port 3000.
- `db/schema.sql` was pasted and run successfully in Supabase SQL editor.
- The later table grants have now run successfully in Supabase.
- Vercel project is created from `slamerow/roamwoven` on `main`.
- Production deployment URL: `https://roamwoven.vercel.app`.
- Vercel env vars set for Production and Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL=https://roamwoven.com`.
- `roamwoven.com` has been purchased through Porkbun.
- Vercel has been upgraded to Pro and `roamwoven.com` has been added to the Roamwoven project.
- Porkbun DNS now points the apex domain at Vercel:
  - A record: `roamwoven.com` -> `216.150.1.1`
  - External DNS check returned `216.150.1.1`.
  - `https://roamwoven.com` returns HTTP 200 from Vercel.
  - `http://roamwoven.com` redirects to HTTPS.
- The Porkbun email-forwarding MX/TXT records were left in place. The old root ALIAS to Porkbun parking was removed.
- Supabase Auth URL configuration is updated:
  - Site URL: `https://roamwoven.com`
  - Redirect URL allow-list: `https://roamwoven.vercel.app/auth/callback`
  - Redirect URL allow-list: `https://roamwoven.com/auth/callback`
- Vercel was redeployed after the `NEXT_PUBLIC_APP_URL` change. Deployment `3zmfrE3f5` is Ready, Current, and assigned to `roamwoven.com`.
- `https://roamwoven.com/login?next=%2Fmaker` returns HTTP 200 and is open in the Codex browser for testing.
- Magic-link email was received at `ekamerow@gmail.com`, and clicking it reached the app callback.
- After callback, `/maker` hit `permission denied for table trips`, meaning auth worked but table grants were still insufficient.
- A first grant patch was run, but `/maker` still showed permission denied.
- A second grant patch was attempted but pasted onto old SQL text and failed with syntax error near `usage`.
- On 2026-06-16, a new magic-link request from the local app reached Supabase but failed because the local sandbox had no network access. Retrying with network access confirmed Supabase is reachable but currently returning `over_email_send_rate_limit` / HTTP 429 for `ekamerow@gmail.com`.
- On 2026-06-16, the deployed Vercel app loaded at `https://roamwoven.vercel.app/login?next=%2Fmaker`, but requesting a magic link still returned `send-failed`. A direct Supabase OTP request using the Vercel callback URL confirmed the underlying cause is still `over_email_send_rate_limit` / HTTP 429 for `ekamerow@gmail.com`.
- `app/auth/magic-link/route.ts` now logs non-secret Supabase error metadata on magic-link send failure so the next failure cause is visible in the dev server log.
- On 2026-06-16, a magic-link email sent successfully from `https://roamwoven.com`, but clicking it landed on `/login?error=auth-failed`. Magic links are now treated as fallback instead of the primary beta testing path.
- `app/auth/callback/route.ts` now supports both Supabase `code` and `token_hash` callback shapes and logs non-secret callback failure metadata.
- `app/auth/password/route.ts` adds Supabase email/password sign-in and account creation so beta testing is not blocked by magic-link delivery/callback fragility.
- Password reset scaffold now exists at `/reset-password` and `/reset-password/update`, with Supabase recovery email and password update routes.
- Localhost testing from Codex is proving unreliable: the Next dev server can be listening while the in-app browser or shell cannot reach the local port. A Vercel preview deployment is likely the easiest way for the user to test auth and trip creation directly.

Supabase grants that should be present:

```sql
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on trips to anon, authenticated;
grant select, insert, update, delete on trip_uploads to anon, authenticated;
grant select, insert, update, delete on trip_legs to anon, authenticated;
grant select, insert, update, delete on trip_items to anon, authenticated;
```

The grants have now been run successfully. If the schema is recreated, rerun this block in a clean SQL editor.

## Important Product Decisions

- Beta should use real Stripe Checkout with promo codes/discounts for test users.
- Public launch and beta should charge or explicitly discount before expensive AI extraction.
- Maker app is the user-facing source of truth.
- Database will be the technical source of truth.
- Traveler app should be one hosted template backed by trip snapshots.
- Photos are part of V1, with count/size/retention limits and no video.
- Wren's Adventure remains the user's real trip app and the reference UX for legs, categories, calendar/day views, search, phrases, maps, and mobile cards.
- Generated apps should not force travel modules. If a customer does not include flights, the traveler app should not show a flight placeholder just to fill a template.
- Roamwoven is deployed on Vercel Pro and the custom domain is live at `https://roamwoven.com`.
- The landing page should be the public product homepage, not a login-first surface. It should explain what Roamwoven does, use real/generated traveler-app screenshots as the money piece, and can later include clickable demos or embedded previews. Login should be a clear action from the homepage, not the homepage itself.
- The public demo should not remain the thin scaffold currently at `/t/demo`. It should use the Wren's Adventure traveler-app shell or at least screenshots/clickable captures of that richer experience, because the polished traveler app is the core proof point.
- Landing page direction: tagline is "The superapp for your next adventure." Add a "Perfect for" section, and later show both finished app screenshots and shots of the prompt/building phase.
- Future spinout idea after Roamwoven is solid: clone the core builder/template architecture into a separate bachelor/bachelorette party app with different marketing, custom UI, bill-splitting features, and likely higher pricing. Keep Roamwoven fully built first so this can be launched as a vertical clone rather than a distraction.

## Recommended Next Task

Finish Supabase auth/database verification, then move into upload persistence:

1. Use the custom domain for testing: `https://roamwoven.com/login?next=%2Fmaker`.
2. Deploy the password-login/callback patch.
3. Create or sign into a Supabase password account.
4. Confirm `/maker` shows the signed-in dashboard rather than the old permission error.
5. Create a real test trip and confirm it inserts with `owner_user_id`.
6. Verify a logged-in user only sees their own trips; direct RLS two-user testing can wait until a second test account exists.
7. Create Stripe account/product/price when the business setup is ready.
8. Set `STRIPE_SECRET_KEY`, `STRIPE_TRIP_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`.
9. Add paid-trip upload records and Supabase Storage.

Keep upload/extraction mocked until trip persistence is working.

Promo-code beta should exercise the same paid-trip lifecycle as normal checkout. Keep expensive extraction mocked until payment and owner-scoped trip persistence are both working.

Small scaffold already exists:

- `lib/env.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `db/schema.sql`
- `db/README.md`
- `lib/billing/stripe.ts`
- `app/maker/trips/[tripId]/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`
- `lib/auth.ts`
- `app/login/page.tsx`
