import type {
  TripItemType,
  TripTransportType,
} from "@/lib/generated-trip-model";
import { canonicalizeTripCategoryId } from "@/lib/trip-categories";

export function canonicalTransportType(
  value: string | null | undefined
): TripTransportType {
  const normalized = value?.trim().toLowerCase().replaceAll(" ", "_");

  if (
    normalized === "flight" ||
    normalized === "train" ||
    normalized === "ferry" ||
    normalized === "rental_car" ||
    normalized === "transfer" ||
    normalized === "bus" ||
    normalized === "drive" ||
    normalized === "other"
  ) {
    return normalized;
  }

  if (normalized === "car" || normalized === "rental") {
    return "rental_car";
  }

  return "other";
}

export function canonicalTransportDescription(value: string | null | undefined) {
  const description = value?.trim() || null;
  if (!description) return null;

  const segments = description
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= 1) return description;

  const transportDetailPattern =
    /\b(arrival|arrive|arrives|bag|bags|boarding|bus|car|check[-\s]?in|coach|confirmation|depart|departs|departure|directions?|driver|drop[-\s]?off|duration|ferry|flight|gate|land|lands|leave|leaves|luggage|metro|operator|pickup|pick[-\s]?up|platform|provider|rail|reservation|route|seat|station|subway|terminal|ticket|train|tram|transfer|voucher|walk)\b/i;
  const destinationPlanPattern =
    /\b(after arrival|bar|breakfast|cafe|café|cathedral|church|city plans?|dinner|food|gallery|lunch|museum|palace|plans? for|restaurant|shopping|sightseeing|tour|visit|walking tour)\b/i;
  const retained = segments.filter(
    (segment) =>
      transportDetailPattern.test(segment) || !destinationPlanPattern.test(segment)
  );

  return retained.length > 0 ? retained.join(" ") : description;
}

export function canonicalItemType({
  description,
  title,
  value,
}: {
  description: string | null | undefined;
  title: string | null | undefined;
  value: string | null | undefined;
}): TripItemType {
  if (
    value === "activity" ||
    value === "note" ||
    value === "admin" ||
    value === "rest_day" ||
    value === "social" ||
    value === "placeholder"
  ) {
    return value;
  }

  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();

  if (/\b(tbd|to confirm|placeholder)\b/.test(text)) {
    return "placeholder";
  }

  return "activity";
}

export function canonicalCategoryId({
  category,
  description,
  itemType,
  title,
}: {
  category: string | null | undefined;
  description: string | null | undefined;
  itemType: TripItemType;
  title: string | null | undefined;
}) {
  const canonicalCategory = canonicalizeTripCategoryId(category);

  if (canonicalCategory) {
    return canonicalCategory;
  }

  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();

  if (/\b(check[-\s]?in|check[-\s]?out|drop bags?|bag drop|arrival|departure|airport|station|flight|land|lands|pickup|pick[-\s]?up|drop[-\s]?off|rental car)\b/.test(text)) {
    return "arrival_departure";
  }

  if (itemType === "rest_day") return "rest_day";
  if (itemType === "social" || /\b(friend|family|meetup|meet up|visit with)\b/.test(text)) {
    return "social";
  }
  if (/\b(cooking class|cookery|food tour|market tour|tasting class)\b/.test(text)) {
    return "food_class";
  }
  if (/\b(restaurant|dinner|lunch|brunch|breakfast|cafe|café|bar|tapas|winery|brewery|beer hall|food hall|market|meal)\b/.test(text)) {
    return "food_dining";
  }
  if (/\b(pottery|calligraphy|batik|silk|workshop|craft class|art class|hands[-\s]?on)\b/.test(text)) {
    return "art_class";
  }
  if (/\b(temple|shrine|church|cathedral|basilica|mosque|synagogue|religious|st vitus|st\. vitus)\b/.test(text)) {
    return "temple_shrine";
  }
  if (/\b(ticket|tickets|tour|guided|entry|reservation|pass|timed|time travel|walking tour|catacombs|castle|palace)\b/.test(text)) {
    return "tours_tickets";
  }
  if (/\b(museum|gallery|exhibit|exhibition|library|monument|statue|landmark|art|culture|historic|history|communism|kgb|belvedere|albertina|mumok|kafka)\b/.test(text)) {
    return "art_culture";
  }
  if (/\b(zoo|wildlife|sanctuary|aquarium|animal|elephant|whale shark|whale|dolphin)\b/.test(text)) {
    return "animal_experience";
  }
  if (/\b(beach|swim|snorkel|pool|water|boat|kayak|surf|reef)\b/.test(text)) {
    return "beach_water";
  }
  if (/\b(hike|park|garden|trail|mountain|nature|outdoors|viewpoint|scenic spot|gloriette|palm house)\b/.test(text)) {
    return "nature_outdoors";
  }
  if (/\b(shop|shopping|market|tailor|tailoring|souvenir|mall|boutique)\b/.test(text)) {
    return "shopping_tailor";
  }
  if (/\b(spa|massage|sauna|yoga|wellness|relaxation|baths?)\b/.test(text)) {
    return "wellness_relaxation";
  }
  if (/\b(playground|kid|kids|child|children|family[-\s]?friendly|toddler|wren)\b/.test(text)) {
    return "kid_activity";
  }
  if (/\b(show|concert|theater|theatre|performance|ferris wheel|nightlife|club|cocktail|hemingway bar)\b/.test(text)) {
    return "nightlife_entertainment";
  }
  if (/\b(train ride|boat ride|scenic ride|road trip|drive|ferry|cruise|panorama train)\b/.test(text)) {
    return "scenic_ride";
  }
  if (/\b(laundry|grocery|groceries|pack|packing|sim card|pharmacy|errand|admin)\b/.test(text)) {
    return "admin_logistics";
  }
  if (itemType === "admin" || itemType === "note" || itemType === "placeholder") {
    return "admin_logistics";
  }

  return "art_culture";
}
