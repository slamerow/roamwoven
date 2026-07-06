"use client";

import { CSSProperties, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { TravelerAppShell } from "@/components/traveler-app-shell";
import type { TravelerAppViewModel } from "@/lib/traveler-view-model";
import {
  THEME_DIRECTIONS,
  derivePalette,
  derivePaletteOptions,
  getThemeDirection,
  type ThemeDirectionKey,
  type TripStyleSettings,
} from "@/lib/style-settings-config";

const paletteFields = [
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "soft", label: "Soft" },
] as const;

export function StyleSettingsPanel({
  previewTrip,
  settings,
  tripId,
}: {
  previewTrip: TravelerAppViewModel;
  settings: TripStyleSettings;
  tripId: string;
}) {
  const [appName, setAppName] = useState(settings.appName);
  const [themeDirection, setThemeDirection] = useState<ThemeDirectionKey>(
    settings.themeDirection
  );
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor);
  const derivedPalette = useMemo(() => derivePalette(primaryColor), [primaryColor]);
  const paletteOptions = useMemo(
    () => derivePaletteOptions(primaryColor),
    [primaryColor]
  );
  const [secondaryColor, setSecondaryColor] = useState(
    settings.secondaryColor ?? derivedPalette.secondary
  );
  const [accentColor, setAccentColor] = useState(
    settings.accentColor ?? derivedPalette.accent
  );
  const [softColor, setSoftColor] = useState(
    settings.softColor ?? derivedPalette.soft
  );
  const theme = getThemeDirection(themeDirection);
  const palette = {
    primary: primaryColor,
    secondary: paletteOptions.secondary.includes(secondaryColor)
      ? secondaryColor
      : derivedPalette.secondary,
    accent: paletteOptions.accent.includes(accentColor)
      ? accentColor
      : derivedPalette.accent,
    soft: paletteOptions.soft.includes(softColor)
      ? softColor
      : derivedPalette.soft,
  };
  const previewVars = useMemo<CSSProperties>(() => {
    if (themeDirection === "modern_futuristic") {
      return {
        "--color-page": "#d9e4e8",
        "--color-app": "#f8fbfd",
        "--color-surface": "#e7eff4",
        "--color-border": palette.accent,
        "--color-ink": "#10161d",
        "--color-muted": "#5a6873",
        "--color-green": palette.primary,
        "--color-leather": palette.secondary,
        "--color-brass": palette.accent,
        "--color-sky": palette.soft,
        "--color-blue": palette.secondary,
        "--shadow-card": "0 18px 42px rgb(16 22 29 / 0.16)",
        fontFamily: theme.fontFamily,
      } as CSSProperties;
    }

    if (themeDirection === "whimsical_fantasy") {
      return {
        "--color-page": "#d6cbc5",
        "--color-app": "#fff7e8",
        "--color-surface": palette.soft,
        "--color-border": palette.accent,
        "--color-ink": "#292432",
        "--color-muted": "#6d5d75",
        "--color-green": palette.primary,
        "--color-leather": palette.secondary,
        "--color-brass": palette.accent,
        "--color-sky": "#f5edf8",
        "--color-blue": palette.secondary,
        "--shadow-card": "0 22px 54px rgb(41 36 50 / 0.2)",
        fontFamily: theme.fontFamily,
      } as CSSProperties;
    }

    return {
      "--color-page": "#aeb99d",
      "--color-app": "#f8e8c5",
      "--color-surface": "#ead2a2",
      "--color-border": palette.secondary,
      "--color-ink": "#231f14",
      "--color-muted": "#6f552e",
      "--color-green": palette.primary,
      "--color-leather": palette.secondary,
      "--color-brass": palette.accent,
      "--color-sky": palette.soft,
      "--color-blue": palette.secondary,
      "--shadow-card": "0 18px 34px rgb(49 31 12 / 0.25)",
      fontFamily: theme.fontFamily,
    } as CSSProperties;
  }, [palette.accent, palette.primary, palette.secondary, palette.soft, theme.fontFamily, themeDirection]);

  function updatePrimaryColor(value: string) {
    const nextPalette = derivePalette(value);

    setPrimaryColor(value);
    setSecondaryColor(nextPalette.secondary);
    setAccentColor(nextPalette.accent);
    setSoftColor(nextPalette.soft);
  }

  function setPaletteValue(key: keyof typeof palette, value: string) {
    if (key === "secondary") {
      setSecondaryColor(value);
    } else if (key === "accent") {
      setAccentColor(value);
    } else if (key === "soft") {
      setSoftColor(value);
    }
  }

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[0.48fr_0.52fr]">
      <form
        action={`/maker/trips/${tripId}/style/settings`}
        className="rounded-md border border-ink/10 bg-white p-5"
        method="post"
      >
        <input name="primaryColor" type="hidden" value={primaryColor} />
        <input name="secondaryColor" type="hidden" value={palette.secondary} />
        <input name="accentColor" type="hidden" value={palette.accent} />
        <input name="softColor" type="hidden" value={palette.soft} />
        <input name="themeDirection" type="hidden" value={themeDirection} />

        <label className="block">
          <span className="text-sm font-semibold text-ink">App name</span>
          <input
            className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
            name="appName"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
          />
          <span className="mt-2 block text-xs leading-5 text-ink/55">
            This is the title travelers see in the finished app. The dashboard
            trip name can be edited from the trip workspace.
          </span>
        </label>

        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">Theme direction</p>
          <p className="mt-1 text-xs leading-5 text-ink/55">
            Every direction keeps the same quiet luxury baseline. Choose the
            expression that best fits the trip.
          </p>
          <div className="mt-3 space-y-3">
            {THEME_DIRECTIONS.map((option) => (
              <button
                key={option.key}
                className={
                  option.key === themeDirection
                    ? "flex w-full items-center justify-between rounded-md border border-moss/35 bg-moss/10 p-3 text-left"
                    : "flex w-full items-center justify-between rounded-md border border-ink/10 bg-paper p-3 text-left"
                }
                type="button"
                onClick={() => setThemeDirection(option.key)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{option.name}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {option.description}
                  </p>
                  <span className="mt-3 flex gap-1.5">
                    {[option.surface, option.text, palette.primary].map(
                      (color) => (
                        <span
                          aria-hidden="true"
                          className="h-3 w-8 rounded-full ring-1 ring-ink/10"
                          key={color}
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </span>
                </div>
                {option.key === themeDirection ? (
                  <Check className="text-moss" size={20} />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">Primary color</p>
          <div className="mt-3 flex items-center gap-3 rounded-md border border-ink/10 bg-paper p-3">
            <input
              aria-label="Primary color"
              className="h-11 w-16 cursor-pointer rounded-md border border-ink/10 bg-transparent"
              type="color"
              value={primaryColor}
              onChange={(event) => updatePrimaryColor(event.target.value)}
            />
            <div>
              <p className="text-sm font-semibold text-ink">{primaryColor}</p>
              <p className="mt-1 text-xs text-ink/55">
                Companion colors are narrowed to polished combinations.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {paletteFields.map((field) => (
              <label
                className="grid gap-2 rounded-md border border-ink/10 bg-paper p-3"
                key={field.key}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">
                  {field.label}
                </span>
                <select
                  className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink"
                  value={palette[field.key]}
                  onChange={(event) =>
                    setPaletteValue(field.key, event.target.value)
                  }
                >
                  {paletteOptions[field.key].map((color, index) => (
                    <option key={color} value={color}>
                      Option {index + 1} / {color}
                    </option>
                  ))}
                </select>
                <span className="grid grid-cols-4 gap-2">
                  {paletteOptions[field.key].map((color) => (
                    <button
                      aria-label={`Use ${color} for ${field.label.toLowerCase()}`}
                      className={
                        color === palette[field.key]
                          ? "h-7 rounded-sm ring-2 ring-ink ring-offset-2"
                          : "h-7 rounded-sm ring-1 ring-ink/10 transition hover:ring-2 hover:ring-ink/35"
                      }
                      key={color}
                      style={{ backgroundColor: color }}
                      title={`${field.label}: ${color}`}
                      type="button"
                      onClick={() => setPaletteValue(field.key, color)}
                    />
                  ))}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          type="submit"
        >
          Save design and continue
          <ArrowRight size={16} />
        </button>
      </form>

      <div className="overflow-hidden rounded-md border border-ink/10 bg-ink p-5 text-paper">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-flax">
              Traveler app preview
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Live traveler shell
            </h2>
          </div>
          <div className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-ink">
            {theme.name}
          </div>
        </div>

        <TravelerAppShell
          displayName={appName || "Untitled Trip"}
          initialUnlocked
          mode="preview"
          style={previewVars}
          trip={previewTrip}
        />
      </div>
    </section>
  );
}
