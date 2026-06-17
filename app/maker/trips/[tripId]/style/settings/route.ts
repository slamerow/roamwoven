import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_THEME_DIRECTION,
  derivePalette,
  derivePaletteOptions,
  isHexColor,
  isThemeDirectionKey,
} from "@/lib/style-settings-config";
import { saveTripStyleSettings } from "@/lib/style-settings";
import { getMakerTrip } from "@/lib/trips";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const trip = await getMakerTrip(tripId);
  const styleUrl = new URL(`/maker/trips/${tripId}/style`, request.url);
  const dataUrl = new URL(`/maker/trips/${tripId}/data`, request.url);

  if (trip.isDemo) {
    return NextResponse.redirect(dataUrl, 303);
  }

  if (trip.paymentStatus !== "paid") {
    styleUrl.searchParams.set("error", "checkout-required");
    return NextResponse.redirect(styleUrl, 303);
  }

  try {
    const formData = await request.formData();
    const appName = String(formData.get("appName") ?? trip.name).trim() || trip.name;
    const primaryColor = String(formData.get("primaryColor") ?? DEFAULT_PRIMARY_COLOR);
    const safePrimaryColor = isHexColor(primaryColor)
      ? primaryColor
      : DEFAULT_PRIMARY_COLOR;
    const palette = derivePalette(safePrimaryColor);
    const paletteOptions = derivePaletteOptions(safePrimaryColor);
    const secondaryColor = String(
      formData.get("secondaryColor") ?? palette.secondary
    );
    const accentColor = String(formData.get("accentColor") ?? palette.accent);
    const softColor = String(formData.get("softColor") ?? palette.soft);
    const themeDirection = String(
      formData.get("themeDirection") ?? DEFAULT_THEME_DIRECTION
    );

    await saveTripStyleSettings({
      appName,
      primaryColor: safePrimaryColor,
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
      tripId,
    });

    dataUrl.searchParams.set("style", "saved");
    return NextResponse.redirect(dataUrl, 303);
  } catch {
    styleUrl.searchParams.set("error", "style-save-failed");
    return NextResponse.redirect(styleUrl, 303);
  }
}
