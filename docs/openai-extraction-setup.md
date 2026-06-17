# OpenAI Extraction Setup

## Current Status

OpenAI extraction plumbing exists, but Roamwoven does not call it from the maker UI yet.

This is intentional. The API code is behind:

- `OPENAI_API_KEY`
- `ROAMWOVEN_ENABLE_AI_EXTRACTION=true`

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
OPENAI_EXTRACTION_MAX_INPUT_CHARS=60000
OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS=4000
ROAMWOVEN_ENABLE_AI_EXTRACTION=false
```

Keep `ROAMWOVEN_ENABLE_AI_EXTRACTION=false` until the paid, explicit build action is ready.

## Cost Guardrails

- Never run AI extraction before checkout is complete.
- Never run AI extraction just because a user uploaded files.
- Require an explicit maker action such as `Build parsed draft`.
- Log model, token usage, trip ID, upload count, run number, and success/failure.
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

## Still Needed Before Turning It On

1. Extract text from uploaded PDFs, Word docs, spreadsheets, and notes.
2. Store extracted text or references in a table such as `extracted_documents`.
3. Add a processing job table or narrow processing fields for run tracking.
4. Add a paid, explicit `Build parsed draft` action.
5. Persist the returned draft structured records.
6. Render persisted draft records on the review screen.
7. Track per-run estimated or actual OpenAI cost.

## First Beta Target

The lowest-risk first pass is notes/text-only extraction:

- Pull `trip_uploads.user_note`.
- Optionally include text extracted from `.txt` uploads.
- Send capped text to OpenAI.
- Store the raw draft JSON and usage metadata.
- Show the draft on `/maker/trips/[tripId]/data`.

PDF/image parsing and OCR can follow once the review loop is proven.
