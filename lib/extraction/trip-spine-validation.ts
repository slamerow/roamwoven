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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reviewDetailForMissingBasic(missingBasic: string) {
  if (missingBasic === "trip title") {
    return {
      answerType: "text",
      prompt: "What should this trip be called?",
      reason: "Roamwoven could not find a clear trip title in the source materials.",
      targetField: "travelerAppTitle",
    };
  }

  if (missingBasic === "destination or city") {
    return {
      answerType: "text",
      prompt: "Which destination or cities belong in this trip?",
      reason: "Roamwoven could not confidently identify the trip destinations.",
      targetField: "destinationSummary",
    };
  }

  if (missingBasic === "trip dates") {
    return {
      answerType: "text",
      prompt: "What dates should this trip cover?",
      reason: "Roamwoven could not confidently identify the trip date range.",
      targetField: "dateRange",
    };
  }

  return {
    answerType: "text",
    prompt: "What should Roamwoven include in the first trip draft?",
    reason:
      "The readable source material did not contain a clear stay, transport item, destination, or anchor plan.",
    targetField: "tripSpine",
  };
}

export function prepareTripDraftForReview(draft: unknown) {
  const record = asRecord(draft);
  const missingBasics = getMissingTripSpineBasics(record);

  if (missingBasics.length === 0) {
    return record;
  }

  const existingDetails = Array.isArray(record.missingDetails)
    ? record.missingDetails
    : [];
  const existingTargets = new Set(
    existingDetails
      .map((detail) =>
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as Record<string, unknown>).targetField
          : null
      )
      .filter((target): target is string => typeof target === "string")
  );
  const recoveryDetails = missingBasics
    .map(reviewDetailForMissingBasic)
    .filter((detail) => !existingTargets.has(detail.targetField))
    .map((detail) => ({
      ...detail,
      confidence: "low",
      evidence: null,
      guessedValue: null,
      relatedTitle: null,
      subjectType: "trip",
    }));

  return {
    ...record,
    _processingReview: {
      disposition: "needs_review",
      missingBasics,
      version: 1,
    },
    missingDetails: [...existingDetails, ...recoveryDetails],
  };
}
