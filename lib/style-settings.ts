import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME_DIRECTION,
  derivePalette,
  derivePaletteOptions,
  isHexColor,
  isThemeDirectionKey,
  type ThemeDirectionKey,
  type TripStyleSettings,
} from "@/lib/style-settings-config";

type TripStyleSettingsRow = {
  app_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  soft_color: string | null;
  theme_direction: string | null;
  updated_at: string | null;
};

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

export function getDefaultStyleSettings(appName: string): TripStyleSettings {
  const palette = derivePalette(DEFAULT_PRIMARY_COLOR);

  return {
    appName,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    softColor: palette.soft,
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
  const palette = derivePalette(primaryColor);
  const paletteOptions = derivePaletteOptions(primaryColor);
  const secondaryColor = row?.secondary_color ?? palette.secondary;
  const accentColor = row?.accent_color ?? palette.accent;
  const softColor = row?.soft_color ?? palette.soft;

  return {
    appName: row?.app_name?.trim() || fallbackAppName,
    primaryColor: isHexColor(primaryColor) ? primaryColor : DEFAULT_PRIMARY_COLOR,
    secondaryColor:
      isHexColor(secondaryColor) &&
      paletteOptions.secondary.includes(secondaryColor)
        ? secondaryColor
        : palette.secondary,
    accentColor:
      isHexColor(accentColor) && paletteOptions.accent.includes(accentColor)
        ? accentColor
        : palette.accent,
    softColor:
      isHexColor(softColor) && paletteOptions.soft.includes(softColor)
        ? softColor
        : palette.soft,
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
    .select(
      "app_name,primary_color,secondary_color,accent_color,soft_color,theme_direction,updated_at"
    )
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
  accentColor,
  primaryColor,
  secondaryColor,
  softColor,
  themeDirection,
  tripId,
}: {
  appName: string;
  accentColor: string;
  primaryColor: string;
  secondaryColor: string;
  softColor: string;
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
        secondary_color: secondaryColor,
        accent_color: accentColor,
        soft_color: softColor,
        theme_direction: themeDirection,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id" }
    );

  if (error) {
    throw new Error(`Unable to save style settings: ${error.message}`);
  }
}

export async function syncTripStyleAppNameAfterTripRename({
  newTripName,
  oldTripName,
  tripId,
}: {
  newTripName: string;
  oldTripName: string;
  tripId: string;
}) {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_style_settings")
    .select("app_name")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return;
    }

    throw new Error(`Unable to load style app name: ${error.message}`);
  }

  const currentAppName = (data as Pick<TripStyleSettingsRow, "app_name"> | null)
    ?.app_name;

  if (currentAppName?.trim() && currentAppName.trim() !== oldTripName.trim()) {
    return;
  }

  const { error: updateError } = await supabase
    .from("trip_style_settings")
    .update({
      app_name: newTripName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("trip_id", tripId);

  if (updateError) {
    throw new Error(`Unable to sync style app name: ${updateError.message}`);
  }
}
