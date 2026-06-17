"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  ImagePlus,
  LockKeyhole,
  MapPin,
  Search,
  Sparkles,
  Tags,
  Upload,
} from "lucide-react";
import type { AsiaDemoTrip } from "@/lib/asia-trip";
import {
  classifyAddressSensitivity,
  classifySensitiveText,
  type SensitiveDetailClassification,
} from "@/lib/traveler-privacy";

const DEMO_TRAVELER_PASSWORD = "traveler";

const samplePhotos = [
  { day: "Day 12", label: "Kyoto lanes" },
  { day: "Day 19", label: "Tokyo evening" },
  { day: "Day 42", label: "Hoi An market" },
  { day: "Day 87", label: "Island sunset" },
];

type TravelerAppShellProps = {
  trip: AsiaDemoTrip;
};

function getCardSensitivity(item: AsiaDemoTrip["days"][number]["items"][number]) {
  return (
    classifyAddressSensitivity({
      address: item.address,
      context: `${item.title} ${item.description}`,
    }) ?? classifySensitiveText(`${item.title} ${item.description}`)
  );
}

function LockedDetail({
  children,
  classification,
  unlocked,
}: {
  children: string;
  classification: SensitiveDetailClassification;
  unlocked: boolean;
}) {
  if (unlocked) {
    return (
      <p className="mt-3 rounded-md bg-moss/10 px-3 py-2 text-xs leading-5 text-ink/70">
        {children}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-ink/10 bg-paper p-3">
      <div className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 shrink-0 text-clay" size={16} />
        <div>
          <p className="text-xs font-semibold text-ink">
            {classification.label} locked
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/55">
            {classification.reason}
          </p>
          <div className="mt-2 h-5 max-w-56 rounded bg-ink/10 blur-[3px]" />
        </div>
      </div>
    </div>
  );
}

export function TravelerAppShell({ trip }: TravelerAppShellProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const featuredDays = trip.days.slice(0, 8);
  const todayDay = trip.days[0];
  const sensitiveCount = useMemo(
    () =>
      trip.days.reduce(
        (count, day) =>
          count + day.items.filter((item) => getCardSensitivity(item)).length,
        0
      ),
    [trip.days]
  );
  const tabs = unlocked
    ? [
        { href: "#today", icon: Sparkles, label: "Today" },
        { href: "#day-nav", icon: CalendarDays, label: "Days" },
        { href: "#photos", icon: Camera, label: "Photos" },
        { href: "#private", icon: LockKeyhole, label: "Details" },
      ]
    : [
        { href: "#photos", icon: Camera, label: "Photos" },
        { href: "#today", icon: Sparkles, label: "Today" },
        { href: "#day-nav", icon: CalendarDays, label: "Days" },
        { href: "#unlock", icon: LockKeyhole, label: "Unlock" },
      ];

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.trim().toLowerCase() === DEMO_TRAVELER_PASSWORD) {
      setUnlocked(true);
      setError(false);
      return;
    }

    setError(true);
  }

  return (
    <main className="journal-page min-h-screen text-[var(--color-ink)]">
      <div className="journal-app mx-auto flex min-h-screen w-full max-w-[440px] flex-col border-x border-black/10 shadow-2xl shadow-stone-950/25">
      <section className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-app)]/95 px-4 pb-4 pt-5 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              {unlocked ? "Traveler mode" : "Follow-along mode"}
            </p>
            <p className="text-base font-semibold text-[var(--color-ink)]">
              {trip.name}
            </p>
          </div>
          <a
            href={unlocked ? "#today" : "#photos"}
            className="rounded-lg bg-[var(--color-green)] px-3 py-2 text-xs font-semibold text-white shadow-sm"
          >
            {unlocked ? "Today" : "Photos"}
          </a>
        </div>
      </section>

      <section className="flex-1 px-5 pb-28 pt-5">
        <header className="rounded-xl bg-[var(--color-green)] p-5 text-white shadow-[var(--shadow-card)]">
          <p className="text-sm text-paper/70">{trip.dateRange}</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight">
            {trip.name}
          </h1>
          <p className="mt-4 text-sm leading-6 text-paper/70">
            {trip.countries.slice(0, 6).join(" / ")}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-semibold">{trip.dayCount}</p>
              <p className="mt-1 text-xs text-paper/65">days</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-semibold">{trip.legs.length}</p>
              <p className="mt-1 text-xs text-paper/65">stays</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-2xl font-semibold">{trip.itemCount}</p>
              <p className="mt-1 text-xs text-paper/65">cards</p>
            </div>
          </div>
        </header>

        {!unlocked ? (
          <section id="unlock" className="mt-4 scroll-mt-24 rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 shrink-0 text-[var(--color-leather)]" size={18} />
              <div>
                <h2 className="text-base font-semibold text-[var(--color-ink)]">
                  Traveler details are locked
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  Follow along with photos and the trip shape. Enter the trip
                  password to reveal private details and upload photos.
                </p>
              </div>
            </div>
            <form className="mt-4 flex gap-2" onSubmit={unlock}>
              <input
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)]/25 bg-white/70 px-3 py-2 text-sm text-[var(--color-ink)]"
                placeholder="Trip password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="rounded-lg bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-white"
                type="submit"
              >
                Unlock
              </button>
            </form>
            {error ? (
              <p className="mt-2 text-xs font-semibold text-clay">
                That password did not unlock traveler mode. Demo password:
                traveler.
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink/45">
                Demo password: traveler
              </p>
            )}
          </section>
        ) : (
          <section className="mt-4 rounded-xl border border-[var(--color-green)]/20 bg-[var(--color-green)]/10 p-4">
            <p className="text-sm font-semibold text-[var(--color-green)]">
              Traveler mode unlocked
            </p>
            <p className="mt-1 text-sm leading-6 text-ink/60">
              Sensitive details and photo upload controls are now available.
            </p>
          </section>
        )}

        <section id="photos" className="mt-4 scroll-mt-24 rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Photos
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
                Follow along
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Photos are front and center for friends and family.
              </p>
            </div>
            {unlocked ? (
              <button className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-green)] px-3 py-2 text-xs font-semibold text-white">
                <Upload size={14} />
                Upload
              </button>
            ) : (
              <span className="rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-muted)]">
                Upload locked
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {samplePhotos.map((photo, index) => (
              <div
                className="aspect-square rounded-lg bg-[var(--color-leather)] p-3 text-white shadow-sm"
                key={photo.label}
              >
                <Camera className="text-flax" size={18} />
                <p className="mt-12 text-xs font-semibold">{photo.day}</p>
                <p className="mt-1 text-sm font-semibold">{photo.label}</p>
                {index === 0 && !unlocked ? (
                  <p className="mt-2 rounded bg-paper/10 px-2 py-1 text-[10px] text-paper/70">
                    New
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {unlocked ? (
            <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)]/25 bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
              <ImagePlus size={16} />
              Add trip photos
            </button>
          ) : null}
        </section>

        <section id="today" className="mt-4 scroll-mt-24 rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Today
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
                {todayDay.title}
              </h2>
              <p className="mt-1 text-sm text-ink/60">{todayDay.legName}</p>
            </div>
            <MapPin className="text-clay" size={20} />
          </div>
          <p className="mt-3 text-sm leading-6 text-ink/60">
            {unlocked
              ? "Traveler mode keeps the operational day view close."
              : "Follower mode keeps today available without exposing private trip logistics."}
          </p>
        </section>

        <nav id="day-nav" className="mt-4 scroll-mt-24 overflow-x-auto pb-2 hide-scrollbar">
          <div className="flex gap-2">
            {featuredDays.map((day) => (
              <a
                key={day.date}
                href={`#day-${day.date}`}
                className="min-w-28 rounded-lg border border-[var(--color-border)]/25 bg-[var(--color-app)] p-3 shadow-sm"
              >
                <p className="text-xs font-semibold text-[var(--color-muted)]">{day.label}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-ink)]">
                  {day.title}
                </p>
              </a>
            ))}
          </div>
        </nav>

        <section id="private" className="mt-4 scroll-mt-24 rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 shadow-[var(--shadow-card)]">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {sensitiveCount} private details protected
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
            Exact lodging, booking controls, access notes, and private contact
            details stay locked unless traveler mode is unlocked.
          </p>
        </section>

        <div className="mt-4 space-y-5">
          {trip.days.map((day) => (
            <section
              id={day.label === "Day 1" ? "today-list" : `day-${day.date}`}
              key={day.date}
              className="scroll-mt-24"
            >
              <div className="mb-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-moss">
                      {day.label}
                    </p>
                    <h2 className="text-xl font-semibold text-ink">
                      {day.title}
                    </h2>
                  </div>
                  <p className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-leather)]">
                    {day.items.length} cards
                  </p>
                </div>
                {day.legName ? (
                  <p className="mt-1 text-sm text-ink/60">{day.legName}</p>
                ) : null}
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/40">
                  {day.primaryCategory}
                </p>
              </div>
              <div className="space-y-3">
                {day.items.map((item) => {
                  const classification = getCardSensitivity(item);
                  const descriptionClassification = classifySensitiveText(
                    item.description
                  );

                  return (
                    <article
                      key={item.id}
                      className="rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-leather)]">
                        {[item.time, item.category].filter(Boolean).join(" · ")}
                      </p>
                      <h3 className="mt-2 text-base font-semibold text-[var(--color-ink)]">
                        {item.title}
                      </h3>
                      {descriptionClassification && !unlocked ? (
                        <LockedDetail
                          classification={descriptionClassification}
                          unlocked={unlocked}
                        >
                          {item.description}
                        </LockedDetail>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-ink/65">
                          {item.description}
                        </p>
                      )}
                      {item.address && classification ? (
                        <LockedDetail
                          classification={classification}
                          unlocked={unlocked}
                        >
                          {item.address}
                        </LockedDetail>
                      ) : item.address ? (
                        <p className="mt-3 text-xs text-ink/45">
                          {item.address}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
      <nav className="fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-app)]/96 px-3 pb-3 pt-2 backdrop-blur">
        <div className="grid grid-cols-4 gap-2">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const active = index === 0;

            return (
              <a
                key={tab.label}
                href={tab.href}
                className={
                  active
                    ? "flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-[var(--color-green)] text-xs font-semibold text-white shadow-lg shadow-emerald-950/25"
                    : "flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold text-[var(--color-muted)] hover:bg-white/70"
                }
              >
                <Icon size={20} strokeWidth={2.2} />
                <span>{tab.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
      </div>
    </main>
  );
}
