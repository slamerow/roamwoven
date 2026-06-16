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

- Beta bypasses payment.
- Public launch should charge before expensive AI extraction.
- Maker app is the user-facing source of truth.
- Database will be the technical source of truth.
- Traveler app should be one hosted template backed by trip snapshots.
- Vercel deployment is deferred because Wren's Adventure may already use the available deployment slot.

## Recommended Next Task

Add Supabase minimally:

1. Configure Supabase env variables.
2. Create `trips` table migration/schema.
3. Add auth helpers.
4. Make create-trip save a real trip.
5. Render maker dashboard from saved trips.

Keep upload/extraction mocked until trip persistence is working.

