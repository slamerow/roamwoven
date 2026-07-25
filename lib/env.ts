export function getOptionalEnv(name: string) {
  return process.env[name]?.trim() || null;
}

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
    // OCR model default. This is `gpt-5.4-mini` deliberately, and it must
    // stay the same family as `extractionModel` above unless a migration
    // says otherwise (AGENTS.md §Operating discipline 1: the pipeline is
    // SHAPE-CALIBRATED to the extraction model).
    //
    // History, and why this line has a test (2026-07-25): commit 1d862ec
    // (2026-07-10) changed this default from "gpt-5.4-mini" to
    // "gpt-5.6-luna", and `git log --all -S'gpt-5.6-luna'` shows it was
    // NEVER reverted. Run 7.25.0's telemetry then read exactly as that
    // asymmetry predicts — all 5 OCR batches / 19 pages / 31,173 chars on
    // gpt-5.6-luna while extraction and sourceRecovery ran gpt-5.4-mini,
    // because extractionModel defaulted to mini and ocrModel defaulted to
    // luna. Eli's verdict on luna was that it "really sucked" and the
    // decision was to roll back; the run's output corroborates it (41 of
    // 399 uncovered lines, four missing ground-truth stops, and "Josefov"
    // misread as "Joselov", which the run then raised a spelling question
    // about). That rollback existed only as a hosted env var, if at all —
    // so DELETING the env var, the most natural way to undo a model
    // change, silently restored luna. A code default is the durable place
    // for an approved rollback; the env var stays available for a
    // deliberate, telemetry-verified experiment.
    ocrModel:
      getOptionalEnv("OPENAI_OCR_MODEL") ??
      "gpt-5.4-mini",
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
