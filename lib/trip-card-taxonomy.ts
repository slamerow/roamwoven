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

type CityTipRecord = {
  categoryId?: string | null;
  description?: string | null;
  itemType?: string | null;
  legId?: string | null;
  title?: string | null;
};

function textForCityTipRecord(record: CityTipRecord) {
  return [record.title, record.description].filter(Boolean).join(" ");
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
