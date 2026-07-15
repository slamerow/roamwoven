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
  getStayAddressVisibility,
} from "@/lib/trip-privacy-policy";
import {
  canonicalizeTripCategoryId,
  getTripCategoryEmoji,
  getTripCategoryLabel,
} from "@/lib/trip-categories";
import { isLegCityTipRecord } from "@/lib/trip-card-taxonomy";
import { normalizeText } from "@/lib/extraction/traveler-text";

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
  cardCount: number;
  city: string;
  country: string | null;
  dateRange: string;
  days: TravelerLegDayView[];
  displayName: string;
  id: string;
  language: string | null;
  latitude: number | null;
  leaveDate: string | null;
  longitude: number | null;
  stayAddress: string | null;
  stayName: string | null;
  timezone: string | null;
  tips: TravelerLegTipView[];
};

export type TravelerLegDayView = {
  cards: TravelerCardView[];
  date: string;
  id: string;
  label: string;
  title: string;
};

export type TravelerLegTipView = {
  categoryId: string;
  categoryLabel: string;
  description: string | null;
  id: string;
  title: string;
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
  stops: Array<{
    description: string | null;
    endTime: string | null;
    id: string;
    startTime: string | null;
    time: string | null;
    title: string;
  }>;
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
  return canonicalizeTripCategoryId(value) ?? "admin_logistics";
}

function createSeedDestinationSummary() {
  const cities = Array.from(
    new Set(seedTrip.legs.map((leg) => leg.city).filter(Boolean))
  );

  return cities.length > 0 ? cities.slice(0, 5).join(" · ") : null;
}

function parseTripDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTripDate(value: string | null, includeYear = true) {
  const date = parseTripDate(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function formatTripDateRange(start: string | null, end: string | null) {
  const startDate = parseTripDate(start);
  const endDate = parseTripDate(end);

  if (!startDate || !endDate) {
    return formatTripDate(start) || formatTripDate(end);
  }

  if (start === end) {
    return formatTripDate(start);
  }

  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const sameMonth = sameYear && startDate.getUTCMonth() === endDate.getUTCMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en", {
      month: "long",
      timeZone: "UTC",
    }).format(startDate);

    return `${month} ${startDate.getUTCDate()}-${endDate.getUTCDate()}, ${startDate.getUTCFullYear()}`;
  }

  if (sameYear) {
    return `${formatTripDate(start, false)} - ${formatTripDate(end)}`;
  }

  return `${formatTripDate(start)} - ${formatTripDate(end)}`;
}

function createTripSummaryRecord(): TripSummaryRecord {
  return {
    destinationSummary: createSeedDestinationSummary(),
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
    canonicalId: leg.id,
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
      addressVisibility: getStayAddressVisibility({
        address: leg.stayAddress,
        name: leg.stayName ?? `${leg.city ?? "Trip"} stay`,
        publicLocationLabel: leg.city ?? null,
      }),
      bookingUrl: null,
      canonicalId: `${leg.id}-stay`,
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
    canonicalId: item.id,
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
    emoji: getTripCategoryEmoji(categoryId),
    enabled: true,
    icon: null,
    id: categoryId,
    label: getTripCategoryLabel(categoryId),
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
      subjectCanonicalId: stay.canonicalId,
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
        subjectCanonicalId: item.canonicalId,
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

function isActiveItem(item: TripItemRecord) {
  return item.status !== "ignored";
}

function isLegLevelTip(item: TripItemRecord) {
  return isLegCityTipRecord(item);
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

  const activeItems = records.items.filter(isActiveItem);
  const tipItems = activeItems.filter(isLegLevelTip);
  const cardItems = activeItems.filter(
    (item) => !isLegLevelTip(item) && !item.parentItemId
  );
  const childrenByParentId = new Map<string, TripItemRecord[]>();
  activeItems
    .filter((item) => item.parentItemId)
    .forEach((item) => {
      const children = childrenByParentId.get(item.parentItemId ?? "") ?? [];
      children.push(item);
      childrenByParentId.set(item.parentItemId ?? "", children);
    });
  const tipsByLegId = new Map<string, TravelerLegTipView[]>();

  for (const item of tipItems) {
    if (!item.legId) {
      continue;
    }

    const category = categoryById.get(item.categoryId);
    const sourceLeg = records.legs.find((leg) => leg.id === item.legId);
    const sourceCity = normalizeText(sourceLeg?.city);
    const targetLegs = sourceCity
      ? records.legs.filter((leg) => normalizeText(leg.city) === sourceCity)
      : [sourceLeg].filter((leg): leg is TripLegRecord => Boolean(leg));

    for (const leg of targetLegs) {
      const tips = tipsByLegId.get(leg.id) ?? [];
      tips.push({
        categoryId: item.categoryId,
        categoryLabel: category?.label ?? getTripCategoryLabel(item.categoryId),
        description: item.description,
        id: item.id,
        title: item.title,
      });
      tipsByLegId.set(leg.id, tips);
    }
  }

  const cards: TravelerCardView[] = cardItems.map((item) => {
    const category = categoryById.get(item.categoryId);

    return {
      address: item.address,
      categoryId: item.categoryId,
      categoryLabel: category?.label ?? getTripCategoryLabel(item.categoryId),
      date: item.date,
      description: item.description ?? "Details to be added.",
      endTime: item.endTime,
      id: item.id,
      itemType: item.itemType,
      legId: item.legId,
      locationName: item.locationName,
      privateDetailIds: privateDetailIdsBySubject.get(`item:${item.id}`) ?? [],
      startTime: item.startTime,
      stops: (childrenByParentId.get(item.id) ?? [])
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((child) => ({
          description: child.description,
          endTime: child.endTime,
          id: child.id,
          startTime: child.startTime,
          time: formatTime(child.startTime),
          title: child.title,
        })),
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
      const legCards = cards.filter((card) => card.legId === leg.id);
      const legDays = records.days
        .filter((day) => day.legIds.includes(leg.id) || day.primaryLegId === leg.id)
        .map((day) => ({
          cards: legCards.filter((card) => card.date === day.date),
          date: day.date,
          id: day.id,
          label: `Day ${day.dayNumber}`,
          title: day.title,
        }))
        .filter((day) => day.cards.length > 0);

      return {
        arriveDate: leg.arriveDate,
        cardCount: legCards.length,
        city: leg.city,
        country: leg.country,
        dateRange: formatTripDateRange(leg.arriveDate, leg.leaveDate),
        days: legDays,
        displayName: leg.displayName,
        id: leg.id,
        language: leg.language,
        latitude: leg.latitude,
        leaveDate: leg.leaveDate,
        longitude: leg.longitude,
        stayAddress: stay?.address ?? null,
        stayName: stay?.name ?? null,
        timezone: leg.timezone,
        tips: tipsByLegId.get(leg.id) ?? [],
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
      dateRange: formatTripDateRange(records.trip.startDate, records.trip.endDate),
      dayCount: records.days.length,
      destinationSummary: records.trip.destinationSummary,
      id: records.trip.id,
      itemCount: cards.length + tipItems.length,
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
