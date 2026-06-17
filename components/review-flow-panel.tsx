"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CloudSun,
  Languages,
  Map,
  Plane,
  Images,
  Search,
  Hotel,
} from "lucide-react";
import {
  APP_MODULES,
  BUILD_CONFIRMATIONS,
  type AppModuleKey,
  type BuildConfirmationKey,
  type TripBuildSettings,
} from "@/lib/build-settings-config";
import type { MakerTrip } from "@/lib/trips";
import type { TripUpload } from "@/lib/uploads";

const moduleIcons: Record<AppModuleKey, typeof CalendarDays> = {
  itinerary: CalendarDays,
  stays: Hotel,
  travel: Plane,
  search: Search,
  phrases: Languages,
  weather: CloudSun,
  maps: Map,
  photos: Images,
};

function formatSize(bytes: number | null) {
  if (!bytes) {
    return "Notes";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function ReviewFlowPanel({
  trip,
  uploads,
  settings,
  saved,
  error,
}: {
  trip: MakerTrip;
  uploads: TripUpload[];
  settings: TripBuildSettings;
  saved?: boolean;
  error?: boolean;
}) {
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(
    () => settings.enabledModules
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(
    () => settings.confirmations
  );

  const checkedCount = BUILD_CONFIRMATIONS.filter(
    (item) => checked[item.key]
  ).length;
  const enabledCount = Object.values(enabledModules).filter(Boolean).length;
  const canContinue =
    uploads.length > 0 && checkedCount === BUILD_CONFIRMATIONS.length;
  const settingsPayload = JSON.stringify({ enabledModules, confirmations: checked });
  const percent = 60;
  const steps = [
    "Create trip",
    "Pay once",
    "Upload info",
    "Content scope",
    "Design",
  ];

  return (
    <>
      <section className="sticky top-0 z-10 -mx-6 border-b border-ink/10 bg-paper/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                Step 4 of 5
              </p>
              <h2 className="text-base font-semibold text-ink">
                Content scope
              </h2>
            </div>
            <p className="hidden text-sm text-ink/60 md:block">
              {uploads.length} material{uploads.length === 1 ? "" : "s"} saved ·{" "}
              {enabledCount} section{enabledCount === 1 ? "" : "s"} selected
            </p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-ink/10">
            <div
              className="h-2 rounded-full bg-moss"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2 text-[11px] font-semibold text-ink/45">
            {steps.map((step, index) => {
              const complete = index < 3;
              const current = index === 3;

              return (
                <span
                  key={step}
                  className={
                    complete
                      ? "text-moss"
                      : current
                        ? "text-clay"
                        : "text-ink/35"
                  }
                >
                  {step}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-ink/10 bg-white p-5">
        {saved ? (
          <p className="mb-4 rounded-md bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            Content choices saved.
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-md bg-clay/10 px-3 py-2 text-sm font-semibold text-clay">
            Content choices could not be saved. Try again in a moment.
          </p>
        ) : null}
        <div>
          <h2 className="text-xl font-semibold text-ink">
            Confirm what belongs in the app
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            This sets the app scope before design. The actual structured draft
            comes after the design choices are saved.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.68fr_0.32fr]">
        <div className="space-y-6">
          <section className="rounded-md border border-ink/10 bg-white p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  Choose what the app includes
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Roamwoven will only generate sections that belong in this trip.
                </p>
              </div>
              <p className="text-sm font-semibold text-moss">
                {enabledCount} selected
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {APP_MODULES.map((module) => {
                const Icon = moduleIcons[module.key];
                const enabled = enabledModules[module.key];

                return (
                  <button
                    key={module.key}
                    className={
                      enabled
                        ? "rounded-md border border-moss/35 bg-moss/10 p-4 text-left"
                        : "rounded-md border border-ink/10 bg-paper p-4 text-left"
                    }
                    type="button"
                    onClick={() =>
                      setEnabledModules((current) => ({
                        ...current,
                        [module.key]: !current[module.key],
                      }))
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Icon
                        className={enabled ? "text-moss" : "text-ink/40"}
                        size={22}
                      />
                      <span
                        aria-hidden="true"
                        className={
                          enabled
                            ? "flex h-6 w-11 items-center rounded-full bg-moss p-1"
                            : "flex h-6 w-11 items-center rounded-full bg-ink/20 p-1"
                        }
                      >
                        <span
                          className={
                            enabled
                              ? "ml-auto h-4 w-4 rounded-full bg-white"
                              : "h-4 w-4 rounded-full bg-white"
                          }
                        />
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink">
                      {module.title}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-ink/60">
                      {module.copy}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-xl font-semibold text-ink">
              Confirm before build
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              These checks help keep the app focused before Roamwoven turns
              source materials into the first structured draft.
            </p>
            <div className="mt-5 space-y-3">
              {BUILD_CONFIRMATIONS.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer gap-3 rounded-md bg-paper p-4"
                >
                  <input
                    checked={Boolean(checked[item.key])}
                    className="mt-1 h-4 w-4 accent-moss"
                    type="checkbox"
                    onChange={(event) =>
                      setChecked((current) => ({
                        ...current,
                        [item.key]: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-ink/60">
                      {item.copy}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">{trip.name}</h2>
            {trip.destinationSummary ? (
              <p className="mt-2 text-sm leading-6 text-ink/60">
                {trip.destinationSummary}
              </p>
            ) : null}
            <div className="mt-5 rounded-md bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                Materials
              </p>
              {uploads.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {uploads.slice(0, 4).map((upload) => (
                    <div key={upload.id} className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {upload.originalFilename}
                      </p>
                      <p className="mt-1 text-xs text-ink/50">
                        {formatDate(upload.createdAt)} ·{" "}
                        {formatSize(upload.fileSizeBytes)}
                      </p>
                    </div>
                  ))}
                  {uploads.length > 4 ? (
                    <p className="text-xs font-semibold text-ink/50">
                      +{uploads.length - 4} more
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-5 text-ink/60">
                  Add files or notes before confirming the build.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-md border border-ink/10 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink">Next step</h2>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Save these content choices, then choose the app name, primary
              color, and visual direction.
            </p>
            {canContinue ? (
              <form action={`/maker/trips/${trip.id}/review/settings`} method="post">
                <input name="settings" type="hidden" value={settingsPayload} />
                <button
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper"
                  type="submit"
                >
                  Continue to design
                  <ArrowRight size={16} />
                </button>
              </form>
            ) : (
              <button
                className="mt-5 w-full rounded-md bg-ink/30 px-4 py-3 text-sm font-semibold text-paper"
                disabled
                type="button"
              >
                Confirm {BUILD_CONFIRMATIONS.length - checkedCount} more
              </button>
            )}
          </section>
        </aside>
      </section>
    </>
  );
}
