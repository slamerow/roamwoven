import { normalizeText } from "@/lib/extraction/traveler-text";

export type TravelerCardKind =
  | "city_note"
  | "overview_invalid"
  | "system_grouped_activity"
  | "timed_activity"
  | "travel"
  | "untimed_planned_activity";

export type GroupingKind =
  | "open_day_options"
  | "option_set"
  | "planned_area"
  | "route_or_tour"
  | "same_site";

export const MAKER_VISIBLE_GROUPING_KINDS: readonly GroupingKind[] = [
  "open_day_options",
  "option_set",
  "planned_area",
  "route_or_tour",
  "same_site",
];

const makerVisibleGroupingKindSet = new Set<GroupingKind>(
  MAKER_VISIBLE_GROUPING_KINDS
);

const CITY_TIP_HEADER_PATTERN =
  /\b(notes?\s*&\s*tips?|eat\s*:|food\s*:|drinks?\s*&\s*nightlife\s*:|possible sights?\s*:|local notes?\s*:|bars?\s*:|beer halls?\s*:|cafes?\s*:|restaurants?\s*:|shopping\s*:|also noted|where to eat|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls to consider|check out foods like|good beer halls|beer halls are|food options|drink options|shopping ideas|local tips?)\b/i;

const CITY_TIP_SIGNAL_PATTERN =
  /\b(notes?\s*&\s*tips?|tips?|ideas?|recommendations?|also noted|eat\s*:|food\s*:|drinks?\s*&\s*nightlife\s*:|possible sights?\s*:|bars?\s*:|beer halls?\s*:|cafes?\s*:|restaurants?\s*:|shopping\s*:|where to eat|food list|restaurants?|cafes?|bars?|beer halls?|check out foods like|food options|drink options|shopping ideas|local notes?)\b/i;

const DAY_SPECIFIC_CLUSTER_PATTERN =
  /\b(first[-\s]?day|second[-\s]?day|third[-\s]?day|day \d+|for the .* day|morning|afternoon|evening)\b/i;

const BOOKING_GUARD_PATTERN =
  /\b(reservation|reserved|booked|booking|ticket|tickets|timed|confirmation|provider|paid|paypal)\b/;

const LOOSE_TIP_PATTERN =
  /\b(also noted|notes?\s*(?:and|&)?\s*tips?|ideas?|recommendations?|eat|where to eat|food|food list|restaurant list|restaurants to consider|cafes to consider|bars to consider|beer halls?|shopping ideas|shopping notes?|transport notes?|transit tips?|local tips?|could visit|maybe visit|if time|possible sights?|things to check out)\b/;

const PLANNED_ACTIVITY_PATTERN =
  /\b(we will|we'll|we are|we're|going to|plan to|planned|booked|reserved|reservation|take a tour|guided tour|visit|stop|doing this|continue your walk|walk along|route|same .* visit|inside|within|explore|wander|stroll)\b/;

const SIGHT_OR_LOOSE_PLACE_PATTERN =
  /\b(aquarium|basilica|cathedral|church|gallery|garden|hall|haus|house|landmark|market|monument|museum|park|palace|square|statue|synagogue|temple|tower|wheel)\b/;

const AVAILABILITY_MARKER_PATTERN =
  /\b(open until|open til|hours?|free\s*\d|free admission)\b/;

const WEAK_RECOMMENDATION_PATTERN =
  /\b(optional|maybe|if time|could visit|things to check out|ideas?|recommendations?|possible sights?|not sure|would recommend|recommended)\b/;

const LOOSE_FOOD_SHOPPING_PATTERN =
  /\b(food|eat|cafes?|restaurants?|bars?|shopping|wine|beer)\b/;

type CityTipRecord = {
  categoryId?: string | null;
  description?: string | null;
  itemType?: string | null;
  legId?: string | null;
  title?: string | null;
};

export type DraftActivityCardInput = {
  category?: string | null;
  date?: string | null;
  description?: string | null;
  endTime?: string | null;
  hasStandaloneAnchor?: boolean;
  isPlannedAreaGroup?: boolean;
  isRentalCarAction?: boolean;
  isSameSiteGroup?: boolean;
  isTourGroup?: boolean;
  isTransportAction?: boolean;
  itemType?: string | null;
  startTime?: string | null;
  title?: string | null;
};

export type DraftActivityCardClassification = {
  hasAvailabilityMarker: boolean;
  hasStrongPlannedActivityLanguage: boolean;
  hasWeakRecommendationMarker: boolean;
  isLooseTipActivity: boolean;
  isOverviewActivity: boolean;
  isSightOrLoosePlace: boolean;
  isWeakDatedCityNoteCandidate: boolean;
  suggestedKind: TravelerCardKind;
};

function textForCityTipRecord(record: CityTipRecord) {
  return [record.title, record.description].filter(Boolean).join(" ");
}

function textForDraftActivity(input: DraftActivityCardInput) {
  return [input.title, input.description].filter(Boolean).join(" ");
}

function hasTime(input: DraftActivityCardInput) {
  return Boolean(input.startTime || input.endTime);
}

export function hasCityTipSignal(value: string | null | undefined) {
  return CITY_TIP_SIGNAL_PATTERN.test(value ?? "");
}

export function hasGenericCityTipHeader(value: string | null | undefined) {
  return CITY_TIP_HEADER_PATTERN.test(value ?? "");
}

export function hasDaySpecificClusterSignal(value: string | null | undefined) {
  return DAY_SPECIFIC_CLUSTER_PATTERN.test(value ?? "");
}

export function isDayOverviewActivityTitle(value: string | null | undefined) {
  return /\b(day\s+\d+|day overview|day summary|daily overview|daily plan|overview day|day plan)\b/i.test(
    value ?? ""
  );
}

export function hasStrongPlannedActivityLanguage(
  input: DraftActivityCardInput
) {
  const text = normalizeText(textForDraftActivity(input));

  if (
    input.date &&
    /\b(breakfast|brunch|lunch|dinner|supper)\b/.test(text)
  ) {
    return true;
  }

  return PLANNED_ACTIVITY_PATTERN.test(text);
}

export function hasWeakRecommendationMarker(input: DraftActivityCardInput) {
  return WEAK_RECOMMENDATION_PATTERN.test(
    normalizeText(textForDraftActivity(input))
  );
}

export function hasAvailabilityMarker(input: DraftActivityCardInput) {
  return AVAILABILITY_MARKER_PATTERN.test(
    normalizeText(textForDraftActivity(input))
  );
}

export function isSightOrLoosePlaceText(value: string | null | undefined) {
  return SIGHT_OR_LOOSE_PLACE_PATTERN.test(normalizeText(value));
}

export function isLooseTipActivity(input: DraftActivityCardInput) {
  const text = normalizeText(textForDraftActivity(input));

  if (!text || hasTime(input)) {
    return false;
  }

  const bookingGuardText = text.replace(/\bticket machines?\b/g, " ");

  if (BOOKING_GUARD_PATTERN.test(bookingGuardText)) {
    return false;
  }

  return input.itemType === "note" || LOOSE_TIP_PATTERN.test(text);
}

export function isWeakDatedCityNoteCandidate(
  input: DraftActivityCardInput
) {
  if (
    !input.date ||
    hasTime(input) ||
    input.hasStandaloneAnchor ||
    input.isPlannedAreaGroup ||
    input.isSameSiteGroup ||
    input.isTourGroup ||
    input.isRentalCarAction ||
    input.isTransportAction ||
    hasStrongPlannedActivityLanguage(input)
  ) {
    return false;
  }

  const textWithCategory = [textForDraftActivity(input), input.category]
    .filter(Boolean)
    .join(" ");

  return (
    hasWeakRecommendationMarker(input) ||
    (isSightOrLoosePlaceText(textForDraftActivity(input)) &&
      hasGenericCityTipHeader(textForDraftActivity(input))) ||
    LOOSE_FOOD_SHOPPING_PATTERN.test(normalizeText(textWithCategory))
  );
}

export function isDayOverviewActivity(input: DraftActivityCardInput) {
  const title = normalizeText(input.title);
  const text = normalizeText(textForDraftActivity(input));

  if (!title || input.itemType === "note" || isLooseTipActivity(input)) {
    return false;
  }

  if (
    /\b(ticket|tickets|reservation|booking|confirmation|provider|paid|paypal)\b/.test(
      text
    )
  ) {
    return false;
  }

  return isDayOverviewActivityTitle(title);
}

export function classifyDraftActivityCard(
  input: DraftActivityCardInput
): DraftActivityCardClassification {
  const isOverview = isDayOverviewActivity(input);
  const isLooseTip = isLooseTipActivity(input);
  const weakCityNoteCandidate = isWeakDatedCityNoteCandidate(input);
  let suggestedKind: TravelerCardKind = "untimed_planned_activity";

  if (isOverview) {
    suggestedKind = "overview_invalid";
  } else if (hasTime(input)) {
    suggestedKind = "timed_activity";
  } else if (isLooseTip || weakCityNoteCandidate || input.itemType === "note") {
    suggestedKind = "city_note";
  } else if (!input.date) {
    suggestedKind = "city_note";
  }

  return {
    hasAvailabilityMarker: hasAvailabilityMarker(input),
    hasStrongPlannedActivityLanguage: hasStrongPlannedActivityLanguage(input),
    hasWeakRecommendationMarker: hasWeakRecommendationMarker(input),
    isLooseTipActivity: isLooseTip,
    isOverviewActivity: isOverview,
    isSightOrLoosePlace: isSightOrLoosePlaceText(textForDraftActivity(input)),
    isWeakDatedCityNoteCandidate: weakCityNoteCandidate,
    suggestedKind,
  };
}

export function isLegCityTipRecord(record: CityTipRecord) {
  const text = textForCityTipRecord(record);
  const daySpecificCluster = hasDaySpecificClusterSignal(text);
  const genericTipHeader = hasGenericCityTipHeader(text);

  if (
    daySpecificCluster &&
    !genericTipHeader &&
    record.categoryId !== "food_dining" &&
    record.categoryId !== "shopping_tailor"
  ) {
    return false;
  }

  return (
    record.itemType === "note" &&
    Boolean(record.legId) &&
    hasCityTipSignal(text)
  );
}

export function isMakerVisibleGroupingKind(
  groupingKind: GroupingKind | null | undefined
): groupingKind is GroupingKind {
  return Boolean(
    groupingKind && makerVisibleGroupingKindSet.has(groupingKind)
  );
}
