# OpenAI Extraction Setup

## Current Status

OpenAI extraction plumbing exists, and Roamwoven has a guarded maker action for the first notes/text/PDF parse.

The maker UI now has a guarded `Build parsed draft` action for the first beta parser, but it is disabled unless extraction is configured. The API code is behind:

- `OPENAI_API_KEY`
- `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`
- Optional `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` allowlist

If either is missing, extraction helper calls fail before contacting OpenAI.

## Billing Model

OpenAI API usage is billed to the OpenAI API account/project that owns the API key configured in Roamwoven. It is separate from ChatGPT or Codex subscription billing.

Use a dedicated OpenAI project for Roamwoven so usage, keys, and budgets stay isolated.

## Required OpenAI Setup

1. Create or select an OpenAI API project for Roamwoven.
2. Set a low monthly project budget while testing.
3. Create a server-side API key for that project.
4. Add these Vercel env vars for Production and Preview:

```bash
OPENAI_API_KEY=...
OPENAI_EXTRACTION_MODEL=gpt-5.4-mini
OPENAI_OCR_MODEL=gpt-5.6-luna
OPENAI_EXTRACTION_MAX_INPUT_CHARS=120000
OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS=12000
OPENAI_OCR_MAX_OUTPUT_TOKENS=16000
OPENAI_OCR_MAX_FILES_PER_RUN=20
OPENAI_OCR_PDF_BATCH_PAGES=4
ROAMWOVEN_ENABLE_AI_EXTRACTION=false
ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS=e50f7e93-b2e9-4b8c-9097-92fce402d885
```

Keep `ROAMWOVEN_ENABLE_AI_EXTRACTION=false` in production until the database and first paid test path are ready.

For the first production test, keep `ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS` set to the single paid test trip. If the allowlist is empty, every paid trip can use extraction once the key and flag are enabled, so do not leave it empty during early cost testing.

Also keep it `false` until the production database has the additive extraction tables from `db/schema.sql`:

- `trip_processing_runs`
- `trip_draft_snapshots`
- `trip_material_extractions`
- `trip_material_ocr_batches`
- `trip_evidence_observations`
- `trip_canonical_pieces`

## Cost Guardrails

- Never run AI extraction before checkout is complete.
- Never run AI extraction just because a user uploaded files.
- Require an explicit maker action such as `Build parsed draft`.
- During early production testing, allowlist only the intended paid test trip.
- Log model, token usage, trip ID, upload count, run number, and success/failure.
- Checkpoint each uploaded material before the model call as text-ready, OCR-needed, unsupported, or failed. The maker still sees one build action; this is internal durability. Material triage uses bounded concurrency so multi-file trips do not process purely serially or spike all uploads at once.
- Normalize the bounded trip-spine context before its model call, but send every source page/section through evidence extraction chunks. Input budgets may create more calls; they must not silently discard the middle of a source.
- Store internal material-budget and material-checkpoint telemetry on `trip_processing_runs.openai_usage`, including raw characters, submitted characters, estimated per-pass input tokens, estimated staged-run input tokens, trimmed material count, and checkpoint status counts. This belongs in future admin/support tooling, not customer-facing maker or traveler UI.
- Run OCR for all OCR-needed materials before the trip draft model call. `OPENAI_OCR_MAX_FILES_PER_RUN` controls material concurrency, not permission to silently skip the rest.
- Split PDFs into ordered page batches (`OPENAI_OCR_PDF_BATCH_PAGES`, default 4). Every returned page must have an explicit coverage marker. An incomplete or token-capped response splits into smaller batches and retries; a repeatedly incomplete single page blocks extraction.
- Persist page-batch attempts in `trip_material_ocr_batches`. Mark the parent material `text_ready` only after every page is covered and complete. Partial output is audit evidence only.
- Extract source sightings as evidence observations, cluster them into canonical pieces, and only then run assembly. Source anchors are evidence producers; they do not create traveler rows after assembly.
- Cap input characters/pages/files for the first beta.
- Treat reprocessing as explicit and limited.
- Prefer cheap first-pass extraction; allow higher-cost reruns only when needed for quality.

## Code Added

- `lib/ai/openai.ts`
  - Server-only Responses API helper.
  - Requires extraction flag and API key.
  - Uses strict JSON schema output.
  - Sets `store: false`.
- `lib/extraction/openai-trip-parser.ts`
  - Roamwoven trip-draft schema and prompt.
  - Accepts extracted text materials, not raw uploaded files.
- `lib/extraction/trip-materials.ts`
  - Collects pasted notes, small `.txt` uploads, and readable text-based PDFs for the first beta parser.
  - Records scanned/image-heavy PDFs and images as OCR-needed instead of silently dropping them.
- `lib/extraction/material-extractions.ts`
  - Persists per-upload extraction checkpoints in `trip_material_extractions`.
  - Defines the OCR lane contract: list OCR-needed materials, mark OCR processing, complete OCR into `text_ready`, or fail OCR with a class/message.
- `lib/extraction/ocr-processor.ts`
  - Downloads OCR-needed originals, creates resumable PDF page batches, adaptively retries incomplete batches, and writes OCR text only after full page coverage.
- `lib/extraction/evidence-clustering.ts`
  - Converts spine, chunk, OCR/prose, and source-anchor sightings into observations and canonical Lego pieces before assembly.
- `lib/extraction/evidence-artifacts.ts`
  - Persists run-scoped observations and canonical pieces for audit/support lineage.
- `lib/extraction/material-budget.ts`
  - Removes repeated boilerplate and caps the submitted material bundle before the AI call.
  - Produces per-run internal telemetry for cost/support review.
- `lib/extraction/processing-runs.ts`
  - Creates processing run logs and stores raw draft snapshots.
- `app/maker/trips/[tripId]/data/extract/route.ts`
  - Paid, explicit parse action.
  - Requires `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`.

## Still Needed Before Turning It On

1. Run the existing extraction SQL plus `db/production-sql-2026-07-10-ocr-evidence-foundations.sql` before deploying this code.
2. Add the OpenAI API key to Vercel.
3. Keep the flag disabled until ready for an intentional paid test.
4. Test with pasted notes, a `.txt` file, or a readable text-based PDF first.
5. Convert the raw draft JSON into editable review cards.
6. Move OCR/extraction into a real worker before broad paid usage. The page-batch and evidence artifacts are designed to become worker checkpoints without changing their contract.
7. Add better per-run estimated or actual OpenAI cost display.

## First Beta Target

The lowest-risk first pass is notes, text files, and readable PDF extraction:

- Pull `trip_uploads.user_note`.
- Include small `.txt` uploads.
- Extract text locally from normal text-based PDFs.
- Send capped text to OpenAI.
- Store the raw draft JSON and usage metadata.
- Show the draft on `/maker/trips/[tripId]/data`.

OCR for scanned PDFs and images now uses the same complete-material gate. A material never becomes model-ready from a partial OCR response.
