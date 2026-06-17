"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
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
  settings,
  tripId,
}: {
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
        </label>

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

        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">Theme direction</p>
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
                <div>
                  <p className="text-sm font-semibold text-ink">{option.name}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {option.description}
                  </p>
                </div>
                {option.key === themeDirection ? (
                  <Check className="text-moss" size={20} />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <button
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
          type="submit"
        >
          Build draft for review
          <ArrowRight size={16} />
        </button>
      </form>

      <div
        className="overflow-hidden rounded-md border border-ink/10 p-5"
        style={{ backgroundColor: theme.text, color: theme.surface }}
      >
        <div
          className="p-5"
          style={{
            background:
              themeDirection === "modern_futuristic"
                ? `linear-gradient(145deg, ${palette.primary}, ${theme.text} 62%, ${palette.accent})`
                : themeDirection === "whimsical_fantasy"
                  ? `radial-gradient(circle at top left, ${palette.accent} 0, ${palette.soft} 32%, ${theme.surface} 70%)`
                  : `linear-gradient(135deg, ${palette.secondary}, ${theme.text})`,
            borderRadius: theme.cardRadius,
            boxShadow: theme.cardShadow,
            color: theme.surface,
            fontFamily: theme.fontFamily,
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: palette.accent }}
          >
            {theme.name}
          </p>
          <h2 className={`mt-3 text-4xl leading-tight ${theme.headingClass}`}>
            {appName || "Untitled Trip"}
          </h2>
          <p className="mt-3 text-sm leading-6 opacity-80">
            A private trip app built from your confirmed materials.
          </p>
        </div>

        <div className="mt-6 space-y-3" style={{ fontFamily: theme.fontFamily }}>
          {["Today", "Stay", "Dinner"].map((label, index) => (
            <div
              key={label}
              className="border p-4"
              style={{
                backgroundColor:
                  index === 0
                    ? palette.soft
                    : index === 1
                      ? theme.surface
                      : palette.primary,
                borderColor: index === 2 ? palette.accent : palette.secondary,
                borderRadius: theme.cardRadius,
                boxShadow: index === 0 ? theme.cardShadow : "none",
                color: index === 2 ? theme.surface : theme.text,
              }}
            >
              <p
                className="text-xs font-semibold uppercase"
                style={{
                  color:
                    index === 2
                      ? theme.surface
                      : index === 1
                        ? palette.secondary
                        : palette.primary,
                }}
              >
                {label}
              </p>
              <p className={`mt-2 text-sm ${theme.headingClass}`}>
                {index === 0
                  ? "Morning plan"
                  : index === 1
                    ? "Check-in details"
                    : "Reservation card"}
              </p>
              <p className="mt-1 text-xs leading-5 opacity-70">
                The preview should feel like the app, not just a tinted form.
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
