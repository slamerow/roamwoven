import { createHash } from "node:crypto";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";
import {
  normalizeText,
  normalizeTripDate,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import {
  classifyDraftActivityCard,
  isPlannedAreaActivityGroup,
  isSameSiteActivityGroup,
  isTourActivityGroup,
} from "@/lib/trip-card-taxonomy";

export const CANONICAL_EVIDENCE_BOUNDARY_VERSION = 2;
export const EVIDENCE_CLUSTER_VERSION = 3;

export type EvidenceKind =
  | "activity"
  | "context"
  | "note"
  | "place"
  | "stay"
  | "transport";

export type EvidenceSource = "model_chunk" | "model_spine" | "source_anchor";

export type EvidenceStageInput = {
  label: string;
  source: Exclude<EvidenceSource, "source_anchor">;
  sourceFilename?: string | null;
  sourceProvenance?: string | null;
  sourceUploadId?: string | null;
  stage: unknown;
};

export type EvidenceObservation = {
  id: string;
  kind: EvidenceKind;
  ordinal: number;
  payload: Record<string, unknown>;
  source: EvidenceSource;
  sourceFilename: string | null;
  sourceLabel: string;
  sourceProvenance: string | null;
  sourceUploadId: string | null;
};

export type CanonicalEvidenceConflict = {
  field: string;
  observationIds: string[];
  values: string[];
};

export type CanonicalEvidencePiece = {
  confidence: "high" | "medium";
  conflicts: CanonicalEvidenceConflict[];
  fieldSources: Record<string, string[]>;
  id: string;
  kind: EvidenceKind;
  mergeReasons: string[];
  observationIds: string[];
  outputEligible: boolean;
  payload: Record<string, unknown>;
};

export type EvidenceClusteringResult = {
  draft: unknown;
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  summary: {
    canonicalPieceCount: number;
    clusteredObservationCount: number;
    contextObservationCount: number;
    observationCount: number;
    sourceAnchorObservationCount: number;
    suppressedWeakAnchorCount: number;
  };
};

const COLLECTIONS: Array<{
  collection: "activities" | "places" | "stays" | "transport";
  kind: Exclude<EvidenceKind, "context" | "note">;
}> = [
  { collection: "activities", kind: "activity" },
  { collection: "places", kind: "place" },
  { collection: "stays", kind: "stay" },
  { collection: "transport", kind: "transport" },
];

const IDENTITY_STOP_WORDS = new Set([
  "activity",
  "afternoon",
  "at",
  "breakfast",
  "day",
  "dinner",
  "flight",
  "for",
  "from",
  "in",
  "lunch",
  "morning",
  "pickup",
  "pick",
  "restaurant",
  "the",
  "to",
  "train",
  "travel",
  "trip",
  "up",
  "visit",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const DATE_FIELDS = new Set([
  "arriveDate",
  "arrivalDate",
  "checkIn",
  "checkInDate",
  "checkOut",
  "checkOutDate",
  "date",
  "departureDate",
  "firstNightDate",
  "lastNightDate",
  "leaveDate",
]);

function inferTripYear(...values: unknown[]) {
  for (const value of values) {
    const text = JSON.stringify(value) ?? "";
    const isoYear = /\b((?:19|20)\d{2})-\d{1,2}-\d{1,2}\b/.exec(text)?.[1];
    const writtenYear = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[^\d]{0,12}\d{1,2}(?:st|nd|rd|th)?[^\d]{0,8}((?:19|20)\d{2})\b/i.exec(
      text
    )?.[1];
    const explicitYear = /\b((?:19|20)\d{2})\b/.exec(text)?.[1];
    const year = isoYear ?? writtenYear ?? explicitYear;

    if (year) {
      return Number(year);
    }
  }

  return null;
}

function normalizePayloadDates(
  payload: Record<string, unknown>,
  defaultYear: number | null
) {
  return Object.fromEntries(
    Object.entries(payload).map(([field, value]) => {
      if (!DATE_FIELDS.has(field) || typeof value !== "string") {
        return [field, value];
      }

      return [field, normalizeTripDate(value, defaultYear) ?? value];
    })
  );
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 24);
}

function normalizedComparable(value: unknown) {
  return typeof value === "string" ? normalizeText(value) : "";
}

function normalizedClockTime(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(value.trim());

  if (!match) {
    return normalizedComparable(value);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase();

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return normalizedComparable(value);
  }

  if (suffix === "pm" && hour < 12) {
    hour += 12;
  } else if (suffix === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const LOCATION_ALIASES: Record<string, string> = {
  "fiumicino": "fco",
  "fiumicino airport": "fco",
  "rome fiumicino": "fco",
  "rome fiumicino airport": "fco",
  "prague hlavni nadrazi": "prague central station",
  "praha hlavni nadrazi": "prague central station",
  "wien hauptbahnhof": "vienna central station",
  "wien hbf": "vienna central station",
};

function normalizedLocation(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = normalizeText(
    value.replace(/^(?:-|–|—|>|→)+\s*/, "")
  )
    .replace(/\b(?:train|flight)\s+code\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalized ||
    /^(?:flight|train|travel|transport)$/.test(normalized) ||
    /^(?:flight|train|travel|transport)\s+(?:from|to)\b/.test(normalized) ||
    /\b(?:am|pm|budget|code|confirmation|costs?|key|lockbox|ticketcode)\b/.test(
      normalized
    ) ||
    /^\d{1,2}\s+\d{2}$/.test(normalized)
  ) {
    return "";
  }

  return LOCATION_ALIASES[normalized] ?? normalized;
}

function locationsMatch(left: unknown, right: unknown) {
  const normalizedLeft = normalizedLocation(left);
  const normalizedRight = normalizedLocation(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const short =
    normalizedLeft.split(" ").length === 1 ? normalizedLeft :
      normalizedRight.split(" ").length === 1 ? normalizedRight : "";
  const long = short === normalizedLeft ? normalizedRight : normalizedLeft;

  return Boolean(
    short.length >= 4 && new RegExp(`\\b${short}\\b`).test(long)
  );
}

function locationQuality(value: unknown) {
  const normalized = normalizedLocation(value);

  if (!normalized) {
    return 0;
  }

  if (/^[a-z]{3}$/.test(normalized)) {
    return 4;
  }

  if (/\b(?:airport|bahnhof|hbf|nadrazi|station|terminal)\b/.test(normalized)) {
    return 4;
  }

  return normalized.split(" ").length >= 2 ? 3 : 2;
}

function identityTokens(value: unknown) {
  return normalizedComparable(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !IDENTITY_STOP_WORDS.has(token));
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return new Set(left.filter((token) => rightSet.has(token))).size;
}

function valuesConflict(left: unknown, right: unknown) {
  const normalizedLeft = normalizedComparable(left);
  const normalizedRight = normalizedComparable(right);
  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight
  );
}

function compatibleField(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  field: string
) {
  return !valuesConflict(left[field], right[field]);
}

function sameOrMissingDate(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftDate = typeof left.date === "string" ? left.date : null;
  const rightDate = typeof right.date === "string" ? right.date : null;

  return !leftDate || !rightDate || tripDatesMatch(leftDate, rightDate);
}

function confirmationFrom(record: Record<string, unknown>) {
  return normalizedComparable(
    record.confirmation ?? record.confirmationLabel ?? record.bookingReference
  );
}

function timeFrom(record: Record<string, unknown>) {
  return normalizedClockTime(
    record.startTime ?? record.departureTime ?? record.checkInTime
  );
}

function isRentalPickup(record: Record<string, unknown>) {
  return /\b(?:pick\s*up|pickup).{0,30}\b(?:rental\s*)?car\b|\brental\s*car.{0,30}\b(?:pick\s*up|pickup)\b/.test(
    normalizeText(
      [record.title, record.description].filter(Boolean).join(" ")
    )
  );
}

function activityMatchReason(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  if (!sameOrMissingDate(left, right)) {
    return null;
  }

  const leftTime = timeFrom(left);
  const rightTime = timeFrom(right);

  if (leftTime && rightTime && leftTime !== rightTime) {
    return null;
  }

  const leftConfirmation = confirmationFrom(left);
  const rightConfirmation = confirmationFrom(right);

  if (leftConfirmation && leftConfirmation === rightConfirmation) {
    return "shared booking identity";
  }

  if (isRentalPickup(left) && isRentalPickup(right)) {
    return "same rental-car pickup";
  }

  const leftTitle = identityTokens(left.title);
  const rightTitle = identityTokens(right.title);
  const overlap = overlapCount(leftTitle, rightTitle);
  const leftTitleText = leftTitle.join(" ");
  const rightTitleText = rightTitle.join(" ");
  const unionSize = new Set([...leftTitle, ...rightTitle]).size;
  const titleSimilarity = unionSize > 0 ? overlap / unionSize : 0;

  if (leftTitleText && leftTitleText === rightTitleText) {
    return leftTime || rightTime ? "same named and timed plan" : "same named plan";
  }

  return overlap >= 2 && titleSimilarity >= 0.8
    ? "same dated venue identity"
    : null;
}

function transportNumber(record: Record<string, unknown>) {
  if (typeof record.number === "string") {
    const explicit = record.number.replace(/[^a-z0-9]/gi, "").toLowerCase();

    if (/^(?=.*\d)[a-z0-9]{2,10}$/.test(explicit)) {
      return explicit;
    }
  }

  const match = /\b([a-z]{1,3})\s*[- ]?(\d{2,5})\b/i.exec(
    typeof record.title === "string" ? record.title : ""
  );
  return match ? `${match[1]}${match[2]}`.toLowerCase() : "";
}

function routeEndpoint(record: Record<string, unknown>, side: "arrival" | "departure") {
  return normalizedLocation(
    record[side] ?? record[`${side}Location`] ?? null
  );
}

function endpointsConflict(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftDeparture = routeEndpoint(left, "departure");
  const rightDeparture = routeEndpoint(right, "departure");
  const leftArrival = routeEndpoint(left, "arrival");
  const rightArrival = routeEndpoint(right, "arrival");

  return (
    Boolean(
      leftDeparture &&
        rightDeparture &&
        !locationsMatch(leftDeparture, rightDeparture)
    ) ||
    Boolean(
      leftArrival && rightArrival && !locationsMatch(leftArrival, rightArrival)
    )
  );
}

function transportMatchReason(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  if (!sameOrMissingDate(left, right) || !compatibleField(left, right, "type")) {
    return null;
  }

  const leftNumber = transportNumber(left);
  const rightNumber = transportNumber(right);
  const leftConfirmation = confirmationFrom(left);
  const rightConfirmation = confirmationFrom(right);
  const leftHasRoute = Boolean(
    routeEndpoint(left, "departure") || routeEndpoint(left, "arrival")
  );
  const rightHasRoute = Boolean(
    routeEndpoint(right, "departure") || routeEndpoint(right, "arrival")
  );
  const departureMatches = Boolean(
    routeEndpoint(left, "departure") &&
      locationsMatch(
        left.departure ?? left.departureLocation,
        right.departure ?? right.departureLocation
      )
  );
  const arrivalMatches = Boolean(
    routeEndpoint(left, "arrival") &&
      locationsMatch(
        left.arrival ?? left.arrivalLocation,
        right.arrival ?? right.arrivalLocation
      )
  );
  const leftTitle = normalizedComparable(left.title);
  const rightTitle = normalizedComparable(right.title);
  const leftIdentityTitle = identityTokens(left.title).join(" ");
  const rightIdentityTitle = identityTokens(right.title).join(" ");

  if (leftNumber && rightNumber && leftNumber !== rightNumber) {
    return null;
  }

  if (leftNumber && leftNumber === rightNumber) {
    return "same transport segment number";
  }

  if (departureMatches && arrivalMatches) {
    return "same transport route";
  }

  if (leftTitle && leftTitle === rightTitle) {
    return "same dated transport title";
  }

  if (leftIdentityTitle && leftIdentityTitle === rightIdentityTitle) {
    return "same dated transport identity";
  }

  if (
    leftConfirmation &&
    leftConfirmation === rightConfirmation &&
    !endpointsConflict(left, right) &&
    (departureMatches || arrivalMatches)
  ) {
    return "same booking and compatible segment";
  }

  if (
    leftConfirmation &&
    leftConfirmation === rightConfirmation &&
    (!leftHasRoute || !rightHasRoute)
  ) {
    return "generic booking resolved to one segment";
  }

  if (
    leftConfirmation &&
    leftConfirmation === rightConfirmation &&
    (leftNumber || rightNumber) &&
    (locationQuality(left.departure ?? left.departureLocation) < 2 ||
      locationQuality(right.departure ?? right.departureLocation) < 2 ||
      locationQuality(left.arrival ?? left.arrivalLocation) < 2 ||
      locationQuality(right.arrival ?? right.arrivalLocation) < 2)
  ) {
    return "generic booking evidence resolved to numbered segment";
  }

  const titleOverlap = overlapCount(identityTokens(left.title), identityTokens(right.title));
  const leftTime = timeFrom(left);
  const rightTime = timeFrom(right);

  if (
    (departureMatches || arrivalMatches) &&
    titleOverlap >= 1 &&
    (!leftTime || !rightTime || leftTime === rightTime)
  ) {
    return "same dated route fragment";
  }

  return null;
}

function stayMatchReason(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  if (
    !compatibleField(left, right, "checkIn") ||
    !compatibleField(left, right, "checkOut")
  ) {
    return null;
  }

  const leftAddress = normalizedComparable(left.address);
  const rightAddress = normalizedComparable(right.address);

  if (leftAddress && leftAddress === rightAddress) {
    return "same stay address";
  }

  const overlap = overlapCount(identityTokens(left.name), identityTokens(right.name));
  return overlap >= 1 ? "same stay identity" : null;
}

function placeMatchReason(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftCity = normalizedComparable(left.city);
  const rightCity = normalizedComparable(right.city);

  if (!leftCity || leftCity !== rightCity) {
    return null;
  }

  const leftArrive = normalizedComparable(left.arriveDate ?? left.arrivalDate);
  const rightArrive = normalizedComparable(right.arriveDate ?? right.arrivalDate);
  const leftLeave = normalizedComparable(left.leaveDate ?? left.departureDate);
  const rightLeave = normalizedComparable(right.leaveDate ?? right.departureDate);

  if (
    (leftArrive && rightArrive && leftArrive !== rightArrive) ||
    (leftLeave && rightLeave && leftLeave !== rightLeave)
  ) {
    return null;
  }

  return compatibleField(left, right, "country") ? "same dated trip visit" : null;
}

function matchReason(
  kind: EvidenceKind,
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  if (kind === "activity" || kind === "note") {
    return activityMatchReason(left, right);
  }

  if (kind === "transport") {
    return transportMatchReason(left, right);
  }

  if (kind === "stay") {
    return stayMatchReason(left, right);
  }

  if (kind === "place") {
    return placeMatchReason(left, right);
  }

  return null;
}

function titleQuality(value: unknown) {
  const title = typeof value === "string" ? value.trim() : "";
  const genericPenalty = /^(activity|stay|transport|travel|train|flight|note)$/i.test(
    title
  )
    ? 50
    : 0;
  return Math.min(title.length, 100) - genericPenalty;
}

function isGenericTitle(value: unknown) {
  return /^(activity|stay|transport|travel|train|flight|return flight home|note)$/i.test(
    typeof value === "string" ? value.trim() : ""
  );
}

function uniqueDescription(left: unknown, right: unknown) {
  const leftText = typeof left === "string" ? left.trim() : "";
  const rightText = typeof right === "string" ? right.trim() : "";

  if (!leftText) return rightText || null;
  if (!rightText || normalizeText(leftText).includes(normalizeText(rightText))) {
    return leftText;
  }
  if (normalizeText(rightText).includes(normalizeText(leftText))) {
    return rightText;
  }

  return `${leftText} ${rightText}`;
}

function mergeObservationIntoPiece(
  piece: CanonicalEvidencePiece,
  observation: EvidenceObservation,
  reason: string
) {
  const next = { ...piece.payload };
  const conflicts = [...piece.conflicts];

  for (const [field, value] of Object.entries(observation.payload)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const existing = next[field];

    if (field === "description") {
      next[field] = uniqueDescription(existing, value);
    } else if (field === "title") {
      if (
        titleQuality(value) > titleQuality(existing) &&
        (observation.source !== "source_anchor" || isGenericTitle(existing))
      ) {
        next[field] = value;
      }
    } else if (field === "sourceFilename") {
      next[field] = existing ?? value;
    } else if (
      ["arrival", "arrivalLocation", "departure", "departureLocation"].includes(
        field
      ) &&
      locationQuality(value) > locationQuality(existing)
    ) {
      next[field] = value;
    } else if (
      ["arrivalTime", "departureTime", "endTime", "startTime", "time"].includes(
        field
      ) &&
      normalizedClockTime(existing) === normalizedClockTime(value)
    ) {
      next[field] = existing;
    } else if (existing === null || existing === undefined || existing === "") {
      next[field] = value;
    } else if (
      valuesConflict(existing, value) &&
      !(
        ["arrival", "arrivalLocation", "departure", "departureLocation"].includes(
          field
        ) &&
        normalizedLocation(existing) === normalizedLocation(value)
      )
    ) {
      const existingConflict = conflicts.find((conflict) => conflict.field === field);
      const values = Array.from(
        new Set([String(existing), String(value), ...(existingConflict?.values ?? [])])
      );
      const observationIds = Array.from(
        new Set([
          ...piece.observationIds,
          observation.id,
          ...(existingConflict?.observationIds ?? []),
        ])
      );

      if (existingConflict) {
        existingConflict.values = values;
        existingConflict.observationIds = observationIds;
      } else {
        conflicts.push({ field, observationIds, values });
      }
    }

    piece.fieldSources[field] = Array.from(
      new Set([...(piece.fieldSources[field] ?? []), observation.id])
    );
  }

  piece.payload = next;
  piece.conflicts = conflicts;
  piece.observationIds.push(observation.id);
  piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
  piece.confidence = conflicts.length === 0 ? "high" : "medium";
  piece.id = `piece_${stableHash({
    kind: piece.kind,
    observations: [...piece.observationIds].sort(),
  })}`;
}

function isStrongStandaloneAnchor(record: Record<string, unknown>) {
  const departure = routeEndpoint(record, "departure");
  const arrival = routeEndpoint(record, "arrival");
  const number = transportNumber(record);
  const hasTime = Boolean(record.departureTime || record.arrivalTime);
  const hasBooking = Boolean(record.confirmation);

  return Boolean(
    record.date &&
      departure &&
      arrival &&
      hasTime &&
      (number || hasBooking)
  );
}

function hasSpecificTransportRoute(record: Record<string, unknown>) {
  return Boolean(routeEndpoint(record, "departure") && routeEndpoint(record, "arrival"));
}

function suppressRedundantTransportParents(pieces: CanonicalEvidencePiece[]) {
  const transportPieces = pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  );

  for (const piece of transportPieces) {
    if (hasSpecificTransportRoute(piece.payload) || transportNumber(piece.payload)) {
      continue;
    }

    const confirmation = confirmationFrom(piece.payload);
    const date = normalizedComparable(piece.payload.date);
    const type = normalizedComparable(piece.payload.type);
    const candidates = transportPieces.filter(
      (candidate) =>
        candidate !== piece &&
        hasSpecificTransportRoute(candidate.payload) &&
        normalizedComparable(candidate.payload.date) === date &&
        normalizedComparable(candidate.payload.type) === type &&
        Boolean(
          (confirmation && confirmationFrom(candidate.payload) === confirmation) ||
            matchReason("transport", piece.payload, candidate.payload)
        )
    );

    if (candidates.length > 0) {
      piece.outputEligible = false;
      piece.mergeReasons = Array.from(
        new Set([
          ...piece.mergeReasons,
          "generic transport parent represented by specific segment",
        ])
      );
    }
  }
}

function createPiece(
  observation: EvidenceObservation,
  outputEligible = true
): CanonicalEvidencePiece {
  const fieldSources = Object.fromEntries(
    Object.entries(observation.payload)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([field]) => [field, [observation.id]])
  );

  return {
    confidence: observation.source === "source_anchor" ? "medium" : "high",
    conflicts: [],
    fieldSources,
    id: `piece_${stableHash({ kind: observation.kind, observation: observation.id })}`,
    kind: observation.kind,
    mergeReasons: ["initial observation"],
    observationIds: [observation.id],
    outputEligible,
    payload: { ...observation.payload },
  };
}

function activityKind(payload: Record<string, unknown>): EvidenceKind {
  const classification = classifyDraftActivityCard({
    category: stringValue(payload, "category"),
    date: stringValue(payload, "date"),
    description: stringValue(payload, "description"),
    endTime: stringValue(payload, "endTime"),
    itemType: stringValue(payload, "itemType"),
    startTime: stringValue(payload, "startTime"),
    title: stringValue(payload, "title"),
  });

  if (classification.isOverviewActivity) {
    return "context";
  }

  // Classification suggestions are intentionally not allowed to demote an
  // observation here. Untimed planned sights and ambiguous recommendations
  // need cluster context; only explicit note evidence crosses this boundary.
  return stringValue(payload, "itemType") === "note" ? "note" : "activity";
}

function activityInput(payload: Record<string, unknown>) {
  return {
    category: stringValue(payload, "category"),
    date: stringValue(payload, "date"),
    description: stringValue(payload, "description"),
    endTime: stringValue(payload, "endTime"),
    itemType: stringValue(payload, "itemType"),
    startTime: stringValue(payload, "startTime"),
    title: stringValue(payload, "title"),
  };
}

function reclassifySourceContainers(observations: EvidenceObservation[]) {
  const activities = observations.filter(
    (observation) => observation.kind === "activity"
  );

  for (const observation of activities) {
    const input = activityInput(observation.payload);
    const title = normalizeText(input.title);
    const description = normalizeText(input.description);

    if (
      !title ||
      input.startTime ||
      input.endTime ||
      /\b(ticket|reservation|booking|confirmation|paid|voucher)\b/.test(
        `${title} ${description}`
      ) ||
      isTourActivityGroup(input) ||
      isSameSiteActivityGroup(input) ||
      isPlannedAreaActivityGroup(input)
    ) {
      continue;
    }

    const mentionedChildren = activities.filter((candidate) => {
      if (
        candidate.id === observation.id ||
        stringValue(candidate.payload, "date") !== input.date
      ) {
        return false;
      }

      const childTitle = normalizeText(stringValue(candidate.payload, "title"));
      return Boolean(childTitle && childTitle !== title && description.includes(childTitle));
    });
    const containerTitle =
      /\b(day|meals?|overview|itinerary|schedule|sights?|plan)\b$/.test(title);

    if (mentionedChildren.length >= 2 || (containerTitle && mentionedChildren.length >= 1)) {
      observation.kind = "context";
    }
  }
}

function createObservation({
  kind,
  ordinal,
  payload,
  source,
  sourceFilename,
  sourceLabel,
  sourceProvenance,
  sourceUploadId,
}: Omit<EvidenceObservation, "id">): EvidenceObservation {
  const id = `obs_${stableHash({
    kind,
    ordinal,
    payload,
    source,
    sourceFilename,
    sourceLabel,
    sourceUploadId,
  })}`;

  return {
    id,
    kind,
    ordinal,
    payload,
    source,
    sourceFilename,
    sourceLabel,
    sourceProvenance,
    sourceUploadId,
  };
}

function anchorPayload(anchor: SourceTransportAnchor) {
  return {
    arrival: anchor.arrivalLocation,
    arrivalTime: anchor.arrivalTime,
    confirmation: anchor.confirmation,
    date: anchor.date,
    departure: anchor.departureLocation,
    departureTime: anchor.departureTime,
    description: null,
    number: anchor.number,
    provider: anchor.provider,
    sourceFilename: anchor.sourceFilename,
    title: anchor.routeLabel,
    type: anchor.kind,
  };
}

function dedupeObjects(items: unknown[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pieceForMissingDetail(
  detail: Record<string, unknown>,
  pieces: CanonicalEvidencePiece[]
) {
  const relatedTitle = identityTokens(detail.relatedTitle);

  if (relatedTitle.length === 0) {
    return null;
  }

  return (
    pieces
      .filter((piece) => piece.outputEligible)
      .map((piece) => ({
        overlap: overlapCount(relatedTitle, identityTokens(piece.payload.title ?? piece.payload.name)),
        piece,
      }))
      .filter((candidate) => candidate.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap)[0]?.piece ?? null
  );
}

function unresolvedMissingDetails({
  details,
  pieces,
  tripOverview,
}: {
  details: unknown[];
  pieces: CanonicalEvidencePiece[];
  tripOverview: unknown;
}) {
  const overview = asRecord(tripOverview);

  return dedupeObjects(details).filter((value) => {
    const detail = asRecord(value);
    const subjectType = normalizedComparable(detail.subjectType);
    const targetField = normalizedComparable(detail.targetField).replace(/\s+/g, "");

    if (
      subjectType === "trip" &&
      /(?:date|daterange|startdate|enddate)/.test(targetField) &&
      (overview.dateRange || overview.startDate || overview.endDate)
    ) {
      return false;
    }

    const piece = pieceForMissingDetail(detail, pieces);

    if (!piece) {
      return true;
    }

    const payload = piece.payload;
    const conflictedFields = new Set(
      piece.conflicts.map((conflict) => normalizeText(conflict.field).replace(/\s+/g, ""))
    );

    if (conflictedFields.has(targetField)) {
      return true;
    }

    if (
      /(?:departuretime|starttime|time)/.test(targetField) &&
      (payload.departureTime || payload.startTime)
    ) {
      return false;
    }

    if (targetField === "arrivaltime" && payload.arrivalTime) {
      return false;
    }

    if (
      /(?:placement|date|city|leg)/.test(targetField) &&
      (payload.date || payload.city)
    ) {
      return false;
    }

    if (targetField === "address" && payload.address) {
      return false;
    }

    return true;
  });
}

export function clusterExtractedEvidence({
  sourceTransportAnchors,
  stages,
  tripOverview,
}: {
  sourceTransportAnchors: SourceTransportAnchor[];
  stages: EvidenceStageInput[];
  tripOverview: unknown;
}): EvidenceClusteringResult {
  const observations: EvidenceObservation[] = [];
  const missingDetails: unknown[] = [];
  const sensitiveDetails: unknown[] = [];
  const tripYear = inferTripYear(
    tripOverview,
    ...stages.map((stageInput) => stageInput.stage),
    sourceTransportAnchors
  );
  let ordinal = 0;

  for (const stageInput of stages) {
    const stage = asRecord(stageInput.stage);
    missingDetails.push(...asArray(stage.missingDetails));
    sensitiveDetails.push(...asArray(stage.sensitiveDetails));

    for (const { collection, kind: defaultKind } of COLLECTIONS) {
      for (const item of asArray(stage[collection])) {
        const payload = normalizePayloadDates(asRecord(item), tripYear);
        if (Object.keys(payload).length === 0) continue;
        ordinal += 1;
        const kind =
          collection === "activities" ? activityKind(payload) : defaultKind;
        observations.push(
          createObservation({
            kind,
            ordinal,
            payload,
            source: stageInput.source,
            sourceFilename:
              stringValue(payload, "sourceFilename") ??
              stageInput.sourceFilename ??
              null,
            sourceLabel: stageInput.label,
            sourceProvenance: stageInput.sourceProvenance ?? null,
            sourceUploadId: stageInput.sourceUploadId ?? null,
          })
        );
      }
    }
  }

  reclassifySourceContainers(observations);

  for (const anchor of sourceTransportAnchors) {
    ordinal += 1;
    observations.push(
      createObservation({
        kind: "transport",
        ordinal,
        payload: normalizePayloadDates(anchorPayload(anchor), tripYear),
        source: "source_anchor",
        sourceFilename: anchor.sourceFilename,
        sourceLabel: anchor.anchorId,
        sourceProvenance: anchor.provenance.join(","),
        sourceUploadId: anchor.sourceUploadId,
      })
    );
  }

  const pieces: CanonicalEvidencePiece[] = [];
  let suppressedWeakAnchorCount = 0;

  for (const observation of observations) {
    if (observation.kind === "context") {
      pieces.push(createPiece(observation, false));
      continue;
    }

    const match = pieces.find((piece) => {
      if (piece.kind !== observation.kind || !piece.outputEligible) return false;
      return Boolean(matchReason(piece.kind, piece.payload, observation.payload));
    });

    if (match) {
      mergeObservationIntoPiece(
        match,
        observation,
        matchReason(match.kind, match.payload, observation.payload) ??
          "compatible evidence"
      );
      continue;
    }

    if (
      observation.source === "source_anchor" &&
      !isStrongStandaloneAnchor(observation.payload)
    ) {
      suppressedWeakAnchorCount += 1;
      pieces.push(createPiece(observation, false));
      continue;
    }

    pieces.push(createPiece(observation));
  }

  suppressRedundantTransportParents(pieces);

  const outputFor = (kind: EvidenceKind) =>
    pieces
      .filter((piece) => piece.outputEligible && piece.kind === kind)
      .map((piece) => piece.payload);
  const activities = [...outputFor("activity"), ...outputFor("note")];
  const finalMissingDetails = unresolvedMissingDetails({
    details: missingDetails,
    pieces,
    tripOverview,
  });
  const draft = {
    activities,
    missingDetails: finalMissingDetails,
    places: outputFor("place"),
    sensitiveDetails: dedupeObjects(sensitiveDetails),
    stays: outputFor("stay"),
    transport: outputFor("transport"),
    tripOverview,
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: sourceTransportAnchors,
    },
    _evidence: {
      canonicalPieceIds: pieces.map((piece) => piece.id),
      observationIds: observations.map((observation) => observation.id),
      version: EVIDENCE_CLUSTER_VERSION,
    },
  };

  return {
    draft,
    observations,
    pieces,
    summary: {
      canonicalPieceCount: pieces.filter((piece) => piece.outputEligible).length,
      clusteredObservationCount: pieces.reduce(
        (count, piece) => count + Math.max(0, piece.observationIds.length - 1),
        0
      ),
      contextObservationCount: observations.filter(
        (observation) => observation.kind === "context"
      ).length,
      observationCount: observations.length,
      sourceAnchorObservationCount: sourceTransportAnchors.length,
      suppressedWeakAnchorCount,
    },
  };
}
