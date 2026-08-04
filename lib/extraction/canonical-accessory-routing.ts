import type {
  CanonicalEvidenceAction,
  CanonicalEvidencePiece,
} from "@/lib/extraction/evidence-clustering";
import {
  normalizeText,
  normalizeTripDate,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import { hasLooseTipVocabulary } from "@/lib/trip-card-taxonomy";

type RoutingActions = {
  addAction: (
    piece: CanonicalEvidencePiece,
    action: CanonicalEvidenceAction
  ) => void;
  mergePiece: (args: {
    reason: string;
    source: CanonicalEvidencePiece;
    target: CanonicalEvidencePiece;
  }) => void;
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function factualActivityDetail(
  segment: string,
  activity: CanonicalEvidencePiece
) {
  const title = stringValue(activity.payload, "title");
  let detail = segment.trim();

  if (title) {
    detail = detail
      .replace(
        new RegExp(`^(?:[^:]{1,30}:\\s*)?${escapeRegExp(title)}\\s*(?:[-—,:]|\\bis\\b)?\\s*`, "i"),
        ""
      )
      .trim();
  }

  if (
    !detail ||
    normalizeText(detail) === normalizeText(title) ||
    !/\b(?:architecture|built|cuisine|designed|dish(?:es)?|famous|founded|historic|history|known for|located|michelin|opened|popular dishes?|serves|speciali[sz]es|traditional|wine)\b/i.test(
      detail
    )
  ) {
    return null;
  }

  if (detail.length > 220) {
    const shortened = detail.slice(0, 220).replace(/\s+\S*$/, "").trim();
    detail = `${shortened}.`;
  }

  return detail;
}

function attachActivityDetail({
  actions,
  activity,
  detail,
  note,
}: {
  actions: RoutingActions;
  activity: CanonicalEvidencePiece;
  detail: string;
  note: CanonicalEvidencePiece;
}) {
  const existing = stringValue(activity.payload, "description");

  if (existing && normalizeText(existing).includes(normalizeText(detail))) {
    return;
  }

  activity.payload.description = [existing, detail].filter(Boolean).join(" ");
  actions.addAction(activity, {
    absorbedTitles: [],
    observationIds: [...note.observationIds],
    reason: "moved one useful source detail from a duplicate city-note mention",
    type: "attached",
  });
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
  const retained = segments.flatMap((segment) => {
    const text = normalizeText(segment);
    const stayMention = compatibleStays.some((stay) =>
      exactRecordMention(segment, [stay.payload.name, stay.payload.address])
    );
    const uniqueLodgingContext =
      compatibleStays.length === 1 &&
      /\b(?:sleep|sleeping|stay|lodging|hostel|hotel|check in|check-in|room|address)\b/.test(
        text
      );
    const matchingActivities = compatibleActivities.filter((activity) =>
      exactRecordMention(segment, [activity.payload.title, activity.payload.address])
    );
    const activityMention = matchingActivities.length > 0;
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

    if (activityMention) {
      if (matchingActivities.length === 1) {
        const detail = factualActivityDetail(segment, matchingActivities[0]);
        if (detail) {
          attachActivityDetail({
            actions,
            activity: matchingActivities[0],
            detail,
            note,
          });
        }
      }
    }

    // Recommendation prose IS note content (live-run 7.21.0, run7 PC-7:
    // "Some beers at Peklo… popular beer spots" and "maybe communism
    // museum" were stripped from the Prague note as "activity evidence"
    // because junk cards shared a name with them; the eat/drink recs
    // vanished from the traveler note entirely). A segment carrying
    // hedge/recommendation vocabulary stays in the note even when a
    // record shares its name — the record match only removes RECORD
    // evidence (bookings, times, addresses), never the recommendation.
    const recommendationProse = hasLooseTipVocabulary(segment);

    return !recommendationProse &&
      (stayMention ||
        uniqueLodgingContext ||
        activityMention ||
        transportMention ||
        uniqueMovementContext)
      ? []
      : [segment];
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

  const retainedChanged =
    dedupedRetained.length !== segments.length ||
    dedupedRetained.some((segment, index) => segment !== segments[index]);

  if (retainedChanged) {
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

function rentalText(piece: CanonicalEvidencePiece) {
  return normalizeText(
    [piece.payload.title, piece.payload.description, piece.payload.category]
      .filter(Boolean)
      .join(" ")
  );
}

function isRentalPickup(piece: CanonicalEvidencePiece) {
  return /\b(?:pick\s*up|pickup).{0,30}\b(?:rental\s*)?car\b|\brental\s*car.{0,30}\b(?:pick\s*up|pickup)\b/.test(
    rentalText(piece)
  );
}

function isRentalTarget(piece: CanonicalEvidencePiece) {
  if (!piece.outputEligible) return false;
  if (piece.kind === "transport") {
    return /\brental\s*car\b/.test(
      normalizeText(String(piece.payload.type ?? "").replaceAll("_", " "))
    );
  }

  return piece.kind === "activity" &&
    (isRentalPickup(piece) || /\b(?:rental car|car rental)\b/.test(rentalText(piece)));
}

function isRentalReservationDetail(piece: CanonicalEvidencePiece) {
  return piece.kind === "activity" &&
    piece.outputEligible &&
    !isRentalPickup(piece) &&
    /\b(?:car|vehicle)\s+(?:booking|reservation)\s+(?:detail|details|information)\b|\b(?:rental car|car rental)\s+(?:booking|reservation)\b/.test(
      rentalText(piece)
    );
}

function attachRentalReservationDetails({
  actions,
  pieces,
}: {
  actions: RoutingActions;
  pieces: CanonicalEvidencePiece[];
}) {
  const targets = pieces.filter(isRentalTarget);

  for (const detail of pieces.filter(isRentalReservationDetail)) {
    const detailDate = stringValue(detail.payload, "date");
    const datedTargets = targets.filter((target) => {
      if (target === detail) return false;
      const targetDate = stringValue(target.payload, "date");
      return Boolean(
        detailDate && targetDate && tripDatesMatch(detailDate, targetDate)
      );
    });
    const matches = datedTargets.length > 0
      ? datedTargets
      : targets.filter((target) => target !== detail).length === 1
        ? targets.filter((target) => target !== detail)
        : [];

    if (matches.length !== 1) continue;

    const target = matches[0];
    for (const field of [
      "address",
      "confirmation",
      "confirmationLabel",
      "endTime",
      "provider",
      "startTime",
    ]) {
      if (!target.payload[field] && detail.payload[field]) {
        target.payload[field] = detail.payload[field];
      }
    }

    const existing = stringValue(target.payload, "description");
    const incoming = stringValue(detail.payload, "description");
    if (incoming && !normalizeText(existing).includes(normalizeText(incoming))) {
      target.payload.description = [existing, incoming].filter(Boolean).join(" ");
    }
    actions.mergePiece({
      reason: "rental reservation details attached to the canonical rental",
      source: detail,
      target,
    });
  }
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
  attachRentalReservationDetails({ actions, pieces });
  removeCrossActivityDescriptionBleed({ actions, pieces });

  for (const note of pieces.filter(
    (piece) => piece.kind === "note" && piece.outputEligible
  )) {
    routeDatedNoteEvidence({ actions, note, pieces, tripYear });
  }
}
