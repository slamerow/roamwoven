import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APP_MODULES,
  BUILD_CONFIRMATIONS,
  type AppModuleKey,
  type BuildConfirmationKey,
  type TripBuildSettings,
} from "@/lib/build-settings-config";

export {
  APP_MODULES,
  BUILD_CONFIRMATIONS,
  type AppModuleKey,
  type BuildConfirmationKey,
  type TripBuildSettings,
};

type TripBuildSettingsRow = {
  enabled_modules: Record<string, unknown> | null;
  confirmations: Record<string, unknown> | null;
  updated_at: string | null;
};

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getDefaultBuildSettings(): TripBuildSettings {
  return {
    enabledModules: Object.fromEntries(
      APP_MODULES.map((module) => [module.key, module.defaultEnabled])
    ) as Record<AppModuleKey, boolean>,
    confirmations: Object.fromEntries(
      BUILD_CONFIRMATIONS.map((confirmation) => [confirmation.key, false])
    ) as Record<BuildConfirmationKey, boolean>,
    updatedAt: null,
  };
}

function coerceBooleanMap<Key extends string>(
  value: Record<string, unknown> | null | undefined,
  keys: readonly Key[],
  fallback: Record<Key, boolean>
) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      typeof value?.[key] === "boolean" ? value[key] : fallback[key],
    ])
  ) as Record<Key, boolean>;
}

function normalizeBuildSettings(
  row: TripBuildSettingsRow | null
): TripBuildSettings {
  const defaults = getDefaultBuildSettings();

  if (!row) {
    return defaults;
  }

  return {
    enabledModules: coerceBooleanMap(
      row.enabled_modules,
      APP_MODULES.map((module) => module.key),
      defaults.enabledModules
    ),
    confirmations: coerceBooleanMap(
      row.confirmations,
      BUILD_CONFIRMATIONS.map((confirmation) => confirmation.key),
      defaults.confirmations
    ),
    updatedAt: row.updated_at,
  };
}

export async function getTripBuildSettings(
  tripId: string
): Promise<TripBuildSettings> {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    return getDefaultBuildSettings();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_build_settings")
    .select("enabled_modules,confirmations,updated_at")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return getDefaultBuildSettings();
    }

    throw new Error(`Unable to load build settings: ${error.message}`);
  }

  return normalizeBuildSettings(data as TripBuildSettingsRow | null);
}

export async function saveTripBuildSettings({
  tripId,
  enabledModules,
  confirmations,
}: {
  tripId: string;
  enabledModules: Record<AppModuleKey, boolean>;
  confirmations: Record<BuildConfirmationKey, boolean>;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("trip_build_settings")
    .upsert(
      {
        trip_id: tripId,
        enabled_modules: enabledModules,
        confirmations,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id" }
    );

  if (error) {
    throw new Error(`Unable to save build settings: ${error.message}`);
  }
}
