import { normalizeText } from "@/lib/extraction/traveler-text";

export type TravelerCardKind =
  | "city_note"
  | "overview_invalid"
  | "system_grouped_activity"
  | "timed_activity"
  | "travel"
  | "untimed_planned_activity";

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

// Commitment requires first-person intent, booking language, a time, or a
// confirmation (defect docket 2026-07-17, commitment-language fix): the
// extraction model writes "Visit the museum" / "X visit." for everything, so
// bare sight verbs ("visit", "explore", "stroll", "stop", "walk along",
// "inside", "route") are parser phrasing, not evidence of a plan. Live runs
// 7.17.1/7.17.2 kept Museum of Communism and Pinball Museum as activity
// cards on the strength of that phrasing alone.
// Tested against normalizeText() output, which strips apostrophes — so
// contractions must be matched in their normalized forms ("we ll", "we re",
// "we d like"). The raw-apostrophe alternations were dead for weeks
// (docs/code-audit-2026-07-18.md, finding B1).
const PLANNED_ACTIVITY_PATTERN =
  /\b(we will|we ?ll|we are|we ?re|we want|we ?d like|we would like|going to|plan to|planned|definitely|booked|reserved|reservation|take a tour|guided tour|doing this)\b/;

const SIGHT_OR_LOOSE_PLACE_PATTERN =
  /\b(aquarium|basilica|cathedral|church|gallery|garden|hall|haus|house|landmark|market|monument|museum|park|palace|square|statue|synagogue|temple|tower|wheel)\b/;

const AVAILABILITY_MARKER_PATTERN =
  /\b(open until|open til|hours?|free\s*\d|free admission)\b/;

// "if you want (to)" / "if you'd like" joined the hedge family in Arc B
// (live-run 7.18.3 PB-4: "Buda hills loop — if you want to get out of the
// city" shipped as a card). Tested against normalizeText() output, so the
// contraction is matched in its normalized form ("if you d like").
const WEAK_RECOMMENDATION_PATTERN =
  /\b(optional|maybe|if time|if we have time|if you want|if you d like|if you like|if you feel like|could visit|could also|far away|things to check out|ideas?|recommendations?|possible sights?|not sure|would recommend|recommended)\b/;

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

export function hasStandaloneActivityAnchor(input: DraftActivityCardInput) {
  const text = normalizeText(textForDraftActivity(input));

  return Boolean(
    hasTime(input) ||
      /\b(ticket|tickets|timed|reserved|reservation|booking|confirmation|provider|paid|paypal|voucher|entry at|starts at)\b/.test(
        text
      )
  );
}

export function isSameSiteActivityGroup(input: DraftActivityCardInput) {
  const text = normalizeText(textForDraftActivity(input));
  const nearbyOnly = /\b(nearby sights?|nearby sites?|nearby stops?|area sights?|area sites?)\b/.test(
    text
  );
  const siteCluster =
    /\bcluster including\b/.test(text) &&
    /\b(palace|castle|complex|grounds|gardens)\b/.test(text);
  const explicitSameVisit =
    /\b(same site|same-site|same .* visit|same .* complex|inside|within|grounds|campus|estate|complex)\b/.test(
      text
    );

  if (nearbyOnly && !explicitSameVisit) {
    return false;
  }

  return (
    siteCluster ||
    explicitSameVisit ||
    (/\b(palace|castle)\b/.test(text) &&
      /\b(gardens?|grounds|complex|inside|within|same .* visit)\b/.test(text))
  );
}

export function isTourActivityGroup(input: DraftActivityCardInput) {
  return /\b(tour|walking tour|walk)\b/.test(normalizeText(input.title));
}

export function isPlannedAreaActivityGroup(input: DraftActivityCardInput) {
  const title = normalizeText(input.title);
  const text = normalizeText(textForDraftActivity(input));

  if (!title || isSameSiteActivityGroup(input)) {
    return false;
  }

  if (
    /\b(notes?|tips?|ideas?|recommendations?|where to eat|food list|restaurant list|shopping ideas?)\b/.test(
      title
    )
  ) {
    return false;
  }

  if (/^explore (?:the )?[a-z]+(?: city)?$/.test(title)) {
    return false;
  }

  return (
    /\b(explore|wander|stroll|walk|neighborhood|neighbourhood|quarter|district|area|morning|afternoon|evening)\b/.test(
      title
    ) &&
    /\b(explore|wander|stroll|walk|continue|route|stops?|with|including|morning|afternoon|evening)\b/.test(
      text
    )
  );
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
  const hasStandaloneAnchor =
    input.hasStandaloneAnchor ?? hasStandaloneActivityAnchor(input);
  const isPlannedAreaGroup =
    input.isPlannedAreaGroup ?? isPlannedAreaActivityGroup(input);
  const isSameSiteGroup = input.isSameSiteGroup ?? isSameSiteActivityGroup(input);
  const isTourGroup = input.isTourGroup ?? isTourActivityGroup(input);

  if (
    !input.date ||
    hasTime(input) ||
    hasStandaloneAnchor ||
    isPlannedAreaGroup ||
    isSameSiteGroup ||
    isTourGroup ||
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

// Shared text-level predicates for the unified classifier
// (lib/extraction/activity-classifier.ts) and the LLM resolver (audit
// finding B1: the resolver's private plan-signal regex counted bare sight
// verbs — "explore", "visit", "walk" — as commitment, contradicting this
// module on the same string).
export function hasCommitmentLanguage(value: string | null | undefined) {
  return PLANNED_ACTIVITY_PATTERN.test(normalizeText(value));
}

export function hasLooseTipVocabulary(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return false;
  return LOOSE_TIP_PATTERN.test(text) || WEAK_RECOMMENDATION_PATTERN.test(text);
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
