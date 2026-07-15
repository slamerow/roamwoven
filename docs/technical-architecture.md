# Roamwoven Technical Architecture

> Historical architecture context. Current locked product behavior lives in
> `docs/product-contracts.md`. When this working draft conflicts with a newer
> locked contract, the locked contract wins.

Version: 0.1
Date: 2026-06-16
Status: Working draft

## 1. Architecture Goal

Roamwoven needs to turn user-uploaded trip materials into structured trip data, then render that data as a private mobile-first traveler app.

The architecture should optimize for:

- Fast V1 development.
- Paid-before-processing cost control.
- High accuracy for critical trip data.
- Easy maker-app edits after publish.
- Reuse of the Asia trip app as the reference traveler app.
- Room to evolve the schema after real beta inputs.
- Commercial-grade privacy, access control, auditability, and cost controls from the beginning.

The system should avoid overbuilding enterprise features before the core loop is proven.

## 2. Recommended V1 Stack

### App Framework

Use a single full-stack web app for V1.

Recommended default:

- Next.js / React.
- TypeScript.
- Tailwind or existing design-system equivalent.
- Server routes/actions for upload, extraction, payment webhooks, and publish operations.

Why:

- One codebase can handle maker app, account dashboard, generated traveler app, and API routes.
- The existing Asia app is already a web app pattern we can reuse conceptually.
- PWA support is straightforward.

### Database

Use Postgres for canonical app data.

Recommended options:

- Supabase Postgres for fastest auth/storage/database start.
- Neon Postgres plus separate auth/storage if we want more control.

For V1, Supabase is likely the pragmatic default because it can cover:

- Auth.
- Postgres.
- File storage.
- Row-level security if needed.

### Payments

Use Stripe Checkout.

Payment happens before expensive extraction.

Beta should still exercise the real checkout path. Use Stripe promotion codes, coupons, or controlled discounts for beta testers rather than removing payment from the flow entirely.

Stripe objects:

- Customer.
- Checkout Session.
- Payment Intent.
- Trip purchase record.
- Promotion code or coupon metadata, where used.

The trip should remain locked until payment succeeds.

### File Storage

Use object storage for uploads.

If using Supabase:

- Store original uploads in Supabase Storage.
- Store extracted text/metadata in Postgres.
- Define retention controls before public launch.
- Keep video out of V1 unless a separate storage/retention policy exists.

If not Supabase:

- S3/R2 are good alternatives.

### AI / Extraction

Use a staged extraction pipeline:

1. File ingestion.
2. Text/OCR extraction.
3. Document classification.
4. Trip fact extraction.
5. Conflict detection.
6. Confidence scoring.
7. Draft structured data.
8. Clarification question generation.

The pipeline should be asynchronous because OCR and AI processing may take time.

V1 can start with a simple job table and background worker rather than a full queue system.

## 3. System Surfaces

### Marketing / Demo Surface

Public pages:

- Product explanation.
- Screenshots from the Asia app.
- Pricing.
- Example generated app.
- Sign up / create trip.

No customer-specific extraction happens before payment.

### Maker App

Authenticated pages:

- Trip dashboard.
- Create trip.
- Payment state.
- Upload materials.
- Intake summary.
- Clarification flow.
- Structured trip editor.
- Placeholder task list.
- Preview traveler app.
- Publish/share controls.

### Traveler App

Private generated app:

- Publicly reachable by hard-to-guess URL or share token.
- Traveler password protection defaults on, but can be toggled off by the trip owner.
- User-configurable traveler password for trips or albums that need an extra privacy layer.
- Mobile-first.
- PWA-ready.
- Reads published trip snapshot.
- Supports offline core content.

## 4. Data Ownership Model

The maker app is the normal user's source of truth.

The database is the canonical technical source of truth.

Google Sheets or sheet export can exist as:

- Internal compatibility layer.
- Debugging aid.
- Power-user export.
- Future premium feature.

The system should not make Google Sheets the only canonical store for V1 unless development speed requires a short-term bridge.

Recommended approach:

- Store canonical structured data in Postgres.
- Provide export to the Asia-style workbook/schema.
- Build traveler app from Postgres/published JSON.
- Optionally generate a Google Sheet for power users later.

This keeps the end-user experience clean and avoids two-way sync complexity too early.

## 5. Core Data Model

The Asia workbook provides the starting shape:

- Legs.
- Activities.
- Categories.
- Phrases.

The current Wren's Adventure app also provides product architecture beyond the workbook: leg-based navigation, category filters, calendar/day browsing, search, phrasebook, map/location affordances, and a polished mobile-first card system should be treated as V1 reference behavior.

V1 should preserve those concepts but add production fields for status, source, confidence, and publish behavior.

### users

Stores account information.

Fields:

- id.
- email.
- display_name.
- created_at.
- updated_at.

If using Supabase Auth, this may be mostly managed by Supabase.

### trips

One paid trip project.

Fields:

- id.
- owner_user_id.
- name.
- slug.
- status.
- payment_status.
- processing_status.
- start_date.
- end_date.
- destination_summary.
- color_palette.
- theme_pack.
- traveler_password_hash.
- photo_password_hash.
- cover_image_url.
- published_app_token.
- token_rotated_at.
- published_at.
- created_at.
- updated_at.

Suggested statuses:

- draft.
- awaiting_payment.
- paid.
- uploading.
- processing.
- needs_review.
- preview_ready.
- published.
- archived.

### trip_uploads

Original uploaded materials.

Fields:

- id.
- trip_id.
- original_filename.
- file_type.
- storage_path.
- user_note.
- detected_document_type.
- classification_confidence.
- processing_status.
- extracted_text_id.
- created_at.

Detected document types:

- travel.
- lodging.
- activity_booking.
- itinerary_doc.
- general_notes.
- screenshot.
- spreadsheet.
- unknown.

### extracted_documents

Text and metadata extracted from each upload.

Fields:

- id.
- trip_upload_id.
- extracted_text.
- extraction_method.
- language.
- page_count.
- image_count.
- extraction_confidence.
- created_at.

For large documents, extracted text may be stored in object storage with a pointer in the database.

### trip_legs

The trip spine.

Fields:

- id.
- trip_id.
- leg_key.
- country.
- city.
- arrive_date.
- leave_date.
- nights.
- stay_name.
- stay_address.
- why.
- arrival_travel_summary.
- departure_travel_summary.
- notes.
- timezone.
- language.
- latitude.
- longitude.
- status.
- review_required.
- confidence.
- source_refs.
- sort_order.
- created_at.
- updated_at.

### trip_items

General card/event/activity/travel rows.

This is the production version of Asia workbook `Activities`.

Fields:

- id.
- trip_id.
- leg_id.
- item_key.
- date.
- start_time.
- end_time.
- title.
- description.
- category.
- item_type.
- location_name.
- address.
- address_visibility.
- confirmation_number.
- confirmation_visibility.
- url.
- notes.
- status.
- placeholder_type.
- review_required.
- confidence.
- source_refs.
- sort_order.
- created_at.
- updated_at.

Suggested item types:

- flight.
- train.
- ferry.
- transfer.
- rental_car.
- lodging.
- activity.
- restaurant.
- admin.
- rest_day.
- social.
- note.
- placeholder.

Activity grouping:

- `trip_items` should eventually support anchor activities and child stops.
- Add `parent_item_id` or a related-item join when the first extraction prototype needs it.
- Add `display_mode` values such as `standalone`, `anchor`, `child_stop`, and `note_inside_activity`.
- Add an explicit review status for ambiguous splits, rather than silently choosing between separate cards and nested stops.
- The extractor should preserve the traveler's mental model. A day arc like "Road to Hana" can be the anchor activity, while a reservation-backed or map-critical stop like "Wai'anapanapa State Park" can become a child stop or its own card.
- A scheduled time, reservation, permit, ticket, confirmation number, or check-in requirement should default to its own card, with rare intentional exceptions.
- Loose advice belongs inside the anchor activity unless it has its own date/time/location/actionable detail.

Historical/sample trips:

- Trip dates may be in the past during dogfooding and closed beta.
- The maker flow should accept historical itineraries without requiring the user to rewrite source docs.
- The traveler app should anchor "Today" to the first trip day when real calendar dates do not line up with the current date.
- Live-only modules such as forecast weather should hide, mock, or clearly degrade for historical trips.

Review editing and cost control:

- The review screen should support manual creation of legs, travel items, lodging, activities, restaurants, notes, and placeholders.
- Manual review edits should write structured records directly and should not rerun extraction.
- Before generation starts, new files/docs can still be added to `trip_uploads` for the first extraction pass.
- Once parsing/generation starts, source materials should lock. Additional documents should enter a revision/reprocess flow with explicit cost controls.
- Regenerating the traveler snapshot from edited structured data should be cheap and separate from expensive document processing.

### clarification_questions

Questions generated for the user during review.

Fields:

- id.
- trip_id.
- section.
- priority.
- question_text.
- help_text.
- question_type.
- related_entity_type.
- related_entity_id.
- options_json.
- default_answer_json.
- answer_json.
- status.
- blocking.
- created_at.
- answered_at.

Question sections:

- trip_structure.
- travel.
- stays.
- bookings.
- activities.
- placeholders.
- style.

### source_refs

Tracks where facts came from.

Can be implemented as a separate table or JSON field at first.

Fields:

- upload_id.
- page_number.
- text_excerpt.
- extraction_note.
- confidence.

This is internal. Do not expose raw source machinery to traveler-app users.

### published_trip_snapshots

Immutable or semi-immutable snapshots used by the traveler app.

Fields:

- id.
- trip_id.
- version.
- snapshot_json.
- created_at.
- published_by_user_id.

The traveler app should read from a published snapshot so draft maker edits do not accidentally appear until preview/publish or refresh is intended.

Published snapshots should include display-safe versions of sensitive fields. Raw confirmation numbers, exact private-residence addresses, and other sensitive source details can remain in maker data while the traveler snapshot stores only what is meant to be shown.

## 6. Processing Pipeline

### Step 1: Payment Gate

Do not run expensive extraction until the trip is paid.

Allowed before payment:

- Account creation.
- Trip creation.
- Demo viewing.
- Price explanation.
- Maybe filename-only upload staging if needed, but avoid content processing.

### Step 2: Upload

User uploads files and optional notes.

The system stores originals and creates `trip_uploads` records.

### Step 3: Text and OCR Extraction

Handle by file type:

- PDF: extract embedded text; OCR pages/images if needed.
- Word: extract document text.
- Spreadsheet: extract sheet names, columns, and rows.
- Images/screenshots: OCR and vision extraction.
- Pasted text: store directly.

### Step 4: Document Classification

Classify each document into a rough type.

Ask the user to confirm only when classification confidence is low or the result affects high-risk extraction.

### Step 5: Fact Extraction

Extract facts into a draft normalized structure:

- Travel segments.
- Stays.
- Activities/bookings.
- Notes.
- Dates/times.
- Locations.
- Confirmation details.

### Step 6: Normalize into Trip Spine

Create the first draft of:

- `trip_legs`.
- `trip_items`.
- Placeholder items.
- Needs-placement items.

### Step 7: Detect Conflicts and Gaps

Examples:

- Flight date conflicts across sources.
- Hotel checkout date does not align with next city arrival.
- Booking has no date.
- Activity has city but no day.
- Day has no lodging.
- Travel gap exists between cities.

### Step 8: Generate Clarification Questions

Generate questions from conflicts, missing high-risk fields, and low-confidence structural choices.

Questions should be grouped and prioritized rather than shown as raw extraction errors.

### Step 9: User Review

User answers questions, skips questions, or creates placeholders.

Answers update the structured data.

### Step 10: Preview and Publish

Generate a published trip snapshot and render the traveler app from that snapshot.

## 7. Clarification UX Architecture

The clarification flow should be generated from structured question records, not hard-coded pages only.

The UI needs:

- Section progress.
- Overall progress.
- Count of remaining questions.
- Skip action where allowed.
- "Use placeholder for now" action.
- Ability to edit the underlying item when needed.

Question types:

- Confirm extracted value.
- Choose between conflicting values.
- Fill missing value.
- Assign item to date.
- Assign item to city/leg.
- Choose category/type.
- Confirm document type.
- Confirm placeholder.

Blocking questions should be rare and reserved for cases where the app cannot be structurally generated without an answer.

## 8. Traveler App Generation

The traveler app should be data-driven, not generated as a new codebase per trip.

Recommended model:

- One deployed traveler app route/template.
- Each trip has a published snapshot.
- App route loads snapshot by share token or slug.
- Styling comes from trip configuration.

Example:

- `/t/wrens-adventure-abc123`
- `/t/smith-family-japan-xyz789`

This avoids creating and deploying a new app for every customer.

The generated app should feel custom because of:

- Trip name.
- Dates and destinations.
- Theme pack.
- Color palette.
- Cover visual.
- Data-rich day cards.
- Placeholder cards.
- Optional phrasebook.

Theme packs should be represented as controlled design tokens, not arbitrary user CSS.

Initial packs:

- Standard Adventure.
- Modern / Futuristic.
- Whimsical / Storybook.
- Quiet Luxury.

Each pack should define primary, secondary, accent, paper/background, card, border, and muted text colors. The product default should bias toward Quiet Luxury: restrained, high-contrast, premium, and not visually noisy.

## 9. PWA / Offline Strategy

V1 should make the traveler app installable/addable to home screen where browser support allows.

Offline should be scoped to core content:

- Trip metadata.
- Legs.
- Days.
- Cards/items.
- Notes.
- Phrasebook.

Implementation:

- Web app manifest.
- Service worker.
- Cache published snapshot JSON.
- Cache core shell assets.
- Show "last synced" state if offline.

Do not promise offline:

- Live maps.
- Live weather.
- External links.
- Changes made after the last sync.

## 10. Refresh Model

Maker app edits should update draft data first.

For published trips:

- User edits maker app data.
- System marks traveler app as needing refresh.
- User can preview updated app.
- User publishes refresh.
- New published snapshot version is created.

Open question:

- Should small edits auto-publish, or should all edits require explicit refresh/publish?

Recommendation:

- V1 should use explicit refresh/publish. It reduces accidental changes and gives the user confidence.
- Later, allow auto-refresh for low-risk edits if users want it.

## 11. Security and Privacy

V1 should include:

- Auth for maker app.
- Paid trip ownership checks.
- Private share token for traveler app.
- Optional traveler password.
- Uploaded files scoped to trip owner.
- No search indexing for traveler app.
- Ability to unpublish or rotate share token.
- Sensitive-field visibility controls for confirmation numbers and addresses.
- Separate photo privacy controls before broad album sharing.

Ownership must be enforced in layers:

- Maker pages and route handlers require an authenticated Supabase user when Supabase is configured.
- Normal trip reads and writes are filtered by `owner_user_id`.
- Supabase Row Level Security is the database backstop so an app bug cannot casually expose another user's trip rows.
- Service-role access is limited to trusted backend operations that cannot run as the user, such as Stripe webhooks marking a specific trip paid.
- Database indexes should support owner-scoped dashboards and trip-scoped itinerary queries as the system grows to thousands of users and trips.

Open question:

- Should traveler apps require login?

Recommendation:

- Start with private unlisted URL plus optional share-token rotation and default-on traveler password.
- Add login-gated traveler apps later if beta users ask for it.

Traveler passwords in V1 should be low-friction. The user can choose a simple password, and the app should avoid enterprise-style complexity rules. The system should still store passwords as hashes, never plaintext.

Private residence addresses should be handled differently from hotels, rentals, restaurants, and public venues. A published traveler snapshot should support broad labels such as "Staying with family · Seattle, WA" while keeping the exact address private in maker data.

Confirmation numbers should default to maker-only. If exposed in the traveler app, they should be behind an explicit visibility setting and ideally a password-protected trip.

Photos are part of V1, but they should be constrained:

- Compress client-side where practical.
- Store originals only if the retention and pricing policy supports it.
- Start with a generous included allowance, roughly 250-500 compressed photos per trip.
- Track count, size, and bandwidth internally before showing hard limits to customers.
- Allow photo sharing to be disabled.
- Let albums inherit the traveler password or use a separate password.
- Exclude video from V1.

## 12. Cost Controls

Cost controls are critical.

Recommended controls:

- Payment before processing.
- File count and size limits per trip.
- Processing budget per trip.
- User-visible messaging for unusually large trips.
- Internal per-trip AI/OCR cost tracking.
- Retry limits.
- Preview/refresh limits if refresh requires expensive regeneration.
- Storage retention limits for original uploads and photos.
- No V1 video storage.
- Per-trip photo count, size, and bandwidth tracking, with soft thresholds before hard caps for normal users.

Most maker-app edits should not rerun full extraction. They should update structured data directly and regenerate the traveler snapshot cheaply.

Current V1 source-material guardrails:

- 25 MB max per uploaded file.
- 20 files max per upload request.
- 100 saved source materials max per trip.
- 500 MB total source-material bytes max per trip.
- 250 KB max pasted notes per upload.

These are intentionally generous for normal itinerary documents but create a clear abuse boundary before AI/OCR and storage costs compound.

For a $25 per-trip launch price, the system should measure whether AI, OCR, storage, payment fees, and manual support stay comfortably below the target cost envelope. The app should be able to flag trips that threaten the margin before they become a support or compute problem.

The working target is under $5 in platform, AI, storage, and routine admin cost per trip. This target excludes taxes, refunds, chargebacks, unusually high support, and founder time during beta.

If usage data shows that the generous photo allowance compresses margin too much, prefer reducing expensive processing, adding a paid storage/video upgrade, or reserving video for a premium tier before raising the base price. $25 is the cleaner consumer price point and should be protected if possible. The default product should avoid making ordinary family travelers feel charged for every small addition.

## 13. Observability

Track:

- Upload count and size.
- Extraction duration.
- Extraction cost estimate.
- Number of generated questions.
- Number of skipped questions.
- Number of placeholders.
- Time from payment to preview.
- Time from upload to published app.
- Manual corrections by field type.
- Critical extraction failures.

For beta, these logs are product research. They show where automation fails and which data fields need better modeling.

## 14. Build Approach

Recommended first repo shape:

```text
roamwoven/
  app/
    (marketing)/
    (maker)/
    t/[token]/
    api/
  components/
  lib/
    auth/
    billing/
    extraction/
    publishing/
    trip-data/
  workers/
  db/
    migrations/
    schema/
  docs/
```

If using Next.js App Router, the exact directory shape may change, but the conceptual boundaries should remain:

- Maker UI.
- Traveler UI.
- Data model.
- Extraction pipeline.
- Payment gate.
- Publishing/snapshots.

## 15. GitHub / Repo Timing

Create the new GitHub repository when the first implementation slice is ready to begin.

Do not create it too early while the product shape is still moving. The repo should start with:

- PRD.
- Technical architecture.
- Initial backlog.
- App scaffold.
- Basic database schema.
- First implementation milestone.

Recommended repo name:

- `roamwoven`

If the domain decision changes, the repo can still remain `roamwoven` unless the product name changes.

The initial repo should be separate from the Asia trip app. The Asia app is a reference implementation and beta fixture, not the codebase to mutate into the platform.

## 16. Immediate Next Steps

1. Convert the PRD and architecture into an implementation backlog.
2. Choose the V1 stack formally.
3. Decide Supabase vs custom Postgres/auth/storage.
4. Decide Stripe payment timing and product setup.
5. Create the new repo.
6. Scaffold the app.
7. Build the paid trip creation and upload skeleton.
8. Prototype extraction against Asia trip source materials.
