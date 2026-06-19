import asiaTripSeed from "@/data/asia-trip-seed.json";
import type {
  StructuredTripRecords,
  TripCategoryRecord,
  TripDayRecord,
  TripItemRecord,
  TripLegRecord,
  TripPrivateDetailRecord,
  TripSourceConfidence,
  TripStayRecord,
  TripSummaryRecord,
  TripWeatherHookRecord,
} from "@/lib/generated-trip-model";
import {
  classifyAddressSensitivity,
  classifySensitiveText,
} from "@/lib/traveler-privacy";

type SeedLeg = {
  arriveDate?: string;
  city?: string;
  country?: string;
  id: string;
  language?: string;
  latitude?: number | null;
  leaveDate?: string;
  longitude?: number | null;
  stayAddress?: string;
  stayName?: string;
  timezone?: string;
};

type SeedItem = {
  address?: string | null;
  category?: string | null;
  date?: string | null;
  description?: string | null;
  endTime?: string | null;
  id: string;
  legId?: string | null;
  locationName?: string | null;
  startTime?: string | null;
  title: string;
  url?: string | null;
};

type SeedTrip = {
  dateRange: string;
  items: SeedItem[];
  legs: SeedLeg[];
  name: string;
};

export type TravelerTripSummary = {
  dateRange: string;
  dayCount: number;
  destinationSummary: string | null;
  id: string;
  itemCount: number;
  name: string;
  title: string;
};

export type TravelerDayView = {
  cards: TravelerCardView[];
  date: string;
  id: string;
  label: string;
  legIds: string[];
  legName: string;
  primaryCategory: string;
  primaryLegId: string | null;
  title: string;
};

export type TravelerLegView = {
  arriveDate: string | null;
  city: string;
  country: string | null;
  displayName: string;
  id: string;
  language: string | null;
  latitude: number | null;
  leaveDate: string | null;
  longitude: number | null;
  stayAddress: string | null;
  stayName: string | null;
  timezone: string | null;
};

export type TravelerCategoryView = {
  count: number;
  description: string | null;
  emoji: string | null;
  id: string;
  label: string;
};

export type TravelerCardView = {
  address: string | null;
  categoryId: string;
  categoryLabel: string;
  date: string | null;
  description: string;
  endTime: string | null;
  id: string;
  itemType: string;
  legId: string | null;
  locationName: string | null;
  privateDetailIds: string[];
  startTime: string | null;
  time: string | null;
  title: string;
  url: string | null;
};

export type TravelerPhrasebookView = {
  category: string;
  english: string;
  id: string;
  language: string;
  pronunciation: string;
  script: string;
  verifyStatus: string | null;
};

export type TravelerWeatherHookView = {
  date: string | null;
  id: string;
  latitude: number | null;
  legId: string | null;
  locationLabel: string;
  longitude: number | null;
  timezone: string | null;
};

export type TravelerPrivacyModel = {
  privateDetailCount: number;
  privateDetails: Array<{
    id: string;
    label: string;
    subjectId: string;
    subjectType: string;
  }>;
};

export type TravelerAppViewModel = {
  cards: TravelerCardView[];
  categories: TravelerCategoryView[];
  days: TravelerDayView[];
  legs: TravelerLegView[];
  phrases: TravelerPhrasebookView[];
  photos: [];
  privacy: TravelerPrivacyModel;
  trip: TravelerTripSummary;
  weatherHooks: TravelerWeatherHookView[];
};

const seedTrip = asiaTripSeed as SeedTrip;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  weekday: "short",
});

const defaultCategoryLabels: Record<string, { emoji: string; label: string }> = {
  activity: { emoji: "✨", label: "Activities" },
  admin_logistics: { emoji: "📋", label: "Admin and logistics" },
  arrival_departure: { emoji: "✈️", label: "Arrival and departure" },
  art_class: { emoji: "🖌️", label: "Art classes" },
  art_culture: { emoji: "🎨", label: "Art and culture" },
  beach_water: { emoji: "🏖️", label: "Beach and water" },
  food_class: { emoji: "👨‍🍳", label: "Food classes" },
  food_dining: { emoji: "🍜", label: "Food and dining" },
  kid_activity: { emoji: "🧸", label: "Kid activities" },
  nature_outdoors: { emoji: "🌿", label: "Nature and outdoors" },
  note: { emoji: "•", label: "Notes" },
  rest_day: { emoji: "😴", label: "Rest days" },
  scenic_ride: { emoji: "🚗", label: "Scenic rides" },
  shopping_tailor: { emoji: "🛍️", label: "Shopping and tailoring" },
  social: { emoji: "👥", label: "Social" },
  temple_shrine: { emoji: "⛩️", label: "Temples and shrines" },
  transport: { emoji: "🚆", label: "Transport" },
  wellness_and_relaxation: { emoji: "💆", label: "Wellness and relaxation" },
  "wellness_&_relaxation": { emoji: "💆", label: "Wellness and relaxation" },
};

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: string) {
  if (date === "needs-placement") {
    return "Needs placement";
  }

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

function normalizeCategoryKey(value?: string | null) {
  return value?.trim().replaceAll("&", "and") || "note";
}

function getCategoryLabel(categoryId: string) {
  const category = defaultCategoryLabels[categoryId];

  if (category) {
    return category.label;
  }

  return categoryId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCategoryEmoji(categoryId: string) {
  return defaultCategoryLabels[categoryId]?.emoji ?? "•";
}

function createTripSummaryRecord(): TripSummaryRecord {
  return {
    destinationSummary: seedTrip.dateRange,
    endDate: seedTrip.legs.at(-1)?.leaveDate ?? null,
    id: "demo-trip",
    name: seedTrip.name,
    startDate: seedTrip.legs[0]?.arriveDate ?? null,
    travelerAppTitle: seedTrip.name,
  };
}

function createLegRecords(tripId: string): TripLegRecord[] {
  return seedTrip.legs.map((leg, index) => ({
    arriveDate: leg.arriveDate ?? null,
    city: leg.city ?? "Unknown stop",
    country: leg.country ?? null,
    displayName: leg.city ?? "Unknown stop",
    id: leg.id,
    language: leg.language ?? null,
    latitude: leg.latitude ?? null,
    leaveDate: leg.leaveDate ?? null,
    legKey: leg.id,
    longitude: leg.longitude ?? null,
    region: null,
    reviewRequired: false,
    sortOrder: index,
    sourceConfidence: "high" as TripSourceConfidence,
    status: "confirmed",
    summary: null,
    timezone: leg.timezone ?? null,
    tripId,
  }));
}

function createStayRecords({
  legs,
  tripId,
}: {
  legs: TripLegRecord[];
  tripId: string;
}): TripStayRecord[] {
  return seedTrip.legs
    .filter((leg) => leg.stayName || leg.stayAddress)
    .map((leg) => ({
      accessDetailsVisibility: "traveler_password",
      address: leg.stayAddress ?? null,
      addressVisibility: classifyAddressSensitivity({
        address: leg.stayAddress,
        context: leg.stayName ?? leg.city ?? "",
      })
        ? "traveler_password"
        : "public",
      bookingUrl: null,
      checkInDate: leg.arriveDate ?? null,
      checkInTime: null,
      checkOutDate: leg.leaveDate ?? null,
      checkOutTime: null,
      confirmationLabel: null,
      confirmationVisibility: "traveler_password",
      id: `${leg.id}-stay`,
      latitude: legs.find((item) => item.id === leg.id)?.latitude ?? null,
      legId: leg.id,
      longitude: legs.find((item) => item.id === leg.id)?.longitude ?? null,
      name: leg.stayName ?? `${leg.city ?? "Trip"} stay`,
      privateDetailIds: [],
      publicLocationLabel: leg.city ?? null,
      reviewRequired: false,
      sourceConfidence: "high",
      status: "confirmed",
      stayType: null,
      tripId,
    }));
}

function createItemRecords(tripId: string): TripItemRecord[] {
  return seedTrip.items.map((item, index) => ({
    address: item.address ?? null,
    categoryId: normalizeCategoryKey(item.category),
    date: item.date ?? null,
    description: item.description ?? null,
    endTime: item.endTime ?? null,
    id: item.id,
    itemType: inferItemType(item),
    latitude: null,
    legId: item.legId ?? null,
    locationName: item.locationName ?? null,
    longitude: null,
    parentItemId: null,
    reviewRequired: hasReviewNeed(item),
    sortOrder: index,
    sourceConfidence: "high",
    startTime: item.startTime ?? null,
    status: hasReviewNeed(item) ? "needs_review" : "confirmed",
    summary: null,
    title: item.title,
    tripId,
    url: item.url ?? null,
  }));
}

function inferItemType(item: SeedItem): TripItemRecord["itemType"] {
  const text = `${item.category ?? ""} ${item.title}`.toLowerCase();

  if (text.includes("food") || text.includes("dinner") || text.includes("lunch")) {
    return "activity";
  }

  if (text.includes("arrival") || text.includes("departure")) {
    return "admin";
  }

  if (text.includes("rest")) {
    return "rest_day";
  }

  if (text.includes("social")) {
    return "social";
  }

  return "activity";
}

function hasReviewNeed(item: SeedItem) {
  return [item.title, item.description, item.address].some((value) =>
    value?.toLowerCase().includes("tbd")
  );
}

function createCategoryRecords({
  items,
  tripId,
}: {
  items: TripItemRecord[];
  tripId: string;
}): TripCategoryRecord[] {
  const categoryIds = Array.from(new Set(items.map((item) => item.categoryId)));

  return categoryIds.map((categoryId, index) => ({
    categoryKey: categoryId,
    description: null,
    emoji: getCategoryEmoji(categoryId),
    enabled: true,
    icon: null,
    id: categoryId,
    label: getCategoryLabel(categoryId),
    sortOrder: index,
    tripId,
  }));
}

function createPrivateDetails({
  items,
  stays,
  tripId,
}: {
  items: TripItemRecord[];
  stays: TripStayRecord[];
  tripId: string;
}): TripPrivateDetailRecord[] {
  const stayDetails = stays
    .filter((stay) => stay.address && stay.addressVisibility !== "public")
    .map((stay) => ({
      detailType: "private_address",
      id: `${stay.id}-address`,
      label: "Exact stay address",
      reason: "Exact lodging details should be protected before public sharing.",
      reviewRequired: false,
      sourceConfidence: "high" as TripSourceConfidence,
      subjectId: stay.id,
      subjectType: "stay" as const,
      tripId,
      value: stay.address ?? "",
      visibility: "traveler_password" as const,
    }));

  const itemDetails = items.flatMap((item) => {
    const classification =
      classifySensitiveText(`${item.title} ${item.description ?? ""}`) ??
      classifyAddressSensitivity({
        address: item.address,
        context: `${item.title} ${item.description ?? ""}`,
      });

    if (!classification) {
      return [];
    }

    return [
      {
        detailType: classification.kind,
        id: `${item.id}-sensitive-detail`,
        label: classification.label,
        reason: classification.reason,
        reviewRequired: true,
        sourceConfidence: "medium" as TripSourceConfidence,
        subjectId: item.id,
        subjectType: "item" as const,
        tripId,
        value: [item.description, item.address].filter(Boolean).join("\n\n"),
        visibility: "traveler_password" as const,
      },
    ];
  });

  return [...stayDetails, ...itemDetails];
}

function createDayRecords({
  items,
  legs,
  tripId,
}: {
  items: TripItemRecord[];
  legs: TripLegRecord[];
  tripId: string;
}): TripDayRecord[] {
  const dates = Array.from(
    new Set(items.map((item) => item.date ?? "needs-placement"))
  ).sort();

  return dates.map((date, index) => {
    const dayItems = items.filter((item) => (item.date ?? "needs-placement") === date);
    const legIds = Array.from(
      new Set(dayItems.map((item) => item.legId).filter(Boolean) as string[])
    );
    const primaryLegId = legIds[0] ?? null;
    const primaryLeg = legs.find((leg) => leg.id === primaryLegId);

    return {
      date,
      dayNumber: index + 1,
      id: `${tripId}-${date}`,
      legIds,
      primaryLegId,
      reviewRequired: dayItems.some((item) => item.reviewRequired),
      sortOrder: index,
      sourceConfidence: "high",
      status: dayItems.some((item) => item.reviewRequired)
        ? "needs_review"
        : "confirmed",
      summary: null,
      title: date === "needs-placement" ? "Needs placement" : formatDate(date),
      tripId,
    };
  });
}

function createWeatherHooks({
  days,
  legs,
  tripId,
}: {
  days: TripDayRecord[];
  legs: TripLegRecord[];
  tripId: string;
}): TripWeatherHookRecord[] {
  return days
    .filter((day) => day.primaryLegId && day.date !== "needs-placement")
    .map((day) => {
      const leg = legs.find((item) => item.id === day.primaryLegId);

      return {
        date: day.date,
        enabled: true,
        id: `${day.id}-weather`,
        latitude: leg?.latitude ?? null,
        legId: day.primaryLegId,
        locationLabel: leg?.displayName ?? "Trip stop",
        longitude: leg?.longitude ?? null,
        source:
          leg?.latitude !== null && leg?.longitude !== null
            ? "coordinates"
            : "city_country",
        timezone: leg?.timezone ?? null,
        tripId,
      };
    });
}

export function getAsiaDemoStructuredTripRecords(): StructuredTripRecords {
  const trip = createTripSummaryRecord();
  const legs = createLegRecords(trip.id);
  const stays = createStayRecords({ legs, tripId: trip.id });
  const items = createItemRecords(trip.id);
  const categories = createCategoryRecords({ items, tripId: trip.id });
  const privateDetails = createPrivateDetails({
    items,
    stays,
    tripId: trip.id,
  });
  const days = createDayRecords({ items, legs, tripId: trip.id });
  const weatherHooks = createWeatherHooks({ days, legs, tripId: trip.id });

  return {
    categories,
    days,
    items,
    legs,
    photos: [],
    phrases: [],
    privateDetails,
    reviewQuestions: [],
    stays,
    transport: [],
    trip,
    weatherHooks,
  };
}

function primaryCategory(cards: TravelerCardView[]) {
  const counts = new Map<string, number>();

  for (const card of cards) {
    counts.set(card.categoryLabel, (counts.get(card.categoryLabel) ?? 0) + 1);
  }

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "plans"
  );
}

export function createTravelerAppViewModel(
  records: StructuredTripRecords
): TravelerAppViewModel {
  const categoryById = new Map(
    records.categories.map((category) => [category.id, category])
  );
  const privateDetailIdsBySubject = new Map<string, string[]>();

  for (const detail of records.privateDetails) {
    const key = `${detail.subjectType}:${detail.subjectId}`;
    const ids = privateDetailIdsBySubject.get(key) ?? [];
    ids.push(detail.id);
    privateDetailIdsBySubject.set(key, ids);
  }

  const cards: TravelerCardView[] = records.items.map((item) => {
    const category = categoryById.get(item.categoryId);

    return {
      address: item.address,
      categoryId: item.categoryId,
      categoryLabel: category?.label ?? getCategoryLabel(item.categoryId),
      date: item.date,
      description: item.description ?? "Details to be added.",
      endTime: item.endTime,
      id: item.id,
      itemType: item.itemType,
      legId: item.legId,
      locationName: item.locationName,
      privateDetailIds: privateDetailIdsBySubject.get(`item:${item.id}`) ?? [],
      startTime: item.startTime,
      time: formatTime(item.startTime),
      title: item.title,
      url: item.url,
    };
  });

  const dayViews = records.days.map((day) => {
    const dayCards = cards.filter((card) => card.date === day.date);
    const primaryLeg = records.legs.find((leg) => leg.id === day.primaryLegId);

    return {
      cards: dayCards,
      date: day.date,
      id: day.id,
      label: `Day ${day.dayNumber}`,
      legIds: day.legIds,
      legName: primaryLeg?.displayName ?? "",
      primaryCategory: primaryCategory(dayCards),
      primaryLegId: day.primaryLegId,
      title: day.title,
    };
  });

  const categoryViews = records.categories
    .map((category) => ({
      count: cards.filter((card) => card.categoryId === category.id).length,
      description: category.description,
      emoji: category.emoji,
      id: category.id,
      label: category.label,
    }))
    .filter((category) => category.count > 0);

  return {
    cards,
    categories: categoryViews,
    days: dayViews,
    legs: records.legs.map((leg) => {
      const stay = records.stays.find((item) => item.legId === leg.id);

      return {
        arriveDate: leg.arriveDate,
        city: leg.city,
        country: leg.country,
        displayName: leg.displayName,
        id: leg.id,
        language: leg.language,
        latitude: leg.latitude,
        leaveDate: leg.leaveDate,
        longitude: leg.longitude,
        stayAddress: stay?.address ?? null,
        stayName: stay?.name ?? null,
        timezone: leg.timezone,
      };
    }),
    phrases: records.phrases.map((phrase) => ({
      category: phrase.category,
      english: phrase.english,
      id: phrase.id,
      language: phrase.language,
      pronunciation: phrase.pronunciation,
      script: phrase.script,
      verifyStatus: phrase.verifyStatus,
    })),
    photos: [],
    privacy: {
      privateDetailCount: records.privateDetails.length,
      privateDetails: records.privateDetails.map((detail) => ({
        id: detail.id,
        label: detail.label,
        subjectId: detail.subjectId,
        subjectType: detail.subjectType,
      })),
    },
    trip: {
      dateRange: records.trip.destinationSummary ?? "",
      dayCount: records.days.length,
      destinationSummary: records.trip.destinationSummary,
      id: records.trip.id,
      itemCount: records.items.length,
      name: records.trip.name,
      title: records.trip.travelerAppTitle,
    },
    weatherHooks: records.weatherHooks.map((hook) => ({
      date: hook.date,
      id: hook.id,
      latitude: hook.latitude,
      legId: hook.legId,
      locationLabel: hook.locationLabel,
      longitude: hook.longitude,
      timezone: hook.timezone,
    })),
  };
}

export function getAsiaDemoTravelerAppViewModel() {
  return createTravelerAppViewModel(getAsiaDemoStructuredTripRecords());
}
