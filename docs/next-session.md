# Next Session Notes

## Current State

Roamwoven has a static beta flow plus the first backend-ready trip lifecycle:

`/maker` -> `/maker/trips/demo-trip` -> upload -> review -> style -> draft review -> summary -> publish -> `/t/demo`

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
- `lib/uploads.ts` stores paid-trip materials in Supabase Storage and creates owner-scoped `trip_uploads` rows.
- The upload page now posts real multipart uploads, shows saved materials after refresh, and keeps upload processing gated behind payment.
- Saved materials can be deleted before generation/processing starts, so bad test inputs can be removed and replaced. Material edits should lock once parsing/generation begins; future revisions should use a revision flow instead of mutating source inputs in place.
- Source-material abuse caps are enforced in the app: 25 MB per file, 20 files per upload request, 100 saved materials per trip, 500 MB total source-material bytes per trip, and 250 KB pasted notes per upload.
- Duplicate source-material uploads are now blocked before save using SHA-256 content hashes, with filename/size as a fallback signal. `trip_uploads.content_sha256` has a per-trip unique index, so concurrent duplicate uploads should fail even if two requests race.
- Production sequencing: before deploying code that reads/writes upload hashes, run the additive SQL for `trip_uploads.content_sha256`, `trip_uploads.source_kind`, `trip_processing_runs.idempotency_key`, `trip_processing_runs.source_upload_ids`, and the two unique indexes in `db/schema.sql`.
- Without Supabase env vars, the maker flow falls back to the Wren's Adventure demo trip.
- Real trip upload is gated behind payment status.
- Stripe Checkout scaffolding exists with promotion-code support and env placeholders.
- The Stripe webhook route can mark trips paid after `checkout.session.completed` through a narrow service-role backend path.
- Checkout sessions now include signed-in user metadata, prefill customer email when available, and return with `session_id` so the workspace can verify a completed payment immediately if the webhook is still catching up.
- Stripe setup checklist lives in `docs/stripe-setup.md`.
- Stripe test checkout has been verified end to end. A test payment redirected back to Roamwoven, and after adding `service_role` grants in Supabase the trip moved to paid, showed `Step 2 of 5 complete`, and unlocked upload.
- The paid checkout workspace state is now designed as a collapsed green `Checkout complete` bar with `Continue to upload`.
- Production upload setup has now been verified on the Stripe-paid trip `e50f7e93-b2e9-4b8c-9097-92fce402d885`.
  - The first upload-page refresh failed because production was missing `trip_uploads.file_size_bytes`.
  - The corrected storage migration was run in Supabase using `trips.owner_user_id` and the `userId/tripId/...` storage path shape.
  - `https://roamwoven.com/maker/trips/e50f7e93-b2e9-4b8c-9097-92fce402d885/upload` now loads.
  - A notes-only intake item saved successfully and persisted after refresh as a real `trip_uploads` row.
- The review step now uses the actual trip and saved upload state. Step 4 lets the maker choose optional app sections, confirm skipped modules stay hidden, and continue to the mocked clean-data step only after confirmation.
- Step 4 build choices now persist to `trip_build_settings` before moving to clean data. The table is owner-scoped through the parent trip, and the clean-data screen can show selected modules.
- The maker flow is now intended as four screens after upload: content scope -> design -> draft review -> trip summary. Design choices persist to `trip_style_settings`; the draft review screen keeps uncertain/private items in a focused review queue, and the trip summary is the "does this look right?" gate before publish.
- The clean-data step now names the actual trip and shows saved source materials, while still using reference structured data for demo trips until extraction is connected.
- The draft review / structured data screen has been simplified:
  - Demo trips show a compact scan summary and focused review queue instead of all extracted records.
  - Real paid trips do not show fake parsed review cards. They show a parse action, a scan summary after parsing, and only missing/sensitive details that need a decision.
  - Confident records should not be surfaced line-by-line in V1 review unless there is a meaningful question.
  - Sensitive details are represented as card-detail protection candidates; the privacy model still needs refinement before launch.
- The design picker keeps dropdowns for secondary/accent/soft colors and now also lets makers click the visible swatches.
- OpenAI extraction setup scaffolding exists and is connected to a guarded maker action:
  - `lib/ai/openai.ts` wraps the Responses API behind `OPENAI_API_KEY` and `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`.
  - `lib/extraction/openai-trip-parser.ts` defines the first trip-draft structured output schema and prompt.
  - `.env.example` includes OpenAI extraction env vars with extraction disabled by default.
  - Setup and cost guardrails are documented in `docs/openai-extraction-setup.md`.
- The first explicit paid `Build parsed draft` action now exists for pasted notes, small `.txt` uploads, and readable text-based PDFs:
  - Route: `app/maker/trips/[tripId]/data/extract/route.ts`.
  - It requires a paid trip, OpenAI config, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, and at least one parseable material.
  - It extracts normal PDF text locally before the OpenAI call. It does not OCR scanned/image-only PDFs yet.
  - It checkpoints each uploaded material in `trip_material_extractions` before the model call as text-ready, OCR-needed, unsupported, or failed. This is internal only; the maker still sees one build action.
  - The OCR lane now has a first OpenAI Responses provider path. The route runs a capped OCR pass for OCR-needed images/PDFs, writes OCR text back as `text_ready`, then gives normalized text to the trip draft model. `OPENAI_OCR_MAX_FILES_PER_RUN` limits beta cost/blast radius.
  - It now normalizes and caps extracted materials before the OpenAI call so ugly documents cannot make model input scale linearly with document mess. Raw-vs-submitted character counts, estimated input tokens, and trimmed material count are stored internally in `trip_processing_runs.openai_usage.materialBudget`.
  - Material-budget telemetry is for future admin/support observability only; do not surface it to maker or traveler UI.
  - It logs `trip_processing_runs`, stores raw JSON in `trip_draft_snapshots`, and updates `trips.processing_status`.
  - The additive DB SQL for `trip_material_extractions` has been run successfully in Supabase. Patch file: `db/production-sql-2026-06-19-material-extraction-checkpoints.sql`. Verification returned `found_count = 13`, `expected_count = 13`, and no missing table/column/index objects.
- Important deployment sequencing rule: when code starts reading or writing a new Supabase table, run the matching production SQL/grants/RLS before asking the user to push/test the deployed app. Otherwise the UI can ship before the database contract exists and fail for non-technical testers.
- The trip workspace now resumes from the next incomplete step instead of always sending paid trips back to upload:
  - no uploads -> upload
  - uploads saved but no content settings -> content scope
  - content settings saved but no design settings -> design
  - design settings saved -> draft review
  - parsed draft reviewed -> trip summary before publish
- The Step 4 content-scope progress bar should stay fixed while the maker checks confirmations. Checkboxes can unlock the "Continue to design" action, but should not mark the top step track complete before the settings save succeeds.
- Maker progress is now a shared seven-step component shown across the workspace, upload, app sections, design, process/review, summary, and publish pages: Start trip -> Add materials -> App sections -> Design -> Process -> Review -> Publish. Checkout/payment should not be presented as one of the traveler-app build steps.
- Later maker pages now provide direct navigation back to app setup and design, so Draft Review is not a one-way funnel.
- Every maker step should include a dashboard/workspace navigation path. The shared progress component now includes Dashboard and Trip workspace links.
- The design page must preview the actual Wren-style traveler app architecture, not generic sample cards. The Wren-style shell is the source of truth for generated app structure.
- The whimsical/fantasy preview had a contrast bug where light text could sit on a light hero background. Keep theme previews accessible regardless of primary/accent color choices.
- Quiet luxury is the shared baseline for every design direction, not a fourth theme. Modern/Futuristic, Rustic/Adventure, and Whimsical/Fantasy should differ by atmosphere while staying premium, readable, and restrained.
- Trip names can be edited from the trip workspace header with the pencil affordance. The Design page's app name field controls the traveler-facing app title.
- Document-update rule: before the first build, the maker can add/delete source materials freely. After the trip spine exists, late documents should be treated as limited app updates that append/modify structured trip records, not a full rebuild. V1 can frame this as a small update lane, such as up to 3 simple late docs.
- Do not rebuild a trip from scratch after the core/spine is built. Updates should patch the existing structured trip data and refresh the app snapshot. If source materials are not enough to build the V1 trip spine, do not produce a thin app; stop and ask for the missing basics such as dates, destinations, stays, transport, or anchor plans.
- The initial parse route now refuses to run if the trip is already processing or a draft/spine already exists. The first parsed draft is validated for V1 spine basics before a snapshot is saved.
- The draft-review screen now derives its first review surface from the generated trip model instead of a flat parser queue. The review contract lives in `lib/generated-trip-review.ts`. When a parsed draft exists, it says what Roamwoven found in human terms, such as legs across days plus flights/stays/activities, and shows the number of things the maker needs to confirm before the traveler app is assembled.
- The model-backed draft-review sections are Places, Stays, Transport, Cards, Private details, and Questions. Confident records stay summarized; only records/questions marked for review expand into confirmation cards.
- Draft day generation in `lib/extraction/draft-to-structured-trip.ts` treats intermediate leg leave dates as overlap boundaries, but includes the final leg leave date as the travel-home day. A Sep 1 to Sep 3 final leg creates Sep 1, Sep 2, and Sep 3 as trip days; intermediate leg leave dates are still covered by the next leg's arrive date or dated transport records.
- The generated-trip review decision contract now exists in `lib/generated-trip-decisions.ts`. Decisions are confirm, edit, protect, delete/ignore, combine, and answer-question. Delete/ignore marks records as `ignored`; protect changes visibility; answer-question records the answer and should resolve into one of the other structured operations.
- Review-decision persistence now exists in `db/schema.sql` and `lib/review-decisions.ts`. The table is `trip_review_decisions`, with action/subject columns plus `payload_json` for action-specific fields. The additive production SQL in `db/production-sql-2026-06-18-review-decisions-and-snapshots.sql` has been run successfully in Supabase.
- The structured draft-review cards now write decisions through `app/maker/trips/[tripId]/data/decisions/route.ts`. Confirm, Protect, Ignore, Mark answered, record-specific Edit forms, and item Combine persist to `trip_review_decisions`; the page reloads from structured records plus applied saved decisions so resolved items leave the queue.
- The trip summary page now reads from applied structured records rather than raw `draft_json` arrays. `lib/generated-trip-summary.ts` produces the title, destination/date range, active record counts, and unresolved-review status after saved review decisions are applied.
- Published traveler snapshots now have a first backend contract: `published_trip_snapshots` in `db/schema.sql`, `lib/published-snapshots.ts`, `app/maker/trips/[tripId]/publish/snapshot/route.ts`, and token rendering in `app/t/[token]/page.tsx`. `SUPABASE_SERVICE_ROLE_KEY` is configured in Vercel for Production and Preview; `/t/demo` remains the local fallback.
- Production QA validation passed on a disposable trip `82e1834c-efaf-4409-929e-542aa881c24e`: Confirm, Protect, Mark answered, summary update, publish snapshot creation, and real `/t/[token]` rendering all worked. The disposable trip was deleted afterward, and its generated token returned 404 after cleanup.
- OpenAI extraction is now ready for a controlled first production test once Vercel env vars are added:
  - `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` gates extraction to selected trip IDs when set.
  - The server POST route rejects non-allowlisted trips even if someone bypasses the disabled button.
  - The draft-review page checks trip-specific extraction eligibility before enabling `Build parsed draft`.
  - Use the paid Central Europe trip `e50f7e93-b2e9-4b8c-9097-92fce402d885` as the first allowlisted trip.
  - Vercel now has `OPENAI_EXTRACTION_MODEL`, `OPENAI_EXTRACTION_MAX_INPUT_CHARS`, `OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS`, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, and `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS=e50f7e93-b2e9-4b8c-9097-92fce402d885`.
  - Vercel still does not have `OPENAI_API_KEY`. Do not add the key until the allowlist code is pushed and deployed.
- Extraction gate decision for repeated paid QA: during active beta testing, it is reasonable to remove/blank `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` so every paid trip can run the first extraction. This is not fully broad public extraction because the route still requires paid checkout, `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`, an OpenAI key, parseable materials, and the idempotent one-build guard. After changing Vercel env vars, redeploy before testing.
- First extraction QA on the paid Andalucia dummy trip `bc773119-703b-4292-8fe1-fa7dbe46de0f` found PDF ingestion issues before any OpenAI call:
  - The first deployed attempt failed with `DOMMatrix is not defined`; this was fixed by adding a minimal server-side `DOMMatrix` shim before loading PDF tooling.
  - The next deployed attempt failed with `Cannot find module '/var/task/.next/server/chunks/pdf.worker.mjs'` while trying to read the uploaded PDF; this was a PDF worker/bundling problem, not a storage or OpenAI problem.
  - The extraction material reader now uses `pdfjs-dist/legacy/build/pdf.mjs` directly for text-only PDF extraction and removes the unused `pdf-parse` dependency. This should be deployed before asking the user to click `Build parsed draft` again.
- Cost-control guardrail: the initial parse button is now framed as a one-time build for the saved material set. The client disables the submit button while the form is pending, and the server/database idempotency key blocks repeated AI calls for the same trip/material set before `extractTripDraftWithOpenAI` can run.
- First real-draft review feedback from the Andalucía extraction exposed a real data-contract issue, not a copy bug: dining reservations were flowing through the generic `activities` draft bucket without Wren-style category organization. The extraction schema now requires every activity to have a Wren-style `category`, dining language backfills to `categoryId = food_dining`, and the review cards label section totals as `Found` separately from records that need confirmation. Do not introduce `itemType = restaurant`; dining reservations are activities with a food/dining category.
- First draft-review UX feedback also shifted the page away from internal parser language: headline is now `Check the draft`, technical model/input-character metadata and the `Parsed draft saved` banner are hidden, dates are spelled out in long form, style direction/colors are shown in the review header, `What we found` is collapsible and includes app categories, sections collapse, empty states say `No ... decisions needed`, and review progress is visible. Generated questions now have answer fields, but this is still only a persisted answer decision; the proper next contract is hypothesis-style questions with guessed value, field target, evidence, confidence, and a resolver that applies the answer to structured records.
- The hypothesis-question contract now exists for new extractions: `missingDetails` can include `subjectType`, `targetField`, `guessedValue`, `evidence`, `answerType`, and `confidence`. The adapter links questions back to matching records by `relatedTitle`; the review UI shows the guess/evidence and offers `Yes, use this`; answering a targeted question applies the answer to a whitelisted structured record field and marks the record confirmed. Next improvement is richer matching/resolution for duplicate records and non-text/vision-derived evidence.
- Andalucía extraction QA/product feedback:
  - Avoid dumb questions. If a night outbound flight clearly starts the trip, use that as the trip start; do not ask whether the first hotel date is the start. If needed, ask a targeted confirmation that the first night is on the plane.
  - Non-blocking uncertainty should not block app creation. Users can answer “not sure yet,” and Roamwoven should still create a TBD card or placeholder when the missing detail is not core route/dates/lodging/transport.
  - Privacy review should be dialed back in the happy path. Group recommended privacy into a few confirmations such as stay addresses, confirmation/booking codes, access codes, and personal/private notes, with optional drill-down into specifics.
  - Activities by category are the right direction; categories should expand accordion-style to show titles, but not descriptions by default.
  - Extraction progress should steadily advance and rotate through meaningful checks instead of resetting through 1-5 repeatedly; copy should underpromise that the build can take up to 2-3 minutes.
  - Review dates should use friendlier compact display such as `Jan. 10-14` instead of raw ISO dates in summary/dropdown contexts.
  - Traveler shell still needs Wren-parity polish later: category emojis, leg grouping/color by country/region, blocked calendar areas, homepage lower-half spacing, and copy.
- Central Europe extraction QA improved enough that lodging dates were correct on the first encouraging pass. Current review calibration:
  - `Calls we made` should be non-blocking and lightweight, with evidence hidden behind a dropdown and an edit escape hatch when the call maps to a structured record.
  - A roughly week-long trip should average a small handful of meaningful questions and calls when extraction is well tuned. Do not hard-code a target count: 3, 7, or 9 can all be fine depending on the materials. Accuracy is still more important than minimizing review.
  - Review principle: Questions are for decisions the app cannot confidently resolve and where the answer changes the traveler experience.
  - If answering the first review queue unlocks genuine new ambiguity, the preferred UX is a tiny second review round of 1-3 follow-up questions, not dumping all hypothetical follow-ups into the first pass. This needs a deliberate resolver/generation pass later.
  - Facts should not be surfaced as calls. Calls are non-obvious decisions that a human trip-planner could confidently infer, such as "no hotel night 1 because you're on an overnight flight." Calls should be statements, not questions.
  - Optional missing-detail rule: if a time-bound reservation, pickup, tour, or appointment has a usable anchor such as a name, address/location, provider, route, confirmation, or enough descriptive context, make the card and usually omit missing nice-to-have fields from review. If it only has a generic type plus time, ask a targeted question because the card is not identifiable enough.
  - Explicit source to-do rule: if the itinerary itself says something like `Need to decide`, `pick a time`, `which ticket`, `book later`, or `TBD` tied to a ticket/time/booking decision, create the activity card and keep that unresolved detail as an open targeted question. Do not turn it into a `Calls we made` note, and do not block publishing if the maker leaves it as a reminder.
  - Medium-confidence contextual guesses that would move stays, transport, or dated cards should remain Questions only when two answers are genuinely plausible. Strong contextual evidence is enough for `Calls we made` when a reasonable human trip-planner would confidently make the same call from ordering, arrival/departure sequence, bag-drop/check-in flow, or surrounding itinerary context.
  - Commercial/public venue addresses such as hotels, hostels, shops, restaurants, museums, or activity locations should not be treated as private details just because they are exact street addresses. Private homes, rentals/Airbnb, apartments, access codes, booking controls, and personal notes remain protected.
  - If a readable PDF contains screenshot-like transport cards, the current pipeline may mark the upload `text_ready` from embedded PDF text and skip OCR, causing image-only train/flight blocks to be missed. The OCR prompt now calls out transport timeline cards, but the proper fix is a mixed-PDF extraction strategy that can combine PDF text and OCR for selected pages/regions without OCRing every readable PDF by default.
- Future calibration loop: Roamwoven should learn from aggregate user behavior, but not by silently self-modifying rules in V1. Store structured signals for review items and later manual edits: shown as call/question/privacy, subject type, target field, confidence, evidence category, accepted/ignored/edited, edit delta, follow-up answers, and final-review edits. Use internal reports to find noisy questions, often-edited calls, privacy recommendations users undo, and fields users commonly add later. Convert strong patterns into prompt/adapter rules and regression tests first; only later consider adaptive scoring/classification once the behavior is well understood.
- Current Central Europe checkpoint before fresh chat:
  - Latest pushed extraction/review tuning made the Central Europe PDF produce few/no calls and questions. That is acceptable for this relatively explicit PDF if the trip summary/app preview proves the spine is correct; do not force calls/questions just to hit a count.
  - Review rules now established: calls are non-obvious statements only, not copied facts and not questions; explicit stay-night facts such as Vienna 3 nights should disappear from review; hotel/hostel/public venue addresses stay public while reservation numbers, room/access details, Wi-Fi passwords, booking controls, and private rental/home details stay protected; privacy defaults should be handled by the single Privacy recommendation, not Questions.
  - User hit the trip summary page and could not inspect specifics because it showed only counts. Product decision: the summary page should become a compact pre-publish QA surface with expandable specifics for trip spine, stays, transport, privacy, and a grouped/truncated activity sample. It should not require publishing the app just to check whether the extraction got basic records right.
  - Date formatting bug on summary page: `2019-01-12 to 2019-01-25` is not acceptable. Use friendly month-spelled date ranges, consistent with legs/stays/transport review formatting.
  - The summary-specifics implementation is now wired: `lib/generated-trip-summary.ts` produces friendly date ranges and section rows, and `app/maker/trips/[tripId]/summary/page.tsx` renders expandable Legs, Transport, Stays, Activities, Protected details, and Review items. Activities are category-grouped and truncated to a pre-publish sample; the page was checked locally on desktop and mobile for overflow.
  - Follow-up summary QA fixed the demo adapter where `seedTrip.dateRange` was incorrectly stored as `destinationSummary`, and fixed the traveler view model where `trip.dateRange` was incorrectly derived from `destinationSummary`. The demo summary now shows `June 27 - November 8, 2026` as the structured date range and destination cities underneath. Protected-detail summary counts now exclude public/hidden detail records, and Review items now include privacy/record-review buckets as well as open questions.
  - Summary page direction shifted from abstract buckets to a day-by-day pre-publish review: Day N + date/location, stay/travel rows first, then activities with collapsed descriptions. This is the surface for evaluating whether extraction got activity count, titles, descriptions, and placement right without bloating the short review-prompt page. The summary header now lightly reflects saved design choices with theme name and color swatches; privacy remains a quiet protected-details note, not a dominant review section.
  - Trip assembly correction pass: broad parent/child suppression and city-note merges now create statement-style Calls and persist `_assembly.debug` on the draft for internal audit. Summary rows can save structured edits, remove records, move activity cards to city tips, and mark warnings checked through the existing review-decision table. Ordinary synthetic check-in cards were removed; normal check-in/drop-bags context should live on the Stay row unless the source gives a separate traveler movement. Summary now flags 7+ visible activity days and critical flight/train records missing route/time/location details.
  - Trip Assembly Provenance + Timeline Ordering pass (2026-07-03): stay/drop-bags flow is folded into Stay rows unless it is a separate early luggage movement; rental car pickup activities merge into Travel rows with time/address/confirmation details; train/flight departure times can be promoted from descriptions; day overview cards are suppressed before maker/traveler surfaces; loose notes now consolidate to one city note per city; loose city-note moves are silent; same-site grouping preserves child names/times in the surviving card and creates one statement-style Call; explicit wrong-city conflicts move loose mentions to the named city note or become a placement review item; Summary ordering now uses departure/explicit times first and invisible day-part fallback second; missing arrival time alone is no longer a hard transport warning; Review copy no longer says "Nothing needs confirmation" when Summary has hard health warnings. Verified with `npm test`, `npm run build`, and `npm run typecheck` after build.
- Maker trips now have an app-level soft-delete path. The trip workspace shows a Danger Zone delete button for real trips; paid trips get an explicit warning that deletion removes the trip from the app and requires contacting support for restore. `listMakerTrips` and `getMakerTrip` hide `status = deleted`, and published traveler snapshot tokens return 404 while the parent trip is deleted. This is intentionally not a hard database delete; backend records remain recoverable by the superadmin.
- CTO durability pass started before new product work:
  - Published traveler snapshots now redact protected addresses and sensitive card details before JSON is shipped to `/t/[token]`. This is intentionally conservative: client-only traveler mode cannot reveal those secrets until a server-verified unlock path exists.
  - `/t/[token]` only renders the trip's active `published_snapshot_id`; older share tokens stop resolving after a republish/token rotation.
  - Stripe checkout now writes durable `trip_payment_events`, verifies the checkout owner, expected Stripe price, expected amount, expected currency, payment status, and deleted-trip state before marking a trip paid.
  - Soft delete now writes `deleted_at`, `deleted_by_user_id`, and `deletion_reason`; late payment webhooks cannot resurrect deleted trips.
  - Review decisions now use a stable `decision_key` and `upsert`, so repeated Confirm/Edit/Protect/etc. clicks update the current decision instead of appending duplicate conflicting rows.
  - Traveler privacy now has a server-side unlock foundation: protected detail values publish into `published_trip_private_details`, and `/t/[token]/unlock` verifies the active token and traveler password before returning those values.
  - CTO risk register added at `docs/cto-risk-register.md`.
  - New additive SQL: `db/production-sql-2026-06-18-durability-foundations.sql`. Run this before deploying the matching app code.
- Checkout sessions now pass `receipt_email` to Stripe using the signed-in user's email. This is the quick checkout-email path; a branded Roamwoven post-purchase email still needs a real email provider later.
- Stripe sandbox promo code `QA100` is active for Roamwoven test builds. It is 100% off once, valid, capped at 10 total redemptions, and currently showed 1 out of 10 redemptions used in the Stripe dashboard, so there are 9 remaining test uses before another code is needed.
- Promo-code checkout verification fix: Stripe discounts can make `checkout.session.amount_total` lower than the configured trip price, including `0` for `QA100`. Payment verification now compares `amount_subtotal` to the expected trip price while recording the actual discounted `amount_total`, so valid promo-code checkouts can mark trips paid without weakening price/currency/owner checks.

Live Supabase dev setup is partially complete:

- Supabase project created: `roamwoven-dev`.
- Project ref: `zijriyeydlupaqpxhiyb`.
- Project URL: `https://zijriyeydlupaqpxhiyb.supabase.co`.
- Local `.env.local` exists and is gitignored.
- `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is still blank because clipboard access from the Codex browser was blocked; it is only needed for trusted backend jobs like the Stripe webhook payment update.
- `NEXT_PUBLIC_APP_URL` is set to `http://localhost:3000` because the current local dev server is running on port 3000.
- `db/schema.sql` was pasted and run successfully in Supabase SQL editor.
- `db/schema.sql` now includes the `trip-materials` private storage bucket, storage object policies, and `trip_uploads.file_size_bytes`.
- `db/schema.sql` now includes `trip_build_settings`; the production table/grants/RLS patch was run successfully in Supabase after the deployed review save failed.
- `db/schema.sql` now includes `trip_style_settings`; the production table/grants/RLS patch was run successfully in Supabase with the same settings-table patch.
- `trip_style_settings` production columns `secondary_color`, `accent_color`, and `soft_color` were added successfully in Supabase after the style picker began persisting companion colors.
- If production shows `Build choices could not be saved`, `Content choices could not be saved`, or `App sections could not be saved`, first verify `trip_build_settings` exists with grants and the owner-scoped RLS policy. If design choices fail next, verify `trip_style_settings` the same way.
- Important storage policy detail: uploaded files use `userId/tripId/uploadId/filename`, so storage policies should check `split_part(storage.objects.name, '/', 1) = auth.uid()::text` and match `trips.id::text = split_part(storage.objects.name, '/', 2)` with `trips.owner_user_id = auth.uid()`.
- On 2026-06-16, PDF upload failed with Supabase Storage RLS error `new row violates row-level security policy`. The storage policies were rerun in production using the explicit `split_part(...)` checks above and Supabase returned `Success. No rows returned`.
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

grant usage on schema public to service_role;

grant select, insert, update, delete on trips to service_role;
grant select, insert, update, delete on trip_uploads to service_role;
grant select, insert, update, delete on trip_legs to service_role;
grant select, insert, update, delete on trip_items to service_role;
```

The grants have now been run successfully. If the schema is recreated, rerun this block in a clean SQL editor. The `service_role` grants are required for Stripe webhooks and Checkout-return verification to mark trips paid.

## Important Product Decisions

- Collaboration rule: operate like a founding CTO, not a purely obedient implementation assistant. When feedback points to a deeper dependency, likely rework, or a missing architecture decision, pause and name that issue before patching the surface. Separate interim polish from foundational work, label interim fixes clearly, and push back when the requested path is likely to waste time.
- Current design-preview decision: put a pin in further Design page tuning until the generated traveler-app data contract, adapter/view-model layer, and shared traveler component architecture are stable. Wren's Adventure is the UX/layout/interaction architecture reference, not a visual skin to copy wholesale. Roamwoven design packs should theme the shared architecture once it exists.
- Generated trip data-model decision: use the uploaded Asia/Wren workbook as the concrete structural reference for pieces and columns, but do not make a spreadsheet the final Roamwoven source of truth. The sheet/editor shape should be a human-readable staging/editing surface; durable scale comes from database records plus published traveler snapshots and a traveler-app view model. See `docs/generated-trip-data-model.md`.
- Beta should use real Stripe Checkout with promo codes/discounts for test users.
- Public launch and beta should charge or explicitly discount before expensive AI extraction.
- Maker app is the user-facing source of truth.
- Database will be the technical source of truth.
- Traveler app should be one hosted template backed by trip snapshots.
- Photos are part of V1, with count/size/retention limits and no video.
- Wren's Adventure remains the user's real trip app and the reference UX for legs, categories, calendar/day views, search, phrases, maps, and mobile cards.
- Generated apps should not force travel modules. If a customer does not include flights, the traveler app should not show a flight placeholder just to fill a template.
- Historical/sample itineraries are valid beta inputs. Do not require old docs to be rewritten with future dates. If dates do not line up with the current day, the traveler app should anchor "Today" to the first trip day, like the Wren's Adventure behavior.
- Activity extraction should preserve the traveler's mental model, not maximize card count. Broad day arcs such as "Road to Hana" can be anchor activities. Named stops such as "Wai'anapanapa State Park" can become child stops or separate cards when they have permits, time windows, map importance, or enough standalone detail. Ambiguous cases should generate review questions.
- Review needs both generated questions and manual additions. Before the initial app build, users can add/delete source docs and manually add legs, flights, stays, activities, restaurants, notes, or placeholders. After the app build starts, manual edits should update structured data cheaply, while adding new docs should be an explicit revision/reprocess path with cost controls.
- Product framing should avoid "passes." There is one initial app build from confirmed materials. Adding activities, legs, flights, stays, or corrections later is an app update, not another pass.
- Sharing/privacy model should be maker-controlled and flexible, not rigidly "maker-only by default." The maker can publish without a password, protect the whole traveler app with one catchall password, password-protect the photo section separately, or protect sensitive card details only. The elegant default for sensitive material is card-detail protection: the card can still appear in the traveler app, while exact private addresses, door codes, confirmations, or personal notes can sit behind a password when the maker chooses.
- Updated traveler-app access decision: V1 should use one trip password, not separate traveler/photo passwords. The default unlocked-by-link experience is follower/photo-forward mode. Entering the trip password unlocks traveler mode, which reveals sensitive details and enables photo upload affordances.
- Sensitive details should be locked by default when they identify private access, private contact, private residences, booking control, payment/identity, or personal safety context. Usually public: city/country, public venues, hotel names without room/access details, activity names, restaurants, day summaries, and shared photos.
- Roamwoven is deployed on Vercel Pro and the custom domain is live at `https://roamwoven.com`.
- The landing page should be the public product homepage, not a login-first surface. It should explain what Roamwoven does, use real/generated traveler-app screenshots as the money piece, and can later include clickable demos or embedded previews. Login should be a clear action from the homepage, not the homepage itself.
- The public demo should use the Wren's Adventure traveler-app shell and interaction model as the reference, not a separate Roamwoven-specific traveler UI. The current `/t/demo` now uses a Wren-style framed shell, sticky tool header, tabbed bottom nav, photo-forward follower mode, Today cards, search/map/phrase surfaces, and traveler-password unlock scaffold. Remaining work is to more directly port/adapt Wren's mature `TripApp`, `PhotoGallery`, and map/photo upload internals onto generated trip snapshots.
- Landing page direction: tagline is "The superapp for your next adventure." Add a "Perfect for" section, and later show both finished app screenshots and shots of the prompt/building phase.
- Likely early buyer profile: affluent/HENRY millennial travelers, often couples or young families, household income roughly $250k-$300k+, taking one or two higher-end trips per year and willing to pay for calm logistics.
- Future spinout idea after Roamwoven is solid: clone the core builder/template architecture into a separate bachelor/bachelorette party app with different marketing, custom UI, bill-splitting features, and likely higher pricing. Keep Roamwoven fully built first so this can be launched as a vertical clone rather than a distraction.
- First app creation flow should feel like: trip name, short description, dump files/notes, visible queued uploads, "Make app," lightweight simulated processing/progress, then secure payment. Real expensive processing must still stay behind checkout.
- Payment should be as frictionless as possible once Stripe is configured: cards plus express wallet-style checkout where available. Research PayPal support separately before promising it in-product.

## Recommended Next Task

Continue the generated-trip foundation before returning to Design page iteration:

1. Read `docs/generated-trip-data-model.md`.
2. Continue from the new record/view-model foundation:
   - `lib/generated-trip-model.ts`
   - `lib/traveler-view-model.ts`
   - `lib/extraction/draft-to-structured-trip.ts`
   - `components/traveler-app-shell.tsx`
   - `app/t/[token]/page.tsx`
3. Keep adapter fixture tests passing with `npm test`; coverage starts in `tests/generated-trip-model.test.ts`.
4. Decide whether to turn on OpenAI extraction now. The backend write/publish path is validated, so extraction is now worth enabling once the OpenAI key/model/cost guardrails are confirmed.
5. Push/deploy the allowlist code, add `OPENAI_API_KEY` in Vercel, redeploy if Vercel requires it, and test extraction on the real paid Central Europe upload.
6. Decide whether to persist applied structured records before summary/publish, or keep decisions as the first durable edit layer a little longer.
7. Return to Design preview only after it can render the real shared traveler architecture.

Latest checks run after the model-backed draft-review update:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the review-decision persistence layer:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after wiring simple review-card decisions:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after wiring edit forms and item combine:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after structured summary model:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after published snapshot foundation:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the OpenAI extraction allowlist guardrail:

- `npm test`
- `npm run build`
- `npm run typecheck` after build regenerated `.next/types`

Latest checks after the Andalucía dining-card/count-contract fix:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the draft-review UX and final-travel-day fix:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the maker trip soft-delete and published-token guard:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after the CTO durability foundation pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Andalucía review UX/product-contract pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Eastern Europe review-friction and bounded-inference pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after Central Europe review-feedback pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after trip-summary pre-publish QA surface:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after day-by-day trip-summary review:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after explicit source TODO extraction rule:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after trip assembly correction pass:

- `npm test`
- `npm run typecheck`
- `npm run build`

Latest checks after canonical record identity cleanup:

- `npm test`
- `npm run typecheck`
- `npm run build`

Canonical identity QA decisions from the July 2 Czech/Central Europe run:

- Obvious duplicate/composite cleanup belongs in internal assembly debug, not maker-facing Calls. Calls should only explain non-obvious app-shaping choices.
- Normal check-in/drop-bags flow should fold into the Stay row when it is same-day/same-place as the stay. Separate luggage storage or a separate traveler movement can remain as an activity.
- If a Travel row already covers rental-car pickup or another movement, the duplicate Activity disappears and useful time/location/details merge into the Travel row.
- Separate booking/ticket/provider/time wins over grouping. Example: the 9:00 AM Old Town/Jewish Quarter walking tour and 2:30 PM Klementinum ticket are two separate activities; the invented `Prague walking tour and Klementinum` parent should be suppressed.
- City tips use bullet-level filtering. If scheduled activity bullets are removed but loose bullets remain, keep the city note. Generic `Notes & Tips` wording is not identity evidence across cities.
- Summary now treats structural duplicate/stay/transport collisions as hard publish-blocking health warnings. Bloat (`7+ visible activity cards`) remains a quiet warning and does not block publish by itself.

Maker UX note:

- App setup now has one required pre-build confirmation: core materials are included. Empty-section handling and recommended privacy language moved into the section/module copy and review behavior instead of separate friction checks.
- Draft processing copy now sets the expectation at up to 5 minutes and cycles through concrete work labels such as flights/trains, hotels, dinner reservations, museums/tours, and other activities.
- Structured draft review now separates `What we found` from `Needs review`. Found groups summarize extracted legs, stays, transport, activities, and privacy groups; the decision queue should only contain records/questions that actually need maker action.
- Leg and stay review summaries should use human date ranges such as `January 1-3, 2019`, not raw ISO dates.
- The create-trip screen previously showed a local-only file/notes dropzone, but `app/maker/trips/create/route.ts` only persisted trip name/description. This made testers think materials vanished. Updated product decision: keep the creation dropzone because it is a useful mini-commitment moment, but actually persist those starter materials to `trip_uploads` during trip creation. AI extraction/processing stays gated until checkout. The upload screen remains useful as the place to review saved materials, add/delete more after checkout, and continue to app setup.
- Starter materials on unpaid trips should not live forever. Beta retention target is 14 days for abandoned unpaid starter materials. `lib/uploads.ts` now has a service-role cleanup helper, `cleanupAbandonedUnpaidStarterMaterials`, which finds unpaid/not-started uploads older than the cutoff, removes storage objects, and deletes `trip_uploads` rows. It defaults to dry-run; wire it to a cron/admin trigger only after deciding the operational trigger and monitoring.
- Found-group cards should show counts while collapsed, such as `5 legs` or `3 stays`.
- Activity combine controls should not appear on every activity. Only show them for plausible duplicates, and explain that the cards share date/category/title language.

Extraction inference note:

- Avoid dumb questions, but do not hallucinate. The parser may infer stay checkout dates only from explicit source evidence such as a visible first night/check-in date plus a stated nights count. Do not infer lodging dates from nearby itinerary context alone; leave uncertain fields null and ask only when the ambiguity materially affects the traveler app.
- Review questions should be rare. High-confidence confirmations, trip-level start/end calls, and privacy-default calls should move into a non-action `Calls we made` section instead of the decision queue. Clearly sensitive details should default to privacy handling instead of asking yes/no privacy questions.
- Stay-date extraction must understand explicit first-night plus nights-count language. Example: if source text says Friday sleep at Wombats and 3 nights, this should produce check-in Friday and checkout Monday, not a missing-date review item. The OpenAI stay schema now captures `firstNightDate` and `nights`; the structured adapter computes checkout from those fields when `checkOut` is absent.
- Central Europe PDF QA found two more lodging calibration rules: if a stay has `checkOut` plus explicit `nights`, compute check-in by subtracting nights; if a lodging-title question has a strong guessed value such as `The Yellow Hostel`, apply it as the stay name and move the question to `Calls we made` instead of `Needs review`. The stay schema now includes check-in/check-out times so `Check in: 2:30 PM` has a real field.

After that foundation is moving, continue hardening the post-payment maker flow:

1. Test the newly scaffolded draft-review screen on the paid trip and the demo trip.
2. Re-test the paid trip on `https://roamwoven.com`:
   - Checkout box is collapsed green after payment.
   - Upload page loads.
   - Notes save and persist.
   - Review page shows the saved materials and module toggles.
   - Design choices save and the swatches are clickable.
   - Draft review loads after design and shows the structured review sections.
3. Add a real file-upload smoke test with a small PDF or text file from the browser.
4. Test the local draft-review controls and decide which actions should persist first: item status, edits, deletion, or manual additions.
5. Add a real persisted review/intake answer model so choices survive refresh and can drive generated app modules.
6. Start shaping the simulated first-pass output into the eventual structured data records.
7. Verify a logged-in user only sees their own trips; direct RLS two-user testing can wait until a second test account exists.

Keep extraction mocked until payment, owner-scoped trip persistence, and upload storage are stable.

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
- `docs/stripe-setup.md`
- `lib/auth.ts`
- `app/login/page.tsx`
