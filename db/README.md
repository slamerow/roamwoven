# Database Notes

`schema.sql` is the current draft schema. It includes the V1 trip lifecycle fields for payment status, theme pack, password flags, photo metrics, token rotation, and sensitive-field visibility.

Ownership is part of the schema, not just app code:

- `trips.owner_user_id` is required and references `auth.users`.
- Maker tables have Row Level Security enabled.
- Trip-owned child tables are protected through policies that check the owning trip.
- Owner/trip/date indexes are included so dashboard and itinerary queries can scale beyond a small beta.
- Normal maker reads/writes should use the user-scoped Supabase server client.
- Service-role access is reserved for trusted backend jobs, such as Stripe webhook payment updates.
- `trip_processing_runs` logs explicit parsing attempts, model/usage metadata, and failure states.
- `trip_draft_snapshots` stores raw parser JSON drafts before those drafts are converted into editable trip records.

The next database step is to turn this into real Supabase migrations and wire:

1. Auth.
2. Owner-scoped trip creation.
3. Dashboard trip listing.
4. Upload records.
5. Published trip snapshots.
6. Production-safe extraction migrations before enabling `ROAMWOVEN_ENABLE_AI_EXTRACTION`.

The prototype must keep building without Supabase env vars. In that mode, maker routes use the Wren's Adventure demo trip while the production code paths remain Supabase-ready.

## Production Patches

- `production-sql-2026-06-18-review-decisions-and-snapshots.sql`: additive patch for `trip_review_decisions`, `published_trip_snapshots`, and `trips.published_snapshot_id`. Run this before testing deployed review decisions or published traveler snapshots.
