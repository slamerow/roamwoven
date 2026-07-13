import type {
  CanonicalEvidenceAction,
  CanonicalEvidencePiece,
} from "@/lib/extraction/evidence-clustering";
import {
  normalizeText,
  normalizeTripDate,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";

type RoutingActions = {
  addAction: (
    piece: CanonicalEvidencePiece,
    action: CanonicalEvidenceAction
  ) => void;
  suppressPiece: (piece: CanonicalEvidencePiece, reason: string) => void;
};

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedComparable(value: unknown) {
  return typeof value === "string" ? normalizeText(value) : "";
}

function splitEvidenceSegments(value: unknown) {
  if (typeof value !== "string") return [];

  return value
    .split(/(?:\r?\n)+|\s*;\s*|(?<=[.!?])\s+/)
    .map((segment) => segment.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function sourceStructuredDate(
  payload: Record<string, unknown>,
  tripYear: number | null
) {
  const candidates = [
    stringValue(payload, "date"),
    stringValue(payload, "sourceSectionLabel"),
    ...(Array.isArray(payload.sourceHeadingPath)
      ? payload.sourceHeadingPath.filter(
          (value): value is string => typeof value === "string"
        )
      : []),
  ];

  for (const candidate of candidates) {
    const date = normalizeTripDate(candidate, tripYear);
    if (date) return date;
  }

  return null;
}

function pieceCity(piece: CanonicalEvidencePiece) {
  return normalizeText(stringValue(piece.payload, "city"));
}

function cityCompatible(piece: CanonicalEvidencePiece, city: string | null) {
  const normalizedPieceCity = pieceCity(piece);
  const normalizedCity = normalizeText(city);
  return !normalizedCity || !normalizedPieceCity || normalizedCity === normalizedPieceCity;
}

function activityDateCompatible(
  piece: CanonicalEvidencePiece,
  date: string | null
) {
  const candidateDate = stringValue(piece.payload, "date");
  return !date || !candidateDate || tripDatesMatch(date, candidateDate);
}

function stayDateCompatible(piece: CanonicalEvidencePiece, date: string | null) {
  if (!date) return true;
  const checkIn = stringValue(piece.payload, "checkIn") ??
    stringValue(piece.payload, "firstNightDate");
  const checkOut = stringValue(piece.payload, "checkOut");
  return Boolean(
    checkIn &&
      (tripDatesMatch(date, checkIn) || (checkOut && date >= checkIn && date < checkOut))
  );
}

function exactRecordMention(segment: string, values: unknown[]) {
  const text = normalizeText(segment);
  return values.some((value) => {
    const normalized = normalizedComparable(value);
    return normalized.length >= 5 && text.includes(normalized);
  });
}

function removeCrossActivityDescriptionBleed({
  actions,
  pieces,
}: {
  actions: RoutingActions;
  pieces: CanonicalEvidencePiece[];
}) {
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );

  for (const activity of activities) {
    const segments = splitEvidenceSegments(activity.payload.description);
    if (segments.length < 2) continue;

    const retained = segments.filter((segment) => {
      const normalizedSegment = normalizeText(segment);
      const leakedTarget = activities.find((candidate) => {
        if (candidate === activity || !candidate.outputEligible) return false;
        const candidateTitle = normalizeText(stringValue(candidate.payload, "title"));
        if (!candidateTitle || candidateTitle.length < 6) return false;
        return (
          normalizedSegment === candidateTitle ||
          normalizedSegment === `the ${candidateTitle}`
        );
      });

      if (!leakedTarget) return true;
      actions.addAction(activity, {
        absorbedTitles: [],
        observationIds: [...activity.observationIds],
        reason: `removed description fragment belonging to ${
          stringValue(leakedTarget.payload, "title") ?? "another canonical activity"
        }`,
        type: "recovered",
      });
      return false;
    });

    if (retained.length !== segments.length) {
      activity.payload.description = retained.join(" ") || null;
    }
  }
}

function routeDatedNoteEvidence({
  actions,
  note,
  pieces,
  tripYear,
}: {
  actions: RoutingActions;
  note: CanonicalEvidencePiece;
  pieces: CanonicalEvidencePiece[];
  tripYear: number | null;
}) {
  const city = stringValue(note.payload, "city");
  const date = sourceStructuredDate(note.payload, tripYear);
  const sectionType = stringValue(note.payload, "sourceSectionType");

  // Source hierarchy is authoritative. Only repair a dated itinerary block
  // that the model mislabeled; never promote or strip a city-reference block.
  if (!date || sectionType === "city_reference") return;

  const compatibleStays = pieces.filter(
    (piece) =>
      piece.kind === "stay" &&
      piece.outputEligible &&
      cityCompatible(piece, city) &&
      stayDateCompatible(piece, date)
  );
  const compatibleActivities = pieces.filter(
    (piece) =>
      piece.kind === "activity" &&
      piece.outputEligible &&
      cityCompatible(piece, city) &&
      activityDateCompatible(piece, date)
  );
  const compatibleTransport = pieces.filter(
    (piece) =>
      piece.kind === "transport" &&
      piece.outputEligible &&
      cityCompatible(piece, city) &&
      activityDateCompatible(piece, date)
  );
  const segments = splitEvidenceSegments(note.payload.description);
  const retained = segments.filter((segment) => {
    const text = normalizeText(segment);
    const stayMention = compatibleStays.some((stay) =>
      exactRecordMention(segment, [stay.payload.name, stay.payload.address])
    );
    const uniqueLodgingContext =
      compatibleStays.length === 1 &&
      /\b(?:sleep|sleeping|stay|lodging|hostel|hotel|check in|check-in|room|address)\b/.test(
        text
      );
    const activityMention = compatibleActivities.some((activity) =>
      exactRecordMention(segment, [activity.payload.title, activity.payload.address])
    );
    const transportMention = compatibleTransport.some((transport) =>
      exactRecordMention(segment, [
        transport.payload.title,
        transport.payload.departure,
        transport.payload.arrival,
      ])
    );
    const uniqueMovementContext =
      compatibleTransport.length === 1 &&
      /\b(?:arrival|arrive|departure|depart|flight|fly|train|transfer)\b/.test(text);

    return !(
      stayMention ||
      uniqueLodgingContext ||
      activityMention ||
      transportMention ||
      uniqueMovementContext
    );
  });

  if (retained.length === 0 && segments.length > 0) {
    actions.suppressPiece(
      note,
      "note evidence routed to canonical stay, activity, or travel records"
    );
    return;
  }

  if (retained.length !== segments.length) {
    note.payload.description = retained.join(" ");
    actions.addAction(note, {
      absorbedTitles: [],
      observationIds: [...note.observationIds],
      reason: "removed stay, activity, and travel evidence before city-note merge",
      type: "recovered",
    });
  }

  const residualText = normalizeText(retained.join(" "));
  const hasPlannedRemainder = retained.length > 0 && retained.every((segment) =>
    /\b(?:tour|explore|visit|work|eat|breakfast|lunch|dinner|wander|walk|spend|relax)\b/.test(
      normalizeText(segment)
    )
  );

  if (
    !hasPlannedRemainder ||
    /\b(?:ideas?|recommendations?|maybe|if time|could visit|things to check out)\b/.test(
      residualText
    )
  ) {
    return;
  }

  const dayparts = ["morning", "afternoon", "evening"].filter((daypart) =>
    residualText.includes(daypart)
  );
  note.kind = "activity";
  note.role = "atomic_candidate";
  note.payload.category = stringValue(note.payload, "category") ?? "art_culture";
  note.payload.date = date;
  note.payload.evidenceRole = "atomic_candidate";
  note.payload.itemType = "activity";
  note.payload.sourceSectionType = "dated_itinerary";
  note.payload.title = `${city ?? "Flexible"}${
    dayparts.length > 0 ? ` ${dayparts.join(" / ")}` : " flexible"
  } plans`;
  actions.addAction(note, {
    absorbedTitles: [],
    observationIds: [...note.observationIds],
    reason: "dated planned content routed from note evidence to one flexible activity",
    type: "recovered",
  });
}

export function routeCanonicalAccessoryEvidence({
  actions,
  pieces,
  tripYear,
}: {
  actions: RoutingActions;
  pieces: CanonicalEvidencePiece[];
  tripYear: number | null;
}) {
  removeCrossActivityDescriptionBleed({ actions, pieces });

  for (const note of pieces.filter(
    (piece) => piece.kind === "note" && piece.outputEligible
  )) {
    routeDatedNoteEvidence({ actions, note, pieces, tripYear });
  }
}
