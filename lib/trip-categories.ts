export const TRIP_CATEGORY_DEFINITIONS = [
  {
    id: "admin_logistics",
    emoji: "📋",
    label: "Admin and logistics",
  },
  {
    id: "animal_experience",
    emoji: "🐘",
    label: "Animal experiences",
  },
  {
    id: "arrival_departure",
    emoji: "✈️ 🏨",
    label: "Arrival and departure",
  },
  {
    id: "art_class",
    emoji: "🖌️",
    label: "Art classes",
  },
  {
    id: "art_culture",
    emoji: "🎨",
    label: "Art and culture",
  },
  {
    id: "beach_water",
    emoji: "🏖️",
    label: "Beach and water",
  },
  {
    id: "food_class",
    emoji: "👨‍🍳",
    label: "Food classes",
  },
  {
    id: "food_dining",
    emoji: "🍜",
    label: "Food and dining",
  },
  {
    id: "kid_activity",
    emoji: "🧸",
    label: "Kid activities",
  },
  {
    id: "nature_outdoors",
    emoji: "🌿",
    label: "Nature and outdoors",
  },
  {
    id: "nightlife_entertainment",
    emoji: "🎭",
    label: "Nightlife and entertainment",
  },
  {
    id: "rest_day",
    emoji: "😴",
    label: "Rest days",
  },
  {
    id: "scenic_ride",
    emoji: "🚗",
    label: "Scenic rides",
  },
  {
    id: "shopping_tailor",
    emoji: "🛍️",
    label: "Shopping and tailoring",
  },
  {
    id: "social",
    emoji: "👥",
    label: "Social",
  },
  {
    id: "temple_shrine",
    emoji: "⛩️",
    label: "Temples and shrines",
  },
  {
    id: "tours_tickets",
    emoji: "🎟️",
    label: "Tours and tickets",
  },
  {
    id: "wellness_relaxation",
    emoji: "💆🧘",
    label: "Wellness and relaxation",
  },
] as const;

export const TRIP_CATEGORY_IDS = TRIP_CATEGORY_DEFINITIONS.map(
  (category) => category.id
);

export type TripCategoryId = (typeof TRIP_CATEGORY_DEFINITIONS)[number]["id"];

const tripCategoryById = new Map(
  TRIP_CATEGORY_DEFINITIONS.map((category) => [category.id, category])
);

const categoryAliases: Record<string, TripCategoryId | null> = {
  activity: null,
  note: null,
  transport: null,
  wellness_and_relaxation: "wellness_relaxation",
  "wellness_&_relaxation": "wellness_relaxation",
};

export function canonicalizeTripCategoryId(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const compacted = normalized.replaceAll("&", "and");

  if (normalized in categoryAliases) {
    return categoryAliases[normalized];
  }

  if (compacted in categoryAliases) {
    return categoryAliases[compacted];
  }

  return tripCategoryById.has(normalized as TripCategoryId)
    ? (normalized as TripCategoryId)
    : null;
}

export function getTripCategoryLabel(categoryId: string) {
  const category = tripCategoryById.get(categoryId as TripCategoryId);

  if (category) {
    return category.label;
  }

  return categoryId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getTripCategoryEmoji(categoryId: string) {
  return tripCategoryById.get(categoryId as TripCategoryId)?.emoji ?? "•";
}
