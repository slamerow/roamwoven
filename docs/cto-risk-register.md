# Roamwoven CTO Risk Register

Status: working register  
Updated: 2026-06-18

## Operating Principle

Roamwoven should feel simple to customers and mature under the hood. The goal is not enterprise ceremony. The goal is a consumer product that can handle the first 10, 100, and 1,000 paid trips without privacy mistakes, payment ambiguity, duplicate AI spend, unrecoverable data loss, or support blindness.

## P0 Risks

### Traveler Privacy and Access

Risk: sensitive addresses, access codes, booking controls, personal contacts, or safety notes are shipped in public snapshot JSON and hidden only by client UI.

Current direction:

- Public traveler snapshots must be redacted before they leave the server.
- Protected detail values belong in server-only storage keyed to the active published snapshot.
- Traveler unlock must be server-verified before returning protected values.
- Old share tokens must stop resolving after republish/token rotation.

Done:

- Public snapshot payload redacts protected addresses and sensitive card details.
- `/t/[token]` only renders the active `published_snapshot_id`.
- `published_trip_private_details` stores server-only protected values.
- `/t/[token]/unlock` verifies access before returning protected values.

Still needed:

- Maker UI for setting/changing the trip password.
- Password hash migration/normalization for existing trips.
- Rate limiting for traveler unlock attempts.
- Server-backed photo upload permissions tied to the same traveler mode.

### Payment Integrity

Risk: Stripe webhooks or checkout-return verification mark the wrong trip paid, double-apply events, accept unexpected amounts, or resurrect deleted trips.

Done:

- `trip_payment_events` records Stripe event/session/payment-intent metadata idempotently.
- Payment marking verifies owner, paid status, expected price, expected amount, expected currency, and deleted-trip state.
- Soft-deleted trips cannot be marked paid by late webhook events.

Still needed:

- Support view for payment events and reconciliation.
- Explicit refund/cancellation state model.
- Tests or scripted smoke for webhook duplicate delivery.

### Source Materials and Upload Lifecycle

Risk: users race quotas, duplicate uploads, orphan storage objects, delete material after processing starts, or lose provenance for a generated app.

Done:

- Upload caps and duplicate hashes exist.
- Pre-processing material deletion is locked behind trip/material editability.

Still needed:

- Transaction-like upload intent/finalize flow or cleanup job for orphan objects.
- Material status transitions: uploaded, selected, text_extracted, parsed, ignored, superseded.
- Late-document revision lane instead of mutating original source material after build.

## P1 Risks

### Extraction as Durable Jobs

Risk: extraction is a route handler plus OpenAI call, which fails poorly at scale and makes retries/cost control/support hard.

Current direction:

- Treat extraction as a job/checkpoint system.
- Every run must have material set identity, idempotency key, model/cost metadata, status, failure class, and retry semantics.

Done:

- `trip_processing_runs` and `trip_draft_snapshots` exist.
- Initial parse has idempotency for exact material sets and failed-run retry.
- Extraction materials are normalized and capped before the AI call, with raw-vs-submitted material-budget telemetry stored on each processing run for internal cost review.
- Per-upload extraction checkpoints exist for text-ready, OCR-needed, unsupported, and failed materials. The current maker flow stays one-click; checkpoints are internal durability/observability.

Still needed:

- Full failure taxonomy across run and material stages: no-text, OCR-needed, model-error, schema-invalid, missing-spine-basics, timeout.
- OCR worker for checkpointed scanned PDFs/images.
- Background worker or queued job runner before broad paid usage. It should use per-trip/account fairness and concurrency limits, not a single global queue that makes one customer wait behind another unrelated customer's build.
- Admin-only cost/usage rollups per trip and per account.

### Structured Record Persistence

Risk: replaying raw draft snapshots plus review decisions becomes brittle as trips get edited, revised, republished, and supported over time.

Current direction:

- AI draft is not the source of truth.
- Structured trip records should become durable editable records.
- Review decisions are an audit/update layer, not the whole data model forever.

Done:

- Generated trip model and decision resolver exist.
- Summary and publish read applied structured records.

Still needed:

- Persist generated structured records as tables or versioned JSON records.
- Store resolver output after review, with version/provenance.
- Add manual additions and updates against structured records.

### Support Observability

Risk: a paying customer reports a broken trip and support cannot answer what happened.

Current direction:

- Every paid trip should have a support-readable timeline: created, paid, uploads, extraction runs, review decisions, publish versions, deletion/recovery.

Done:

- Payment events, processing runs, snapshots, review decisions, and soft-delete metadata exist.

Still needed:

- Superadmin/support surface.
- Internal trip timeline query.
- Recovery flow for paid deleted trips.
- Structured audit events table if timelines outgrow existing tables.

## P2 Risks

### Scale and Back Catalog

Risk: schema and storage patterns work for a demo but become expensive or awkward at 10k+ trips/year.

Current direction:

- Index by owner/trip/status/date.
- Keep large source materials in object storage.
- Keep published traveler reads snapshot-based.
- Avoid recomputing whole apps for small updates.

Still needed:

- Retention policy for source uploads and generated artifacts.
- Snapshot compaction/version retention.
- Back catalog import/update tooling.

### Product Surface Drift

Risk: screens get polished before the data contracts are stable, causing rework.

Current direction:

- Wren-style traveler UX remains the acceptance baseline.
- Roamwoven data contracts and adapters should mature before heavy visual tuning.

Still needed:

- Shared traveler component architecture backed by real generated view models.
- Design packs that theme the shared architecture rather than fork it.
