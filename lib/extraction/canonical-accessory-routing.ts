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
    if (!normalized) return false;
    if (normalized.length >= 5 && text.includes(normalized)) return true;

    const stopWords = new Set([
      "activity",
      "cafe",
      "dinner",
      "flight",
      "hotel",
      "hostel",
      "house",
      "lunch",
      "museum",
      "palace",
      "restaurant",
      "stay",
      "the",
      "tour",
      "train",
      "visit",
    ]);
    const valueTokens = normalized
      .split(/\s+/)
      .filter((token) => token.length >= 5 && !stopWords.has(token));
    if (valueTokens.length === 0) return false;
    const segmentTokens = text.split(/\s+/);
    const withinTypoDistance = (left: string, right: string) => {
      const limit = Math.min(left.length, right.length) >= 8 ? 2 : 1;
      if (Math.abs(left.length - right.length) > limit) return false;
      const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

      for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex];
        let rowMinimum = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
          const value = Math.min(
            current[rightIndex - 1] + 1,
            previous[rightIndex] + 1,
            previous[rightIndex - 1] + Number(
              left[leftIndex - 1] !== right[rightIndex - 1]
            )
          );
          current.push(value);
          rowMinimum = Math.min(rowMinimum, value);
        }
        if (rowMinimum > limit) return false;
        previous.splice(0, previous.length, ...current);
      }

      return previous[right.length] <= limit;
    };

    const matchedTokens = valueTokens.filter((valueToken) =>
      segmentTokens.some((segmentToken) =>
        segmentToken === valueToken || withinTypoDistance(segmentToken, valueToken)
      )
    );
    return Boolean(
      matchedTokens.length >= Math.min(2, valueTokens.length) ||
        matchedTokens.some((token) => token.length >= 7)
    );
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

    const directionTargets = compatibleTransport.filter((transport) =>
      exactRecordMention(segment, [
        transport.payload.arrival,
        transport.payload.arrivalLocation,
        transport.payload.departure,
        transport.payload.departureLocation,
      ])
    );
    if (
      directionTargets.length === 1 &&
      /\b(?:directions?|from the (?:airport|station)|metro|subway|tram|walk|take|transfer)\b/.test(
        text
      )
    ) {
      const target = directionTargets[0];
      const existing = stringValue(target.payload, "description");
      if (!existing || !normalizeText(existing).includes(text)) {
        target.payload.description = [existing, segment].filter(Boolean).join(" ");
      }
      actions.addAction(target, {
        absorbedTitles: [],
        observationIds: [...note.observationIds],
        reason: "explicit station or airport directions attached to inbound travel",
        type: "attached",
      });
    }

    return !(
      stayMention ||
      uniqueLodgingContext ||
      activityMention ||
      transportMention ||
      uniqueMovementContext
    );
  });
  const dedupedRetained = retained.filter((segment, index) => {
    const normalized = normalizeText(segment);
    return retained.findIndex((candidate) => normalizeText(candidate) === normalized) === index;
  });

  if (dedupedRetained.length === 0 && segments.length > 0) {
    actions.suppressPiece(
      note,
      "note evidence routed to canonical stay, activity, or travel records"
    );
    return;
  }

  if (dedupedRetained.length !== segments.length) {
    note.payload.description = dedupedRetained.join(" ");
    actions.addAction(note, {
      absorbedTitles: [],
      observationIds: [...note.observationIds],
      reason: "removed stay, activity, and travel evidence before city-note merge",
      type: "recovered",
    });
  }

  // Notes are never promoted into a broad activity here. If source evidence
  // contains a concrete plan, atomic extraction or the canonical role decision
  // must own it. This layer may sanitize and attach evidence only.
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
