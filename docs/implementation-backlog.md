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

Beta note:

- Local testing and friends-and-family beta can use a payment bypass.
- Public launch should restore the hard payment gate before expensive extraction.

Acceptance criteria:

- User can start checkout from an unpaid trip.
- Checkout metadata includes trip ID and user ID.
- Successful webhook marks trip `paid`.
- Expensive upload processing remains locked until payment succeeds.
- Beta bypass is controlled intentionally, not by removing payment concepts from the product.

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
- User can optionally add a note/context label per upload.
- Upload list shows file name, type, size, and status.

### M2.2 Storage and Upload Records

Store files and create database records.

Acceptance criteria:

- Uploaded files are stored in object storage.
- `trip_uploads` records are created.
- Uploads are scoped to trip owner.
- Basic file size/type limits exist.

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

### M3.2 Asia Workbook Importer

Build an importer for the current Asia workbook.

Purpose:

- Seed test data.
- Validate traveler app rendering.
- Provide a bridge between current app model and Roamwoven schema.

Acceptance criteria:

- Importer reads `Legs`, `Activities`, `Categories`, and `Phrases`.
- Imported data maps into Roamwoven trip schema.
- Imported Asia trip can render in the traveler app template.

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

## Milestone 4: Clarification Flow

### M4.1 Question Generation

Generate clarification questions from missing, conflicting, or low-confidence fields.

Question sections:

- Trip structure.
- Travel.
- Stays.
- Bookings.
- Activities.
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
- User can choose color palette.
- Optional cover image can be added or deferred.

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

## Milestone 7: Beta Hardening

### M7.1 Cost Tracking

Track extraction cost by trip.

Acceptance criteria:

- Store rough AI/OCR cost per processing job.
- Admin/debug view can show cost by trip.
- Large or repeated processing can be limited.

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
- Beta users can pay or use a comped test trip.
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

This would prove the platform direction while keeping the expensive, uncertain extraction pipeline isolated for the next pass.
