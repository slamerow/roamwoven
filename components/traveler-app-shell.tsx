"use client";

import { CSSProperties, FormEvent, ReactNode, useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudSun,
  Images,
  ImagePlus,
  Languages,
  LockKeyhole,
  Map as MapIcon,
  MapPin,
  Search,
  Sparkles,
  Tags,
  Upload,
  X,
} from "lucide-react";
import type { AsiaDemoTrip } from "@/lib/asia-trip";
import {
  classifyAddressSensitivity,
  classifySensitiveText,
  type SensitiveDetailClassification,
} from "@/lib/traveler-privacy";
import {
  TRAVELER_TABS,
  TRAVELER_TOOLS,
  type TravelerTabId,
  type TravelerToolId,
} from "@/lib/traveler-app-architecture";

const DEMO_TRAVELER_PASSWORD = "traveler";

const samplePhotos = [
  { day: "Day 12", label: "Kyoto lanes" },
  { day: "Day 19", label: "Tokyo evening" },
  { day: "Day 42", label: "Hoi An market" },
  { day: "Day 87", label: "Island sunset" },
];

type TravelerAppShellProps = {
  displayName?: string;
  initialUnlocked?: boolean;
  mode?: "standalone" | "preview";
  style?: CSSProperties;
  trip: AsiaDemoTrip;
};

type TravelerItem = AsiaDemoTrip["days"][number]["items"][number];
type TravelerDay = AsiaDemoTrip["days"][number];
type ActiveTab = TravelerTabId;
type OverlayKind = "unlock" | TravelerToolId;

const travelerToolIcons: Record<TravelerToolId, typeof Sparkles> = {
  map: MapIcon,
  photos: Images,
  phrases: Languages,
  search: Search,
  stay: MapPin,
};

const travelerTabIcons: Record<TravelerTabId, typeof Sparkles> = {
  calendar: CalendarDays,
  categories: Tags,
  legs: MapPin,
  today: Sparkles,
};

function getCardSensitivity(item: TravelerItem) {
  return (
    classifyAddressSensitivity({
      address: item.address,
      context: `${item.title} ${item.description}`,
    }) ?? classifySensitiveText(`${item.title} ${item.description}`)
  );
}

function getItemSensitivity(item: TravelerItem) {
  return classifySensitiveText(item.description) ?? getCardSensitivity(item);
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function categoryEmoji(category: string | null | undefined) {
  const normalized = category?.toLowerCase() ?? "";

  if (normalized.includes("arrival") || normalized.includes("departure")) {
    return "✈️";
  }

  if (normalized.includes("food") || normalized.includes("dinner")) {
    return "🍽️";
  }

  if (normalized.includes("stay") || normalized.includes("hotel")) {
    return "🏨";
  }

  if (normalized.includes("transport")) {
    return "🚆";
  }

  if (normalized.includes("activity")) {
    return "✨";
  }

  return "•";
}

function categoriesForTrip(trip: AsiaDemoTrip) {
  const counts = new Map<string, number>();

  for (const item of trip.items) {
    const category = item.category?.replaceAll("_", " ") ?? "note";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
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
      <p className="mt-4 whitespace-pre-line rounded-xl bg-[var(--color-sky)]/55 px-4 py-3 text-sm leading-6 text-[var(--color-ink)]">
        {children}
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border)]/35 bg-[var(--color-app)] p-4">
      <div className="flex items-start gap-2">
        <LockKeyhole className="mt-0.5 shrink-0 text-[var(--color-leather)]" size={17} />
        <div>
          <p className="text-sm font-bold text-[var(--color-ink)]">
            {classification.label} locked
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
            {classification.reason}
          </p>
          <div className="mt-3 h-6 max-w-64 rounded-md bg-[var(--color-muted)]/20 blur-[3px]" />
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/70 bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm shadow-stone-950/10"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MiniWeatherSummary({ isPreview = false }: { isPreview?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Weather details"
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/65 bg-[var(--color-sky)] px-2 py-2 text-left shadow-sm transition hover:-translate-y-0.5 min-[400px]:gap-2 min-[400px]:px-2.5"
    >
      <CloudSun className="shrink-0 text-[var(--color-blue)]" size={22} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase leading-none text-[var(--color-muted)]">
          Weather
        </p>
        <p className="mt-1 whitespace-nowrap text-sm font-bold leading-none">
          {isPreview ? "71° / 52°" : "-- / --"}
        </p>
        <p className="mt-1 max-w-28 truncate text-[11px] font-semibold leading-none text-[var(--color-blue)]">
          {isPreview ? "Cloudy" : "Forecast soon"}
        </p>
      </div>
    </button>
  );
}

function Overlay({
  children,
  closeLabel,
  onClose,
}: {
  children: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-stone-950/35 backdrop-blur-sm">
      <div className="mx-auto flex max-h-dvh min-h-dvh w-full max-w-[440px] flex-col overflow-y-auto overscroll-contain bg-[var(--color-app)] px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-2xl">
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={closeLabel}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface)] shadow-sm"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function UnlockForm({
  error,
  onSubmit,
  password,
  setPassword,
}: {
  error: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password: string;
  setPassword: (value: string) => void;
}) {
  return (
    <form className="mt-5 flex gap-2" onSubmit={onSubmit}>
      <input
        className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)]/25 bg-white/70 px-3 py-3 text-sm text-[var(--color-ink)]"
        placeholder="Trip password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button
        className="rounded-lg bg-[var(--color-green)] px-4 py-3 text-sm font-bold text-white"
        type="submit"
      >
        Unlock
      </button>
      {error ? (
        <p className="sr-only">Password did not unlock traveler mode.</p>
      ) : null}
    </form>
  );
}

function ActivityCard({
  item,
  onSelect,
}: {
  item: TravelerItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="mx-2 flex h-[235px] shrink-0 basis-[78%] snap-center flex-col items-center justify-center rounded-xl border border-white/70 bg-[var(--color-surface)] p-5 text-center shadow-[var(--shadow-card)] outline outline-1 outline-black/5 transition hover:-translate-y-0.5"
      onClick={onSelect}
    >
      {item.time ? (
        <div className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--color-muted)]">
          <Clock size={16} />
          <span>{item.time}</span>
        </div>
      ) : null}
      <h2 className={item.time ? "mt-5 line-clamp-4 text-3xl font-semibold leading-tight" : "line-clamp-4 text-3xl font-semibold leading-tight"}>
        {item.title}
      </h2>
      <p className="mt-6 text-3xl leading-none">{categoryEmoji(item.category)}</p>
    </button>
  );
}

function PhotoPanel({
  unlocked,
}: {
  unlocked: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/70 bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-leather)]">
              Trip photos
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Follow along
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              Photos are the first stop for friends and family. Traveler mode
              unlocks uploads.
            </p>
          </div>
          {unlocked ? (
            <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-green)] text-white shadow-sm">
              <Upload size={18} />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/35 text-[var(--color-muted)]">
              <LockKeyhole size={18} />
            </div>
          )}
        </div>
      </section>

      <div>
        {samplePhotos.map((photo) => (
          <button
            type="button"
            className="block w-full bg-stone-900 text-left"
            key={photo.label}
          >
            <div className="flex min-h-[235px] flex-col justify-end bg-[var(--color-leather)] p-5 text-white">
              <Camera className="text-flax" size={28} />
              <p className="mt-20 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                {photo.day}
              </p>
              <h3 className="mt-1 text-3xl font-semibold">{photo.label}</h3>
            </div>
          </button>
        ))}
      </div>

      {unlocked ? (
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-green)] px-4 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/20">
          <ImagePlus size={18} />
          Add trip photos
        </button>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)]/25 bg-[var(--color-app)] p-4 text-sm font-semibold text-[var(--color-muted)] shadow-sm">
          Enter the trip password to upload photos.
        </div>
      )}
    </div>
  );
}

function TodayPanel({
  day,
  isPreview,
  onSelect,
  unlocked,
}: {
  day: TravelerDay;
  isPreview?: boolean;
  onSelect: (item: TravelerItem) => void;
  unlocked: boolean;
}) {
  return (
    <div
      className={
        isPreview
          ? "flex min-h-[410px] flex-col"
          : "flex min-h-[calc(100dvh-15rem)] flex-col"
      }
    >
      <div className="pb-2 pt-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            aria-label="Previous day"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink)] opacity-35"
            disabled
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              {day.title}
            </p>
            <h2 className="mt-1 truncate text-4xl font-semibold leading-tight">
              {day.legName || "Today"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Next day"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink)]"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      <div className="-mx-5 flex flex-1 items-center">
        <div className="hide-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth pb-5 pt-6">
          <div className="shrink-0 basis-[11%]" aria-hidden="true" />
          {day.items.map((item) => (
            <ActivityCard
              item={item}
              key={item.id}
              onSelect={() => onSelect(item)}
            />
          ))}
          <div className="shrink-0 basis-[11%]" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function LegsPanel({ trip }: { trip: AsiaDemoTrip }) {
  return (
    <div className="space-y-3">
      {trip.legs.map((leg, index) => (
        <button
          className="relative flex w-full items-center justify-between overflow-hidden rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 pl-5 text-left shadow-[var(--shadow-card)] outline outline-1 outline-black/5 transition hover:-translate-y-0.5"
          key={leg.id}
          type="button"
        >
          <span className="absolute bottom-0 right-0 top-0 w-2 bg-[var(--color-brass)]" />
          <span className="min-w-0">
            <span className="truncate text-lg font-semibold">{leg.city}</span>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">
              {[leg.arriveDate, leg.leaveDate].filter(Boolean).join(" - ")} ·{" "}
              {leg.country}
            </span>
            <span className="mt-1 block truncate text-sm text-[var(--color-muted)]">
              {leg.stayName ?? "Stay details"}
            </span>
          </span>
          {index === 0 ? (
            <span className="mr-2 rounded-full bg-[var(--color-green)]/10 px-2 py-1 text-xs font-bold text-[var(--color-green)]">
              Today
            </span>
          ) : null}
          <ChevronRight className="ml-3 shrink-0 text-[var(--color-muted)]" size={20} />
        </button>
      ))}
    </div>
  );
}

function CategoriesPanel({
  categories,
}: {
  categories: Array<[string, number]>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map(([category, count]) => (
        <button
          key={category}
          type="button"
          className="min-h-[170px] rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)] outline outline-1 outline-black/5"
        >
          <span className="block text-4xl">•</span>
          <span className="mt-4 block text-base font-semibold capitalize leading-snug">
            {category}
          </span>
          <span className="mt-2 block text-sm text-[var(--color-muted)]">
            {formatCount(count, "card")}
          </span>
        </button>
      ))}
    </div>
  );
}

function CalendarPanel({ days }: { days: TravelerDay[] }) {
  const months = Array.from(new Set(days.map((day) => day.date.slice(0, 7))));

  return (
    <div className="space-y-4">
      {months.slice(0, 5).map((month) => (
        <section
          className="rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
          key={month}
        >
          <p className="text-lg font-semibold">
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              timeZone: "UTC",
              year: "numeric",
            }).format(new Date(`${month}-01T00:00:00Z`))}
          </p>
          <div className="mt-4 grid grid-cols-7 gap-1">
            {days
              .filter((day) => day.date.startsWith(month))
              .slice(0, 35)
              .map((day) => (
                <button
                  className="flex min-h-[62px] flex-col justify-between rounded-md border border-white/45 bg-[var(--color-app)] px-2 py-1.5 text-left shadow-sm"
                  key={day.date}
                  type="button"
                >
                  <span className="text-[10px] font-semibold leading-none text-[var(--color-muted)]">
                    {Number(day.date.slice(-2))}
                  </span>
                  <span className="line-clamp-2 text-[10px] font-bold leading-tight">
                    {day.legName || day.primaryCategory}
                  </span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SearchTool({
  items,
  onSelect,
}: {
  items: TravelerItem[];
  onSelect: (item: TravelerItem) => void;
}) {
  const results = items
    .filter((item) =>
      ["hotel", "airport", "train", "check", "dinner", "temple", "market"].some(
        (term) =>
          `${item.title} ${item.description} ${item.category}`
            .toLowerCase()
            .includes(term)
      )
    )
    .slice(0, 8);

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 rounded-lg bg-white/45 px-3 py-3">
          <Search className="text-[var(--color-blue)]" size={18} />
          <span className="text-sm font-semibold text-[var(--color-muted)]">
            Search flights, hotels, food, notes...
          </span>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {results.map((item) => (
          <button
            key={item.id}
            type="button"
            className="w-full rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)]"
            onClick={() => onSelect(item)}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-leather)]">
              {[item.time, item.category].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-2 text-lg font-semibold">{item.title}</p>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--color-muted)]">
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function MapTool({ trip }: { trip: AsiaDemoTrip }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-white/60 bg-[var(--color-sky)] p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-blue)]">
          Route overview
        </p>
        <div className="mt-5 space-y-3">
          {trip.legs.slice(0, 6).map((leg, index) => (
            <div className="flex items-center gap-3" key={leg.id}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-green)] text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-base font-semibold">{leg.city}</p>
                <p className="text-sm text-[var(--color-blue)]">
                  {[leg.country, leg.stayName].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="rounded-xl bg-[var(--color-app)] p-4 text-sm leading-6 text-[var(--color-muted)] shadow-sm">
        The live version opens a full route map from the same header button, so
        travelers can jump from any screen to where they are going next.
      </p>
    </div>
  );
}

function PhraseTool() {
  const phrases = [
    ["Hello", "Konnichiwa / Annyeonghaseyo / Sabaidee"],
    ["Thank you", "Arigato / Kamsahamnida / Khop chai"],
    ["Where is the bathroom?", "Toilet wa doko desu ka?"],
    ["No meat, please", "Meatなしでお願いします"],
    ["For the baby", "Baby / child seat, please"],
  ];

  return (
    <div className="mt-6 grid gap-3">
      {phrases.map(([label, phrase]) => (
        <div
          key={label}
          className="rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]"
        >
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-leather)]">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold leading-snug">{phrase}</p>
        </div>
      ))}
    </div>
  );
}

function ActivityDetail({
  item,
  onClose,
  unlocked,
}: {
  item: TravelerItem;
  onClose: () => void;
  unlocked: boolean;
}) {
  const detailSensitivity = classifySensitiveText(item.description);
  const addressSensitivity = classifyAddressSensitivity({
    address: item.address,
    context: `${item.title} ${item.description}`,
  });

  return (
    <Overlay closeLabel="Close activity" onClose={onClose}>
      <p className="text-sm font-semibold text-[var(--color-muted)]">
        {[item.time, item.category].filter(Boolean).join(" · ")}
      </p>
      <h2 className="mt-2 text-4xl font-semibold leading-tight">{item.title}</h2>
      {detailSensitivity ? (
        <LockedDetail classification={detailSensitivity} unlocked={unlocked}>
          {item.description}
        </LockedDetail>
      ) : (
        <p className="mt-6 whitespace-pre-line text-lg leading-8 text-[var(--color-ink)]">
          {item.description}
        </p>
      )}
      {item.address && addressSensitivity ? (
        <LockedDetail classification={addressSensitivity} unlocked={unlocked}>
          {item.address}
        </LockedDetail>
      ) : item.address ? (
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)]">
            <MapPin size={16} />
            Address
          </p>
          <p className="mt-4 whitespace-pre-line text-2xl font-semibold leading-snug">
            {item.address}
          </p>
        </div>
      ) : null}
    </Overlay>
  );
}

export function TravelerAppShell({
  displayName,
  initialUnlocked = false,
  mode = "standalone",
  style,
  trip,
}: TravelerAppShellProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("today");
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind | null>(null);
  const [selectedItem, setSelectedItem] = useState<TravelerItem | null>(null);
  const todayDay = trip.days[0];
  const categories = useMemo(() => categoriesForTrip(trip), [trip]);
  const sensitiveCount = useMemo(
    () =>
      trip.days.reduce(
        (count, day) =>
          count + day.items.filter((item) => getItemSensitivity(item)).length,
        0
      ),
    [trip.days]
  );
  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.trim().toLowerCase() === DEMO_TRAVELER_PASSWORD) {
      setUnlocked(true);
      setActiveTab("today");
      setOverlay(null);
      setError(false);
      return;
    }

    setError(true);
  }

  const isPreview = mode === "preview";

  return (
    <main
      className={
        isPreview
          ? "journal-page h-[720px] overflow-hidden rounded-[34px] border-[8px] border-[#17140f] text-[var(--color-ink)] shadow-2xl shadow-stone-950/25"
          : "journal-page min-h-screen text-[var(--color-ink)]"
      }
      style={style}
    >
      <div
        className={
          isPreview
            ? "journal-app relative mx-auto flex h-full w-full max-w-[440px] flex-col overflow-hidden border-x border-black/10 shadow-2xl shadow-stone-950/25"
            : "journal-app mx-auto flex min-h-screen w-full max-w-[440px] flex-col border-x border-black/10 shadow-2xl shadow-stone-950/25"
        }
      >
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-app)]/95 px-4 pb-4 pt-5 backdrop-blur min-[400px]:px-5">
          <div className="flex items-start justify-between gap-2 min-[400px]:gap-3">
            {activeTab === "today" ? (
              <MiniWeatherSummary isPreview={isPreview} />
            ) : (
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/65 bg-[var(--color-sky)] px-2.5 py-2 text-left shadow-sm"
                onClick={() => (unlocked ? setActiveTab("today") : setOverlay("unlock"))}
              >
                {unlocked ? (
                  <CloudSun className="shrink-0 text-[var(--color-blue)]" size={22} />
                ) : (
                  <LockKeyhole className="shrink-0 text-[var(--color-blue)]" size={22} />
                )}
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase leading-none text-[var(--color-muted)]">
                    {unlocked ? "Traveler mode" : "Follow along"}
                  </span>
                  <span className="mt-1 block whitespace-nowrap text-sm font-bold leading-none">
                    {unlocked ? "Private details" : "Photos first"}
                  </span>
                  <span className="mt-1 block max-w-32 truncate text-[11px] font-semibold leading-none text-[var(--color-blue)]">
                    {unlocked ? "Unlocked" : "Tap to unlock"}
                  </span>
                </span>
              </button>
            )}
            <div className="flex shrink-0 gap-1 min-[400px]:gap-1.5">
              {TRAVELER_TOOLS.map((tool) => {
                const Icon = travelerToolIcons[tool.id];

                return (
                  <IconButton
                    key={tool.id}
                    label={tool.label}
                    onClick={() => setOverlay(tool.id)}
                  >
                    <Icon size={19} />
                  </IconButton>
                );
              })}
            </div>
          </div>
        </header>

        {displayName && !isPreview ? (
          <section className="border-b border-[var(--color-border)]/35 px-5 py-3">
            <p className="truncate text-sm font-bold text-[var(--color-muted)]">
              {displayName}
            </p>
          </section>
        ) : null}

        <section className="flex-1 px-5 pb-28 pt-5">
          {isPreview ? null : !unlocked ? (
            <button
              type="button"
              className="mb-5 w-full rounded-xl border border-white/70 bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-card)]"
              onClick={() => setOverlay("photos")}
            >
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--color-leather)]">
                Follow along
              </p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">
                View trip photos
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Friends and family can start with photos. Traveler mode unlocks
                private details and uploads.
              </p>
            </button>
          ) : null}
          {activeTab === "today" ? (
            <TodayPanel
              day={todayDay}
              isPreview={isPreview}
              onSelect={setSelectedItem}
              unlocked={unlocked}
            />
          ) : null}
          {activeTab === "legs" ? <LegsPanel trip={trip} /> : null}
          {activeTab === "categories" ? (
            <CategoriesPanel categories={categories} />
          ) : null}
          {activeTab === "calendar" ? (
            <CalendarPanel days={trip.days} />
          ) : null}

          <section className="mt-5 rounded-xl border border-white/60 bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold">
              {formatCount(sensitiveCount, "private detail")} protected
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
              {unlocked
                ? "Traveler mode reveals exact lodging, access notes, booking controls, and private contact details."
                : "Follower mode keeps exact lodging, access notes, booking controls, and private contact details locked behind the trip password."}
            </p>
          </section>
        </section>

        <nav
          className={
            isPreview
              ? "absolute bottom-0 left-0 z-20 w-full border-t border-[var(--color-border)] bg-[var(--color-app)]/96 px-3 pb-3 pt-2 backdrop-blur"
              : "fixed bottom-0 left-1/2 z-20 w-full max-w-[440px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-app)]/96 px-3 pb-3 pt-2 backdrop-blur"
          }
        >
          <div className="grid grid-cols-4 gap-2">
            {TRAVELER_TABS.map((tab) => {
              const Icon = travelerTabIcons[tab.id];
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold transition ${
                    isActive
                      ? "bg-[var(--color-green)] text-white shadow-lg shadow-emerald-950/25"
                      : "text-[var(--color-muted)] hover:bg-white/70"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={20} strokeWidth={2.2} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {selectedItem ? (
          <ActivityDetail
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            unlocked={unlocked}
          />
        ) : null}

        {overlay === "unlock" ? (
          <Overlay closeLabel="Close unlock" onClose={() => setOverlay(null)}>
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              Trip password
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Unlock traveler mode
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--color-muted)]">
              One trip password reveals sensitive details and enables photo
              uploads. Demo password: traveler.
            </p>
            <UnlockForm
              error={error}
              onSubmit={unlock}
              password={password}
              setPassword={setPassword}
            />
            {error ? (
              <p className="mt-3 text-sm font-bold text-[var(--color-leather)]">
                That password did not unlock traveler mode.
              </p>
            ) : null}
          </Overlay>
        ) : null}
        {overlay === "photos" ? (
          <Overlay closeLabel="Close photos" onClose={() => setOverlay(null)}>
            <PhotoPanel unlocked={unlocked} />
          </Overlay>
        ) : null}

        {overlay === "stay" ? (
          <Overlay closeLabel="Close stay" onClose={() => setOverlay(null)}>
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              Stay
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              {todayDay.legName || "Today"}
            </h2>
            <LockedDetail
              classification={{
                kind: "private_residence",
                label: "Exact stay detail",
                reason:
                  "Follower mode keeps exact lodging and private addresses behind the trip password.",
              }}
              unlocked={unlocked}
            >
              Exact lodging address appears here in traveler mode.
            </LockedDetail>
          </Overlay>
        ) : null}

        {overlay === "search" ? (
          <Overlay closeLabel="Close tool" onClose={() => setOverlay(null)}>
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              Search
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Find trip details
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--color-muted)]">
              Search keeps every reservation, note, restaurant, and address a
              couple taps away.
            </p>
            <SearchTool
              items={trip.days.flatMap((day) => day.items)}
              onSelect={(item) => {
                setOverlay(null);
                setSelectedItem(item);
              }}
            />
          </Overlay>
        ) : null}
        {overlay === "map" ? (
          <Overlay closeLabel="Close map" onClose={() => setOverlay(null)}>
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              Map
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Route map
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--color-muted)]">
              The route is always one tap away from the header.
            </p>
            <MapTool trip={trip} />
          </Overlay>
        ) : null}
        {overlay === "phrases" ? (
          <Overlay closeLabel="Close phrases" onClose={() => setOverlay(null)}>
            <p className="text-sm font-semibold text-[var(--color-muted)]">
              Phrases
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight">
              Useful phrases
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--color-muted)]">
              Practical phrases stay in the app, organized for the places on
              the trip.
            </p>
            <PhraseTool />
          </Overlay>
        ) : null}
      </div>
    </main>
  );
}
