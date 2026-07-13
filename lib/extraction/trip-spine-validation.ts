function getArray(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const child = (value as Record<string, unknown>)[key];
  return Array.isArray(child) ? child : [];
}

export function getMissingTripSpineBasics(draft: unknown) {
  const hasTravelerContent = ["activities", "places", "stays", "transport"]
    .some((collection) => getArray(draft, collection).length > 0);

  return hasTravelerContent
    ? []
    : ["at least one stay, transport item, place, or anchor plan"];
}

export function createCanonicalTripSpineReviewDetails(draft: unknown) {
  if (getMissingTripSpineBasics(draft).length === 0) {
    return [];
  }

  return [{
    _canonicalReviewDisposition: "question",
    answerType: "text",
    confidence: "low",
    evidence: null,
    guessedValue: null,
    prompt: "What should Roamwoven include in the first trip draft?",
    reason:
      "The readable source material did not contain a clear stay, transport item, destination, or anchor plan.",
    relatedTitle: null,
    subjectType: "trip",
    targetField: "tripSpine",
  }];
}
