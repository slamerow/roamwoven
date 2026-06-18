export class MissingTripSpineBasicsError extends Error {
  constructor(public missingBasics: string[]) {
    super(`Trip spine is missing: ${missingBasics.join(", ")}`);
  }
}

function getObject(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

function getArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const child = (value as Record<string, unknown>)[key];
  return Array.isArray(child) ? child : [];
}

function getString(value: Record<string, unknown> | null, key: string) {
  const child = value?.[key];
  return typeof child === "string" && child.trim() ? child.trim() : null;
}

function arrayHasString(value: unknown[], key: string) {
  return value.some(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>)[key] === "string" &&
      String((item as Record<string, unknown>)[key]).trim()
  );
}

export function getMissingTripSpineBasics(draft: unknown) {
  const overview = getObject(draft, "tripOverview");
  const places = getArray(draft, "places");
  const stays = getArray(draft, "stays");
  const transport = getArray(draft, "transport");
  const activities = getArray(draft, "activities");
  const missing: string[] = [];

  if (!getString(overview, "title")) {
    missing.push("trip title");
  }

  if (
    !getString(overview, "destinationSummary") &&
    !arrayHasString(places, "city")
  ) {
    missing.push("destination or city");
  }

  if (
    !getString(overview, "dateRange") &&
    !arrayHasString(places, "arriveDate") &&
    !arrayHasString(transport, "date") &&
    !arrayHasString(activities, "date")
  ) {
    missing.push("trip dates");
  }

  if (
    places.length === 0 &&
    stays.length === 0 &&
    transport.length === 0 &&
    activities.length === 0
  ) {
    missing.push("at least one stay, transport item, place, or anchor plan");
  }

  return missing;
}

export function assertTripSpineBasics(draft: unknown) {
  const missingBasics = getMissingTripSpineBasics(draft);

  if (missingBasics.length > 0) {
    throw new MissingTripSpineBasicsError(missingBasics);
  }
}
