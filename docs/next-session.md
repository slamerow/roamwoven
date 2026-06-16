# Next Session Notes

## Current State

Roamwoven has a complete static beta flow:

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

No backend persistence is wired yet.

## Important Product Decisions

- Beta should use real Stripe Checkout with promo codes/discounts for test users.
- Public launch and beta should charge or explicitly discount before expensive AI extraction.
- Maker app is the user-facing source of truth.
- Database will be the technical source of truth.
- Traveler app should be one hosted template backed by trip snapshots.
- Photos are part of V1, with count/size/retention limits and no video.
- Wren's Adventure remains the user's real trip app and the reference UX for legs, categories, calendar/day views, search, phrases, maps, and mobile cards.
- Vercel deployment is deferred because Wren's Adventure may already use the available deployment slot.

## Recommended Next Task

Add Supabase minimally:

1. Configure Supabase env variables.
2. Create `trips` table migration/schema.
3. Add auth helpers.
4. Make create-trip save a real trip.
5. Render maker dashboard from saved trips.

Keep upload/extraction mocked until trip persistence is working.

After trip persistence is working, wire Stripe Checkout in test mode before building expensive extraction. Promo-code beta should exercise the same paid-trip lifecycle as normal checkout.

Small scaffold already exists:

- `lib/env.ts`
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `db/schema.sql`
- `db/README.md`
