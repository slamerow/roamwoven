import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME_DIRECTION,
  isHexColor,
  isThemeDirectionKey,
  type ThemeDirectionKey,
  type TripStyleSettings,
} from "@/lib/style-settings-config";

type TripStyleSettingsRow = {
  app_name: string | null;
  primary_color: string | null;
  theme_direction: string | null;
  updated_at: string | null;
};

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getDefaultStyleSettings(appName: string): TripStyleSettings {
  return {
    appName,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    themeDirection: DEFAULT_THEME_DIRECTION,
    updatedAt: null,
  };
}

function normalizeStyleSettings(
  row: TripStyleSettingsRow | null,
  fallbackAppName: string
): TripStyleSettings {
  const themeDirection = row?.theme_direction ?? DEFAULT_THEME_DIRECTION;
  const primaryColor = row?.primary_color ?? DEFAULT_PRIMARY_COLOR;

  return {
    appName: row?.app_name?.trim() || fallbackAppName,
    primaryColor: isHexColor(primaryColor) ? primaryColor : DEFAULT_PRIMARY_COLOR,
    themeDirection: isThemeDirectionKey(themeDirection)
      ? themeDirection
      : DEFAULT_THEME_DIRECTION,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function getTripStyleSettings({
  fallbackAppName,
  tripId,
}: {
  fallbackAppName: string;
  tripId: string;
}): Promise<TripStyleSettings> {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    return getDefaultStyleSettings(fallbackAppName);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_style_settings")
    .select("app_name,primary_color,theme_direction,updated_at")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return getDefaultStyleSettings(fallbackAppName);
    }

    throw new Error(`Unable to load style settings: ${error.message}`);
  }

  return normalizeStyleSettings(data as TripStyleSettingsRow | null, fallbackAppName);
}

export async function saveTripStyleSettings({
  appName,
  primaryColor,
  themeDirection,
  tripId,
}: {
  appName: string;
  primaryColor: string;
  themeDirection: ThemeDirectionKey;
  tripId: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("trip_style_settings")
    .upsert(
      {
        trip_id: tripId,
        app_name: appName.trim(),
        primary_color: primaryColor,
        theme_direction: themeDirection,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id" }
    );

  if (error) {
    throw new Error(`Unable to save style settings: ${error.message}`);
  }
}
