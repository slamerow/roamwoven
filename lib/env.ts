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
  };
}

export function hasSupabaseBrowserConfig() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
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
