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

// Availability means OPENING information, not duration. Live-run 7.21.0
// (run7 PC-1): bare `hours?` matched the planned-duration parenthetical in
// "Prague castle (2 hours)", which made the castle look like a researched
// idea and fed the planned-or-ideas demotion that killed it.
const AVAILABILITY_MARKER_PATTERN =
  /\b(open until|open til|opening hours|hours:|open \d|free\s*\d|free admission)\b/;

// "if you want (to)" / "if you'd like" joined the hedge family in Arc B
// (live-run 7.18.3 PB-4: "Buda hills loop — if you want to get out of the
// city" shipped as a card). Tested against normalizeText() output, so the
// contraction is matched in its normalized form ("if you d like").
const WEAK_RECOMMENDATION_PATTERN =
  /\b(optional|maybe|if time|if we have time|if you want|if you d like|if you like|if you feel like|could visit|could also|far away|things to check out|ideas?|recommendations?|possible sights?|not sure|would recommend|recommended|take a peek|worth a quick look)\b|\bwhen you(?: are| re)?\b[^.]{0,100}\bstop into\b/;

const LOOSE_FOOD_SHOPPING_PATTERN =
  /\b(food|eat|cafes?|restaurants?|bars?|shopping|wine|beer)\b/;

// A named-site container noun. Moved here from
// lib/extraction/activity-classifier.ts (Task C2, 2026-08-04 work order:
// "one definition per concept") because that module already imports FROM
// this one (classifyDraftActivityCard, hasCommitmentLanguage,
// hasLooseTipVocabulary, hasStandaloneActivityAnchor) — importing the other
// way round would have created a cycle, so the shared constant lives on the
// lower-level side. activity-classifier.ts re-exports it under the same
// name for its existing callers (lib/extraction/evidence-clustering.ts,
// which re-exports it again as SAME_SITE_CONTAINER_PATTERN; and
// lib/extraction/geocode-verification.ts). Before this move,
// isSameSiteActivityGroup below carried its OWN word list here
// (`palace|castle|complex|grounds|gardens`) that disagreed with this one
// (`citadel|fortress|acropolis|abbey|monastery` missing, `gardens` extra) —
// the same class of divergence that deleted a landmark from a customer's
// itinerary (see docs/assembly-restructure-work-order-2026-08-04.md, Task
// A/C).
export const SITE_CONTAINER_NOUN_PATTERN =
  /\b(?:castle|palace|complex|grounds|citadel|fortress|acropolis|abbey|monastery)\b/i;

type CityTipRecord = {
  categoryId?: string | null;
  cityNoteKey?: string | null;
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
  // Task C2 (2026-08-04 work order): this used to test its own private
  // site-noun list (`palace|castle|complex|grounds|gardens`) instead of the
  // shared SITE_CONTAINER_NOUN_PATTERN — a third independent copy of "is
  // this a site container?" alongside evidence-clustering.ts's
  // SAME_SITE_CONTAINER_PATTERN and activity-classifier.ts's own now-moved
  // copy. Consuming the shared pattern picks up
  // citadel|fortress|acropolis|abbey|monastery, which this local list
  // lacked, and drops "gardens" as a standalone container noun: gardens
  // ("Schönbrunn gardens", "River Palace gardens") are the CHILD/component
  // side of a site grouping in this codebase's own fixtures
  // (tests/evidence-clustering.test.ts:1201, :1337), and
  // SITE_CONTAINER_NOUN_PATTERN is also SAME_SITE_CONTAINER_PATTERN,
  // consumed at ~15 merge-refusal sites in evidence-clustering.ts — folding
  // "gardens" into it would make those same component titles match as
  // containers too, an unverifiable-by-reading change to merge-refusal
  // behaviour well outside this task's blast radius (standing rule 4). The
  // palace/castle-plus-gardens combination a few lines below (this
  // function's own fallback clause) still catches the common "Palace ...
  // gardens" phrasing, so this narrows rather than removes gardens
  // handling here.
  const siteCluster =
    /\bcluster including\b/.test(text) && SITE_CONTAINER_NOUN_PATTERN.test(text);
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

  // The meal-slot anchor must come from the TITLE — source-derived naming
  // ("Trdelnik for breakfast", "Breakfast at Cafe Central") — never from
  // the description. Live-run 7.21.0 (run7 PC-3): the parser rewrites bare
  // list entries into meal prose ("Dinner at Mazel Tov restaurant."), and
  // that invented phrasing stamped fixed commitment onto an idea-list
  // entry, which poisoned the whole Jan-21 section against demotion.
  if (
    input.date &&
    /\b(breakfast|brunch|lunch|dinner|supper)\b/.test(
      normalizeText(input.title)
    )
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

  // Time and booking evidence are intrinsic to this card. Other commitment
  // is decided by the canonical source ledger; it cannot erase an explicit
  // loose-tip marker here (for example, "Dinner ideas"). Final diagnostics
  // consult that authoritative ledger before reporting a committed card.
  if (!text || hasTime(input)) {
    return false;
  }

  const bookingGuardText = text.replace(/\bticket machines?\b/g, " ");

  if (BOOKING_GUARD_PATTERN.test(bookingGuardText)) {
    return false;
  }

  return (
    input.itemType === "note" ||
    LOOSE_TIP_PATTERN.test(text) ||
    WEAK_RECOMMENDATION_PATTERN.test(text)
  );
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

// Plain-string sibling of hasWeakRecommendationMarker, for callers that
// build a combined text blob (title + description + section context) rather
// than a DraftActivityCardInput — the canonical evidence resolver
// (lib/extraction/canonical-evidence-resolver.ts), which carried a PRIVATE
// copy of this vocabulary that omitted "far away" (Task C1, 2026-08-04 work
// order). "(far away)" is a documented product rule — it must silently
// demote an item to city notes — and the same class of divergence (a
// resolver-only regex disagreeing with this module on the same string) was
// found and fixed twice before and never applied here (audit findings B1,
// B4; see also hasCommitmentLanguage above, the B1 fix for the sibling
// plan-signal regex).
export function hasWeakRecommendationLanguage(
  value: string | null | undefined
) {
  return WEAK_RECOMMENDATION_PATTERN.test(normalizeText(value));
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
    Boolean(record.cityNoteKey || record.legId) &&
    hasCityTipSignal(text)
  );
}
