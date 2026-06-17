"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const themes = [
  {
    name: "Modern / Futuristic",
    description: "Crisp, precise, and high-contrast.",
    surface: "#f5f7f4",
    text: "#15191d",
  },
  {
    name: "Rustic / Adventure",
    description: "Grounded, outdoorsy, and close to the current reference app.",
    surface: "#faf8f2",
    text: "#20211f",
  },
  {
    name: "Whimsical / Fantasy",
    description: "Storybook, soft, and playful without getting childish.",
    surface: "#fbf3df",
    text: "#292432",
  },
];

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;

  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToHex(h: number, s: number, l: number) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = l - chroma / 2;
  const [red, green, blue] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return rgbToHex(
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255)
  );
}

function derivePalette(primary: string) {
  const { h, s, l } = rgbToHsl(hexToRgb(primary));
  const secondaryHue = (h + 35) % 360;
  const accentHue = (h + 180) % 360;

  return {
    primary,
    secondary: hslToHex(secondaryHue, Math.min(0.42, s * 0.72 + 0.08), 0.42),
    accent: hslToHex(accentHue, Math.min(0.5, s * 0.8 + 0.12), 0.56),
    soft: hslToHex(h, Math.min(0.22, s * 0.35), 0.94),
  };
}

export function StyleSettingsPanel({
  initialAppName,
  tripId,
}: {
  initialAppName: string;
  tripId: string;
}) {
  const [appName, setAppName] = useState(initialAppName);
  const [themeIndex, setThemeIndex] = useState(1);
  const [primaryColor, setPrimaryColor] = useState("#526247");
  const theme = themes[themeIndex];
  const palette = useMemo(() => derivePalette(primaryColor), [primaryColor]);

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[0.48fr_0.52fr]">
      <div className="rounded-md border border-ink/10 bg-white p-5">
        <label className="block">
          <span className="text-sm font-semibold text-ink">App name</span>
          <input
            className="mt-2 w-full rounded-md border border-ink/15 px-3 py-3 text-sm"
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
            {themes.map((option, index) => (
              <button
                key={option.name}
                className={
                  index === themeIndex
                    ? "flex w-full items-center justify-between rounded-md border border-moss/35 bg-moss/10 p-3 text-left"
                    : "flex w-full items-center justify-between rounded-md border border-ink/10 bg-paper p-3 text-left"
                }
                type="button"
                onClick={() => setThemeIndex(index)}
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{option.name}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {option.description}
                  </p>
                </div>
                {index === themeIndex ? (
                  <Check className="text-moss" size={20} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

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
              style={{ backgroundColor: index === 0 ? palette.soft : theme.surface, color: theme.text }}
            >
              <p
                className="text-xs font-semibold uppercase"
                style={{ color: index === 1 ? palette.secondary : palette.primary }}
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
        <Link
          href={`/maker/trips/${tripId}/publish`}
          className="mt-6 inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: palette.primary, color: "#ffffff" }}
        >
          Continue to publish
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
