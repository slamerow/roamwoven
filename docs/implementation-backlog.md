# Roamwoven Implementation Backlog

Version: 0.1
Date: 2026-06-16
Status: Working draft

## Goal

Build the first Roamwoven beta: a paid trip creation flow, upload/intake pipeline, clarification UI, editable structured trip data, and a generated private PWA traveler app based on the Asia app reference.

This backlog is ordered for momentum. It assumes we will create a new `roamwoven` repo before implementation begins.

## Build Principles

- Payment before expensive AI processing.
- Maker app is the user-facing source of truth.
- Database is the technical source of truth.
- Asia workbook/app are reference examples, not immutable constraints.
- Generated traveler apps use one deployed template plus trip snapshots.
- V1 should prefer placeholders over missing cards.
- Keep V1 consumer-simple; avoid travel-agent CRM scope.
- Build with commercial-grade privacy, cost tracking, and sensitive-field defaults from the beginning.
- Default visual direction should feel understated and premium, not ornate or gimmicky.
- Beta should use the real Stripe path with promo codes/discounts rather than skipping checkout.
- Photos are part of V1, with strict storage/privacy limits; video is out.

## Milestone 0: Project Setup

### M0.1 Create Repo

Create a new GitHub repo named `roamwoven`.

Acceptance criteria:

- Repo exists locally and on GitHub.
- Initial README explains the product in one paragraph.
- PRD, architecture, and backlog are copied into `/docs`.
- Basic `.gitignore`, package manager config, and linting are present.

### M0.2 App Scaffold

Scaffold the full-stack web app.

Recommended default:

- Next.js.
- TypeScript.
- Tailwind.
- Supabase client/server helpers.
- Stripe SDK.

Acceptance criteria:

- App runs locally.
- Home page loads.
- Maker dashboard route exists.
- Traveler app route placeholder exists at `/t/[token]`.

### M0.3 Environment Setup

Add required environment configuration.

Initial env vars:

- `NEXT_PUBLIC_SUPABASE_URL`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY`.
- `STRIPE_SECRET_KEY`.
- `STRIPE_WEBHOOK_SECRET`.
- `NEXT_PUBLIC_APP_URL`.

Acceptance criteria:

- `.env.example` exists.
- App fails gracefully when required env vars are missing.

## Milestone 1: Auth, Trips, and Payment Gate

### M1.1 Authentication

Implement signup/login/logout.

Acceptance criteria:

- User can sign up.
- User can log in.
- User can log out.
- Protected maker routes redirect anonymous users.

### M1.2 Trip Dashboard

Build authenticated trip dashboard.

Acceptance criteria:

- User can see their trips.
- Empty state explains how to create the first trip.
- User can create a trip with name, destination summary, and optional dates.

### M1.3 Trip Status Model

Implement trip lifecycle statuses.

Statuses:

- `draft`.
- `awaiting_payment`.
- `paid`.
- `uploading`.
- `processing`.
- `needs_review`.
- `preview_ready`.
- `published`.
- `archived`.

Acceptance criteria:

- Trip status appears in maker dashboard.
- Status controls what actions are available.

### M1.4 Stripe Checkout

Add one-time per-trip payment.

Pricing assumptions:

- Launch target is a flat $25 per trip.
- Protect the $25 price point if possible; it is cleaner psychologically than $30.
- $30 remains a fallback only if real usage data shows the margin cannot work through processing controls or add-ons.
- Short trips may get an automatic goodwill discount later.
- Referral credit and an annual unlimited personal tier are future pricing experiments.
- Beta testers use promo codes or discounts.
- Target routine cost is under $5 per trip before taxes, refunds, disputes, and unusual support.

Beta note:

- Local development can use test-mode Stripe and controlled test fixtures.
- Friends-and-family beta should still exercise checkout, with promo codes where needed.
- Avoid building the product around a payment bypass that has to be untangled later.

Acceptance criteria:

- User can start checkout from an unpaid trip.
- Checkout metadata includes trip ID and user ID.
- Successful webhook marks trip `paid`.
- Expensive upload processing remains locked until payment succeeds.
- Promotion code metadata is captured for beta and referral analysis.

### M1.5 Post-Payment Upload Entry

After payment, route user to upload screen.

Acceptance criteria:

- Paid trip can access upload flow.
- Unpaid trip cannot process files.
- UI clearly says payment is complete and the user can now upload materials.

## Milestone 2: Upload and Intake

### M2.1 File Upload UI

Build upload screen for paid trips.

Supported V1 inputs:

- PDFs.
- Word docs.
- Images/screenshots.
- Spreadsheets.
- Pasted text.

Acceptance criteria:

- User can upload multiple files.
- User can paste notes into a text area.
- User can delete wrong saved materials before parsing/generation starts.
- User can optionally add a note/context label per upload.
- Upload list shows file name, type, size, and status.

### M2.2 Storage and Upload Records

Store files and create database records.

Implementation status:

- Initial route/helper exists for paid-trip uploads.
- Supabase SQL now creates a private `trip-materials` bucket and owner-scoped storage policies.
- Upload rows include filename, MIME type, size, storage path, note text, status, and timestamp.
- Real extraction remains mocked.

Acceptance criteria:

- Uploaded files are stored in object storage.
- `trip_uploads` records are created.
- Uploads are scoped to trip owner.
- Basic file size/type limits exist.
- Trip-level upload caps exist: 25 MB per file, 20 files per request, 100 saved materials per trip, 500 MB per trip, and 250 KB pasted notes per upload.
- Materials lock once parsing/generation starts; later changes should use a revision flow.

### M2.3 Text Extraction Prototype

Extract text from initial file types.

Acceptance criteria:

- PDF text extraction works for text-based PDFs.
- Word document extraction works.
- Pasted text is stored directly.
- Screenshot/image OCR can be stubbed or implemented depending on available service choice.
- Extracted text is saved or referenced in `extracted_documents`.

### M2.4 Document Classification

Classify uploaded materials.

Document types:

- Travel.
- Lodging.
- Activity booking.
- Itinerary doc.
- General notes.
- Screenshot.
- Spreadsheet.
- Unknown.

Acceptance criteria:

- Each upload gets a detected document type.
- Each classification has confidence.
- Low-confidence classifications are flagged for user confirmation.

### M2.5 Intake Summary

Show the first user-facing processing result.

Acceptance criteria:

- User sees counts by document/item type.
- User sees number of items needing review.
- User sees which documents were understood vs uncertain.

## Milestone 3: Structured Trip Data

### M3.1 Database Schema

Create core tables.

Tables:

- `trips`.
- `trip_uploads`.
- `extracted_documents`.
- `trip_legs`.
- `trip_items`.
- `clarification_questions`.
- `published_trip_snapshots`.

Acceptance criteria:

- Migrations exist.
- Local dev database can be reset and seeded.
- Row ownership is enforced or prepared for enforcement.
- Trip records include theme pack, share token rotation, and optional traveler/photo password fields.
- Item records include address visibility and confirmation visibility fields.
- Published snapshots can omit or mask maker-only sensitive details.

### M3.2 Asia Workbook Importer

Build an importer for the current Asia workbook.

Purpose:

- Seed test data.
- Validate traveler app rendering.
- Provide a bridge between current app model and Roamwoven schema.
- Preserve the Wren's Adventure traveler-app behaviors that matter: legs, categories, calendar/day views, search, phrases, maps, and polished mobile cards.

Acceptance criteria:

- Importer reads `Legs`, `Activities`, `Categories`, and `Phrases`.
- Imported data maps into Roamwoven trip schema.
- Imported Asia trip can render in the traveler app template.
- Traveler app template can represent the Wren's Adventure reference UX, not just a simplified card list.

### M3.3 Draft Trip JSON

Define a draft structured output format for extraction.

Acceptance criteria:

- Format includes legs, items, placeholders, source refs, and confidence.
- Format can be validated before writing to database.
- Bad or partial output produces actionable errors, not silent failure.

### M3.4 Fact Extraction Prototype

Create first AI extraction pass.

Acceptance criteria:

- Given extracted text, system produces draft legs/items.
- High-risk fields include confidence/source refs.
- Conflicts are represented explicitly.
- Output can be written into draft trip tables.
- Activity grouping preserves the traveler's mental model: broad day arcs can become anchor activities, while fixed bookings and map-critical stops can become standalone cards or child stops.
- Scheduled times, reservations, permits, tickets, confirmation numbers, and check-in requirements default to standalone cards.
- Ambiguous activity splits produce review questions instead of silently over-splitting or over-collapsing.

### M3.5 Historical Trip Handling

Support old itineraries as first-class beta fixtures.

Acceptance criteria:

- Maker flow accepts past-dated trips.
- Traveler preview can anchor "Today" to the first trip day when the real calendar date is outside the trip range.
- Live-only modules, especially forecast weather, do not show broken historical states.
- Public/customer copy can still frame Roamwoven around upcoming trips later without blocking dogfooding.

## Milestone 4: Clarification Flow

### M4.1 Question Generation

Generate clarification questions from missing, conflicting, or low-confidence fields.

Question sections:

- Trip structure.
- Travel.
- Stays.
- Bookings.
- Activities.
- Activity grouping.
- Placeholders.
- Style.

Acceptance criteria:

- Questions are stored as structured records.
- Each question has priority, status, and related entity.
- Blocking questions are rare and explicit.

### M4.2 Review UI Shell

Build the progress-based review flow.

Acceptance criteria:

- User sees current section.
- User sees overall progress.
- User sees remaining question count.
- User can answer, skip, or use placeholder where allowed.
- Skipping never creates an empty broken card; it creates a calm placeholder or marks the item intentionally hidden.
- User can resolve grouping questions such as "own card," "keep inside the day activity," or "hide from traveler app."

### M4.2a Manual Review Additions

Let makers add missing structured details without rerunning extraction.

Acceptance criteria:

- User can manually add a leg/city.
- User can manually add a flight/transport item.
- User can manually add lodging.
- User can manually add an activity, restaurant, note, or placeholder.
- Manual additions are stored as structured draft records with source marked as manual.
- Manual additions do not trigger expensive document processing.
- If the user wants to add more files after generation starts, the app routes them into a deliberate revision/reprocess flow.

### M4.3 Question Types

Implement initial question components.

Types:

- Confirm extracted value.
- Choose between conflicting values.
- Fill missing value.
- Assign item to date.
- Assign item to city/leg.
- Choose category/type.
- Confirm document type.
- Confirm placeholder.

Acceptance criteria:

- Answers update structured trip data.
- Skips create review flags or placeholders.
- Progress updates correctly.

### M4.4 Placeholder Queue

Build maker-app placeholder task list.

Acceptance criteria:

- Placeholders are visible in one place.
- User can resolve, edit, or keep placeholder.
- Placeholder status affects traveler app display.

## Milestone 5: Maker Editing

### M5.1 Leg Editor

Edit city/stay/date spine.

Acceptance criteria:

- User can edit city, country, dates, stay name, address, notes, timezone, and language.
- Date changes update affected item placement warnings.

### M5.2 Item Editor

Edit cards/items.

Acceptance criteria:

- User can edit title, date, time, description, category/type, location, address, URL, and notes.
- User can move item between days/legs.
- User can create/delete items.
- User can quickly add or rewrite a one- to two-line description.
- User can hide or expose addresses and confirmation numbers.
- AI-assisted title/description generation stays factual and reviewable.

### M5.3 Travel Detail Forms

Specialized form fields for travel items.

Acceptance criteria:

- Flight item can capture airline, flight number, departure/arrival airports, times, confirmation number.
- Ground transport can capture provider, route, pickup/dropoff, confirmation.
- Specialized fields still render into clean card descriptions.

### M5.4 Style Settings

Simple app customization.

Acceptance criteria:

- User can set app name.
- User can choose a theme pack.
- User can choose color palette within the theme direction.
- Optional cover image can be added or deferred.

Initial theme packs:

- Quiet Luxury.
- Standard Adventure.
- Modern / Futuristic.
- Whimsical / Storybook.

## Milestone 6: Traveler App

### M6.1 Published Snapshot

Create snapshot-based publishing.

Acceptance criteria:

- User can generate a preview snapshot.
- Snapshot includes all app-renderable data.
- Draft edits do not automatically leak into published traveler app unless refreshed.

### M6.2 Traveler App Template

Build the private PWA route.

Acceptance criteria:

- Route loads by private token.
- Trip title/dates render.
- Days render in order.
- Legs render.
- Items render as cards.
- Placeholder cards render calmly.
- App is mobile-first.

### M6.3 Offline Shell

Add PWA basics.

Acceptance criteria:

- Web manifest exists.
- Core app shell is cacheable.
- Published snapshot can be available offline after first load.
- Offline state shows last synced timestamp.

### M6.4 Publish and Share

Expose publish controls.

Acceptance criteria:

- User can publish private traveler app.
- User can copy/share private URL.
- User can unpublish or rotate token.
- Traveler password protection defaults on with plain wording such as "Recommended for private family trips."
- User can toggle password protection off.
- User can set a simple password without complex password rules.
- Traveler password is stored hashed, never plaintext.
- Published snapshot respects address and confirmation visibility settings.

### M6.5 V1 Photo Sharing

Add bounded photo-sharing controls as part of the premium V1 value proposition.

Acceptance criteria:

- Photos can be disabled entirely for a trip.
- Photo albums can be password protected separately or inherit traveler password.
- Photo storage has size and retention limits.
- Initial included allowance targets 250-500 compressed photos per trip.
- Photo count and upload size are tracked internally.
- Soft warnings/support review happen before hard caps for normal users.
- Photos are compressed where practical before storage.
- Video is not accepted in V1.

## Milestone 7: Beta Hardening

### M7.1 Cost Tracking

Track extraction cost by trip.

Acceptance criteria:

- Store rough AI/OCR cost per processing job.
- Admin/debug view can show cost by trip.
- Large or repeated processing can be limited.
- Track storage usage for uploads and photos.
- Flag trips that threaten the $25 margin target.
- Report estimated cost against the under-$5 routine cost target.

### M7.1a Terms and Plan Guardrails

Prepare the minimum product/legal controls needed before public launch.

Acceptance criteria:

- Checkout or account flow links to terms.
- Terms say users must review trip details before relying on them.
- Terms reserve the right to limit abusive uploads, refreshes, storage, or commercial resale.
- Unlimited personal plan is not enabled until usage limits and commercial-use restrictions are enforceable.

### M7.2 Failure Logging

Log extraction failures and manual corrections.

Acceptance criteria:

- Failed documents show actionable status.
- Manual correction categories are tracked.
- Critical fields corrected by user are captured for product learning.

### M7.3 Asia Trip QA

Use Asia trip as golden test.

Acceptance criteria:

- Imported Asia trip renders correctly.
- Generated traveler app matches expected day/card coverage.
- No missing flights.
- No missing lodging.
- Placeholders are intentional.
- Mobile layout is usable.

### M7.4 Beta Tester Flow

Prepare invite-only beta flow.

Acceptance criteria:

- Beta users can create account.
- Beta users can pay through Stripe or use a promo code.
- Support/admin can inspect processing state.
- Manual support can correct data behind the scenes if needed.

## Priority Build Order

1. Repo + scaffold.
2. Auth + dashboard.
3. Trips + payment gate.
4. Upload shell.
5. Database schema.
6. Asia workbook importer.
7. Traveler app template from imported data.
8. Published snapshots.
9. Upload extraction prototype.
10. Intake summary.
11. Clarification questions.
12. Maker editing.
13. PWA/offline.
14. Stripe production hardening.
15. Beta QA.

## Today/Tomorrow Shipping Target

If trying to make visible progress immediately, the best target is not full AI extraction. The best target is a credible product skeleton:

- New `roamwoven` repo.
- Next.js app scaffold.
- Auth placeholder or Supabase auth.
- Trip dashboard.
- Create trip form.
- Payment-gated upload placeholder.
- Asia workbook importer.
- Traveler app route rendering imported Asia trip data.

Deployment note:

- Do not assume Vercel is immediately available for Roamwoven because Wren's Adventure may already occupy the user's available Vercel project/deployment slot.
- Keep local/GitHub progress unblocked.
- Revisit hosted beta when the product is useful enough to justify switching deployments, using another host, or upgrading.

This would prove the platform direction while keeping the expensive, uncertain extraction pipeline isolated for the next pass.
