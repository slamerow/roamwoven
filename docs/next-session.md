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
  - It logs `trip_processing_runs`, stores raw JSON in `trip_draft_snapshots`, and updates `trips.processing_status`.
  - Do not enable extraction in production until the additive DB SQL for those tables has run.
- Important deployment sequencing rule: when code starts reading or writing a new Supabase table, run the matching production SQL/grants/RLS before asking the user to push/test the deployed app. Otherwise the UI can ship before the database contract exists and fail for non-technical testers.
- The trip workspace now resumes from the next incomplete step instead of always sending paid trips back to upload:
  - no uploads -> upload
  - uploads saved but no content settings -> content scope
  - content settings saved but no design settings -> design
  - design settings saved -> draft review
  - parsed draft reviewed -> trip summary before publish
- The Step 4 content-scope progress bar should stay fixed while the maker checks confirmations. Checkboxes can unlock the "Continue to design" action, but should not mark the top step track complete before the settings save succeeds.
- Maker progress is now a shared seven-step component shown across the workspace, upload, app setup, design, process/review, summary, and publish pages: Start trip -> Add materials -> App setup -> Design -> Process -> Review -> Publish. Checkout/payment should not be presented as one of the traveler-app build steps.
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
- First extraction QA on the paid Andalucia dummy trip `bc773119-703b-4292-8fe1-fa7dbe46de0f` found PDF ingestion issues before any OpenAI call:
  - The first deployed attempt failed with `DOMMatrix is not defined`; this was fixed by adding a minimal server-side `DOMMatrix` shim before loading PDF tooling.
  - The next deployed attempt failed with `Cannot find module '/var/task/.next/server/chunks/pdf.worker.mjs'` while trying to read the uploaded PDF; this was a PDF worker/bundling problem, not a storage or OpenAI problem.
  - The extraction material reader now uses `pdfjs-dist/legacy/build/pdf.mjs` directly for text-only PDF extraction and removes the unused `pdf-parse` dependency. This should be deployed before asking the user to click `Build parsed draft` again.
- Cost-control guardrail: the initial parse button is now framed as a one-time build for the saved material set. The client disables the submit button while the form is pending, and the server/database idempotency key blocks repeated AI calls for the same trip/material set before `extractTripDraftWithOpenAI` can run.
- First real-draft review feedback from the Andalucía extraction exposed a real data-contract issue, not a copy bug: dining reservations were flowing through the generic `activities` draft bucket without Wren-style category organization. The extraction schema now requires every activity to have a Wren-style `category`, dining language backfills to `categoryId = food_dining`, and the review cards label section totals as `Found` separately from records that need confirmation. Do not introduce `itemType = restaurant`; dining reservations are activities with a food/dining category.
- First draft-review UX feedback also shifted the page away from internal parser language: headline is now `Check the draft`, technical model/input-character metadata and the `Parsed draft saved` banner are hidden, dates are spelled out in long form, style direction/colors are shown in the review header, `What we found` is collapsible and includes app categories, sections collapse, empty states say `No ... decisions needed`, and review progress is visible. Generated questions now have answer fields, but this is still only a persisted answer decision; the proper next contract is hypothesis-style questions with guessed value, field target, evidence, confidence, and a resolver that applies the answer to structured records.
- The hypothesis-question contract now exists for new extractions: `missingDetails` can include `subjectType`, `targetField`, `guessedValue`, `evidence`, `answerType`, and `confidence`. The adapter links questions back to matching records by `relatedTitle`; the review UI shows the guess/evidence and offers `Yes, use this`; answering a targeted question applies the answer to a whitelisted structured record field and marks the record confirmed. Next improvement is richer matching/resolution for duplicate records and non-text/vision-derived evidence.

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
- If production shows `Build choices could not be saved` or `Content choices could not be saved`, first verify `trip_build_settings` exists with grants and the owner-scoped RLS policy. If design choices fail next, verify `trip_style_settings` the same way.
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
