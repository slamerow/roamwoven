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

export function getStripeConfig() {
  return {
    secretKey: getOptionalEnv("STRIPE_SECRET_KEY"),
    webhookSecret: getOptionalEnv("STRIPE_WEBHOOK_SECRET"),
    tripPriceId: getOptionalEnv("STRIPE_TRIP_PRICE_ID"),
    appUrl: getOptionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
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
