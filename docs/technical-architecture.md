# Roamwoven Technical Architecture

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

Stripe objects:

- Customer.
- Checkout Session.
- Payment Intent.
- Trip purchase record.

The trip should remain locked until payment succeeds.

### File Storage

Use object storage for uploads.

If using Supabase:

- Store original uploads in Supabase Storage.
- Store extracted text/metadata in Postgres.
- Consider retention controls later.

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
- Optional login can be added later if private URL is not enough.
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
- cover_image_url.
- published_app_token.
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
- Color palette.
- Cover visual.
- Data-rich day cards.
- Placeholder cards.
- Optional phrasebook.

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
- Uploaded files scoped to trip owner.
- No search indexing for traveler app.
- Ability to unpublish or rotate share token.

Open question:

- Should traveler apps require login?

Recommendation:

- Start with private unlisted URL plus optional share-token rotation.
- Add login-gated traveler apps later if beta users ask for it.

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

Most maker-app edits should not rerun full extraction. They should update structured data directly and regenerate the traveler snapshot cheaply.

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

