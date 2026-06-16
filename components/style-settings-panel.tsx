"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const palettes = [
  {
    name: "Forest Clay",
    colors: ["#20211f", "#526247", "#a05b43", "#faf8f2"],
  },
  {
    name: "Coastal",
    colors: ["#19333a", "#3d7280", "#d38b5d", "#f7f2e8"],
  },
  {
    name: "Market Day",
    colors: ["#26312a", "#6f8b52", "#bd6648", "#fff8e7"],
  },
];

export function StyleSettingsPanel({ tripId }: { tripId: string }) {
  const [appName, setAppName] = useState("Wren's Adventure");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const palette = palettes[paletteIndex];

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
          <p className="text-sm font-semibold text-ink">Color palette</p>
          <div className="mt-3 space-y-3">
            {palettes.map((option, index) => (
              <button
                key={option.name}
                className="flex w-full items-center justify-between rounded-md border border-ink/10 bg-paper p-3 text-left"
                type="button"
                onClick={() => setPaletteIndex(index)}
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{option.name}</p>
                  <div className="mt-2 flex gap-1">
                    {option.colors.map((color) => (
                      <span
                        key={color}
                        className="h-5 w-8 rounded-sm border border-ink/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                {index === paletteIndex ? (
                  <Check className="text-moss" size={20} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="rounded-md border border-ink/10 p-5 text-paper"
        style={{ backgroundColor: palette.colors[0] }}
      >
        <p className="text-sm text-paper/70">Preview</p>
        <h2 className="mt-2 text-4xl font-semibold leading-tight">
          {appName || "Untitled Trip"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-paper/70">
          A private trip app generated from clean structured data.
        </p>
        <div className="mt-6 space-y-3">
          <div className="rounded-md p-4 text-ink" style={{ backgroundColor: palette.colors[3] }}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: palette.colors[2] }}>
              Travel
            </p>
            <p className="mt-2 text-sm font-semibold">Fly to Seattle</p>
          </div>
          <div className="rounded-md p-4 text-ink" style={{ backgroundColor: palette.colors[3] }}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: palette.colors[2] }}>
              Stay
            </p>
            <p className="mt-2 text-sm font-semibold">Airbnb Kihei</p>
          </div>
        </div>
        <Link
          href={`/maker/trips/${tripId}/publish`}
          className="mt-6 inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: palette.colors[3], color: palette.colors[0] }}
        >
          Publish app
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
