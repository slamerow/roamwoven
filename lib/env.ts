export function getOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

// Models known to read images and PDFs. The OCR lane sends `input_image` /
// `input_file` content, so ONLY a model on this list can serve it; a text-only
// model returns nothing usable and the source file is receipted as "not
// included" (the 2026-07-25 incident — see getOpenAIConfig's ocrModel note).
//
// This list is a REMINDER, not a capability probe: the only way to truly know
// is to send one page and look at the output, which is what
// `scripts/ocr-smoke-test.mjs` exists for. Adding a model here without running
// that smoke test repeats the incident.
export const OCR_VISION_CAPABLE_MODELS = ["gpt-5.6-luna"] as const;

// Text-only models that have been mistakenly used for OCR. Named explicitly so
// the mistake is caught by a test rather than by a lost live run.
export const OCR_TEXT_ONLY_MODELS = ["gpt-5.4-mini"] as const;

export function getSupabaseConfig() {
  return {
    url: getOptionalEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getOptionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getAppUrl() {
  return getOptionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

export function getStripeConfig() {
  return {
    secretKey: getOptionalEnv("STRIPE_SECRET_KEY"),
    webhookSecret: getOptionalEnv("STRIPE_WEBHOOK_SECRET"),
    tripPriceId: getOptionalEnv("STRIPE_TRIP_PRICE_ID"),
    appUrl: getAppUrl(),
  };
}

function getOptionalPositiveInteger(name: string, fallback: number) {
  const value = Number(getOptionalEnv(name));

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getOptionalImageDetail(name: string) {
  const value = getOptionalEnv(name);

  return value === "auto" ||
    value === "high" ||
    value === "low" ||
    value === "original"
    ? value
    : null;
}

export function parseOptionalEnvList(value: string | null) {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

export function getOpenAIConfig() {
  const configuredOcrMaxOutputTokens = getOptionalPositiveInteger(
    "OPENAI_OCR_MAX_OUTPUT_TOKENS",
    16000
  );

  return {
    apiKey: getOptionalEnv("OPENAI_API_KEY"),
    extractionModel: getOptionalEnv("OPENAI_EXTRACTION_MODEL") ?? "gpt-5.4-mini",
    extractionEnabled: getOptionalEnv("ROAMWOVEN_ENABLE_AI_EXTRACTION") === "true",
    extractionAllowedTripIds: parseOptionalEnvList(
      getOptionalEnv("ROAMWOVEN_EXTRACTION_ALLOWED_TRIP_IDS")
    ),
    // OCR model default. MUST be a VISION-CAPABLE model — this lane sends
    // `input_image` / `input_file` content (lib/ai/openai.ts getOcrContent),
    // so a text-only model returns nothing usable and the source file is
    // receipted as "not included" (RW-ING-001 fail-soft). It is EXPECTED and
    // CORRECT that this differs from `extractionModel` above: extraction
    // reads text, OCR reads pixels. See OCR_VISION_CAPABLE_MODELS below.
    //
    // INCIDENT, 2026-07-25 — one live run lost, recorded so it is not
    // repeated. This default was changed to "gpt-5.4-mini" on the reasoning
    // that commit 1d862ec (2026-07-10) had swapped it mini -> luna and
    // `git log --all -S'gpt-5.6-luna'` proved it was never reverted, so the
    // luna value looked like an unreverted accident blocking an approved
    // rollback. The git facts were right; the INTERPRETATION was backwards.
    // 1d862ec is the commit that BUILT real image/PDF OCR — it created
    // ocr-batches.ts, pdf-page-batches.ts, openai-ocr.test.ts and added 439
    // lines to ocr-processor.ts — and it set luna because luna is the model
    // that can read a document. The earlier "gpt-5.4-mini" value was a
    // placeholder from 639247e (2026-06-19), three weeks before OCR sent an
    // image to anything. Consequence of the swap: OCR extracted NOTHING,
    // "USE FOR TESTING CZECH.pdf" was receipted as not included, only the
    // pdf.js text layer reached the parser, and the run produced 6 transport
    // / 4 activities instead of 8 / ~40.
    //
    // Two lessons, both already written in AGENTS.md and both skipped:
    //  1. A model change is a MIGRATION and requires a single-chunk SHAPE
    //     smoke test of the new model BEFORE the live run (discipline 1c).
    //     `scripts/ocr-smoke-test.mjs` now makes that cheap — run it.
    //  2. A git diff shows WHAT changed, never WHY. Read the commit the
    //     change belongs to before calling an old value a mistake.
    //
    // Still open and NOT addressed by this line: luna's OCR quality is poor
    // (run 7.25.0: 41 of 399 uncovered lines, four missing ground-truth
    // stops, "Josefov" misread as "Joselov"). The fix for that is a BETTER
    // VISION model, never a text model — and it goes through the smoke test
    // first.
    ocrModel:
      getOptionalEnv("OPENAI_OCR_MODEL") ??
      "gpt-5.6-luna",
    ocrMaxFilesPerRun: getOptionalPositiveInteger(
      "OPENAI_OCR_MAX_FILES_PER_RUN",
      20
    ),
    ocrImageDetail: getOptionalImageDetail("OPENAI_OCR_IMAGE_DETAIL"),
    ocrMaxOutputTokens: Math.max(12000, configuredOcrMaxOutputTokens),
    ocrPdfBatchPages: getOptionalPositiveInteger(
      "OPENAI_OCR_PDF_BATCH_PAGES",
      4
    ),
    maxInputChars: getOptionalPositiveInteger(
      "OPENAI_EXTRACTION_MAX_INPUT_CHARS",
      120000
    ),
    maxOutputTokens: getOptionalPositiveInteger(
      "OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS",
      12000
    ),
    // RW-EVD-001 bounded recovery call: one excerpt-only re-ask per build,
    // hard input/output caps, extraction model unless overridden.
    recoveryModel:
      getOptionalEnv("OPENAI_RECOVERY_MODEL") ??
      (getOptionalEnv("OPENAI_EXTRACTION_MODEL") ?? "gpt-5.4-mini"),
    recoveryMaxInputChars: getOptionalPositiveInteger(
      "OPENAI_RECOVERY_MAX_INPUT_CHARS",
      16000
    ),
    recoveryMaxOutputTokens: getOptionalPositiveInteger(
      "OPENAI_RECOVERY_MAX_OUTPUT_TOKENS",
      8000
    ),
    recoveryMaxLines: getOptionalPositiveInteger(
      "OPENAI_RECOVERY_MAX_LINES",
      // Live-run 7.21.0: the 60-line cap dropped 27 candidate lines (up
      // from 2 in 7.18.3) and became the main content-loss driver (run7
      // PC-7). Env-tunable in Vercel.
      120
    ),
  };
}

// Geocoding verification lane (Arc B, standing CEO decision): env-keyed —
// no API key means the lane is disabled; hard per-trip lookup budget;
// results ride in usage JSON only (no DB tables in v1).
export function getGeocodeVerificationConfig() {
  return {
    apiKey: getOptionalEnv("GEOCODE_VERIFICATION_API_KEY"),
    endpoint:
      getOptionalEnv("GEOCODE_VERIFICATION_ENDPOINT") ??
      "https://maps.googleapis.com/maps/api/geocode/json",
    maxLookups: getOptionalPositiveInteger(
      "GEOCODE_VERIFICATION_MAX_LOOKUPS",
      // Live-run 7.21.0: a 15-lookup budget starved the discovered-walk
      // pool (29 of 44 candidates skipped) while radius rules ran on
      // fabricated parser coordinates. Env-tunable; raise/lower in Vercel.
      50
    ),
    timeoutMs: getOptionalPositiveInteger(
      "GEOCODE_VERIFICATION_TIMEOUT_MS",
      4000
    ),
  };
}

export function hasStripeCheckoutConfig() {
  const config = getStripeConfig();
  return Boolean(config.secretKey && config.tripPriceId);
}

export function hasOpenAIExtractionConfig() {
  const config = getOpenAIConfig();
  return Boolean(config.apiKey && config.extractionEnabled);
}

export function isTripAllowedForOpenAIExtraction(tripId: string) {
  const { extractionAllowedTripIds } = getOpenAIConfig();

  return (
    extractionAllowedTripIds.length === 0 ||
    extractionAllowedTripIds.includes(tripId)
  );
}

export function hasOpenAIExtractionConfigForTrip(tripId: string) {
  return hasOpenAIExtractionConfig() && isTripAllowedForOpenAIExtraction(tripId);
}
