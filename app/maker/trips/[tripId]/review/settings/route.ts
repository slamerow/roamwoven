import { NextRequest, NextResponse } from "next/server";
import {
  APP_MODULES,
  BUILD_CONFIRMATIONS,
  getDefaultBuildSettings,
  saveTripBuildSettings,
  type AppModuleKey,
  type BuildConfirmationKey,
} from "@/lib/build-settings";
import { getMakerTrip } from "@/lib/trips";

function parseBooleanMap<Key extends string>(
  value: unknown,
  keys: readonly Key[],
  fallback: Record<Key, boolean>
) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    keys.map((key) => [
      key,
      typeof record[key] === "boolean" ? record[key] : fallback[key],
    ])
  ) as Record<Key, boolean>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const reviewUrl = new URL(`/maker/trips/${tripId}/review`, request.url);
  const styleUrl = new URL(`/maker/trips/${tripId}/style`, request.url);

  if (trip.isDemo) {
    return NextResponse.redirect(styleUrl, 303);
  }

  if (trip.paymentStatus !== "paid") {
    reviewUrl.searchParams.set("error", "checkout-required");
    return NextResponse.redirect(reviewUrl, 303);
  }

  try {
    const formData = await request.formData();
    const rawSettings = JSON.parse(String(formData.get("settings") ?? "{}")) as {
      enabledModules?: unknown;
      confirmations?: unknown;
    };
    const defaults = getDefaultBuildSettings();
    const enabledModules = parseBooleanMap<AppModuleKey>(
      rawSettings.enabledModules,
      APP_MODULES.map((module) => module.key),
      defaults.enabledModules
    );
    const confirmations = parseBooleanMap<BuildConfirmationKey>(
      rawSettings.confirmations,
      BUILD_CONFIRMATIONS.map((confirmation) => confirmation.key),
      defaults.confirmations
    );

    await saveTripBuildSettings({
      tripId,
      enabledModules,
      confirmations,
    });

    styleUrl.searchParams.set("scope", "saved");
    return NextResponse.redirect(styleUrl, 303);
  } catch {
    reviewUrl.searchParams.set("error", "settings-save-failed");
    return NextResponse.redirect(reviewUrl, 303);
  }
}
