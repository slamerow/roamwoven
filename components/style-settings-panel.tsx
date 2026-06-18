"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Images,
  Languages,
  MapPin,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";
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

const themePreviewCopy = {
  modern_futuristic: {
    material: "Glass itinerary OS",
    cards: ["Transit window", "Hotel access", "Rooftop dinner"],
    detail:
      "Clean rails, crisp surfaces, and quick tools for moving through the day.",
  },
  rustic_adventure: {
    material: "Field journal",
    cards: ["Morning route", "Lodge check-in", "Trailside dinner"],
    detail:
      "Grounded cards, map-room warmth, and practical notes close to the plan.",
  },
  whimsical_fantasy: {
    material: "Storybook journey",
    cards: ["Morning chapter", "Hidden doorway", "Lantern dinner"],
    detail:
      "Soft storybook atmosphere with restrained contrast and readable cards.",
  },
} satisfies Record<
  ThemeDirectionKey,
  { cards: [string, string, string]; detail: string; material: string }
>;

function getReadableTextColor(backgroundColor: string) {
  const hex = backgroundColor.replace("#", "");
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const luminance =
    0.2126 * red ** 2.2 + 0.7152 * green ** 2.2 + 0.0722 * blue ** 2.2;

  return luminance > 0.52 ? "#201c16" : "#fffaf0";
}

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
  const isWhimsical = themeDirection === "whimsical_fantasy";
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
  const heroBackground = isWhimsical
    ? `linear-gradient(135deg, ${palette.soft} 0%, #fffaf0 48%, ${palette.accent} 180%)`
    : themeDirection === "modern_futuristic"
      ? `linear-gradient(145deg, ${palette.primary}, ${theme.text} 62%, ${palette.accent})`
      : `linear-gradient(135deg, ${palette.secondary}, ${theme.text})`;
  const heroTextColor = isWhimsical
    ? theme.text
    : getReadableTextColor(palette.primary);
  const themeCopy = themePreviewCopy[themeDirection];
  const isModern = themeDirection === "modern_futuristic";
  const isRustic = themeDirection === "rustic_adventure";

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
          Continue to process draft
          <ArrowRight size={16} />
        </button>
      </form>

      <div
        className="overflow-hidden rounded-md border border-ink/10 p-5"
        style={{ backgroundColor: theme.text, color: theme.surface }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: palette.accent }}
            >
              Traveler app preview
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              Traveler app structure
            </h2>
          </div>
          <div
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: palette.soft, color: theme.text }}
          >
            Today
          </div>
        </div>

        <div
          className={
            isModern
              ? "rounded-[26px] border p-4"
              : isRustic
                ? "rounded-[18px] border p-4"
                : "rounded-[34px] border p-4"
          }
          style={{
            backgroundColor: theme.surface,
            backgroundImage: isModern
              ? `linear-gradient(90deg, ${palette.soft} 1px, transparent 1px), linear-gradient(180deg, ${palette.soft} 1px, transparent 1px)`
              : isRustic
                ? `linear-gradient(180deg, ${palette.soft}, ${theme.surface})`
                : `radial-gradient(circle at 18% 10%, ${palette.soft}, transparent 34%), linear-gradient(180deg, #fffaf0, ${theme.surface})`,
            backgroundSize: isModern ? "26px 26px" : undefined,
            borderColor: palette.secondary,
            boxShadow: theme.cardShadow,
            color: theme.text,
            fontFamily: theme.fontFamily,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className="min-w-0 rounded-lg px-3 py-2"
              style={{ backgroundColor: palette.soft }}
            >
              <p className="text-[10px] font-bold uppercase leading-none opacity-65">
                Traveler mode
              </p>
              <p className="mt-1 truncate text-sm font-bold">
                {themeCopy.material}
              </p>
            </div>
            <div className="flex gap-1">
              {[Images, MapPin, Search, Languages].map((Icon, index) => (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  key={index}
                  style={{
                    backgroundColor: index === 0 ? palette.primary : palette.soft,
                    color: index === 0 ? getReadableTextColor(palette.primary) : theme.text,
                  }}
                >
                  <Icon size={17} />
                </span>
              ))}
            </div>
          </div>

          {isModern ? (
            <div className="mt-5">
              <div
                className="rounded-[22px] border p-5"
                style={{
                  background: heroBackground,
                  borderColor: palette.accent,
                  color: heroTextColor,
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                    {theme.name}
                  </p>
                  <span className="h-px flex-1 opacity-40" style={{ backgroundColor: heroTextColor }} />
                  <p className="text-xs font-semibold">09:20</p>
                </div>
                <h2 className={`mt-5 text-4xl leading-tight ${theme.headingClass}`}>
                  {appName || "Untitled Trip"}
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 opacity-80">
                  {themeCopy.detail}
                </p>
              </div>
              <div className="mt-5 space-y-3">
                {themeCopy.cards.map((label, index) => (
                  <div
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] border bg-white/80 p-3 backdrop-blur"
                    key={label}
                    style={{ borderColor: index === 0 ? palette.primary : palette.soft }}
                  >
                    <span
                      className="h-10 w-1.5 rounded-full"
                      style={{ backgroundColor: index === 0 ? palette.primary : palette.accent }}
                    />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-55">
                        {index === 0 ? "Today" : index === 1 ? "Stay" : "Dinner"}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{label}</p>
                    </div>
                    <span
                      className="rounded-full px-2 py-1 text-[10px] font-semibold"
                      style={{
                        backgroundColor: palette.soft,
                        color: theme.text,
                      }}
                    >
                      Open
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : isRustic ? (
            <div className="mt-5">
              <div
                className="rounded-[14px] border-l-4 p-5"
                style={{
                  background: heroBackground,
                  borderColor: palette.accent,
                  color: heroTextColor,
                }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                  {theme.name}
                </p>
                <h2 className={`mt-4 text-4xl leading-tight ${theme.headingClass}`}>
                  {appName || "Untitled Trip"}
                </h2>
                <p className="mt-3 text-sm leading-6 opacity-80">
                  {themeCopy.detail}
                </p>
              </div>
              <div className="mt-5 space-y-3 border-l-2 pl-4" style={{ borderColor: palette.secondary }}>
                {themeCopy.cards.map((label, index) => (
                  <div
                    className="relative rounded-[12px] border p-4"
                    key={label}
                    style={{
                      backgroundColor: index === 2 ? palette.primary : "#fffaf0",
                      borderColor: palette.secondary,
                      color: index === 2 ? getReadableTextColor(palette.primary) : theme.text,
                    }}
                  >
                    <span
                      className="absolute -left-[23px] top-5 h-3 w-3 rounded-full ring-4"
                      style={{
                        backgroundColor: palette.accent,
                        boxShadow: `0 0 0 4px ${theme.surface}`,
                      }}
                    />
                    <p className="text-xs font-semibold uppercase">
                      {index === 0 ? "Today" : index === 1 ? "Stay" : "Dinner"}
                    </p>
                    <p className={`mt-5 text-xl ${theme.headingClass}`}>{label}</p>
                    <p className="mt-2 text-xs leading-5 opacity-70">
                      Notes, timing, and private details stay tucked into the card.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div
                className="rounded-t-[54px] rounded-b-[26px] border p-6"
                style={{
                  background: heroBackground,
                  borderColor: palette.accent,
                  color: heroTextColor,
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-[0.16em]"
                  style={{ color: palette.secondary }}
                >
                  {theme.name}
                </p>
                <h2 className={`mt-5 text-4xl leading-tight ${theme.headingClass}`}>
                  {appName || "Untitled Trip"}
                </h2>
                <p className="mt-3 text-sm leading-6 opacity-80">
                  {themeCopy.detail}
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                {themeCopy.cards.map((label, index) => (
                  <div
                    className="rounded-[26px] border p-4"
                    key={label}
                    style={{
                      backgroundColor:
                        index === 0
                          ? "#fffaf0"
                          : index === 1
                            ? palette.soft
                            : palette.primary,
                      borderColor: palette.accent,
                      color: index === 2 ? getReadableTextColor(palette.primary) : theme.text,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: index === 2 ? palette.accent : palette.primary,
                          color: getReadableTextColor(index === 2 ? palette.accent : palette.primary),
                        }}
                      >
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-65">
                          {index === 0 ? "Today" : index === 1 ? "Stay" : "Dinner"}
                        </p>
                        <p className={`mt-1 text-lg ${theme.headingClass}`}>{label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              ["Legs", MapPin],
              ["Categories", Tags],
              ["Today", Sparkles],
              ["Calendar", CalendarDays],
            ].map(([label, Icon], index) => {
              const ActiveIcon = Icon as typeof Sparkles;

              return (
                <div
                  className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold"
                  key={label as string}
                  style={{
                    backgroundColor: index === 2 ? palette.primary : palette.soft,
                    color: index === 2 ? getReadableTextColor(palette.primary) : theme.text,
                  }}
                >
                  <ActiveIcon size={18} />
                  <span>{label as string}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3" style={{ fontFamily: theme.fontFamily }}>
          {[
            ["Palette", palette.primary],
            ["Accent", palette.accent],
            ["Soft", palette.soft],
          ].map(([label, color]) => (
            <div
              key={label}
              className="rounded-md border border-white/10 p-3"
              style={{
                backgroundColor: color,
                color: getReadableTextColor(color),
              }}
            >
              <p className="text-xs font-semibold uppercase">{label}</p>
              <p className="mt-1 text-sm font-bold">{color}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
