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

export function hasSupabaseBrowserConfig() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

