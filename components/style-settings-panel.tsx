"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  THEME_DIRECTIONS,
  derivePalette,
  getThemeDirection,
  type ThemeDirectionKey,
  type TripStyleSettings,
} from "@/lib/style-settings-config";

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
  const theme = getThemeDirection(themeDirection);
  const palette = useMemo(() => derivePalette(primaryColor), [primaryColor]);

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[0.48fr_0.52fr]">
      <form
        action={`/maker/trips/${tripId}/style/settings`}
        className="rounded-md border border-ink/10 bg-white p-5"
        method="post"
      >
        <input name="primaryColor" type="hidden" value={primaryColor} />
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
              onChange={(event) => setPrimaryColor(event.target.value)}
            />
            <div>
              <p className="text-sm font-semibold text-ink">{primaryColor}</p>
              <p className="mt-1 text-xs text-ink/55">
                Secondary and accent colors are suggested from this.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {Object.entries(palette).map(([label, color]) => (
              <div key={label} className="rounded-md border border-ink/10 p-2">
                <span
                  className="block h-8 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <p className="mt-2 text-xs font-semibold capitalize text-ink/55">
                  {label}
                </p>
              </div>
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
        className="rounded-md border border-ink/10 p-5"
        style={{ backgroundColor: theme.text, color: theme.surface }}
      >
        <p className="text-sm" style={{ color: palette.accent }}>
          {theme.name}
        </p>
        <h2 className="mt-2 text-4xl font-semibold leading-tight">
          {appName || "Untitled Trip"}
        </h2>
        <p className="mt-3 text-sm leading-6 opacity-75">
          A private trip app built from your confirmed materials.
        </p>
        <div className="mt-6 space-y-3">
          {["Today", "Stay", "Dinner"].map((label, index) => (
            <div
              key={label}
              className="rounded-md p-4"
              style={{
                backgroundColor: index === 0 ? palette.soft : theme.surface,
                color: theme.text,
              }}
            >
              <p
                className="text-xs font-semibold uppercase"
                style={{
                  color: index === 1 ? palette.secondary : palette.primary,
                }}
              >
                {label}
              </p>
              <p className="mt-2 text-sm font-semibold">
                {index === 0
                  ? "Morning plan"
                  : index === 1
                    ? "Check-in details"
                    : "Reservation card"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
