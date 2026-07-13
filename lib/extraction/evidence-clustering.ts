import { createHash } from "node:crypto";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";
import { routeCanonicalAccessoryEvidence } from "@/lib/extraction/canonical-accessory-routing";
import {
  normalizeTripClockTime,
  normalizeText,
  normalizeTripDate,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import {
  classifyDraftActivityCard,
} from "@/lib/trip-card-taxonomy";

export const EVIDENCE_CLUSTER_VERSION = 7;

export type EvidenceKind =
  | "activity"
  | "context"
  | "note"
  | "place"
  | "stay"
  | "transport";

export type EvidenceSource = "model_chunk" | "model_spine" | "source_anchor";

export type EvidenceRole =
  | "accessory_detail"
  | "atomic_candidate"
  | "city_note_candidate"
  | "context"
  | "grouping_proposal"
  | "rejected";

export type EvidenceSourceStructure = {
  headingPath: string[];
  sectionLabel: string | null;
  sectionType:
    | "booking_detail"
    | "city_reference"
    | "dated_itinerary"
    | "unknown";
};

export type CanonicalEvidenceAction = {
  absorbedTitles: string[];
  decisionId?: string;
  observationIds: string[];
  reason: string;
  type:
    | "attached"
    | "field_selected"
    | "grouped"
    | "merged"
    | "recovered"
    | "rejected";
};

export type CanonicalGroupingDecision = {
  candidateIds: string[];
  claim: string;
  decisionId: string;
  parentCandidateId: string;
  parentTitle: string;
  source: "canonical_resolver";
};

export type EvidenceStageInput = {
  label: string;
  source: Exclude<EvidenceSource, "source_anchor">;
  sourceFilename?: string | null;
  sourceProvenance?: string | null;
  sourceText?: string | null;
  sourceUploadId?: string | null;
  stage: unknown;
};

export type EvidenceObservation = {
  id: string;
  kind: EvidenceKind;
  ordinal: number;
  payload: Record<string, unknown>;
  role: EvidenceRole;
  source: EvidenceSource;
  sourceFilename: string | null;
  sourceLabel: string;
  sourceProvenance: string | null;
  sourceStructure: EvidenceSourceStructure;
  sourceUploadId: string | null;
};

export type CanonicalEvidenceConflict = {
  field: string;
  observationIds: string[];
  values: string[];
};

export type CanonicalEvidencePiece = {
  actions: CanonicalEvidenceAction[];
  confidence: "high" | "medium";
  conflicts: CanonicalEvidenceConflict[];
  fieldSources: Record<string, string[]>;
  fieldWinnerRanks: Record<string, number>;
  id: string;
  kind: EvidenceKind;
  mergeReasons: string[];
  observationIds: string[];
  outputEligible: boolean;
  payload: Record<string, unknown>;
  role: EvidenceRole;
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
    rejectedObservationCount: number;
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
  "guided",
  "in",
  "including",
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

const GENERIC_SINGLE_IDENTITY_TOKENS = new Set([
  "activity",
  "admission",
  "bath",
  "church",
  "entry",
  "house",
  "museum",
  "pass",
  "ticket",
  "tour",
]);

const DISTINCT_COMPONENT_TOKENS = new Set([
  "chapel",
  "garden",
  "gallery",
  "grounds",
  "library",
  "museum",
  "tower",
  "zoo",
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

const TIME_FIELDS = new Set([
  "arrivalTime",
  "checkInTime",
  "checkOutTime",
  "departureTime",
  "endTime",
  "startTime",
  "time",
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
      if (typeof value !== "string") {
        return [field, value];
      }

      if (DATE_FIELDS.has(field)) {
        return [field, normalizeTripDate(value, defaultYear) ?? value];
      }

      if (TIME_FIELDS.has(field)) {
        return [field, normalizeTripClockTime(value) ?? value];
      }

      return [field, value];
    })
  );
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const EVIDENCE_ROLES = new Set<EvidenceRole>([
  "accessory_detail",
  "atomic_candidate",
  "city_note_candidate",
  "context",
  "grouping_proposal",
  "rejected",
]);

function evidenceRoleFromPayload(
  payload: Record<string, unknown>,
  kind: EvidenceKind
): EvidenceRole {
  const explicit = stringValue(payload, "evidenceRole") as EvidenceRole | null;

  if (explicit && EVIDENCE_ROLES.has(explicit)) {
    return explicit;
  }

  if (kind === "context") return "context";
  if (kind === "note") return "city_note_candidate";
  return "atomic_candidate";
}

function sourceStructureFromPayload(
  payload: Record<string, unknown>
): EvidenceSourceStructure {
  const rawSectionType = stringValue(payload, "sourceSectionType");
  const sectionType =
    rawSectionType === "booking_detail" ||
    rawSectionType === "city_reference" ||
    rawSectionType === "dated_itinerary"
      ? rawSectionType
      : "unknown";
  const headingPath = Array.isArray(payload.sourceHeadingPath)
    ? payload.sourceHeadingPath.filter(
        (value): value is string => typeof value === "string" && Boolean(value.trim())
      )
    : [];

  return {
    headingPath,
    sectionLabel: stringValue(payload, "sourceSectionLabel"),
    sectionType,
  };
}

function publicPayload(payload: Record<string, unknown>) {
  const {
    _canonicalGroupingDecisionIds,
    _canonicalRoleDecision,
    _resolverCandidateId,
    evidenceRole: _evidenceRole,
    sourceHeadingPath: _sourceHeadingPath,
    sourceSectionLabel: _sourceSectionLabel,
    sourceSectionType: _sourceSectionType,
    ...publicFields
  } = payload;

  return publicFields;
}

function addCanonicalAction(
  piece: CanonicalEvidencePiece,
  action: CanonicalEvidenceAction
) {
  const key = JSON.stringify(action);

  if (!piece.actions.some((candidate) => JSON.stringify(candidate) === key)) {
    piece.actions.push(action);
  }
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
  return typeof value === "string"
    ? normalizeTripClockTime(value) ?? normalizedComparable(value)
    : "";
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
    .map((token) =>
      token.length > 4 && token.endsWith("s") && !token.endsWith("ss")
        ? token.slice(0, -1)
        : token
    )
    .filter((token) => token.length > 2 && !IDENTITY_STOP_WORDS.has(token));
}

function aliasIdentityTokens(record: Record<string, unknown>) {
  const title = typeof record.title === "string" ? record.title : "";
  const description =
    typeof record.description === "string" ? record.description : "";
  const titleTokens = identityTokens(title);
  const genericTitle =
    titleTokens.length > 0 &&
    titleTokens.every((token) => GENERIC_SINGLE_IDENTITY_TOKENS.has(token));
  const aliasDescription =
    (/\b(?:also known as|aka)\b/i.test(description) ||
      (genericTitle && /\b(?:including|includes)\b/i.test(description))) &&
    description.length <= 180
      ? description
      : "";

  return identityTokens([title, aliasDescription].filter(Boolean).join(" "));
}

function tokenSetContains(container: string[], contained: string[]) {
  const containerSet = new Set(container);
  return contained.length > 0 && contained.every((token) => containerSet.has(token));
}

function distinctiveSingleIdentity(tokens: string[]) {
  return (
    tokens.length === 1 &&
    tokens[0].length >= 5 &&
    !GENERIC_SINGLE_IDENTITY_TOKENS.has(tokens[0])
  );
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
  const leftTime = timeFrom(left);
  const rightTime = timeFrom(right);
  const datesMatch = sameOrMissingDate(left, right);

  if (leftTime && rightTime && leftTime !== rightTime) {
    return null;
  }

  const leftConfirmation = confirmationFrom(left);
  const rightConfirmation = confirmationFrom(right);

  if (leftConfirmation && leftConfirmation === rightConfirmation) {
    return "shared booking identity";
  }

  if (datesMatch && isRentalPickup(left) && isRentalPickup(right)) {
    return "same rental-car pickup";
  }

  const leftDate = stringValue(left, "date");
  const rightDate = stringValue(right, "date");

  // A repeated venue name is not proof that two scheduled visits are one plan.
  // Cross-date evidence only clusters when a stronger booking identity matched above.
  if (leftDate && rightDate && !datesMatch) {
    return null;
  }

  const leftTitle = aliasIdentityTokens(left);
  const rightTitle = aliasIdentityTokens(right);
  const overlap = overlapCount(leftTitle, rightTitle);
  const leftTitleText = leftTitle.join(" ");
  const rightTitleText = rightTitle.join(" ");
  const unionSize = new Set([...leftTitle, ...rightTitle]).size;
  const titleSimilarity = unionSize > 0 ? overlap / unionSize : 0;
  const smaller = leftTitle.length <= rightTitle.length ? leftTitle : rightTitle;
  const larger = smaller === leftTitle ? rightTitle : leftTitle;
  const containedIdentity = tokenSetContains(larger, smaller);
  const containedExtras = larger.filter((token) => !new Set(smaller).has(token));
  const containsDistinctComponent = containedExtras.some((token) =>
    DISTINCT_COMPONENT_TOKENS.has(token)
  );
  const sameDistinctiveSingle =
    leftTitleText === rightTitleText &&
    distinctiveSingleIdentity(leftTitle) &&
    distinctiveSingleIdentity(rightTitle);
  const explicitSeparateVisit = Boolean(
    !datesMatch &&
      ((leftTime && rightTime) ||
        (leftConfirmation &&
          rightConfirmation &&
          leftConfirmation !== rightConfirmation))
  );

  if (explicitSeparateVisit) {
    return null;
  }

  if (leftTitleText && leftTitleText === rightTitleText) {
    return leftTime || rightTime
      ? "same named and timed plan"
      : "same named plan";
  }

  if (
    containedIdentity &&
    !containsDistinctComponent &&
    (smaller.length >= 2 ||
      (datesMatch && sameDistinctiveSingle) ||
      (datesMatch && leftTime && leftTime === rightTime))
  ) {
    return "same venue alias";
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
  const leftName = normalizedComparable(left.name);
  const rightName = normalizedComparable(right.name);
  const addressTokens = (value: string) =>
    value.split(/\s+/).filter((token) => token.length > 1);
  const leftAddressTokens = addressTokens(leftAddress);
  const rightAddressTokens = addressTokens(rightAddress);
  const addressOverlap = overlapCount(leftAddressTokens, rightAddressTokens);
  const addressUnion = new Set([
    ...leftAddressTokens,
    ...rightAddressTokens,
  ]).size;
  const tokenSimilarAddress = Boolean(
    leftAddress &&
      rightAddress &&
      addressUnion > 0 &&
      addressOverlap / addressUnion >= 0.78 &&
      leftAddressTokens.some(
        (token) => /\d/.test(token) && rightAddressTokens.includes(token)
      )
  );

  if (
    leftAddress &&
    rightAddress &&
    (leftAddress === rightAddress ||
      leftAddress.includes(rightAddress) ||
      rightAddress.includes(leftAddress) ||
      tokenSimilarAddress)
  ) {
    return "same stay address";
  }

  if (
    (leftAddress && rightName && leftAddress.includes(rightName)) ||
    (rightAddress && leftName && rightAddress.includes(leftName))
  ) {
    return "stay address evidence attached to lodging";
  }

  const leftConfirmation = confirmationFrom(left);
  const rightConfirmation = confirmationFrom(right);

  if (leftConfirmation && leftConfirmation === rightConfirmation) {
    return "same stay booking";
  }

  if (leftAddress && rightAddress) {
    return null;
  }

  if (leftName && leftName === rightName) {
    return "same stay identity";
  }

  const genericStayTokens = new Set([
    "accommodation",
    "airbnb",
    "apartment",
    "hostel",
    "hotel",
    "lodging",
    "rental",
    "stay",
  ]);
  const leftTokens = identityTokens(left.name).filter(
    (token) => !genericStayTokens.has(token)
  );
  const rightTokens = identityTokens(right.name).filter(
    (token) => !genericStayTokens.has(token)
  );
  const overlap = overlapCount(leftTokens, rightTokens);

  return overlap >= 2 || (overlap === 1 && leftTokens.length === 1 && rightTokens.length === 1)
    ? "same distinctive stay identity"
    : null;
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

function evidenceSpecificity(record: Record<string, unknown>) {
  const description =
    typeof record.description === "string" ? record.description.trim() : "";

  return (
    (timeFrom(record) ? 40 : 0) +
    (confirmationFrom(record) ? 40 : 0) +
    (normalizedComparable(record.address) ? 20 : 0) +
    Math.min(description.length, 240) / 12 +
    identityTokens(record.title).length * 2
  );
}

function evidenceValueRank(
  observation: EvidenceObservation,
  field: string,
  value: unknown
) {
  const provenance = normalizeText(observation.sourceProvenance);
  let rank =
    observation.source === "source_anchor"
      ? 180
      : observation.source === "model_chunk"
        ? 150
        : 100;

  if (provenance.includes("manual note")) rank += 60;
  if (provenance.includes("text layer")) rank += 50;
  if (provenance.includes("ocr")) rank += 20;
  if (field === "title") rank += titleQuality(value) / 10;
  if (field === "description" && typeof value === "string") {
    rank += Math.min(value.length, 240) / 24;
  }

  return rank;
}

function endpointEvidenceScore({
  field,
  payload,
  rank,
  value,
}: {
  field: string;
  payload: Record<string, unknown>;
  rank: number;
  value: unknown;
}) {
  const endpoint = normalizedLocation(value);
  if (!endpoint) {
    return -10_000;
  }
  const routeText = normalizeText(
    [payload.title, payload.description].filter(Boolean).join(" ")
  );
  const direction = field.startsWith("arrival") ? "to" : "from";
  const routeAlignment = Boolean(
    endpoint &&
      (routeText.includes(`${direction} ${endpoint}`) || routeText.endsWith(endpoint))
  );

  return rank + locationQuality(value) * 10 + (routeAlignment ? 60 : 0);
}

function recordCanonicalConflict({
  conflicts,
  existing,
  field,
  observation,
  piece,
  value,
}: {
  conflicts: CanonicalEvidenceConflict[];
  existing: unknown;
  field: string;
  observation: EvidenceObservation;
  piece: CanonicalEvidencePiece;
  value: unknown;
}) {
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
    const incomingRank = evidenceValueRank(observation, field, value);
    const existingRank = piece.fieldWinnerRanks[field] ?? 0;

    if (field === "description") {
      next[field] = uniqueDescription(existing, value);
    } else if (field === "title") {
      if (
        titleQuality(value) > titleQuality(existing) &&
        (observation.source !== "source_anchor" || isGenericTitle(existing))
      ) {
        next[field] = value;
        piece.fieldWinnerRanks[field] = incomingRank;
      }
    } else if (field === "sourceFilename") {
      next[field] = existing ?? value;
    } else if (
      ["arrival", "arrivalLocation", "departure", "departureLocation"].includes(
        field
      ) &&
      valuesConflict(existing, value) &&
      endpointEvidenceScore({
        field,
        payload: { ...next, ...observation.payload },
        rank: incomingRank,
        value,
      }) >
        endpointEvidenceScore({
          field,
          payload: next,
          rank: existingRank,
          value: existing,
        })
    ) {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        value,
      });
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [observation.id],
        reason: `Selected stronger ${field} route evidence from ${observation.sourceLabel}.`,
        type: "field_selected",
      });
    } else if (
      ["arrivalTime", "departureTime", "endTime", "startTime", "time"].includes(
        field
      ) &&
      normalizedClockTime(existing) === normalizedClockTime(value)
    ) {
      next[field] = existing;
    } else if (
      ["arrivalTime", "departureTime", "endTime", "startTime", "time"].includes(
        field
      ) &&
      valuesConflict(existing, value) &&
      incomingRank > existingRank
    ) {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        value,
      });
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [observation.id],
        reason: `Selected stronger ${field} evidence from ${observation.sourceLabel}.`,
        type: "field_selected",
      });
    } else if (
      field === "date" &&
      valuesConflict(existing, value) &&
      evidenceSpecificity(observation.payload) > evidenceSpecificity(next)
    ) {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        value,
      });
    } else if (existing === null || existing === undefined || existing === "") {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
    } else if (
      valuesConflict(existing, value) &&
      !(
        ["arrival", "arrivalLocation", "departure", "departureLocation"].includes(
          field
        ) &&
        normalizedLocation(existing) === normalizedLocation(value)
      )
    ) {
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        value,
      });
    }

    piece.fieldSources[field] = Array.from(
      new Set([...(piece.fieldSources[field] ?? []), observation.id])
    );
  }

  piece.payload = next;
  piece.conflicts = conflicts;
  piece.observationIds.push(observation.id);
  piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
  piece.role =
    piece.role === "atomic_candidate" && observation.role !== "atomic_candidate"
      ? observation.role
      : piece.role;
  addCanonicalAction(piece, {
    absorbedTitles: [
      stringValue(observation.payload, "title") ??
        stringValue(observation.payload, "name") ??
        observation.sourceLabel,
    ],
    observationIds: [observation.id],
    reason,
    type: "merged",
  });
  piece.confidence = conflicts.length === 0 ? "high" : "medium";
  piece.id = `piece_${stableHash({
    kind: piece.kind,
    observations: [...piece.observationIds].sort(),
  })}`;
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
    actions: [],
    confidence: observation.source === "source_anchor" ? "medium" : "high",
    conflicts: [],
    fieldSources,
    fieldWinnerRanks: Object.fromEntries(
      Object.entries(observation.payload)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([field, value]) => [
          field,
          evidenceValueRank(observation, field, value),
        ])
    ),
    id: `piece_${stableHash({ kind: observation.kind, observation: observation.id })}`,
    kind: observation.kind,
    mergeReasons: ["initial observation"],
    observationIds: [observation.id],
    outputEligible,
    payload: { ...observation.payload },
    role: observation.role,
  };
}

function suppressCanonicalPiece(
  piece: CanonicalEvidencePiece,
  reason: string
) {
  piece.outputEligible = false;
  piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
  addCanonicalAction(piece, {
    absorbedTitles: [],
    observationIds: [...piece.observationIds],
    reason,
    type: "rejected",
  });
}

function mergeCanonicalPieceInto({
  actionType = "attached",
  decisionId,
  reason,
  source,
  target,
}: {
  actionType?: "attached" | "grouped";
  decisionId?: string;
  reason: string;
  source: CanonicalEvidencePiece;
  target: CanonicalEvidencePiece;
}) {
  target.observationIds = Array.from(
    new Set([...target.observationIds, ...source.observationIds])
  );
  target.mergeReasons = Array.from(
    new Set([...target.mergeReasons, ...source.mergeReasons, reason])
  );
  target.actions = [...target.actions, ...source.actions];

  for (const [field, observationIds] of Object.entries(source.fieldSources)) {
    target.fieldSources[field] = Array.from(
      new Set([...(target.fieldSources[field] ?? []), ...observationIds])
    );
    target.fieldWinnerRanks[field] = Math.max(
      target.fieldWinnerRanks[field] ?? 0,
      source.fieldWinnerRanks[field] ?? 0
    );
  }

  target.conflicts = [
    ...target.conflicts,
    ...source.conflicts.filter(
      (conflict) =>
        !target.conflicts.some(
          (existing) =>
            existing.field === conflict.field &&
            existing.values.join("|") === conflict.values.join("|")
        )
    ),
  ];
  target.confidence = target.conflicts.length === 0 ? "high" : "medium";
  addCanonicalAction(target, {
    absorbedTitles: [
      stringValue(source.payload, "title") ??
        stringValue(source.payload, "name") ??
        "Untitled evidence",
    ],
    decisionId,
    observationIds: [...source.observationIds],
    reason,
    type: actionType,
  });
  target.id = `piece_${stableHash({
    kind: target.kind,
    observations: [...target.observationIds].sort(),
  })}`;
  suppressCanonicalPiece(source, reason);
}

function activityText(record: Record<string, unknown>) {
  return normalizeText(
    [record.title, record.description, record.category]
      .filter(Boolean)
      .join(" ")
  );
}

function sameCanonicalDate(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftDate = stringValue(left, "date");
  const rightDate = stringValue(right, "date");
  return Boolean(leftDate && rightDate && tripDatesMatch(leftDate, rightDate));
}

function attachGenericActivityAccessories(pieces: CanonicalEvidencePiece[]) {
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );

  for (const accessory of activities) {
    if (!accessory.outputEligible) {
      continue;
    }

    const text = activityText(accessory.payload);

    if (
      !/\b(?:admission|entry|pass|skip the line|ticket|voucher)\b/.test(text) ||
      /\b(?:museum|palace|castle|cathedral|church|synagogue|gallery|garden)\b/.test(
        normalizeText(accessory.payload.title as string | undefined)
      )
    ) {
      continue;
    }

    const time = timeFrom(accessory.payload);
    const candidates = activities.filter((candidate) => {
      if (
        candidate === accessory ||
        !candidate.outputEligible ||
        !sameCanonicalDate(candidate.payload, accessory.payload) ||
        /\b(?:admission|entry|pass|skip the line|ticket|voucher)\b/.test(
          activityText(candidate.payload)
        )
      ) {
        return false;
      }

      const candidateTime = timeFrom(candidate.payload);
      return Boolean(time && candidateTime && time === candidateTime);
    });

    if (candidates.length !== 1) {
      continue;
    }

    const target = candidates[0];
    target.payload.description = uniqueDescription(
      target.payload.description,
      accessory.payload.description ?? accessory.payload.title
    );
    mergeCanonicalPieceInto({
      reason: "supporting admission evidence attached to named activity",
      source: accessory,
      target,
    });
  }
}

function genericActivityConcept(payload: Record<string, unknown>) {
  const title = normalizeText(stringValue(payload, "title"));

  if (/^(?:breakfast|brunch|dinner|lunch|supper)$/.test(title)) {
    return title;
  }

  if (/^(?:[a-z]+\s+)?walking tour$/.test(title)) {
    return "walking tour";
  }

  if (/^(?:bath|baths|bath house|bath houses)$/.test(title)) {
    return "bath";
  }

  return null;
}

function attachGenericActivityPlaceholders(pieces: CanonicalEvidencePiece[]) {
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );

  for (const generic of activities) {
    const concept = genericActivityConcept(generic.payload);

    if (!concept || !generic.outputEligible) {
      continue;
    }

    const genericTime = timeFrom(generic.payload);
    const candidates = activities.filter((candidate) => {
      if (
        candidate === generic ||
        !candidate.outputEligible ||
        genericActivityConcept(candidate.payload) ||
        !sameCanonicalDate(candidate.payload, generic.payload)
      ) {
        return false;
      }

      const candidateText = activityText(candidate.payload);
      const candidateTime = timeFrom(candidate.payload);

      if (genericTime) {
        return candidateTime === genericTime;
      }

      return candidateText.includes(concept);
    });

    if (candidates.length !== 1) {
      continue;
    }

    const target = candidates[0];
    target.payload.description = uniqueDescription(
      target.payload.description,
      generic.payload.description
    );
    mergeCanonicalPieceInto({
      reason: `generic ${concept} evidence resolved to named activity`,
      source: generic,
      target,
    });
  }
}

function attachRentalCarReturns(pieces: CanonicalEvidencePiece[]) {
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );

  for (const returnPiece of activities) {
    if (!/\b(?:car|vehicle)\s+return\b|\breturn(?:ing)?\s+(?:the\s+)?(?:car|vehicle)\b/.test(
      activityText(returnPiece.payload)
    )) {
      continue;
    }

    const pickups = activities.filter(
      (candidate) =>
        candidate !== returnPiece &&
        candidate.outputEligible &&
        isRentalPickup(candidate.payload) &&
        sameCanonicalDate(candidate.payload, returnPiece.payload)
    );

    if (pickups.length !== 1) {
      continue;
    }

    const pickup = pickups[0];
    const returnTime =
      returnPiece.payload.endTime ??
      returnPiece.payload.startTime ??
      returnPiece.payload.time ??
      null;
    const returnAddress = returnPiece.payload.address;
    const pickupAddress = pickup.payload.address;
    const normalizedReturnAddress = normalizedComparable(returnAddress);
    const normalizedPickupAddress = normalizedComparable(pickupAddress);
    const isSameReturnLocation = Boolean(
      /\bsame (?:place|location|address)\b/.test(
        activityText(returnPiece.payload)
      ) ||
        (normalizedReturnAddress &&
          normalizedPickupAddress &&
          (normalizedReturnAddress.includes(normalizedPickupAddress) ||
            normalizedPickupAddress.includes(normalizedReturnAddress)))
    );

    if (!pickup.payload.endTime && returnTime) {
      pickup.payload.endTime = returnTime;
    }

    if (
      typeof returnAddress === "string" &&
      isSameReturnLocation &&
      (!pickup.payload.address ||
        returnAddress.length > String(pickup.payload.address).length)
    ) {
      pickup.payload.address = returnAddress;
    }

    const returnLocationDetail =
      typeof returnAddress === "string" && !isSameReturnLocation
        ? `Return location: ${returnAddress}.`
        : null;
    pickup.payload.description = uniqueDescription(
      pickup.payload.description,
      uniqueDescription(
        returnPiece.payload.description ??
          (returnTime ? `Return the car by ${returnTime}.` : "Return the car."),
        returnLocationDetail
      )
    );
    mergeCanonicalPieceInto({
      reason: "rental return details attached to pickup activity",
      source: returnPiece,
      target: pickup,
    });
  }
}

function suppressRepresentedTravelAndStayActivities(
  pieces: CanonicalEvidencePiece[]
) {
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );
  const transports = pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  );
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );

  for (const activity of activities) {
    const text = activityText(activity.payload);

    if (/\b(?:flight|fly|train|bus|ferry|transfer)\b/.test(text)) {
      const movementKind = /\b(?:flight|fly)\b/.test(text)
        ? "flight"
        : /\btrain\b/.test(text)
          ? "train"
          : /\bbus\b/.test(text)
            ? "bus"
            : /\bferry\b/.test(text)
              ? "ferry"
              : null;
      const sameDateKind = transports.filter(
        (transport) =>
          sameCanonicalDate(activity.payload, transport.payload) &&
          (!movementKind || normalizedComparable(transport.payload.type) === movementKind)
      );
      const activityTokens = identityTokens(
        [activity.payload.title, activity.payload.description].filter(Boolean).join(" ")
      );
      const matches = sameDateKind.filter((transport) => {
        const transportTokens = identityTokens(
          [
            transport.payload.title,
            transport.payload.departure,
            transport.payload.arrival,
            transport.payload.number,
          ]
            .filter(Boolean)
            .join(" ")
        );

        return (
          Boolean(activityMatchReason(activity.payload, transport.payload)) ||
          overlapCount(activityTokens, transportTokens) >= 1 ||
          sameDateKind.length === 1
        );
      });

      if (matches.length === 1) {
        suppressCanonicalPiece(
          activity,
          "traveler movement represented by canonical transport"
        );
        continue;
      }
    }

    if (!/\b(?:check in|check-in|check out|check-out|drop bags?|bag drop)\b/.test(text)) {
      continue;
    }

    const activityTime = timeFrom(activity.payload);
    const activityCity = stringValue(activity.payload, "city");
    const distinctArrivalAction = Boolean(
      activityTime &&
        /\b(?:arrive|arrival|land|landing)\b/.test(text) &&
        /\b(?:drop bags?|bag drop)\b/.test(text) &&
        (transports.some(
          (transport) =>
            sameCanonicalDate(activity.payload, transport.payload) &&
            (normalizedClockTime(transport.payload.arrivalTime) === activityTime ||
              Boolean(
                activityCity &&
                  locationsMatch(
                    transport.payload.arrival ?? transport.payload.arrivalLocation,
                    activityCity
                  )
              ))
        ) ||
          /\b(?:before|then|later|spend (?:the )?day|sightsee|tour|explore|continue)\b/.test(
            text
          ))
    );

    if (distinctArrivalAction) {
      continue;
    }

    const sameDateStays = stays.filter((stay) => {
      const checkIn = stringValue(stay.payload, "checkIn") ??
        stringValue(stay.payload, "firstNightDate");
      const activityDate = stringValue(activity.payload, "date");

      return Boolean(
        activityDate &&
          checkIn &&
          tripDatesMatch(activityDate, checkIn)
      );
    });
    const matchingStays = sameDateStays.filter((stay) => {
      const stayName = normalizeText(stringValue(stay.payload, "name"));

      return !stayName || text.includes(stayName) || sameDateStays.length === 1;
    });

    if (matchingStays.length === 1) {
      suppressCanonicalPiece(
        activity,
        "routine check-in or bag-drop evidence attached to stay"
      );
    }
  }
}

function applyAccessTaskPolicy(pieces: CanonicalEvidencePiece[]) {
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );

  for (const activity of pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  )) {
    const text = activityText(activity.payload);

    if (!/\b(?:collect|pick up|pickup).{0,20}\b(?:apartment\s+)?key\b|\blockbox\b/.test(text)) {
      continue;
    }

    const date = stringValue(activity.payload, "date");
    const matchingPrivateStay = stays.find((stay) => {
      const stayText = normalizeText(
        [stay.payload.name, stay.payload.stayType].filter(Boolean).join(" ")
      );
      const checkIn = stringValue(stay.payload, "checkIn") ??
        stringValue(stay.payload, "firstNightDate");

      return Boolean(
        date &&
          checkIn &&
          tripDatesMatch(date, checkIn) &&
          /\b(?:airbnb|apartment|flat|home|rental)\b/.test(stayText)
      );
    });
    const stayAddress = matchingPrivateStay?.payload.address;
    const activityAddress = activity.payload.address;
    const distinctPickupLocation = Boolean(
      activityAddress &&
        (!stayAddress ||
          normalizedComparable(activityAddress) !== normalizedComparable(stayAddress))
    );
    const explicitSeparateAction = Boolean(
      timeFrom(activity.payload) ||
        distinctPickupLocation ||
        /\b(?:meet|office|reception|host|elsewhere|remote)\b/.test(text)
    );

    if (!matchingPrivateStay || !explicitSeparateAction) {
      suppressCanonicalPiece(
        activity,
        matchingPrivateStay
          ? "routine access instructions attached to private stay"
          : "access instructions had no compatible private stay"
      );
    }
  }
}

function isGenericStayName(value: unknown) {
  const title = normalizedComparable(value);

  return Boolean(
    title &&
      /^(?:[a-z]+\s+)?(?:accommodation|airbnb|apartment|hostel|hotel|lodging|rental|stay)$/.test(
        title
      )
  );
}

function isWeakStayFragmentName(value: unknown) {
  if (isGenericStayName(value)) return true;
  const raw = typeof value === "string" ? value : "";
  const normalized = normalizedComparable(value);

  return Boolean(
    normalized &&
      normalized.split(/\s+/).length <= 9 &&
      /(?:[$€£]\s*\d|\b\d{2,4}\s*(?:usd|eur|gbp)\b)/i.test(raw) &&
      /\b(?:double|ensuite|night|nights|private|room|shared|single)\b/.test(
        normalized
      )
  );
}

function attachGenericStayFragments(pieces: CanonicalEvidencePiece[]) {
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  const placeCities = new Set(
    pieces
      .filter((piece) => piece.kind === "place" && piece.outputEligible)
      .map((piece) => normalizedComparable(piece.payload.city))
      .filter(Boolean)
  );
  const isWeakFragment = (piece: CanonicalEvidencePiece) =>
    isWeakStayFragmentName(piece.payload.name) ||
    placeCities.has(normalizedComparable(piece.payload.name));

  for (const generic of stays) {
    if (
      !generic.outputEligible ||
      !isWeakFragment(generic) ||
      generic.payload.address ||
      confirmationFrom(generic.payload)
    ) {
      continue;
    }

    const genericDate = stringValue(generic.payload, "checkIn") ??
      stringValue(generic.payload, "firstNightDate");
    const genericTokens = identityTokens(generic.payload.name);
    const datedCandidates = stays.filter((candidate) => {
      if (
        candidate === generic ||
        !candidate.outputEligible ||
        (isWeakFragment(candidate) &&
          !candidate.payload.address &&
          !confirmationFrom(candidate.payload))
      ) {
        return false;
      }

      const checkIn = stringValue(candidate.payload, "checkIn") ??
        stringValue(candidate.payload, "firstNightDate");
      const checkOut = stringValue(candidate.payload, "checkOut");
      const dateFits = Boolean(
        genericDate &&
          checkIn &&
          (tripDatesMatch(genericDate, checkIn) ||
            (checkOut && genericDate >= checkIn && genericDate < checkOut))
      );
      return dateFits;
    });
    const citySpecificCandidates = datedCandidates.filter((candidate) => {
      const candidateTokens = identityTokens(
        [candidate.payload.name, candidate.payload.city].filter(Boolean).join(" ")
      );
      return overlapCount(
        genericTokens.filter((token) => !GENERIC_SINGLE_IDENTITY_TOKENS.has(token)),
        candidateTokens
      ) > 0;
    });
    const candidates = datedCandidates.length === 1
      ? datedCandidates
      : citySpecificCandidates;

    if (candidates.length === 1) {
      mergeCanonicalPieceInto({
        reason: "generic stay evidence attached to unique dated lodging",
        source: generic,
        target: candidates[0],
      });
    }
  }
}

function shiftIsoDate(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function recoverOutOfRangePieces(pieces: CanonicalEvidencePiece[]) {
  const boundaryDates = pieces
    .filter(
      (piece) =>
        piece.outputEligible && (piece.kind === "place" || piece.kind === "stay")
    )
    .flatMap((piece) =>
      [
        piece.payload.arriveDate,
        piece.payload.arrivalDate,
        piece.payload.leaveDate,
        piece.payload.departureDate,
        piece.payload.checkIn,
        piece.payload.firstNightDate,
        piece.payload.checkOut,
      ].filter(
        (value): value is string =>
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      )
    )
    .sort();

  if (boundaryDates.length < 2) {
    return;
  }

  const earliest = shiftIsoDate(boundaryDates[0], -2);
  const latest = shiftIsoDate(boundaryDates.at(-1) ?? boundaryDates[0], 2);

  for (const piece of pieces) {
    if (
      !piece.outputEligible ||
      (piece.kind !== "activity" && piece.kind !== "transport")
    ) {
      continue;
    }

    const date = stringValue(piece.payload, "date");

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (date < earliest || date > latest)) {
      const reason =
        `removed suspect date ${date} outside established trip range ${earliest} to ${latest}`;

      piece.payload.date = null;
      piece.payload._recoveryRequired = true;
      piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason,
        type: "recovered",
      });
    }
  }
}

function mergeCanonicalCityNotes(pieces: CanonicalEvidencePiece[]) {
  const places = pieces
    .filter((piece) => piece.kind === "place" && piece.outputEligible)
    .map((piece) => ({
      arriveDate:
        stringValue(piece.payload, "arriveDate") ??
        stringValue(piece.payload, "arrivalDate"),
      city: stringValue(piece.payload, "city"),
      leaveDate:
        stringValue(piece.payload, "leaveDate") ??
        stringValue(piece.payload, "departureDate"),
    }))
    .filter((place) => Boolean(place.city));
  const notes = pieces.filter(
    (piece) => piece.kind === "note" && piece.outputEligible
  );
  const groups = new Map<string, CanonicalEvidencePiece[]>();

  for (const note of notes) {
    const explicitCity = stringValue(note.payload, "city");
    const date = stringValue(note.payload, "date");
    const text = normalizeText(
      [note.payload.title, note.payload.description].filter(Boolean).join(" ")
    );
    const city =
      explicitCity ??
      places.find(
        (place) =>
          place.city && normalizeText(place.city) && text.includes(normalizeText(place.city))
      )?.city ??
      places.find(
        (place) =>
          date &&
          place.arriveDate &&
          date >= place.arriveDate &&
          (!place.leaveDate || date < place.leaveDate)
      )?.city ??
      null;

    if (!city) {
      continue;
    }

    note.payload.city = city;
    const key = normalizeText(city);
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }

  for (const group of groups.values()) {
    const [target, ...rest] = group;
    const city =
      stringValue(target.payload, "city") ??
      places.find((place) =>
        normalizeText(
          [target.payload.title, target.payload.description].filter(Boolean).join(" ")
        ).includes(normalizeText(place.city))
      )?.city ??
      "City";

    target.payload.title = `${city} Notes & Tips`;
    target.payload.city = city;
    target.payload.date = null;
    target.payload.itemType = "note";

    for (const note of rest) {
      target.payload.description = uniqueDescription(
        target.payload.description,
        note.payload.description ?? note.payload.title
      );
      mergeCanonicalPieceInto({
        reason: `canonical ${city} note collection`,
        source: note,
        target,
      });
    }
  }
}

function executeCanonicalGroupingDecisions({
  decisions,
  observations,
  pieces,
}: {
  decisions: CanonicalGroupingDecision[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const observationIdByCandidateId = new Map<string, string>();

  for (const observation of observations) {
    const candidateId = stringValue(observation.payload, "_resolverCandidateId");
    if (candidateId) observationIdByCandidateId.set(candidateId, observation.id);
  }

  for (const decision of decisions) {
    const candidatePiece = (candidateId: string) => {
      const observationId = observationIdByCandidateId.get(candidateId);
      return observationId
        ? pieces.find((piece) => piece.observationIds.includes(observationId)) ?? null
        : null;
    };
    const parent = candidatePiece(decision.parentCandidateId);
    const candidatePieces = decision.candidateIds.map(candidatePiece);

    if (
      !decision.decisionId ||
      decision.source !== "canonical_resolver" ||
      !parent ||
      parent.kind !== "activity" ||
      !parent.outputEligible ||
      candidatePieces.some((piece) => !piece)
    ) {
      continue;
    }

    const children = Array.from(
      new Set(
        candidatePieces.filter(
          (piece): piece is CanonicalEvidencePiece =>
            Boolean(piece && piece !== parent && piece.outputEligible)
        )
      )
    );

    if (
      children.length === 0 ||
      children.some(
        (child) =>
          child.kind !== "activity" ||
          !sameCanonicalDate(parent.payload, child.payload)
      )
    ) {
      continue;
    }

    for (const child of children) {
      const childTitle = stringValue(child.payload, "title");
      const childDescription = stringValue(child.payload, "description");
      parent.payload.description = uniqueDescription(
        parent.payload.description,
        [childTitle, childDescription].filter(Boolean).join(": ")
      );
      mergeCanonicalPieceInto({
        actionType: "grouped",
        decisionId: decision.decisionId,
        reason: `canonical resolver decision: ${decision.claim}`,
        source: child,
        target: parent,
      });
    }
  }
}

function createCanonicalGroupingCalls(
  decisions: CanonicalGroupingDecision[],
  pieces: CanonicalEvidencePiece[]
) {
  const calls: Array<Record<string, unknown>> = [];
  for (const decision of decisions) {
    const parent = pieces.find(
      (piece) =>
        piece.outputEligible &&
        piece.actions.some(
          (action) =>
            action.type === "grouped" && action.decisionId === decision.decisionId
        )
    );

    if (!parent) continue;

    const groupedActions = parent.actions.filter(
      (action) =>
        action.type === "grouped" && action.decisionId === decision.decisionId
    );
    const childTitles = Array.from(
      new Set(groupedActions.flatMap((action) => action.absorbedTitles))
    );

    if (childTitles.length === 0) continue;

    calls.push({
      answerType: "confirm",
      assemblySource: "canonical_evidence",
      confidence: "high",
      evidence: decision.claim,
      guessedValue: stringValue(parent.payload, "title"),
      prompt: `We grouped ${childTitles.join(", ")} into ${
        stringValue(parent.payload, "title") ?? "one activity"
      }.`,
      reason:
        "Source structure and a bounded public venue lookup agreed this is one visit, so the traveler app keeps one card with visible included stops.",
      resolverDecisionId: decision.decisionId,
      relatedCanonicalPieceId: parent.id,
      relatedTitle: stringValue(parent.payload, "title"),
      subjectType: "item",
      targetField: "presentation",
    });
  }

  return calls;
}

function createCanonicalConflictQuestions(pieces: CanonicalEvidencePiece[]) {
  return pieces.flatMap((piece) => {
    if (!piece.outputEligible || piece.kind !== "activity") {
      return [];
    }

    const dateConflict = piece.conflicts.find(
      (conflict) => conflict.field === "date" && conflict.values.length > 1
    );

    if (!dateConflict) {
      return [];
    }

    const title = stringValue(piece.payload, "title") ?? "this activity";

    return [{
      answerType: "date",
      confidence: "medium",
      evidence: `Source evidence placed ${title} on ${dateConflict.values.join(" and ")}.`,
      guessedValue: stringValue(piece.payload, "date"),
      prompt: `Which day should ${title} appear on?`,
      reason:
        "Repeated source evidence describes one canonical activity but disagrees about its day, so Roamwoven kept one card and needs one placement decision.",
      relatedCanonicalPieceId: piece.id,
      relatedTitle: title,
      subjectType: "item",
      targetField: "date",
    }];
  });
}

function activityKind(payload: Record<string, unknown>): EvidenceKind {
  const explicitRole = evidenceRoleFromPayload(payload, "activity");
  const canonicalRoleDecision = stringValue(payload, "_canonicalRoleDecision");
  const approvedGrouping = Array.isArray(payload._canonicalGroupingDecisionIds) &&
    payload._canonicalGroupingDecisionIds.length > 0;
  const sourceStructure = sourceStructureFromPayload(payload);
  const classification = classifyDraftActivityCard({
    category: stringValue(payload, "category"),
    date: stringValue(payload, "date"),
    description: stringValue(payload, "description"),
    endTime: stringValue(payload, "endTime"),
    itemType: stringValue(payload, "itemType"),
    startTime: stringValue(payload, "startTime"),
    title: stringValue(payload, "title"),
  });

  if (approvedGrouping) {
    return "activity";
  }

  if (explicitRole === "context" || explicitRole === "rejected") {
    return "context";
  }

  if (canonicalRoleDecision === "keep_activity") {
    return "activity";
  }

  if (canonicalRoleDecision === "city_note") {
    return "note";
  }

  if (
    explicitRole === "city_note_candidate" ||
    sourceStructure.sectionType === "city_reference" ||
    stringValue(payload, "itemType") === "note" ||
    classification.isLooseTipActivity ||
    (classification.isWeakDatedCityNoteCandidate &&
      classification.hasWeakRecommendationMarker)
  ) {
    return "note";
  }

  if (explicitRole === "atomic_candidate" && payload._recoveryRequired === true) {
    return "activity";
  }

  if (
    classification.isOverviewActivity ||
    !stringValue(payload, "date") &&
    !classification.hasStrongPlannedActivityLanguage
  ) {
    return "note";
  }

  return "activity";
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

  for (const observation of observations) {
    const approvedGrouping = Array.isArray(
      observation.payload._canonicalGroupingDecisionIds
    ) && observation.payload._canonicalGroupingDecisionIds.length > 0;
    const approvedKeepActivity =
      observation.payload._canonicalRoleDecision === "keep_activity";

    if (observation.role === "grouping_proposal" && !approvedGrouping) {
      observation.kind = "context";
      observation.role = "context";
      continue;
    }

    if (observation.kind !== "activity") {
      continue;
    }

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
      approvedGrouping ||
      approvedKeepActivity
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
      observation.role = "context";
    }
  }
}

function createObservation({
  kind,
  ordinal,
  payload,
  role,
  source,
  sourceFilename,
  sourceLabel,
  sourceProvenance,
  sourceStructure,
  sourceUploadId,
}: Omit<EvidenceObservation, "id">): EvidenceObservation {
  const id = `obs_${stableHash({
    kind,
    ordinal,
    payload,
    role,
    source,
    sourceFilename,
    sourceLabel,
    sourceStructure,
    sourceUploadId,
  })}`;

  return {
    id,
    kind,
    ordinal,
    payload,
    role,
    source,
    sourceFilename,
    sourceLabel,
    sourceProvenance,
    sourceStructure,
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
  const subjectType = normalizedComparable(detail.subjectType);
  const expectedKind =
    subjectType === "item" ? "activity" :
      subjectType === "stay" ? "stay" :
        subjectType === "transport" ? "transport" :
          subjectType === "leg" ? "place" : null;

  if (relatedTitle.length === 0) {
    return null;
  }

  const candidates = pieces
      .filter(
        (piece) => piece.outputEligible && (!expectedKind || piece.kind === expectedKind)
      )
      .map((piece) => ({
        overlap: overlapCount(relatedTitle, identityTokens(piece.payload.title ?? piece.payload.name)),
        piece,
      }))
      .filter((candidate) => candidate.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap);
  const best = candidates[0];
  const minimumOverlap = Math.min(2, relatedTitle.length);

  if (
    !best ||
    best.overlap < minimumOverlap ||
    candidates[1]?.overlap === best.overlap
  ) {
    return null;
  }

  return best.piece;
}

function recoverMissingNamedEvidence({
  details,
  observations,
  pieces,
  startingOrdinal,
}: {
  details: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
  startingOrdinal: number;
}) {
  let ordinal = startingOrdinal;

  for (const value of details) {
    const detail = asRecord(value);
    const relatedTitle = stringValue(detail, "relatedTitle");
    const subjectType = normalizedComparable(detail.subjectType);

    if (
      !relatedTitle ||
      subjectType !== "item" ||
      pieceForMissingDetail(detail, pieces)
    ) {
      continue;
    }

    const evidence = stringValue(detail, "evidence");
    const reason = stringValue(detail, "reason");
    const sourceBacked = /\b(source|document|itinerary|pdf|lists?|says?|states?|shows?)\b/.test(
      normalizeText([evidence, reason].filter(Boolean).join(" "))
    );

    if (!sourceBacked) {
      continue;
    }

    ordinal += 1;
    const observation = createObservation({
      kind: "activity",
      ordinal,
      payload: {
        _recoveryRequired: true,
        address: null,
        category: "art_culture",
        city: null,
        date: null,
        description:
          evidence ??
          "This named source item needs placement review before publishing.",
        endTime: null,
        evidenceRole: "atomic_candidate",
        itemType: "placeholder",
        sourceFilename: "canonical recovery",
        sourceHeadingPath: [],
        sourceSectionLabel: null,
        sourceSectionType: "unknown",
        startTime: null,
        title: relatedTitle,
      },
      role: "atomic_candidate",
      source: "model_chunk",
      sourceFilename: null,
      sourceLabel: "missing named evidence recovery",
      sourceProvenance: "source review question",
      sourceStructure: {
        headingPath: [],
        sectionLabel: null,
        sectionType: "unknown",
      },
      sourceUploadId: null,
    });
    const piece = createPiece(observation);

    addCanonicalAction(piece, {
      absorbedTitles: [relatedTitle],
      observationIds: [observation.id],
      reason:
        "Named source evidence had no surviving canonical target, so Roamwoven preserved a review-required card.",
      type: "recovered",
    });
    detail.relatedCanonicalPieceId = piece.id;
    observations.push(observation);
    pieces.push(piece);
  }
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
  const tripYear = inferTripYear(overview, ...pieces.map((piece) => piece.payload));

  return dedupeObjects(details).filter((value) => {
    const detail = asRecord(value);
    const questionText = normalizeText(
      [detail.prompt, detail.reason].filter(Boolean).join(" ")
    );

    if (
      /\b(?:no question (?:is )?needed|does not need (?:a )?question|already identifiable|already resolved)\b/.test(
        questionText
      )
    ) {
      return false;
    }
    const subjectType = normalizedComparable(detail.subjectType);
    const targetField = normalizedComparable(detail.targetField).replace(/\s+/g, "");

    if (subjectType === "stay" && /(?:name|lodging|booking)/.test(targetField)) {
      const detailText = [detail.prompt, detail.reason, detail.evidence, detail.relatedTitle]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
      const detailDate = normalizeTripDate(detailText, tripYear);
      const normalizedDetailText = normalizeText(detailText);
      const compatibleStays = pieces.filter((candidate) => {
        if (!candidate.outputEligible || candidate.kind !== "stay") return false;
        const checkIn = stringValue(candidate.payload, "checkIn") ??
          stringValue(candidate.payload, "firstNightDate");
        const checkOut = stringValue(candidate.payload, "checkOut");
        const city = normalizeText(stringValue(candidate.payload, "city"));
        const cityFits = Boolean(city && normalizedDetailText.includes(city));
        const dateFits = !detailDate || Boolean(
          checkIn &&
            (tripDatesMatch(detailDate, checkIn) ||
              (checkOut && detailDate >= checkIn && detailDate < checkOut))
        );
        return cityFits && dateFits;
      });

      const resolvedStayName = normalizeText(
        stringValue(compatibleStays[0]?.payload ?? {}, "name")
      )
        .replace(
          /\b(?:accommodation|airbnb|apartment|hostel|hotel|lodging|rental|stay)\b/g,
          " "
        )
        .replace(/\s+/g, " ")
        .trim();

      if (compatibleStays.length === 1 && resolvedStayName.length >= 3) {
        return false;
      }
    }

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

    if (
      subjectType === "item" &&
      /^(?:itemtype|presentation|keep|visibility)$/.test(targetField) &&
      piece.kind === "activity" &&
      piece.outputEligible &&
      !stringValue(detail, "resolverDecisionId")
    ) {
      return false;
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
  groupingDecisions = [],
  resolverMetadata,
  sourceTransportAnchors,
  stages,
  tripOverview,
}: {
  groupingDecisions?: CanonicalGroupingDecision[];
  resolverMetadata?: unknown;
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
        const role = evidenceRoleFromPayload(payload, kind);
        observations.push(
          createObservation({
            kind,
            ordinal,
            payload,
            role,
            source: stageInput.source,
            sourceFilename:
              stringValue(payload, "sourceFilename") ??
              stageInput.sourceFilename ??
              null,
            sourceLabel: stageInput.label,
            sourceProvenance: stageInput.sourceProvenance ?? null,
            sourceStructure: sourceStructureFromPayload(payload),
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
        role: "atomic_candidate",
        source: "source_anchor",
        sourceFilename: anchor.sourceFilename,
        sourceLabel: anchor.anchorId,
        sourceProvenance: anchor.provenance.join(","),
        sourceStructure: {
          headingPath: [],
          sectionLabel: null,
          sectionType: "booking_detail",
        },
        sourceUploadId: anchor.sourceUploadId,
      })
    );
  }

  const pieces: CanonicalEvidencePiece[] = [];
  let suppressedWeakAnchorCount = 0;

  for (const observation of observations) {
    if (observation.kind === "context" || observation.role === "rejected") {
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

    if (observation.source === "source_anchor") {
      suppressedWeakAnchorCount += 1;
      pieces.push(createPiece(observation, false));
      continue;
    }

    pieces.push(createPiece(observation));
  }

  suppressRedundantTransportParents(pieces);
  attachGenericStayFragments(pieces);
  attachGenericActivityAccessories(pieces);
  attachGenericActivityPlaceholders(pieces);
  attachRentalCarReturns(pieces);
  suppressRepresentedTravelAndStayActivities(pieces);
  applyAccessTaskPolicy(pieces);
  recoverOutOfRangePieces(pieces);
  recoverMissingNamedEvidence({
    details: missingDetails,
    observations,
    pieces,
    startingOrdinal: ordinal,
  });
  executeCanonicalGroupingDecisions({
    decisions: groupingDecisions,
    observations,
    pieces,
  });
  routeCanonicalAccessoryEvidence({
    actions: {
      addAction: addCanonicalAction,
      suppressPiece: suppressCanonicalPiece,
    },
    pieces,
    tripYear,
  });
  mergeCanonicalCityNotes(pieces);
  const canonicalGroupingCalls = createCanonicalGroupingCalls(
    groupingDecisions,
    pieces
  );
  const canonicalConflictQuestions = createCanonicalConflictQuestions(pieces);

  const outputFor = (kind: EvidenceKind) =>
    pieces
      .filter((piece) => piece.outputEligible && piece.kind === kind)
      .map((piece) => ({
        ...publicPayload(piece.payload),
        _canonicalPieceId: piece.id,
      }));
  const activities = [...outputFor("activity"), ...outputFor("note")];
  const finalMissingDetails = unresolvedMissingDetails({
    details: [
      ...missingDetails,
      ...canonicalGroupingCalls,
      ...canonicalConflictQuestions,
    ],
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
      actions: pieces.flatMap((piece) =>
        piece.actions.map((action) => ({
          ...action,
          canonicalPieceId: piece.id,
        }))
      ),
      canonicalPieceIds: pieces.map((piece) => piece.id),
      observationIds: observations.map((observation) => observation.id),
      resolver: resolverMetadata ?? null,
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
      rejectedObservationCount: new Set(
        pieces
          .filter((piece) => !piece.outputEligible)
          .flatMap((piece) => piece.observationIds)
      ).size,
      sourceAnchorObservationCount: sourceTransportAnchors.length,
      suppressedWeakAnchorCount,
    },
  };
}
