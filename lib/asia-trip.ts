import asiaTripSeed from "@/data/asia-trip-seed.json";

type SeedLeg = {
  id: string;
  city?: string;
  country?: string;
  arriveDate?: string;
  leaveDate?: string;
  stayName?: string;
  stayAddress?: string;
};

type SeedItem = {
  id: string;
  legId?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  address?: string | null;
};

type SeedTrip = {
  name: string;
  dateRange: string;
  legs: SeedLeg[];
  items: SeedItem[];
};

export type TravelerDay = {
  date: string;
  label: string;
  title: string;
  legName: string;
  primaryCategory: string;
  items: Array<{
    id: string;
    category: string;
    time: string | null;
    title: string;
    description: string;
    address: string | null;
  }>;
};

const trip = asiaTripSeed as SeedTrip;

const legById = new Map(trip.legs.map((leg) => [leg.id, leg]));

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  weekday: "short",
});

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: string) {
  return dateFormatter.format(parseDateKey(date));
}

function formatTime(time?: string | null) {
  if (!time) {
    return null;
  }

  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function titleForDay(date: string, items: SeedItem[]) {
  const firstLeg = items
    .map((item) => (item.legId ? legById.get(item.legId) : undefined))
    .find(Boolean);

  if (!firstLeg) {
    return "Needs placement";
  }

  return [firstLeg.city, firstLeg.country].filter(Boolean).join(", ");
}

function primaryCategory(items: SeedItem[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const category = item.category?.replaceAll("_", " ") ?? "note";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "plans"
  );
}

export function getAsiaDemoTrip() {
  const itemsByDate = new Map<string, SeedItem[]>();

  for (const item of trip.items) {
    const date = item.date ?? "needs-placement";
    const dayItems = itemsByDate.get(date) ?? [];
    dayItems.push(item);
    itemsByDate.set(date, dayItems);
  }

  const days: TravelerDay[] = Array.from(itemsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items], index) => {
      const sortedItems = [...items].sort((a, b) =>
        (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99")
      );

      return {
        date,
        label: date === "needs-placement" ? "Needs placement" : `Day ${index + 1}`,
        title: date === "needs-placement" ? "Needs placement" : formatDate(date),
        legName: date === "needs-placement" ? "" : titleForDay(date, sortedItems),
        primaryCategory: primaryCategory(sortedItems),
        items: sortedItems.map((item) => ({
          id: item.id,
          category: item.category?.replaceAll("_", " ") ?? "note",
          time: formatTime(item.startTime),
          title: item.title,
          description: item.description ?? "Details to be added.",
          address: item.address ?? null,
        })),
      };
    });

  return {
    name: trip.name,
    dateRange: trip.dateRange,
    legs: trip.legs,
    items: trip.items,
    dayCount: days.length,
    itemCount: trip.items.length,
    countries: Array.from(
      new Set(trip.legs.map((leg) => leg.country).filter(Boolean))
    ),
    days,
  };
}
