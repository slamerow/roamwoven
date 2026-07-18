import { normalizeText } from "@/lib/extraction/traveler-text";
import { isDayOverviewActivityTitle } from "@/lib/trip-card-taxonomy";

// ONE sameEntity/winner module (remediation Phase 1, audit findings A1/A4;
// CEO decision 2026-07-18). Six collapse/dedup rules previously carried six
// private winner policies; the highest-impact failure was merge-winner
// scoring by raw title LENGTH, which let the "Explore Vienna" day-arc
// heading fragment beat "Schonbrunn Palace" and delete the venue (live run
// 7.18.2, PB-3). Every collapse rule keeps its own TRIGGER; the winner
// decision now comes from here.
//
// The ladder (handoff-approved): merge eligibility first — an overview,
// day-arc, or heading-fragment card can NEVER win a merge against a real
// card — then booking > named-venue distinctive tokens > commitment >
// specificity > title quality (length last, where it belongs).

export type MergeWinnerCard = {
  city?: string | null;
  commitmentRank?: number;
  confirmation?: string | null;
  description?: string | null;
  sourceHeadingPath?: string[] | null;
  sourceSectionLabel?: string | null;
  time?: string | null;
  title?: string | null;
};

export type MergeEligibility = {
  eligible: boolean;
  reason: "day_arc" | "heading_fragment" | "overview" | null;
};

export type MergeWinnerContext = {
  tripCities?: Iterable<string | null | undefined>;
};

// Sight verbs are parser phrasing, never content (RW-CLS-001): a title made
// only of verbs + a trip city is a day arc, not a venue.
const SIGHT_VERB_PATTERN =
  /^(?:we\s+)?(?:explore|exploring|discover|discovering|see|seeing|visit|visiting|wander|wandering|tour|touring|stroll|strolling|walk|walking|enjoy|enjoying|experience|do|doing)\b/i;

const ARC_FILLER_TOKENS = new Set([
  "a",
  "an",
  "and",
  "around",
  "afternoon",
  "city",
  "day",
  "downtown",
  "evening",
  "free",
  "in",
  "morning",
  "new",
  "of",
  "old",
  "the",
  "time",
  "to",
  "town",
]);

const SIGHT_VERB_TOKENS = new Set([
  "we",
  "explore",
  "exploring",
  "discover",
  "discovering",
  "see",
  "seeing",
  "visit",
  "visiting",
  "wander",
  "wandering",
  "tour",
  "touring",
  "stroll",
  "strolling",
  "walk",
  "walking",
  "enjoy",
  "enjoying",
  "experience",
  "do",
  "doing",
]);

export function tripCityTokenSet(
  cities: Iterable<string | null | undefined> | undefined
) {
  const tokens = new Set<string>();

  for (const city of cities ?? []) {
    for (const token of normalizeText(city).split(" ").filter(Boolean)) {
      tokens.add(token);
    }
  }

  return tokens;
}

// Content tokens = what remains of a title after verbs, day-arc filler, and
// trip-city names are removed. "Explore Vienna" -> none; "Prague Castle" ->
// ["castle"]; "Schonbrunn Palace" -> ["schonbrunn", "palace"].
export function titleContentTokens(
  title: string | null | undefined,
  cityTokens: Set<string>
) {
  return normalizeText(title)
    .split(" ")
    .filter(Boolean)
    .filter(
      (token) =>
        !SIGHT_VERB_TOKENS.has(token) &&
        !ARC_FILLER_TOKENS.has(token) &&
        !cityTokens.has(token)
    );
}

export function isDayArcTitle(
  title: string | null | undefined,
  cityTokens: Set<string>
) {
  const trimmed = title?.trim() ?? "";

  if (!trimmed) {
    return false;
  }

  if (isDayOverviewActivityTitle(trimmed)) {
    return true;
  }

  return (
    SIGHT_VERB_PATTERN.test(trimmed) &&
    titleContentTokens(trimmed, cityTokens).length === 0
  );
}

// A day heading's non-date remainder splits into segments on the source's
// own separators ("Friday, January 18th // Explore Vienna / Pick up Card").
export function headingRemainderSegments(
  value: string | null | undefined
): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\/\/|\s+[—–]\s+|::|\s+-{2,}\s+|\/|\||•|·/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

// A heading fragment is a card whose title IS one segment of its own source
// day heading and carries no venue content of its own. "Explore Vienna" out
// of "Friday, January 18th // Explore Vienna / Pick up Card / …" is a
// fragment even when it ships on a different day (live run 7.18.2 shipped it
// on Jan 19). A venue named inside a multi-part heading ("Prague Castle"
// under "Lesser Town & Prague Castle") keeps venue content tokens and is NOT
// a fragment.
export function isHeadingFragmentTitle(
  title: string | null | undefined,
  headingTexts: Array<string | null | undefined>,
  cityTokens: Set<string>
) {
  const comparableTitle = normalizeText(title);

  if (!comparableTitle) {
    return false;
  }

  if (titleContentTokens(title, cityTokens).length > 0) {
    return false;
  }

  return headingTexts.some((heading) =>
    headingRemainderSegments(heading).some(
      (segment) => normalizeText(segment) === comparableTitle
    )
  );
}

export function classifyMergeEligibility(
  card: MergeWinnerCard,
  context: MergeWinnerContext = {}
): MergeEligibility {
  const cityTokens = tripCityTokenSet(context.tripCities);

  if (card.city) {
    for (const token of normalizeText(card.city).split(" ").filter(Boolean)) {
      cityTokens.add(token);
    }
  }

  if (isDayOverviewActivityTitle(card.title ?? "")) {
    return { eligible: false, reason: "overview" };
  }

  const headingTexts = [
    card.sourceSectionLabel ?? null,
    ...(card.sourceHeadingPath ?? []),
  ];

  if (isHeadingFragmentTitle(card.title, headingTexts, cityTokens)) {
    return {
      eligible: false,
      reason: isDayArcTitle(card.title, cityTokens)
        ? "day_arc"
        : "heading_fragment",
    };
  }

  // A bare day-arc title WITHOUT heading corroboration stays eligible on
  // purpose: "Tour Rome" is a real approved ground-truth card. The heading
  // is what proves a verb+city title is heading noise, not a plan.
  return { eligible: true, reason: null };
}

function titleQualityScore(title: string | null | undefined) {
  const trimmed = title?.trim() ?? "";
  const genericPenalty =
    /^(activity|stay|transport|travel|train|flight|note)$/i.test(trimmed)
      ? 50
      : 0;

  return Math.min(trimmed.length, 100) - genericPenalty;
}

export type MergeWinnerDecision = {
  loser: "left" | "right";
  rung:
    | "bonus"
    | "booking"
    | "commitment"
    | "eligibility"
    | "named_venue"
    | "specificity"
    | "tie"
    | "title_quality";
  winner: "left" | "right";
};

// The single winner ladder. `leftBonus`/`rightBonus` let a rule keep its own
// locked top preference below eligibility (the alternative-slot collapse's
// or-carrying copy, RW-CAN-001) without re-growing a private ladder.
export function chooseMergeWinner(
  left: MergeWinnerCard,
  right: MergeWinnerCard,
  context: MergeWinnerContext & {
    leftBonus?: number;
    rightBonus?: number;
  } = {}
): MergeWinnerDecision {
  const decide = (
    leftScore: number,
    rightScore: number,
    rung: MergeWinnerDecision["rung"]
  ): MergeWinnerDecision | null => {
    if (leftScore === rightScore) {
      return null;
    }

    return leftScore > rightScore
      ? { loser: "right", rung, winner: "left" }
      : { loser: "left", rung, winner: "right" };
  };

  const cityTokens = tripCityTokenSet(context.tripCities);
  const leftEligibility = classifyMergeEligibility(left, context);
  const rightEligibility = classifyMergeEligibility(right, context);

  return (
    decide(
      leftEligibility.eligible ? 1 : 0,
      rightEligibility.eligible ? 1 : 0,
      "eligibility"
    ) ??
    decide(context.leftBonus ?? 0, context.rightBonus ?? 0, "bonus") ??
    decide(
      left.confirmation ? 1 : 0,
      right.confirmation ? 1 : 0,
      "booking"
    ) ??
    decide(
      titleContentTokens(left.title, cityTokens).length > 0 ? 1 : 0,
      titleContentTokens(right.title, cityTokens).length > 0 ? 1 : 0,
      "named_venue"
    ) ??
    decide(
      left.commitmentRank ?? 0,
      right.commitmentRank ?? 0,
      "commitment"
    ) ??
    decide(
      titleContentTokens(left.title, cityTokens).length +
        (left.time ? 1 : 0),
      titleContentTokens(right.title, cityTokens).length +
        (right.time ? 1 : 0),
      "specificity"
    ) ??
    decide(
      titleQualityScore(left.title),
      titleQualityScore(right.title),
      "title_quality"
    ) ?? { loser: "right", rung: "tie", winner: "left" }
  );
}
