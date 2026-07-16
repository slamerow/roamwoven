import { createHash } from "node:crypto";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";
import { routeCanonicalAccessoryEvidence } from "@/lib/extraction/canonical-accessory-routing";
import {
  canonicalCategoryId,
  canonicalItemType,
  canonicalTransportDescription,
  canonicalTransportType,
} from "@/lib/extraction/canonical-field-policy";
import {
  normalizeTripClockTime,
  normalizeText,
  normalizeTripDate,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import {
  classifyDraftActivityCard,
} from "@/lib/trip-card-taxonomy";
import {
  isRentalCarPickupCandidate,
  isScenicRideCandidate,
  shouldBeTravelRow,
} from "@/lib/trip-travel-boundary-policy";
import {
  hasTransportTimeEvidence,
  isCriticalTransportRecord,
} from "@/lib/trip-transport-policy";
import { createCanonicalTripSpineReviewDetails } from "@/lib/extraction/trip-spine-validation";

export const EVIDENCE_CLUSTER_VERSION = 13;

export type EvidenceKind =
  | "activity"
  | "context"
  | "decision"
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
    | "cancelled"
    | "field_selected"
    | "grouped"
    | "merged"
    | "recovered"
    | "rejected"
    | "superseded";
};

export type CanonicalGroupingDecision = {
  callRequired?: boolean;
  candidateIds: string[];
  claim: string;
  containerCandidateId?: string | null;
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
  disposition?: EvidenceObservationDisposition;
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

export type EvidenceObservationDisposition = {
  canonicalPieceId: string | null;
  outcome:
    | "canonical_entity"
    | "declared_detail"
    | "evidence_only"
    | "maker_decision"
    | "sensitive_redaction";
  reason: string;
  reasonCode:
    | "attached_detail"
    | "cancelled"
    | "canonical_entity"
    | "grouped_child"
    | "needs_identity_enrichment"
    | "rejected"
    | "source_context"
    | "superseded"
    | "superseded_or_duplicate"
    | "weak_source_anchor";
};

export type CanonicalEvidenceConflict = {
  field: string;
  observationIds: string[];
  requiresReview: boolean;
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
    dispositionCount: number;
    observationCount: number;
    rejectedObservationCount: number;
    sourceAnchorObservationCount: number;
    suppressedWeakAnchorCount: number;
  };
};

const COLLECTIONS: Array<{
  collection: "activities" | "places" | "stays" | "transport";
  kind: Exclude<EvidenceKind, "context" | "decision" | "note">;
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
  const normalized = Object.fromEntries(
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

  if (
    !stringValue(normalized, "date") &&
    stringValue(normalized, "itemType") !== "note" &&
    stringValue(normalized, "sourceSectionType") === "dated_itinerary"
  ) {
    const structuralDates = [
      stringValue(normalized, "sourceSectionLabel"),
      ...(Array.isArray(normalized.sourceHeadingPath)
        ? normalized.sourceHeadingPath.filter(
            (value): value is string => typeof value === "string"
          )
        : []),
    ];

    for (const candidate of structuralDates) {
      const date = normalizeTripDate(candidate, defaultYear);
      if (!date) continue;
      normalized.date = date;
      normalized._canonicalDateSource = "dated_source_structure";
      break;
    }
  }

  return normalized;
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
    if (
      explicit === "accessory_detail" &&
      kind === "activity" &&
      hasIndependentActivityAnchor(payload)
    ) {
      return "atomic_candidate";
    }
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

export function canonicalPiecePublicPayload(
  payload: Record<string, unknown>
) {
  const {
    _canonicalGroupingDecisionIds,
    _canonicalNoteCollectionLabel,
    _canonicalNoteEntries,
    _canonicalNoteEntry,
    _canonicalRoleDecision,
    _canonicalProvisionalFields,
    _canonicalSourceDecisions,
    _resolverCandidateId,
    evidenceRole: _evidenceRole,
    sourceHeadingPath: _sourceHeadingPath,
    sourceSectionLabel: _sourceSectionLabel,
    sourceSectionType: _sourceSectionType,
    ...publicFields
  } = payload;

  return publicFields;
}

type CanonicalSourceDecision = {
  decisionType: "ticket_choice";
  sourceText: string;
  targetField: "description";
};

function canonicalSourceDecisions(
  payload: Record<string, unknown>
): CanonicalSourceDecision[] {
  if (!Array.isArray(payload._canonicalSourceDecisions)) return [];

  return payload._canonicalSourceDecisions.flatMap((value) => {
    const record = asRecord(value);
    const decisionType = stringValue(record, "decisionType");
    const sourceText = stringValue(record, "sourceText");
    const targetField = stringValue(record, "targetField");

    return decisionType === "ticket_choice" &&
      sourceText &&
      targetField === "description"
      ? [{ decisionType, sourceText, targetField }]
      : [];
  });
}

function hasIndependentActivityAnchor(payload: Record<string, unknown>) {
  const title = normalizeText(stringValue(payload, "title"));
  const text = normalizeText(
    [payload.title, payload.description].filter(Boolean).join(" ")
  );
  const hasAnchor = Boolean(
    stringValue(payload, "startTime") ||
      stringValue(payload, "endTime") ||
      /\b(?:booked|confirmation|paid|reservation|reserved|starts? at|ticketed|voucher)\b/.test(
        text
      )
  );
  const detailOnlyTitle =
    /\b(?:bus|ferry|flight|train|transfer)\b/.test(title) ||
    /^(?:access|admission|arrival|booking|check in|check out|confirmation|departure|entry|pass|ticket|voucher)\b/.test(
      title
    );

  return Boolean(title && hasAnchor && !detailOnlyTitle);
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

function crossSourceActivityConflictReason({
  observation,
  observations,
  piece,
}: {
  observation: EvidenceObservation;
  observations: EvidenceObservation[];
  piece: CanonicalEvidencePiece;
}) {
  if (piece.kind !== "activity" || observation.kind !== "activity") return null;
  const title = normalizedComparable(observation.payload.title);
  const date = stringValue(observation.payload, "date");
  const time = timeFrom(observation.payload);
  const confirmation = confirmationFrom(observation.payload);
  if (!title || !date || !time) return null;

  const sourceIdentity =
    observation.sourceUploadId ??
    observation.sourceFilename ??
    observation.sourceLabel;
  const conflictingWitness = observations.find((candidate) => {
    if (!piece.observationIds.includes(candidate.id)) return false;
    const candidateSourceIdentity =
      candidate.sourceUploadId ??
      candidate.sourceFilename ??
      candidate.sourceLabel;
    const candidateConfirmation = confirmationFrom(candidate.payload);

    return Boolean(
      candidateSourceIdentity !== sourceIdentity &&
        normalizedComparable(candidate.payload.title) === title &&
        stringValue(candidate.payload, "date") === date &&
        timeFrom(candidate.payload) &&
        timeFrom(candidate.payload) !== time &&
        (!confirmation ||
          !candidateConfirmation ||
          confirmation === candidateConfirmation)
    );
  });

  return conflictingWitness
    ? "same dated activity identity across conflicting sources"
    : null;
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
  const sourceHierarchyRank =
    observation.sourceStructure.sectionType === "booking_detail"
      ? 4
      : observation.sourceStructure.sectionType === "dated_itinerary"
        ? 3
        : observation.sourceStructure.sectionType === "city_reference"
          ? 1
          : 2;
  let rank = sourceHierarchyRank * 10_000 +
    (observation.source === "source_anchor"
      ? 180
      : observation.source === "model_chunk"
        ? 150
        : 100);

  if (provenance.includes("manual note")) rank += 60;
  if (provenance.includes("text layer")) rank += 50;
  if (provenance.includes("ocr")) rank += 20;
  if (field === "title") rank += titleQuality(value) / 10;
  if (field === "description" && typeof value === "string") {
    rank += Math.min(value.length, 240) / 24;
  }

  return rank;
}

function evidenceAuthority(rank: number) {
  return Math.floor(rank / 10_000);
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
  requiresReview,
  value,
}: {
  conflicts: CanonicalEvidenceConflict[];
  existing: unknown;
  field: string;
  observation: EvidenceObservation;
  piece: CanonicalEvidencePiece;
  requiresReview: boolean;
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
    existingConflict.requiresReview ||= requiresReview;
  } else {
    conflicts.push({ field, observationIds, requiresReview, values });
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
    const sameAuthority =
      evidenceAuthority(incomingRank) === evidenceAuthority(existingRank);

    if (field === "description") {
      next[field] = uniqueDescription(existing, value);
    } else if (field === "title") {
      if (
        (evidenceAuthority(incomingRank) > evidenceAuthority(existingRank) ||
          (sameAuthority && titleQuality(value) > titleQuality(existing))) &&
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
        requiresReview: sameAuthority,
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
        requiresReview: sameAuthority,
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
      (incomingRank > existingRank ||
        (sameAuthority && evidenceSpecificity(observation.payload) > evidenceSpecificity(next)))
    ) {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        requiresReview: sameAuthority,
        value,
      });
    } else if (
      valuesConflict(existing, value) &&
      ![
        "arrival",
        "arrivalLocation",
        "arrivalTime",
        "date",
        "departure",
        "departureLocation",
        "departureTime",
        "endTime",
        "startTime",
        "time",
        "title",
      ].includes(field) &&
      evidenceAuthority(incomingRank) > evidenceAuthority(existingRank)
    ) {
      next[field] = value;
      piece.fieldWinnerRanks[field] = incomingRank;
      recordCanonicalConflict({
        conflicts,
        existing,
        field,
        observation,
        piece,
        requiresReview: false,
        value,
      });
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [observation.id],
        reason: `Selected higher-authority ${field} evidence from ${observation.sourceLabel}.`,
        type: "field_selected",
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
        requiresReview: sameAuthority,
        value,
      });
    }

    piece.fieldSources[field] = Array.from(
      new Set([...(piece.fieldSources[field] ?? []), observation.id])
    );
  }

  piece.payload = next;
  piece.conflicts = conflicts;
  piece.observationIds = Array.from(
    new Set([...piece.observationIds, observation.id])
  );
  piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
  const rolePriority: Record<EvidenceRole, number> = {
    atomic_candidate: 6,
    city_note_candidate: 5,
    accessory_detail: 4,
    grouping_proposal: 3,
    context: 2,
    rejected: 1,
  };
  if (rolePriority[observation.role] > rolePriority[piece.role]) {
    piece.role = observation.role;
  }
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
  piece.confidence = conflicts.some((conflict) => conflict.requiresReview)
    ? "medium"
    : "high";
  refreshCanonicalPieceId(piece);
}

function refreshCanonicalPieceId(piece: CanonicalEvidencePiece) {
  piece.id = `piece_${stableHash({
    kind: piece.kind,
    observations: [...piece.observationIds].sort(),
  })}`;
}

function reconcileCanonicalConflicts(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[]
) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );

  for (const piece of pieces) {
    piece.conflicts = piece.conflicts.flatMap((conflict) => {
      const values = new Map<
        string,
        { display: string; rank: number }
      >();
      for (const observationId of piece.observationIds) {
        const observation = observationById.get(observationId);
        const value = observation?.payload[conflict.field];
        if (!observation || value === null || value === undefined || value === "") {
          continue;
        }
        const key = normalizedComparable(value);
        if (!key) continue;
        const rank = evidenceValueRank(observation, conflict.field, value);
        const existing = values.get(key);
        if (!existing || rank > existing.rank) {
          values.set(key, { display: String(value), rank });
        }
      }

      const ranked = [...values.values()].sort(
        (left, right) => right.rank - left.rank || left.display.localeCompare(right.display)
      );
      if (ranked.length < 2) return [];

      return [{
        ...conflict,
        requiresReview: ranked[0].rank === ranked[1].rank,
        values: ranked.map((value) => value.display),
      }];
    });
    piece.confidence = piece.conflicts.some((conflict) => conflict.requiresReview)
      ? "medium"
      : "high";
  }
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
  preserveTargetIdentity = false,
  reason,
  source,
  target,
}: {
  actionType?: "attached" | "grouped";
  decisionId?: string;
  preserveTargetIdentity?: boolean;
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
  target.confidence = target.conflicts.some((conflict) => conflict.requiresReview)
    ? "medium"
    : "high";
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
  if (!preserveTargetIdentity) {
    refreshCanonicalPieceId(target);
  }
  suppressCanonicalPiece(source, reason);
}

function travelBoundaryRecord(piece: CanonicalEvidencePiece) {
  return {
    arrivalDate:
      stringValue(piece.payload, "arrivalDate") ??
      stringValue(piece.payload, "dropOffDate") ??
      stringValue(piece.payload, "endDate"),
    arrivalLocation:
      stringValue(piece.payload, "arrival") ??
      stringValue(piece.payload, "arrivalLocation") ??
      stringValue(piece.payload, "dropOffLocation"),
    category: stringValue(piece.payload, "category"),
    confirmationLabel: confirmationFrom(piece.payload),
    departureDate:
      stringValue(piece.payload, "departureDate") ??
      stringValue(piece.payload, "pickupDate") ??
      stringValue(piece.payload, "startDate") ??
      stringValue(piece.payload, "date"),
    departureLocation:
      stringValue(piece.payload, "departure") ??
      stringValue(piece.payload, "departureLocation") ??
      stringValue(piece.payload, "pickupLocation") ??
      stringValue(piece.payload, "address"),
    description: stringValue(piece.payload, "description"),
    itemType: stringValue(piece.payload, "itemType"),
    provider: stringValue(piece.payload, "provider"),
    title:
      stringValue(piece.payload, "title") ?? stringValue(piece.payload, "name"),
    transportType: stringValue(piece.payload, "type"),
  };
}

function convertCanonicalTransportToActivity(
  piece: CanonicalEvidencePiece,
  reason: string
) {
  const scenicRide = isScenicRideCandidate(travelBoundaryRecord(piece));
  piece.kind = "activity";
  piece.role = "atomic_candidate";
  piece.payload = {
    ...piece.payload,
    address:
      piece.payload.address ??
      piece.payload.pickupLocation ??
      piece.payload.departureLocation ??
      piece.payload.departure ??
      null,
    category: scenicRide ? "scenic_ride" : "arrival_departure",
    date:
      piece.payload.date ??
      piece.payload.pickupDate ??
      piece.payload.departureDate ??
      piece.payload.startDate ??
      null,
    endTime:
      piece.payload.endTime ??
      piece.payload.dropOffTime ??
      piece.payload.arrivalTime ??
      null,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    startTime:
      piece.payload.startTime ??
      piece.payload.pickupTime ??
      piece.payload.departureTime ??
      piece.payload.time ??
      null,
  };
  refreshCanonicalPieceId(piece);
  addCanonicalAction(piece, {
    absorbedTitles: [],
    observationIds: [...piece.observationIds],
    reason,
    type: "recovered",
  });
}

function convertCanonicalActivityToTransport(
  piece: CanonicalEvidencePiece,
  reason: string
) {
  piece.kind = "transport";
  piece.role = "atomic_candidate";
  piece.payload = {
    ...piece.payload,
    arrival:
      piece.payload.arrival ??
      piece.payload.arrivalLocation ??
      piece.payload.dropOffLocation ??
      null,
    arrivalTime:
      piece.payload.arrivalTime ??
      piece.payload.dropOffTime ??
      piece.payload.endTime ??
      null,
    date:
      piece.payload.date ??
      piece.payload.pickupDate ??
      piece.payload.departureDate ??
      null,
    departure:
      piece.payload.departure ??
      piece.payload.departureLocation ??
      piece.payload.pickupLocation ??
      piece.payload.address ??
      null,
    departureTime:
      piece.payload.departureTime ??
      piece.payload.pickupTime ??
      piece.payload.startTime ??
      null,
    evidenceRole: "atomic_candidate",
    type: canonicalTransportType(stringValue(piece.payload, "type")),
  };
  refreshCanonicalPieceId(piece);
  addCanonicalAction(piece, {
    absorbedTitles: [],
    observationIds: [...piece.observationIds],
    reason,
    type: "recovered",
  });
}

function routeCanonicalTravelBoundaries(pieces: CanonicalEvidencePiece[]) {
  for (const piece of pieces.filter((candidate) => candidate.outputEligible)) {
    const record = travelBoundaryRecord(piece);

    if (piece.kind === "transport") {
      piece.payload.type = canonicalTransportType(stringValue(piece.payload, "type"));

      if (!shouldBeTravelRow(record)) {
        convertCanonicalTransportToActivity(
          piece,
          "canonical travel boundary routed local movement to an activity"
        );
      }
      continue;
    }

    if (
      piece.kind === "activity" &&
      isRentalCarPickupCandidate(record) &&
      shouldBeTravelRow(record)
    ) {
      convertCanonicalActivityToTransport(
        piece,
        "canonical travel boundary routed intercity rental movement to travel"
      );
    }
  }
}

function mergeReclassifiedCanonicalPieces(pieces: CanonicalEvidencePiece[]) {
  for (const source of pieces) {
    if (!source.outputEligible) continue;
    const target = pieces.find(
      (candidate) =>
        candidate !== source &&
        candidate.outputEligible &&
        candidate.kind === source.kind &&
        Boolean(matchReason(candidate.kind, candidate.payload, source.payload))
    );
    if (!target) continue;

    for (const [field, value] of Object.entries(source.payload)) {
      if (value === null || value === undefined || value === "") continue;
      if (field === "description") {
        target.payload.description = uniqueDescription(
          target.payload.description,
          value
        );
      } else if (
        target.payload[field] === null ||
        target.payload[field] === undefined ||
        target.payload[field] === ""
      ) {
        target.payload[field] = value;
      }
    }
    mergeCanonicalPieceInto({
      reason: "reclassified evidence merged into its canonical entity",
      source,
      target,
    });
  }
}

function attachArrivalOnlyTransportPieces(pieces: CanonicalEvidencePiece[]) {
  const transports = pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  );

  for (const arrivalOnly of transports) {
    if (!arrivalOnly.outputEligible || hasSpecificTransportRoute(arrivalOnly.payload)) {
      continue;
    }

    const text = normalizeText(
      [arrivalOnly.payload.title, arrivalOnly.payload.description]
        .filter(Boolean)
        .join(" ")
    );
    if (!/\b(arriv|arrival|land|landing|reach)\b/.test(text)) continue;

    const arrivalDate = stringValue(arrivalOnly.payload, "date");
    const arrivalTime = normalizedClockTime(
      arrivalOnly.payload.arrivalTime ?? arrivalOnly.payload.time
    );
    const candidates = transports.filter((candidate) => {
      if (
        candidate === arrivalOnly ||
        !candidate.outputEligible ||
        !hasSpecificTransportRoute(candidate.payload)
      ) {
        return false;
      }

      const candidateDate = stringValue(candidate.payload, "date");
      const dateFits = Boolean(
        arrivalDate &&
          candidateDate &&
          (tripDatesMatch(arrivalDate, candidateDate) ||
            shiftIsoDate(candidateDate, 1) === arrivalDate)
      );
      if (!dateFits) return false;

      const candidateArrivalTime = normalizedClockTime(candidate.payload.arrivalTime);
      const timeFits = Boolean(
        arrivalTime && candidateArrivalTime && arrivalTime === candidateArrivalTime
      );
      const destination = normalizeText(
        routeEndpoint(candidate.payload, "arrival")
      );
      const destinationFits = Boolean(destination && text.includes(destination));

      return timeFits || destinationFits;
    });

    if (candidates.length !== 1) continue;
    const target = candidates[0];
    target.payload.description = uniqueDescription(
      target.payload.description,
      arrivalOnly.payload.description ?? arrivalOnly.payload.title
    );
    mergeCanonicalPieceInto({
      reason: "arrival-only evidence attached to the matching inbound travel segment",
      source: arrivalOnly,
      target,
    });
  }
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

function attachCanonicalAccessoryDetails(pieces: CanonicalEvidencePiece[]) {
  const accessories = pieces.filter(
    (piece) =>
      piece.kind !== "decision" &&
      piece.role === "accessory_detail" &&
      !piece.outputEligible
  );

  for (const accessory of accessories) {
    const text = activityText(accessory.payload);
    const accessoryDate = stringValue(accessory.payload, "date");
    const accessoryTime = timeFrom(accessory.payload);
    const titleTokens = identityTokens(accessory.payload.title);
    const candidates = pieces.filter((candidate) => {
      if (!candidate.outputEligible || candidate === accessory) return false;
      const candidateDate = stringValue(candidate.payload, "date") ??
        stringValue(candidate.payload, "checkIn");
      if (
        accessoryDate &&
        candidateDate &&
        !tripDatesMatch(accessoryDate, candidateDate)
      ) {
        return false;
      }

      if (candidate.kind === accessory.kind) {
        return Boolean(matchReason(candidate.kind, candidate.payload, accessory.payload));
      }

      const candidateText = activityText(candidate.payload);
      const candidateTokens = identityTokens(
        [candidate.payload.title, candidate.payload.name].filter(Boolean).join(" ")
      );
      const tokenMatch = overlapCount(titleTokens, candidateTokens) >= Math.min(
        2,
        Math.max(1, titleTokens.length)
      );
      const timeMatch = Boolean(
        accessoryTime && timeFrom(candidate.payload) === accessoryTime
      );

      if (
        candidate.kind === "transport" &&
        /\b(?:bus|ferry|flight|train|transfer)\b/.test(text)
      ) {
        return tokenMatch || timeMatch || Boolean(
          (routeEndpoint(candidate.payload, "departure") &&
            text.includes(routeEndpoint(candidate.payload, "departure"))) ||
          (routeEndpoint(candidate.payload, "arrival") &&
            text.includes(routeEndpoint(candidate.payload, "arrival")))
        );
      }

      if (candidate.kind === "stay" && /\b(?:airbnb|check in|hostel|hotel|lodging|room|stay)\b/.test(text)) {
        return tokenMatch || Boolean(
          normalizedComparable(candidate.payload.address) &&
          text.includes(normalizedComparable(candidate.payload.address))
        );
      }

      return candidate.kind === "activity" && (tokenMatch || timeMatch);
    });

    if (candidates.length !== 1) {
      addCanonicalAction(accessory, {
        absorbedTitles: [],
        observationIds: [...accessory.observationIds],
        reason: "accessory evidence remained non-output because it had no unique canonical owner",
        type: "rejected",
      });
      continue;
    }

    const target = candidates[0];
    target.payload.description = uniqueDescription(
      target.payload.description,
      accessory.payload.description ?? accessory.payload.title
    );
    mergeCanonicalPieceInto({
      reason: "accessory evidence attached to its unique canonical owner",
      source: accessory,
      target,
    });
  }
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
      /^(?:accommodation|airbnb|airbnb apartment|apartment|hostel|hotel|lodging|private lodging|private rental|rental|stay|[a-z]+ (?:airbnb|apartment|lodging|rental|stay))$/.test(
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
      /\b(?:double|ensuite|night|nights|private|room|shared|single)\b/.test(
        normalized
      ) &&
      (/(?:[$€£]\s*\d|\b\d{2,4}\s*(?:usd|eur|gbp)\b)/i.test(raw) ||
        /\b(?:private|shared|single|double)\s+(?:room|bathroom)|\broom\s+(?:ensuite|en suite)\b/.test(
          normalized
        ))
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
  const isWeakFragment = (piece: CanonicalEvidencePiece) => {
    const name = normalizedComparable(piece.payload.name);
    const cityTypeName = Array.from(placeCities).some(
      (city) =>
        name === city ||
        (name.startsWith(`${city} `) &&
          /^(?:accommodation|airbnb|apartment|hostel|hotel|lodging|rental|stay)$/.test(
            name.slice(city.length).trim()
          ))
    );
    return isWeakStayFragmentName(piece.payload.name) || cityTypeName;
  };

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

function isBooleanLikeStayName(value: unknown) {
  return /^(?:yes|no|true|false|correct|confirmed)$/i.test(
    typeof value === "string" ? value.trim() : ""
  );
}

function pruneNonOvernightPlaces(pieces: CanonicalEvidencePiece[]) {
  const places = pieces
    .filter((piece) => piece.kind === "place" && piece.outputEligible)
    .sort((left, right) =>
      String(left.payload.arriveDate ?? left.payload.arrivalDate ?? "").localeCompare(
        String(right.payload.arriveDate ?? right.payload.arrivalDate ?? "")
      )
    );
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );
  const transport = pieces
    .filter((piece) => piece.kind === "transport" && piece.outputEligible)
    .sort((left, right) =>
      String(left.payload.date ?? left.payload.departureDate ?? "").localeCompare(
        String(right.payload.date ?? right.payload.departureDate ?? "")
      )
    );
  const firstTransport = transport[0];
  const lastTransport = transport.at(-1);

  places.forEach((place, index) => {
    const city = stringValue(place.payload, "city");
    const arriveDate = stringValue(place.payload, "arriveDate") ??
      stringValue(place.payload, "arrivalDate");
    const leaveDate = stringValue(place.payload, "leaveDate") ??
      stringValue(place.payload, "departureDate");
    const stayMatches = stays.some((stay) => {
      const checkIn = stringValue(stay.payload, "checkIn") ??
        stringValue(stay.payload, "firstNightDate");
      const explicitCity = stringValue(stay.payload, "city");
      const cityFits = Boolean(
        city && explicitCity && normalizeText(city) === normalizeText(explicitCity)
      );
      const dateFits = Boolean(
        arriveDate &&
          checkIn &&
          checkIn >= arriveDate &&
          (!leaveDate || checkIn < leaveDate)
      );
      return cityFits || dateFits;
    });
    const activityMatches = activities.some((activity) => {
      const activityCity = stringValue(activity.payload, "city");
      const date = stringValue(activity.payload, "date");
      return Boolean(
        city &&
          activityCity &&
          normalizeText(city) === normalizeText(activityCity) &&
          (!arriveDate || !date || (date >= arriveDate && (!leaveDate || date < leaveDate)))
      );
    });
    const hasTravelerPresence = stayMatches || activityMatches;
    const firstDate = stringValue(firstTransport?.payload ?? {}, "date") ??
      stringValue(firstTransport?.payload ?? {}, "departureDate");
    const lastDate = stringValue(lastTransport?.payload ?? {}, "date") ??
      stringValue(lastTransport?.payload ?? {}, "arrivalDate");
    const firstDepartureMatches = Boolean(
      city &&
        firstTransport &&
        locationsMatch(
          city,
          firstTransport.payload.departure ?? firstTransport.payload.departureLocation
        )
    );
    const firstArrivalMatches = Boolean(
      city &&
        firstTransport &&
        locationsMatch(
          city,
          firstTransport.payload.arrival ?? firstTransport.payload.arrivalLocation
        )
    );
    const lastArrivalMatches = Boolean(
      city &&
        lastTransport &&
        locationsMatch(
          city,
          lastTransport.payload.arrival ?? lastTransport.payload.arrivalLocation
        )
    );
    const lastTravelSaysHome = /\b(?:back home|flight home|fly home|home flight|return home)\b/.test(
      activityText(lastTransport?.payload ?? {})
    );
    const returnsToStartingCity = Boolean(
      city &&
        stringValue(places[0]?.payload ?? {}, "city") &&
        normalizeText(city) === normalizeText(
          stringValue(places[0]?.payload ?? {}, "city")
        )
    );
    const departureHome = Boolean(
      index === 0 &&
        !hasTravelerPresence &&
        firstTransport &&
        (!arriveDate || !firstDate || firstDate <= arriveDate) &&
        (firstDepartureMatches || !firstArrivalMatches)
    );
    const returnHome = Boolean(
      index === places.length - 1 &&
        !hasTravelerPresence &&
        lastTransport &&
        (!arriveDate || !lastDate || tripDatesMatch(arriveDate, lastDate)) &&
        (lastTravelSaysHome || (returnsToStartingCity && lastArrivalMatches))
    );
    const sameDayOnly = Boolean(
      arriveDate && leaveDate && leaveDate <= arriveDate && !stayMatches
    );

    if (departureHome || returnHome || sameDayOnly) {
      suppressCanonicalPiece(
        place,
        departureHome || returnHome
          ? "home departure or return is not an overnight trip leg"
          : "same-day destination is an activity, not an overnight trip leg"
      );
    }
  });
}

function routeUnbookedDayTripTransport(pieces: CanonicalEvidencePiece[]) {
  const places = pieces.filter(
    (piece) => piece.kind === "place" && piece.outputEligible
  );
  if (places.length === 0) return;
  const activities = pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  );

  for (const transport of pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  )) {
    const type = canonicalTransportType(stringValue(transport.payload, "type"));
    if (type !== "train" && type !== "bus" && type !== "ferry") continue;
    const text = activityText(transport.payload);
    const booked = Boolean(
      confirmationFrom(transport.payload) ||
        /\b(?:booked|booking|confirmation|paid|reservation|reserved|ticket|voucher)\b/.test(
          text
        )
    );
    if (booked) continue;

    const date = stringValue(transport.payload, "date");
    const departure = transport.payload.departure ?? transport.payload.departureLocation;
    const arrival = transport.payload.arrival ?? transport.payload.arrivalLocation;
    const departureLeg = places.find((place) => {
      const city = stringValue(place.payload, "city");
      const arrive = stringValue(place.payload, "arriveDate");
      const leave = stringValue(place.payload, "leaveDate");
      return Boolean(
        city &&
          locationsMatch(city, departure) &&
          (!date || !arrive || (date >= arrive && (!leave || date <= leave)))
      );
    });
    const arrivalLeg = places.find((place) => {
      const city = stringValue(place.payload, "city");
      const arrive = stringValue(place.payload, "arriveDate");
      return Boolean(
        city &&
          locationsMatch(city, arrival) &&
          (!date || !arrive || date === arrive || shiftIsoDate(date, 1) === arrive)
      );
    });
    const movesToOvernightLeg = Boolean(
      arrivalLeg && arrivalLeg !== departureLeg
    );
    if (movesToOvernightLeg) continue;

    const arrivalName = normalizedLocation(arrival);
    const matchingDayTrips = activities.filter((activity) =>
      Boolean(
        date &&
          stringValue(activity.payload, "date") === date &&
          arrivalName &&
          activityText(activity.payload).includes(arrivalName)
      )
    );
    if (matchingDayTrips.length === 1) {
      const target = matchingDayTrips[0];
      target.payload.description = uniqueDescription(
        target.payload.description,
        transport.payload.description ?? transport.payload.title
      );
      mergeCanonicalPieceInto({
        reason: "unbooked day-trip movement attached to the destination activity",
        source: transport,
        target,
      });
      continue;
    }

    convertCanonicalTransportToActivity(
      transport,
      "unbooked day-trip movement belongs in the activity timeline"
    );
  }
}

function finalizeCanonicalPlaceFields(pieces: CanonicalEvidencePiece[]) {
  const places = pieces
    .filter((piece) => piece.kind === "place" && piece.outputEligible)
    .sort((left, right) =>
      String(left.payload.arriveDate ?? left.payload.arrivalDate ?? "").localeCompare(
        String(right.payload.arriveDate ?? right.payload.arrivalDate ?? "")
      )
    );

  places.forEach((place, index) => {
    const arriveDate = stringValue(place.payload, "arriveDate") ??
      stringValue(place.payload, "arrivalDate");
    const leaveDate = stringValue(place.payload, "leaveDate") ??
      stringValue(place.payload, "departureDate");
    const nextArrival = stringValue(places[index + 1]?.payload ?? {}, "arriveDate") ??
      stringValue(places[index + 1]?.payload ?? {}, "arrivalDate");

    if (!leaveDate && arriveDate && nextArrival && nextArrival > arriveDate) {
      place.payload.leaveDate = nextArrival;
      addCanonicalAction(place, {
        absorbedTitles: [],
        observationIds: [...place.observationIds],
        reason: "next canonical leg arrival establishes the preceding leg boundary",
        type: "recovered",
      });
    }
  });
}

function applyCanonicalGuessedStayNames(
  details: unknown[],
  pieces: CanonicalEvidencePiece[]
) {
  const genericNameTokens = new Set([
    "accommodation",
    "airbnb",
    "apartment",
    "hostel",
    "hotel",
    "lodging",
    "rental",
    "stay",
    "the",
  ]);

  for (const value of details) {
    const detail = asRecord(value);
    const subjectType = normalizedComparable(detail.subjectType);
    const targetField = normalizedComparable(detail.targetField).replace(/\s+/g, "");
    const guessedName = stringValue(detail, "guessedValue");

    if (
      subjectType !== "stay" ||
      !/(?:name|title)/.test(targetField) ||
      !guessedName ||
      isGenericStayName(guessedName) ||
      isBooleanLikeStayName(guessedName)
    ) {
      continue;
    }

    const piece = pieceForMissingDetail(detail, pieces);
    if (
      !piece ||
      piece.kind !== "stay" ||
      !isGenericStayName(piece.payload.name)
    ) {
      continue;
    }

    const evidence = normalizeText(
      [detail.evidence, detail.reason, detail.prompt]
        .filter((candidate): candidate is string => typeof candidate === "string")
        .join(" ")
    );
    const distinctiveTokens = identityTokens(guessedName).filter(
      (token) => token.length >= 3 && !genericNameTokens.has(token)
    );

    if (
      distinctiveTokens.length === 0 ||
      !distinctiveTokens.every((token) => evidence.includes(token))
    ) {
      continue;
    }

    const originalName = stringValue(piece.payload, "name") ?? "Stay";
    piece.payload.name = guessedName;
    detail.relatedCanonicalPieceId = piece.id;
    addCanonicalAction(piece, {
      absorbedTitles: [originalName],
      observationIds: [...piece.observationIds],
      reason: "uniquely scoped source-backed lodging name resolved canonically",
      type: "recovered",
    });
  }
}

function applyCanonicalGuessedStayDates(
  details: unknown[],
  pieces: CanonicalEvidencePiece[],
  tripYear: number | null
) {
  for (const value of details) {
    const detail = asRecord(value);
    if (normalizedComparable(detail.subjectType) !== "stay") continue;

    const targetField = normalizedComparable(detail.targetField).replace(/\s+/g, "");
    const field = /(?:checkout|enddate)/.test(targetField)
      ? "checkOut"
      : /(?:checkin|firstnight|startdate)/.test(targetField)
        ? "checkIn"
        : null;
    const guessedDate = normalizeTripDate(
      stringValue(detail, "guessedValue"),
      tripYear
    );
    const piece = field ? pieceForMissingDetail(detail, pieces) : null;

    if (
      !field ||
      !guessedDate ||
      !piece ||
      piece.kind !== "stay" ||
      stringValue(piece.payload, field)
    ) {
      continue;
    }

    piece.payload[field] = guessedDate;
    piece.payload._canonicalProvisionalFields = Array.from(new Set([
      ...(Array.isArray(piece.payload._canonicalProvisionalFields)
        ? piece.payload._canonicalProvisionalFields.filter(
            (value): value is string => typeof value === "string"
          )
        : []),
      field,
    ]));
    detail.relatedCanonicalPieceId = piece.id;
    addCanonicalAction(piece, {
      absorbedTitles: [],
      observationIds: [...piece.observationIds],
      reason: `uniquely scoped provisional stay ${field} applied canonically`,
      type: "recovered",
    });
  }
}

function stayCity(
  stay: CanonicalEvidencePiece,
  places: CanonicalEvidencePiece[]
) {
  const explicitCity = stringValue(stay.payload, "city");
  if (explicitCity) return explicitCity;
  const checkIn =
    stringValue(stay.payload, "checkIn") ??
    stringValue(stay.payload, "firstNightDate");

  return places.find((place) => {
    const arriveDate =
      stringValue(place.payload, "arriveDate") ??
      stringValue(place.payload, "arrivalDate");
    const leaveDate =
      stringValue(place.payload, "leaveDate") ??
      stringValue(place.payload, "departureDate");
    return Boolean(
      checkIn &&
        arriveDate &&
        checkIn >= arriveDate &&
        (!leaveDate || checkIn < leaveDate)
    );
  })?.payload.city as string | undefined ?? null;
}

function genericStayTypeName(value: unknown) {
  const normalized = normalizedComparable(value);
  if (/\b(?:airbnb|apartment|flat|private rental|vacation rental|vrbo)\b/.test(normalized)) {
    return "Airbnb";
  }
  if (/\bhostel\b/.test(normalized)) return "Hostel";
  if (/\bhotel\b/.test(normalized)) return "Hotel";
  return "Stay";
}

function finalizeCanonicalStayFields(pieces: CanonicalEvidencePiece[]) {
  const places = pieces.filter(
    (piece) => piece.kind === "place" && piece.outputEligible
  );
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  const genericByCity = new Map<string, CanonicalEvidencePiece[]>();

  for (const stay of stays) {
    const rawName = stringValue(stay.payload, "name") ?? "Stay";
    const namedAirbnb = rawName.match(/^airbnb\s*\/\s*(.+)$/i)?.[1]?.trim();
    if (namedAirbnb) {
      stay.payload.name = namedAirbnb;
    }

    const name = stringValue(stay.payload, "name") ?? rawName;
    const city = stayCity(stay, places);
    if (city) stay.payload.city = city;
    const normalizedName = normalizeText(name);
    const normalizedCity = normalizeText(city);
    const cityTypeGeneric = Boolean(
      normalizedCity &&
        new RegExp(
          `^${normalizedCity} (?:accommodation|airbnb|apartment|hostel|hotel|lodging|rental|stay)$`
        ).test(normalizedName)
    );
    const generic =
      isGenericStayName(name) || isBooleanLikeStayName(name) || cityTypeGeneric;
    if (generic) {
      const key = normalizeText(city) || "unknown";
      genericByCity.set(key, [...(genericByCity.get(key) ?? []), stay]);
    }

    const nightsValue = stay.payload.nights;
    const nights =
      typeof nightsValue === "number"
        ? nightsValue
        : typeof nightsValue === "string"
          ? Number(nightsValue)
          : null;
    const checkIn =
      stringValue(stay.payload, "checkIn") ??
      stringValue(stay.payload, "firstNightDate");
    const checkOut = stringValue(stay.payload, "checkOut");
    if (!checkIn && checkOut && nights && nights > 0) {
      stay.payload.checkIn = shiftIsoDate(checkOut, -nights);
    } else if (checkIn) {
      stay.payload.checkIn = checkIn;
    }
    if (!checkOut && checkIn && nights && nights > 0) {
      stay.payload.checkOut = shiftIsoDate(checkIn, nights);
    }
  }

  for (const stay of stays) {
    const checkIn = stringValue(stay.payload, "checkIn") ??
      stringValue(stay.payload, "firstNightDate");
    if (!checkIn || stringValue(stay.payload, "checkOut")) continue;

    const matchingPlaces = places.filter((place) => {
      const arriveDate = stringValue(place.payload, "arriveDate") ??
        stringValue(place.payload, "arrivalDate");
      const leaveDate = stringValue(place.payload, "leaveDate") ??
        stringValue(place.payload, "departureDate");
      return Boolean(
        arriveDate &&
          leaveDate &&
          checkIn >= arriveDate &&
          checkIn < leaveDate
      );
    });
    const place = matchingPlaces.length === 1 ? matchingPlaces[0] : null;
    const placeCity = normalizeText(stringValue(place?.payload ?? {}, "city"));
    const compatibleStays = stays.filter((candidate) =>
      normalizeText(stayCity(candidate, places)) === placeCity
    );
    const leaveDate = stringValue(place?.payload ?? {}, "leaveDate") ??
      stringValue(place?.payload ?? {}, "departureDate");

    if (place && leaveDate && compatibleStays.length === 1) {
      stay.payload.checkOut = leaveDate;
      addCanonicalAction(stay, {
        absorbedTitles: [],
        observationIds: [...stay.observationIds],
        reason: "single canonical stay inherits its leg departure boundary",
        type: "recovered",
      });
    }
  }

  for (const group of genericByCity.values()) {
    for (const stay of group) {
      const city = stringValue(stay.payload, "city") ?? "Trip";
      const typeName = genericStayTypeName(stay.payload.name);
      const checkIn = stringValue(stay.payload, "checkIn");
      const checkOut = stringValue(stay.payload, "checkOut");
      stay.payload.name = group.length === 1
        ? `${city} ${typeName}`
        : `${city} ${typeName}${
            checkIn ? ` · ${checkIn}${checkOut ? `–${checkOut}` : ""}` : ""
          }`;
      addCanonicalAction(stay, {
        absorbedTitles: [],
        observationIds: [...stay.observationIds],
        reason: "canonical unnamed-stay naming policy applied",
        type: "recovered",
      });
    }
  }
}

function finalizeCanonicalOutputFields(pieces: CanonicalEvidencePiece[]) {
  for (const piece of pieces.filter((candidate) => candidate.outputEligible)) {
    if (piece.kind === "transport") {
      piece.payload.title =
        stringValue(piece.payload, "title") ??
        stringValue(piece.payload, "routeLabel") ??
        "Transport";
      piece.payload.date =
        stringValue(piece.payload, "date") ??
        stringValue(piece.payload, "departureDate") ??
        stringValue(piece.payload, "pickupDate") ??
        stringValue(piece.payload, "startDate");
      piece.payload.departure =
        stringValue(piece.payload, "departure") ??
        stringValue(piece.payload, "departureLocation") ??
        stringValue(piece.payload, "pickupLocation");
      piece.payload.arrival =
        stringValue(piece.payload, "arrival") ??
        stringValue(piece.payload, "arrivalLocation") ??
        stringValue(piece.payload, "dropOffLocation");
      piece.payload.departureTime =
        stringValue(piece.payload, "departureTime") ??
        stringValue(piece.payload, "startTime") ??
        stringValue(piece.payload, "time");
      piece.payload.arrivalTime =
        stringValue(piece.payload, "arrivalTime") ??
        stringValue(piece.payload, "endTime");
      piece.payload.confirmation =
        stringValue(piece.payload, "confirmation") ??
        stringValue(piece.payload, "confirmationLabel");
      piece.payload.description = canonicalTransportDescription(
        stringValue(piece.payload, "description")
      );
      piece.payload.type = canonicalTransportType(stringValue(piece.payload, "type"));
      continue;
    }

    if (piece.kind !== "activity" && piece.kind !== "note") continue;
    const title = stringValue(piece.payload, "title");
    const description = stringValue(piece.payload, "description");
    const itemType = piece.kind === "note"
      ? "note"
      : canonicalItemType({
          description,
          title,
          value: stringValue(piece.payload, "itemType"),
        });
    piece.payload.itemType = itemType;
    piece.payload.category = canonicalCategoryId({
      category: stringValue(piece.payload, "category"),
      description,
      itemType,
      title,
    });
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

function mergeCityNoteDescription(left: unknown, right: unknown) {
  const segments = [left, right]
    .filter((value): value is string => typeof value === "string")
    .flatMap((value) =>
      value
        .split(/(?:\r?\n)+|\s*;\s*|(?<=[.!?])\s+/)
        .map((segment) => segment.trim())
        .filter(Boolean)
    );
  const retained: string[] = [];

  for (const segment of segments) {
    const normalized = normalizeText(segment);
    if (!normalized) continue;
    const duplicateIndex = retained.findIndex((candidate) => {
      const existing = normalizeText(candidate);
      return (
        existing === normalized ||
        (existing.length >= 20 && normalized.includes(existing)) ||
        (normalized.length >= 20 && existing.includes(normalized))
      );
    });
    if (duplicateIndex === -1) {
      retained.push(segment);
      continue;
    }
    if (segment.length > retained[duplicateIndex].length) {
      retained[duplicateIndex] = segment;
    }
  }

  return retained.join("\n") || null;
}

function cityNoteCollectionDescription(notes: CanonicalEvidencePiece[]) {
  const labeledEntries = new Map<string, string[]>();
  let description: string | null = null;

  for (const note of notes) {
    const label = stringValue(note.payload, "_canonicalNoteCollectionLabel");
    const title = stringValue(note.payload, "title");
    if (note.payload._canonicalNoteEntry === true && label && title) {
      labeledEntries.set(label, [...(labeledEntries.get(label) ?? []), title]);
      continue;
    }
    description = mergeCityNoteDescription(
      description,
      note.payload.description ?? note.payload.title
    );
  }

  for (const [label, entries] of labeledEntries) {
    description = mergeCityNoteDescription(
      description,
      `${label}: ${entries.join(", ")}`
    );
  }

  return description;
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
    const first = group[0];
    const city =
      stringValue(first.payload, "city") ??
      places.find((place) =>
        normalizeText(
          [first.payload.title, first.payload.description].filter(Boolean).join(" ")
        ).includes(normalizeText(place.city))
      )?.city ??
      "City";
    const insertionIndex = Math.min(...group.map((note) => pieces.indexOf(note)));
    const target: CanonicalEvidencePiece = {
      actions: [],
      confidence: "high",
      conflicts: [],
      fieldSources: {},
      fieldWinnerRanks: {},
      id: `piece_${stableHash({ city, type: "canonical_city_note_collection" })}`,
      kind: "note",
      mergeReasons: ["canonical city-note collection"],
      observationIds: [],
      outputEligible: true,
      payload: {
        category: first.payload.category,
        city,
        date: null,
        description: cityNoteCollectionDescription(group),
        itemType: "note",
        title: `${city} Notes & Tips`,
      },
      role: "city_note_candidate",
    };
    pieces.splice(insertionIndex >= 0 ? insertionIndex : pieces.length, 0, target);

    for (const note of group) {
      mergeCanonicalPieceInto({
        preserveTargetIdentity: true,
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
    const requestedAnchor = candidatePiece(decision.parentCandidateId);
    const candidatePieces = decision.candidateIds.map(candidatePiece);

    if (
      !decision.decisionId ||
      decision.source !== "canonical_resolver" ||
      !requestedAnchor ||
      requestedAnchor.kind !== "activity" ||
      !requestedAnchor.outputEligible ||
      candidatePieces.some((piece) => !piece)
    ) {
      continue;
    }

    const sourcePieces = Array.from(
      new Set(
        candidatePieces.filter(
          (piece): piece is CanonicalEvidencePiece =>
            Boolean(piece && piece.outputEligible)
        )
      )
    );

    if (
      sourcePieces.length < 2 ||
      sourcePieces.some(
        (child) =>
          child.kind !== "activity" ||
          !sameCanonicalDate(requestedAnchor.payload, child.payload)
      )
    ) {
      continue;
    }

    const fixedPieces = sourcePieces.filter((piece) =>
      Boolean(
        timeFrom(piece.payload) ||
          confirmationFrom(piece.payload) ||
          /\b(?:booked|paid|reservation|reserved|ticketed|timed|voucher)\b/.test(
            activityText(piece.payload)
        )
      )
    );
    const explicitContainer = decision.containerCandidateId
      ? candidatePiece(decision.containerCandidateId)
      : null;
    const requestedAnchorCoversVisit = Boolean(
      !explicitContainer &&
        sourcePieces.includes(requestedAnchor) &&
        (/\b(?:same[ -]?site|complex|grounds|campus|estate|one .{0,24} visit|covers? the visit)\b/i.test(
          `${decision.claim} ${activityText(requestedAnchor.payload)}`
        ) ||
          (/\b(?:walk|walking tour|walking route|neighbou?rhood route)\b/i.test(
            activityText(requestedAnchor.payload)
          ) && /\b(?:walk|route|tour)\b/i.test(decision.claim))
        )
    );
    const promotedParent = requestedAnchorCoversVisit ? requestedAnchor : null;
    const independentFixedPieces = fixedPieces.filter(
      (piece) => piece !== promotedParent
    );
    const groupedChildPieces = sourcePieces.filter(
      (piece) =>
        piece !== explicitContainer &&
        piece !== promotedParent &&
        !independentFixedPieces.includes(piece)
    );
    const meaningfulStopCount = groupedChildPieces.filter((piece) =>
      !/^(?:breakfast|brunch|coffee|dinner|lunch|meal)(?:\s+break|\s+nearby)?$/i.test(
        stringValue(piece.payload, "title") ?? ""
      )
    ).length;

    const minimumStopCount = explicitContainer || promotedParent ? 1 : 2;

    if (
      groupedChildPieces.length < minimumStopCount ||
      meaningfulStopCount < minimumStopCount
    ) {
      continue;
    }

    const parent = explicitContainer ?? promotedParent ?? {
      actions: [],
      confidence: "high" as const,
      conflicts: [],
      fieldSources: {},
      fieldWinnerRanks: {},
      id: `piece_${stableHash({
        decisionId: decision.decisionId,
        type: "canonical_group",
      })}`,
      kind: "activity" as const,
      mergeReasons: ["canonical grouping container"],
      observationIds: [],
      outputEligible: true,
      payload: {},
      role: "grouping_proposal" as const,
    };

    if (!explicitContainer && !promotedParent) {
      const insertionIndex = Math.min(
        ...groupedChildPieces.map((piece) => pieces.indexOf(piece))
      );
      pieces.splice(
        insertionIndex >= 0 ? insertionIndex : pieces.length,
        0,
        parent
      );
    }

    parent.kind = "activity";
    parent.outputEligible = true;
    parent.role = "grouping_proposal";
    const sourceParentTitle = stringValue(parent.payload, "title");
    const restrainedSourceParentTitle =
      sourceParentTitle &&
      !/\b(?:cluster|collection|group|highlights|sights|attractions)\b/i.test(
        sourceParentTitle
      )
        ? sourceParentTitle
        : null;
    parent.payload = {
      ...parent.payload,
      category: requestedAnchor.payload.category,
      city: requestedAnchor.payload.city,
      date: requestedAnchor.payload.date,
      itemType: "activity",
      title:
        restrainedSourceParentTitle ||
        decision.parentTitle ||
        sourceParentTitle ||
        stringValue(requestedAnchor.payload, "title") ||
        "Grouped visit",
      _canonicalGroupDecisionId: decision.decisionId,
      _canonicalGroupRole: "parent",
      _canonicalGroupStopCount: groupedChildPieces.length,
    };

    const childTitles = groupedChildPieces
      .map((piece) => stringValue(piece.payload, "title"))
      .filter((title): title is string => Boolean(title));
    addCanonicalAction(parent, {
      absorbedTitles: childTitles,
      decisionId: decision.decisionId,
      observationIds: groupedChildPieces.flatMap((piece) => piece.observationIds),
      reason: `canonical resolver decision: ${decision.claim}`,
      type: "grouped",
    });

    groupedChildPieces.forEach((child, index) => {
      child.payload._canonicalGroupDecisionId = decision.decisionId;
      child.payload._canonicalGroupOrder = index;
      child.payload._canonicalGroupRole = "child";
      child.payload._canonicalParentPieceId = parent.id;
      addCanonicalAction(child, {
        absorbedTitles: [],
        decisionId: decision.decisionId,
        observationIds: [...child.observationIds],
        reason: `parented without flattening: ${decision.claim}`,
        type: "grouped",
      });
    });
  }
}

function suppressIsolatedUntimedGenericMeals(pieces: CanonicalEvidencePiece[]) {
  for (const piece of pieces) {
    if (
      !piece.outputEligible ||
      (piece.kind !== "activity" && piece.kind !== "note") ||
      piece.payload._canonicalGroupRole === "child" ||
      timeFrom(piece.payload) ||
      confirmationFrom(piece.payload) ||
      !/^(?:breakfast|brunch|coffee|dinner|lunch|meal)$/i.test(
        stringValue(piece.payload, "title") ?? ""
      )
    ) {
      continue;
    }

    suppressCanonicalPiece(
      piece,
      "isolated untimed generic meal has no traveler-meaningful venue or valid group context"
    );
  }
}

function suppressUnresolvedIsolatedTerms({
  observations,
  pieces,
}: {
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );

  for (const piece of pieces) {
    if (!piece.outputEligible || (piece.kind !== "activity" && piece.kind !== "note")) {
      continue;
    }
    if (
      piece.payload._canonicalGroupRole === "parent" ||
      piece.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    const title = stringValue(piece.payload, "title");
    const sourceObservations = piece.observationIds
      .map((id) => observationById.get(id))
      .filter((value): value is EvidenceObservation => Boolean(value));
    const unknownStructure =
      sourceObservations.length > 0 &&
      sourceObservations.every(
        (observation) => observation.sourceStructure.sectionType === "unknown"
      );
    if (
      !title ||
      title.split(/\s+/).length > 3 ||
      stringValue(piece.payload, "description") ||
      stringValue(piece.payload, "date") ||
      stringValue(piece.payload, "city") ||
      timeFrom(piece.payload) ||
      confirmationFrom(piece.payload) ||
      !unknownStructure
    ) {
      continue;
    }

    suppressCanonicalPiece(
      piece,
      "needs_identity_enrichment: isolated term has no source-supported planning context"
    );
  }
}

function createCanonicalGroupingCalls(
  decisions: CanonicalGroupingDecision[],
  pieces: CanonicalEvidencePiece[]
) {
  const calls: Array<Record<string, unknown>> = [];
  for (const decision of decisions) {
    if (decision.callRequired === false) continue;

    const parent = pieces.find(
      (piece) =>
        piece.outputEligible &&
        piece.payload._canonicalGroupRole === "parent" &&
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
      _canonicalReviewDisposition: "call",
      answerType: "confirm",
      assemblySource: "canonical_evidence",
      confidence: "high",
      evidence: decision.claim,
      guessedValue: stringValue(parent.payload, "title"),
      prompt: `We made ${
        stringValue(parent.payload, "title") ?? "this route"
      } one activity card with ${childTitles.length} included stop${
        childTitles.length === 1 ? "" : "s"
      }.`,
      reason:
        "Source structure supports one visit, so the traveler app keeps one card with visible included stops.",
      resolverDecisionId: decision.decisionId,
      relatedCanonicalPieceId: parent.id,
      relatedTitle: stringValue(parent.payload, "title"),
      subjectType: "item",
      targetField: "presentation",
    });
  }

  return calls;
}

function applyExplicitSourceUpdates(pieces: CanonicalEvidencePiece[]) {
  for (const piece of pieces) {
    if (!piece.outputEligible) continue;
    const text = [
      stringValue(piece.payload, "title"),
      stringValue(piece.payload, "description"),
      stringValue(piece.payload, "status"),
      stringValue(piece.payload, "notes"),
    ].filter(Boolean).join(" ");
    const cancellation = /\b(?:cancelled|canceled|do not use|no longer going|will not happen)\b/i.test(
      text
    );
    const replacement = /\b(?:instead|new (?:date|provider|time|venue)|replaced by|replacement|rescheduled|revised|updated)\b/i.test(
      text
    );

    if (cancellation && !replacement) {
      const reason = "explicit source cancellation supersedes the earlier itinerary record";
      piece.outputEligible = false;
      piece.mergeReasons = Array.from(new Set([...piece.mergeReasons, reason]));
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason,
        type: "cancelled",
      });
      continue;
    }

    if (replacement) {
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason: "explicit source update supersedes earlier itinerary details",
        type: "superseded",
      });
    }
  }
}

function createCanonicalSourceUpdateCalls(pieces: CanonicalEvidencePiece[]) {
  return pieces.flatMap((piece) => {
    const cancellation = piece.actions.find((action) => action.type === "cancelled");
    const replacement = piece.actions.find((action) => action.type === "superseded");
    const title =
      stringValue(piece.payload, "title") ??
      stringValue(piece.payload, "name") ??
      "an itinerary item";
    const action = cancellation ?? replacement;
    if (!action) return [];

    return [{
      _canonicalReviewDisposition: "call",
      answerOptions: [],
      answerType: "confirm",
      assemblySource: "canonical_evidence",
      confidence: "high",
      evidence: action.reason,
      guessedValue: null,
      prompt: cancellation
        ? `We left out ${title} because a later source notice says it was cancelled.`
        : `We used the updated source details for ${title}.`,
      reason: cancellation
        ? "An explicit cancellation supersedes the earlier itinerary record."
        : "An explicit source update supersedes the earlier version.",
      relatedCanonicalPieceId: piece.id,
      relatedTitle: title,
      subjectType: piece.kind === "activity" ? "item" : piece.kind,
      targetField: "source_update",
    }];
  });
}

function createCanonicalConflictQuestions(pieces: CanonicalEvidencePiece[]) {
  return pieces.flatMap((piece) => {
    if (!piece.outputEligible) {
      return [];
    }

    const materialFields =
      piece.kind === "activity"
        ? new Set(["date", "endTime", "startTime"])
        : piece.kind === "stay"
          ? new Set(["checkIn", "checkOut", "name"])
          : piece.kind === "transport"
            ? new Set([
                "arrival",
                "arrivalTime",
                "date",
                "departure",
                "departureTime",
              ])
            : piece.kind === "place"
              ? new Set(["arriveDate", "city", "leaveDate"])
              : new Set<string>();
    const conflict = piece.conflicts.find(
      (candidate) =>
        candidate.requiresReview &&
        materialFields.has(candidate.field) &&
        candidate.values.length > 1
    );

    if (!conflict) {
      return [];
    }

    const title =
      stringValue(piece.payload, "title") ??
      stringValue(piece.payload, "name") ??
      stringValue(piece.payload, "city") ??
      `this ${piece.kind}`;
    const subjectType =
      piece.kind === "activity" ? "item" :
        piece.kind === "place" ? "leg" : piece.kind;

    const dateOptions = conflict.field.toLowerCase().includes("date") &&
      conflict.values.length >= 2 &&
      conflict.values.length <= 3 &&
      conflict.values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      ? conflict.values.map((value) => ({ label: value, value }))
      : [];

    return [{
      _canonicalReviewDisposition: "question",
      answerOptions: dateOptions,
      answerType: dateOptions.length > 0
        ? "single_choice"
        : conflict.field.toLowerCase().includes("date")
          ? "date"
          : "text",
      confidence: "medium",
      evidence: `Equally authoritative source evidence gives ${conflict.values.join(" and ")} for ${title}.`,
      guessedValue: stringValue(piece.payload, conflict.field),
      prompt: `Which ${conflict.field} should Roamwoven use for ${title}?`,
      reason:
        "Equally authoritative source evidence conflicts, so Roamwoven preserved one canonical record and needs one material decision.",
      relatedCanonicalPieceId: piece.id,
      relatedTitle: title,
      subjectType,
      targetField: conflict.field,
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

  // Concrete traveler intent outranks loose surrounding prose only when the
  // canonical resolver has not already made the role decision.
  if (hasIndependentActivityAnchor(payload)) {
    return "activity";
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

function enforceCanonicalOutputActivityRoles(
  pieces: CanonicalEvidencePiece[]
) {
  for (const piece of pieces) {
    if (!piece.outputEligible || (piece.kind !== "activity" && piece.kind !== "note")) {
      continue;
    }
    if (
      piece.payload._canonicalGroupRole === "parent" ||
      piece.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    const classification = classifyDraftActivityCard(activityInput(piece.payload));

    if (classification.isOverviewActivity) {
      suppressCanonicalPiece(
        piece,
        "generic day overview is source context, not a traveler card"
      );
      continue;
    }

    if (piece.kind === "activity" && activityKind(piece.payload) === "note") {
      piece.kind = "note";
      piece.payload.itemType = "note";
      piece.payload.date = null;
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason: "canonical activity policy routed a loose reference to city notes",
        type: "recovered",
      });
    }
  }
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
}: Omit<EvidenceObservation, "disposition" | "id">): EvidenceObservation {
  const id = `obs_${stableHash({
    kind,
    payload,
    role,
    source,
    sourceFilename,
    sourceLabel,
    sourceProvenance,
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

function looksLikeUnresolvedIsolatedPublicTerm(
  observation: EvidenceObservation
) {
  const title = stringValue(observation.payload, "title");
  const description = stringValue(observation.payload, "description");

  return Boolean(
    title &&
      !description &&
      !stringValue(observation.payload, "date") &&
      !stringValue(observation.payload, "city") &&
      title.split(/\s+/).length <= 3 &&
      observation.sourceStructure.sectionType === "unknown"
  );
}

function assignCanonicalEvidenceDispositions({
  observations,
  pieces,
}: {
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  for (const observation of observations) {
    const owners = pieces.filter((piece) =>
      piece.observationIds.includes(observation.id)
    );
    const owner =
      owners.find((piece) => piece.outputEligible) ??
      owners.sort(
        (left, right) =>
          right.observationIds.length - left.observationIds.length ||
          left.id.localeCompare(right.id)
      )[0] ??
      null;
    const action = owner?.actions
      .filter((candidate) => candidate.observationIds.includes(observation.id))
      .at(-1);
    const groupedChild = Boolean(
      owner?.outputEligible && owner.payload._canonicalGroupRole === "child"
    );
    const attachedDetail = Boolean(
      observation.role === "accessory_detail" && owner?.outputEligible
    );
    const unresolvedIdentity = Boolean(
      !owner?.outputEligible && looksLikeUnresolvedIsolatedPublicTerm(observation)
    );
    const sourceContext =
      observation.kind === "context" ||
      observation.role === "context" ||
      observation.role === "grouping_proposal";
    const weakSourceAnchor = Boolean(
      observation.source === "source_anchor" && !owner?.outputEligible
    );
    const rejected = observation.role === "rejected";
    const cancelled = owner?.actions.some(
      (candidate) =>
        candidate.type === "cancelled" &&
        candidate.observationIds.includes(observation.id)
    );
    const superseded = owner?.actions.some(
      (candidate) =>
        candidate.type === "superseded" &&
        candidate.observationIds.includes(observation.id)
    );
    const mergedAway = Boolean(
      !owner?.outputEligible &&
      owners.some((piece) =>
        piece.actions.some(
          (candidate) =>
            candidate.type === "rejected" &&
            candidate.observationIds.includes(observation.id)
        )
      )
    );

    observation.disposition = owner?.outputEligible
      ? {
          canonicalPieceId: owner.id,
          outcome: attachedDetail ? "declared_detail" : "canonical_entity",
          reason:
            action?.reason ??
            (groupedChild
              ? "Preserved as an ordered child of a canonical group."
              : attachedDetail
                ? "Attached to its owning canonical entity."
                : "Preserved as a canonical traveler entity."),
          reasonCode: groupedChild
            ? "grouped_child"
            : attachedDetail
              ? "attached_detail"
              : "canonical_entity",
        }
      : {
          canonicalPieceId: owner?.id ?? null,
          outcome: "evidence_only",
          reason:
            action?.reason ??
            (unresolvedIdentity
              ? "Retained for future identity enrichment; assembly did not invent traveler intent."
              : weakSourceAnchor
                ? "A weak source anchor could not manufacture a traveler record."
                : sourceContext
                  ? "Retained as source context rather than an additional traveler card."
                  : rejected
                    ? "Rejected by canonical evidence policy."
                    : "Retained in lineage after canonical deduplication."),
          reasonCode: cancelled
            ? "cancelled"
            : superseded
              ? "superseded"
              : unresolvedIdentity
            ? "needs_identity_enrichment"
            : weakSourceAnchor
              ? "weak_source_anchor"
              : sourceContext
                ? "source_context"
                : rejected
                  ? "rejected"
                  : mergedAway
                    ? "superseded_or_duplicate"
                    : "superseded_or_duplicate",
        };
  }
}

function pushUniqueObservation(
  observations: EvidenceObservation[],
  observation: EvidenceObservation
) {
  if (!observations.some((candidate) => candidate.id === observation.id)) {
    observations.push(observation);
  }
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

export function reapplyCanonicalOutputInvariants({
  pieces: inputPieces,
  tripYear = null,
}: {
  pieces: CanonicalEvidencePiece[];
  tripYear?: number | null;
}) {
  const pieces = structuredClone(inputPieces);
  const before = JSON.stringify(pieces);

  enforceCanonicalOutputActivityRoles(pieces);
  suppressRepresentedTravelAndStayActivities(pieces);
  routeCanonicalAccessoryEvidence({
    actions: {
      addAction: addCanonicalAction,
      mergePiece: mergeCanonicalPieceInto,
      suppressPiece: suppressCanonicalPiece,
    },
    pieces,
    tripYear,
  });
  finalizeCanonicalOutputFields(pieces);

  return {
    changed: JSON.stringify(pieces) !== before,
    pieces,
  };
}

function reviewDetailText(detail: Record<string, unknown>) {
  return [
    detail.prompt,
    detail.reason,
    detail.evidence,
    detail.guessedValue,
    detail.relatedTitle,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function bookingIdentityTokens(value: string) {
  return Array.from(
    value.matchAll(
      /\b(?:booking|confirmation|pnr|record locator|reservation)(?:\s+(?:code|id|number|reference))?\s*[:#-]?\s*([a-z0-9][a-z0-9-]{3,})\b/gi
    ),
    (match) => normalizeText(match[1]).replace(/\s+/g, "")
  );
}

function pieceForMissingDetail(
  detail: Record<string, unknown>,
  pieces: CanonicalEvidencePiece[]
) {
  const relatedCanonicalPieceId = stringValue(detail, "relatedCanonicalPieceId");
  if (relatedCanonicalPieceId) {
    const canonicalMatch = pieces.find(
      (piece) => piece.outputEligible && piece.id === relatedCanonicalPieceId
    );
    if (canonicalMatch) return canonicalMatch;
  }

  const detailText = reviewDetailText(detail);
  const normalizedDetailText = normalizeText(detailText);
  const detailBookingTokens = bookingIdentityTokens(detailText);
  if (detailBookingTokens.length > 0) {
    const bookingMatches = pieces.filter((piece) => {
      if (!piece.outputEligible) return false;
      const pieceText = [
        piece.payload.confirmation,
        piece.payload.confirmationLabel,
        piece.payload.description,
        piece.payload.reservation,
        piece.payload.reservationNumber,
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ");
      const pieceTokens = new Set([
        ...bookingIdentityTokens(pieceText),
        ...[confirmationFrom(piece.payload)]
          .filter((value): value is string => Boolean(value))
          .map((value) => normalizeText(value).replace(/\s+/g, "")),
      ]);
      return detailBookingTokens.some((token) => pieceTokens.has(token));
    });
    if (bookingMatches.length === 1) return bookingMatches[0];
  }

  const addressMatches = pieces.filter((piece) => {
    if (!piece.outputEligible) return false;
    const address = normalizeText(stringValue(piece.payload, "address"));
    return Boolean(address.length >= 8 && normalizedDetailText.includes(address));
  });
  if (addressMatches.length === 1) return addressMatches[0];

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
        (piece) =>
          piece.outputEligible &&
          (!expectedKind ||
            piece.kind === expectedKind ||
            (expectedKind === "transport" &&
              piece.kind === "activity" &&
              isRentalPickup(piece.payload)))
      )
      .map((piece) => ({
        overlap: overlapCount(
          relatedTitle,
          identityTokens(
            [piece.payload.title, piece.payload.name, piece.payload.description]
              .filter(Boolean)
              .join(" ")
          )
        ),
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
    const relatedDate = normalizeTripDate(relatedTitle, null);
    const nonEntityTitle = Boolean(
      relatedTitle &&
      ((relatedDate &&
        /^(?:\d{1,2}[.]\d{1,2}[.]\d{4}|(?:19|20)\d{2}-\d{1,2}-\d{1,2})(?:\s+(?:details?|information|note|notes))?$/i.test(
          relatedTitle.trim()
        )) || /^(?:booking|details?|information|note|notes|reservation)$/i.test(
          relatedTitle.trim()
        ))
    );

    if (
      !relatedTitle ||
      nonEntityTitle ||
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
          "This named source item needs placement review.",
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
    const existingPiece = pieces.find(
      (candidate) =>
        candidate.kind === piece.kind &&
        candidate.observationIds.includes(observation.id)
    );

    if (existingPiece) {
      detail.relatedCanonicalPieceId = existingPiece.id;
      continue;
    }

    addCanonicalAction(piece, {
      absorbedTitles: [relatedTitle],
      observationIds: [observation.id],
      reason:
        "Named source evidence had no surviving canonical target, so Roamwoven preserved a review-required card.",
      type: "recovered",
    });
    detail.relatedCanonicalPieceId = piece.id;
    pushUniqueObservation(observations, observation);
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
  const hasCanonicalTripDate = pieces.some((piece) =>
    piece.outputEligible &&
    [
      piece.payload.date,
      piece.payload.arriveDate,
      piece.payload.arrivalDate,
      piece.payload.checkIn,
      piece.payload.departureDate,
    ].some(
      (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    )
  );

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
    if (
      normalizedComparable(detail.confidence) === "high" &&
      /\b(?:no maker decision|routine assembly|routine stay context)\b/.test(
        questionText
      )
    ) {
      return false;
    }
    const subjectType = normalizedComparable(detail.subjectType);
    const targetField = normalizedComparable(detail.targetField).replace(/\s+/g, "");
    const relatedTitle = stringValue(detail, "relatedTitle");
    const relatedDate = normalizeTripDate(relatedTitle, tripYear);

    if (
      relatedTitle &&
      ((relatedDate &&
        /^(?:\d{1,2}[.]\d{1,2}[.]\d{4}|(?:19|20)\d{2}-\d{1,2}-\d{1,2})(?:\s+(?:details?|information|note|notes))?$/i.test(
          relatedTitle.trim()
        )) ||
        /^(?:booking|details?|information|note|notes|reservation)$/i.test(
          relatedTitle.trim()
        ))
    ) {
      return false;
    }

    if (stringValue(detail, "_canonicalReviewDisposition") === "call") {
      return true;
    }

    if (
      (subjectType === "day" || subjectType === "item") &&
      /^(?:itemtype|keep|presentation|visibility)$/.test(targetField) &&
      !stringValue(detail, "resolverDecisionId") &&
      stringValue(detail, "_canonicalReviewDisposition") !== "call"
    ) {
      return false;
    }

    if (subjectType === "stay" && /(?:name|title|lodging|booking)/.test(targetField)) {
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
      (overview.dateRange ||
        overview.startDate ||
        overview.endDate ||
        (normalizedComparable(detail.confidence) === "high" && hasCanonicalTripDate))
    ) {
      return false;
    }

    if (
      (subjectType === "stay" || subjectType === "trip") &&
      /(?:privacy|sensitive|visibility)/.test(targetField)
    ) {
      return false;
    }

    if (
      subjectType === "transport" &&
      /(?:operator|provider)/.test(targetField)
    ) {
      return false;
    }

    if (subjectType === "stay" && /night/.test(targetField)) {
      const guessedNights = Number(
        /\b(\d{1,2})\s*nights?\b/i.exec(
          stringValue(detail, "guessedValue") ?? ""
        )?.[1]
      );
      const matchingStays = pieces.filter((candidate) => {
        if (!candidate.outputEligible || candidate.kind !== "stay") return false;
        const nightsValue = candidate.payload.nights;
        const nights = typeof nightsValue === "number"
          ? nightsValue
          : typeof nightsValue === "string"
            ? Number(nightsValue)
            : Number.NaN;
        return Number.isFinite(guessedNights) && nights === guessedNights;
      });

      if (matchingStays.length === 1) {
        return false;
      }
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

    if (
      subjectType === "item" &&
      targetField === "description" &&
      piece.kind === "activity"
    ) {
      const detailText = normalizeText(reviewDetailText(detail));
      const pieceText = activityText(piece.payload);
      if (
        /\b(?:bag drop|drop bags?|check in|check-in)\b/.test(detailText) &&
        /\b(?:bag drop|drop bags?|check in|check-in)\b/.test(pieceText)
      ) {
        return false;
      }
    }

    if (
      subjectType === "transport" &&
      piece.kind === "activity" &&
      isRentalPickup(piece.payload) &&
      /(?:address|arrival|departure|location|pickup)/.test(targetField) &&
      piece.payload.address
    ) {
      return false;
    }

    if (
      subjectType === "item" &&
      /^(?:address|name|title)$/.test(targetField) &&
      piece.kind === "activity" &&
      !isGenericTitle(piece.payload.title)
    ) {
      if (stringValue(detail, "_canonicalQuestionKind") === "alternative_slot") {
        return true;
      }
      return false;
    }

    const payload = piece.payload;
    const conflictedFields = new Set(
      piece.conflicts
        .filter((conflict) => conflict.requiresReview)
        .map((conflict) => normalizeText(conflict.field).replace(/\s+/g, ""))
    );

    if (conflictedFields.has(targetField)) {
      return true;
    }

    if (
      /(?:placement|date)/.test(targetField) &&
      Array.isArray(payload._canonicalProvisionalFields) &&
      payload._canonicalProvisionalFields.includes("date")
    ) {
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
      subjectType === "transport" &&
      ((/^(?:arrival|arrivallocation|destination|dropoff|dropofflocation)$/.test(targetField) &&
        (payload.arrival || payload.arrivalLocation || payload.dropOffLocation)) ||
        (/^(?:departure|departurelocation|origin|pickup|pickuplocation)$/.test(targetField) &&
          (payload.departure || payload.departureLocation || payload.pickupLocation)))
    ) {
      return false;
    }

    if (
      subjectType === "stay" &&
      piece.kind === "stay" &&
      /(?:checkin|checkout|date|night|placement)/.test(targetField) &&
      (payload.checkIn || payload.firstNightDate) &&
      payload.checkOut
    ) {
      const provisionalFields = new Set(
        Array.isArray(payload._canonicalProvisionalFields)
          ? payload._canonicalProvisionalFields.filter(
              (value): value is string => typeof value === "string"
            )
          : []
      );
      return /(?:checkout|enddate)/.test(targetField)
        ? provisionalFields.has("checkOut")
        : provisionalFields.has("checkIn");
    }

    if (/(?:placement|date)/.test(targetField) && payload.date) {
      return false;
    }

    if (/(?:city|leg)/.test(targetField) && payload.city) {
      return false;
    }

    if (targetField === "address" && payload.address) {
      return false;
    }

    if (
      stringValue(detail, "answerType") === "single_choice" &&
      Array.isArray(detail.answerOptions) &&
      detail.answerOptions.length >= 2
    ) {
      return true;
    }

    return true;
  });
}

function sourceLineMatchesActivityTitle(line: string, title: string) {
  const normalizedLine = normalizeText(line);
  const normalizedTitle = normalizeText(title);

  if (!normalizedLine || !normalizedTitle) return false;
  if (normalizedLine.includes(normalizedTitle)) return true;

  const titleTokens = identityTokens(title);
  const lineTokens = new Set(identityTokens(line));
  return titleTokens.length > 0 && titleTokens.every((token) => lineTokens.has(token));
}

function explicitCityNoteEntries(payload: Record<string, unknown>) {
  const description = stringValue(payload, "description");
  if (!description) return null;

  const labeled = /^([^:\n]{2,35}):\s*([\s\S]+)$/.exec(description.trim());
  const collectionLabel = labeled?.[1]?.trim() ?? null;
  const body = labeled?.[2] ?? description;
  const entries = body
    .split(labeled ? /\s*,\s*|\s+\/\s+|\s*;\s*/ : /\r?\n|\s*;\s*/)
    .map((entry) => entry.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  const looksLikeStructuredNames =
    entries.length >= 2 &&
    entries.length <= 20 &&
    entries.every(
      (entry) =>
        entry.length <= 80 &&
        entry.split(/\s+/).length <= 7 &&
        !/[.!?]$/.test(entry) &&
        !/\b(?:built|founded|known for|located|opened|serves|speciali[sz]es|traditional|would recommend)\b/i.test(
          entry
        )
    );

  return looksLikeStructuredNames ? { collectionLabel, entries } : null;
}

function sourceDecisionObservations({
  stageInput,
  startingOrdinal,
}: {
  stageInput: EvidenceStageInput;
  startingOrdinal: number;
}) {
  const sourceLines = (stageInput.sourceText ?? "").split(/\r?\n/);
  const todoLines = sourceLines
    .map((line, index) => ({ index, line: line.trim() }))
    .filter(
      ({ line }) =>
        line.length > 0 &&
        /\b(?:which ticket|ticket to get|choose (?:a |the |which )?ticket|need to decide.{0,30}ticket|still need to.{0,30}ticket|ticket.{0,20}tbd)\b/i.test(
          line
        )
    );
  const activities = asArray(asRecord(stageInput.stage).activities).map(asRecord);
  const observations: EvidenceObservation[] = [];
  let ordinal = startingOrdinal;

  for (const todo of todoLines) {
    const ranked = activities
      .flatMap((activity, activityIndex) => {
        const title = stringValue(activity, "title");
        if (!title) return [];
        const titleLines = sourceLines
          .map((line, lineIndex) =>
            sourceLineMatchesActivityTitle(line, title) ? lineIndex : null
          )
          .filter((lineIndex): lineIndex is number => lineIndex !== null);
        const distance = Math.min(
          ...titleLines.map((lineIndex) => Math.abs(lineIndex - todo.index))
        );

        return Number.isFinite(distance) && distance <= 4
          ? [{ activity, activityIndex, distance, title }]
          : [];
      })
      .sort(
        (left, right) =>
          left.distance - right.distance || left.activityIndex - right.activityIndex
      );

    if (!ranked[0] || ranked[1]?.distance === ranked[0].distance) continue;

    const target = ranked[0];
    ordinal += 1;
    observations.push(
      createObservation({
        kind: "decision",
        ordinal,
        payload: {
          decisionType: "ticket_choice",
          relatedResolverCandidateId: stringValue(
            target.activity,
            "_resolverCandidateId"
          ),
          relatedTitle: target.title,
          sourceText: todo.line,
          targetField: "description",
          title: `Decision for ${target.title}`,
        },
        role: "accessory_detail",
        source: stageInput.source,
        sourceFilename: stageInput.sourceFilename ?? null,
        sourceLabel: stageInput.label,
        sourceProvenance: stageInput.sourceProvenance ?? null,
        sourceStructure: sourceStructureFromPayload(target.activity),
        sourceUploadId: stageInput.sourceUploadId ?? null,
      })
    );
  }

  return { observations, ordinal };
}

function attachCanonicalSourceDecisions(pieces: CanonicalEvidencePiece[]) {
  for (const decision of pieces.filter((piece) => piece.kind === "decision")) {
    const relatedCandidateId = stringValue(
      decision.payload,
      "relatedResolverCandidateId"
    );
    const relatedTitle = normalizeText(stringValue(decision.payload, "relatedTitle"));
    const candidates = pieces.filter(
      (piece) =>
        piece.kind === "activity" &&
        piece.outputEligible &&
        (relatedCandidateId
          ? stringValue(piece.payload, "_resolverCandidateId") === relatedCandidateId
          : normalizeText(stringValue(piece.payload, "title")) === relatedTitle)
    );

    if (candidates.length !== 1) continue;

    const target = candidates[0];
    const sourceText = stringValue(decision.payload, "sourceText");
    if (!sourceText) continue;
    const nextDecision: CanonicalSourceDecision = {
      decisionType: "ticket_choice",
      sourceText,
      targetField: "description",
    };
    target.payload._canonicalSourceDecisions = [
      ...canonicalSourceDecisions(target.payload),
      nextDecision,
    ];
    mergeCanonicalPieceInto({
      reason: "typed source decision attached to its canonical activity",
      source: decision,
      target,
    });
  }
}

function hasCanonicalExplicitTodo(payload: Record<string, unknown>) {
  if (canonicalSourceDecisions(payload).length > 0) return true;
  const text = [stringValue(payload, "title"), stringValue(payload, "description")]
    .filter(Boolean)
    .join(" ");

  return /\b(need to decide|needs? to decide|still need to|to be decided|to decide|pick a time|choose (?:a |the |which )?(?:ticket|time|tour|option)|which ticket|book this|book later|reserve later|confirm later|decide later|not booked yet|ticket to get)\b/i.test(
    text
  ) || (/\btbd\b/i.test(text) && /\b(ticket|time|book|booking|reserve|reservation|option|tour)\b/i.test(text));
}

function tripDateBounds(pieces: CanonicalEvidencePiece[]) {
  const dates = pieces
    .filter(
      (piece) =>
        piece.outputEligible &&
        (piece.kind === "place" || piece.kind === "stay" || piece.kind === "transport")
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
        piece.payload.date,
      ].filter(
        (value): value is string =>
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      )
    )
    .sort();

  return { max: dates.at(-1) ?? null, min: dates[0] ?? null };
}

function assignProvisionalActivityDates({
  observations,
  pieces,
}: {
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const places = pieces.filter(
    (piece) => piece.outputEligible && piece.kind === "place"
  );

  for (const piece of pieces) {
    if (
      !piece.outputEligible ||
      piece.kind !== "activity" ||
      stringValue(piece.payload, "date")
    ) {
      continue;
    }

    const city = normalizeText(stringValue(piece.payload, "city"));
    const sourceObservations = piece.observationIds
      .map((id) => observationById.get(id))
      .filter((value): value is EvidenceObservation => Boolean(value));
    const sourceOrdinal = Math.min(
      ...sourceObservations.map((observation) => observation.ordinal)
    );
    const sourceUploadIds = new Set(
      sourceObservations.map((observation) => observation.sourceUploadId).filter(Boolean)
    );
    const candidates = places
      .map((place) => {
        const placeCity = normalizeText(stringValue(place.payload, "city"));
        const placeObservations = place.observationIds
          .map((id) => observationById.get(id))
          .filter((value): value is EvidenceObservation => Boolean(value));
        const sameSource = placeObservations.some((observation) =>
          observation.sourceUploadId
            ? sourceUploadIds.has(observation.sourceUploadId)
            : sourceObservations.some(
                (source) => source.sourceLabel === observation.sourceLabel
              )
        );
        const distance = Math.min(
          ...placeObservations.map((observation) =>
            Number.isFinite(sourceOrdinal)
              ? Math.abs(observation.ordinal - sourceOrdinal)
              : Number.MAX_SAFE_INTEGER
          )
        );

        return {
          distance,
          place,
          score: Number(Boolean(city && city === placeCity)) * 1000 + Number(sameSource) * 100,
        };
      })
      .filter(({ place, score }) =>
        score > 0 && Boolean(
          stringValue(place.payload, "arriveDate") ??
          stringValue(place.payload, "arrivalDate")
        )
      )
      .sort((left, right) => right.score - left.score || left.distance - right.distance);
    const place = candidates[0]?.place ?? null;
    const arriveDate = place
      ? stringValue(place.payload, "arriveDate") ??
        stringValue(place.payload, "arrivalDate")
      : null;
    const leaveDate = place
      ? stringValue(place.payload, "leaveDate") ??
        stringValue(place.payload, "departureDate")
      : null;

    if (!arriveDate) continue;
    const firstFullDay = shiftIsoDate(arriveDate, 1);
    const provisionalDate = leaveDate && firstFullDay < leaveDate
      ? firstFullDay
      : arriveDate;
    piece.payload.date = provisionalDate;
    piece.payload.city = piece.payload.city ?? place?.payload.city;
    piece.payload._canonicalProvisionalFields = Array.from(new Set([
      ...(Array.isArray(piece.payload._canonicalProvisionalFields)
        ? piece.payload._canonicalProvisionalFields.filter(
            (value): value is string => typeof value === "string"
          )
        : []),
      "date",
    ]));
    addCanonicalAction(piece, {
      absorbedTitles: [],
      observationIds: [...piece.observationIds],
      reason: `provisionally placed on ${provisionalDate} using the matching city leg`,
      type: "recovered",
    });
  }
}

function alternativeTitles(value: string | null) {
  if (!value || !/\s+or\s+/i.test(value)) return [];
  const options = value
    .split(/\s+or\s+/i)
    .map((option) => option.trim())
    .filter((option) => option.length >= 3);

  if (options.length < 2 || options.length > 3) return [];
  const slot = /^(?:breakfast|brunch|coffee|dinner|evening|lunch|morning|afternoon|meal)\s*:\s*(.+)$/i.exec(
    options[0]
  );
  if (slot?.[1]) options[0] = slot[1].trim();

  return options;
}

function questionTime(value: string | null) {
  const normalized = value ? normalizeTripClockTime(value) : null;
  if (!normalized) return value;
  const [hourValue, minute] = normalized.split(":");
  const hour = Number(hourValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function createCanonicalOwnedQuestions(pieces: CanonicalEvidencePiece[]) {
  const dateBounds = tripDateBounds(pieces);
  const owned: Array<Record<string, unknown>> = pieces.flatMap(
    (piece): Array<Record<string, unknown>> => {
    if (!piece.outputEligible) return [];

    const title = stringValue(piece.payload, "title") ?? "this item";
    const description = stringValue(piece.payload, "description");
    const options = alternativeTitles(title);

    if (piece.kind === "activity" && options.length > 0) {
      return [{
        _canonicalReviewDisposition: "question",
        _canonicalQuestionKind: "alternative_slot",
        answerOptions: options.map((option) => ({ label: option, value: option })),
        answerType: "single_choice",
        confidence: "medium",
        evidence: [title, description].filter(Boolean).join(" — "),
        guessedValue: null,
        prompt: `Which is planned: ${options.join(" or ")}?`,
        reason: "The source reserves one itinerary slot for mutually exclusive options.",
        relatedCanonicalPieceId: piece.id,
        relatedTitle: title,
        subjectType: "item",
        targetField: "title",
      }];
    }

    const genericTimedMeal = piece.kind === "activity" &&
      /^(?:breakfast|brunch|coffee|dinner|lunch|meal)$/i.test(title) &&
      Boolean(stringValue(piece.payload, "startTime"));
    if (genericTimedMeal) {
      const meal = title.toLowerCase();
      const time = questionTime(stringValue(piece.payload, "startTime"));
      return [{
        _canonicalReviewDisposition: "question",
        answerOptions: [{ label: "Somewhere nearby", value: "Somewhere nearby" }],
        answerType: "text",
        confidence: "medium",
        evidence: [title, time].filter(Boolean).join(" · "),
        guessedValue: "Somewhere nearby",
        prompt: `Do you have a specific ${meal} place${
          time ? ` for ${time}` : ""
        }, or should we keep it nearby?`,
        reason: "The source reserves the meal time but does not name a venue.",
        relatedCanonicalPieceId: piece.id,
        relatedTitle: title,
        subjectType: "item",
        targetField: "locationName",
      }];
    }

    if (piece.kind === "activity" && hasCanonicalExplicitTodo(piece.payload)) {
      const sourceDecision = canonicalSourceDecisions(piece.payload)[0] ?? null;
      const decisionEvidence = sourceDecision?.sourceText ?? description;
      const text = `${title} ${description ?? ""} ${decisionEvidence ?? ""}`;
      const ticketDecision = /\bticket\b/i.test(text);
      const timeDecision = /\b(time|start)\b/i.test(text);
      const bookingDecision = /\b(book|reserve|reservation)\b/i.test(text);

      return [{
        _canonicalReviewDisposition: "question",
        answerType: timeDecision && !ticketDecision ? "time" : "text",
        confidence: "medium",
        evidence: decisionEvidence,
        guessedValue: null,
        prompt: ticketDecision
          ? `Which ticket or tour option should be listed for ${title}?`
          : timeDecision
            ? `Have you picked a time for ${title}?`
            : bookingDecision
              ? `Have you booked ${title} yet?`
              : `Have you decided the remaining detail for ${title}?`,
        reason: "The source marks this activity detail as undecided, so this needs your choice.",
        relatedCanonicalPieceId: piece.id,
        relatedTitle: title,
        subjectType: "item",
        targetField: timeDecision && !ticketDecision ? "startTime" : "description",
      }];
    }

    const provisionalDate = Array.isArray(piece.payload._canonicalProvisionalFields) &&
      piece.payload._canonicalProvisionalFields.includes("date")
      ? stringValue(piece.payload, "date")
      : null;
    if (piece.kind === "activity" && (!piece.payload.date || provisionalDate)) {
      return [{
        _canonicalReviewDisposition: "question",
        answerOptions: [],
        answerType: "date",
        answerMax: dateBounds.max,
        answerMin: dateBounds.min,
        confidence: "medium",
        evidence: description,
        guessedValue: provisionalDate,
        prompt: `Which day does ${title} happen?`,
        reason: provisionalDate
          ? `We placed this on ${provisionalDate} for now using the matching city leg.`
          : "This source-backed activity does not have a clear date.",
        relatedCanonicalPieceId: piece.id,
        relatedTitle: title,
        subjectType: "item",
        targetField: "date",
      }];
    }

    if (piece.kind !== "transport") return [];

    const policyRecord = {
      arrivalLocation: stringValue(piece.payload, "arrival"),
      arrivalTime: stringValue(piece.payload, "arrivalTime"),
      confirmationLabel: stringValue(piece.payload, "confirmation"),
      departureLocation: stringValue(piece.payload, "departure"),
      departureTime: stringValue(piece.payload, "departureTime"),
      description,
      provider: stringValue(piece.payload, "provider"),
      routeLabel: title,
      transportType: stringValue(piece.payload, "type"),
    };

    if (
      !isCriticalTransportRecord(policyRecord) ||
      policyRecord.departureTime ||
      hasTransportTimeEvidence(policyRecord)
    ) {
      return [];
    }

    return [{
      _canonicalReviewDisposition: "question",
      answerType: "time",
      confidence: "medium",
      evidence: [
        title,
        description,
        policyRecord.departureLocation,
        policyRecord.arrivalLocation,
        policyRecord.provider,
      ].filter(Boolean).join(" "),
      guessedValue: null,
      prompt:
        policyRecord.transportType === "rental_car" ||
        policyRecord.transportType === "transfer"
          ? `What time is ${title}?`
          : `What time does ${title} depart?`,
      reason: "Critical travel cards need a departure or pickup time for the Today timeline. Leave this unanswered if it is not booked yet.",
      relatedCanonicalPieceId: piece.id,
      relatedTitle: title,
      subjectType: "transport",
      targetField: "departureTime",
    }];
    }
  );
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  const missingStayQuestions = pieces.flatMap((piece) => {
    if (!piece.outputEligible || piece.kind !== "place") return [];
    const city = stringValue(piece.payload, "city");
    const arriveDate = stringValue(piece.payload, "arriveDate") ??
      stringValue(piece.payload, "arrivalDate");
    const leaveDate = stringValue(piece.payload, "leaveDate") ??
      stringValue(piece.payload, "departureDate");
    if (!city || !arriveDate || !leaveDate || leaveDate <= arriveDate) return [];

    const hasStay = stays.some((stay) => {
      const checkIn = stringValue(stay.payload, "checkIn") ??
        stringValue(stay.payload, "firstNightDate");
      const stayCityValue = stringValue(stay.payload, "city");
      return Boolean(
        (stayCityValue && normalizeText(stayCityValue) === normalizeText(city)) ||
          (checkIn && checkIn >= arriveDate && checkIn < leaveDate)
      );
    });
    if (hasStay) return [];

    return [{
      _canonicalReviewDisposition: "question",
      answerType: "text",
      confidence: "medium",
      evidence: `${city}, ${arriveDate} to ${leaveDate}`,
      guessedValue: null,
      prompt: `Where are you staying in ${city}?`,
      reason:
        "The source clearly includes an overnight destination, but Roamwoven did not find its lodging details.",
      relatedCanonicalPieceId: piece.id,
      relatedTitle: city,
      subjectType: "leg",
      targetField: "lodging",
    }];
  });

  return [...owned, ...missingStayQuestions];
}

function canonicalReviewSubjectType(piece: CanonicalEvidencePiece) {
  if (piece.kind === "activity" || piece.kind === "note") return "item";
  if (piece.kind === "place") return "leg";
  if (piece.kind === "stay" || piece.kind === "transport") return piece.kind;
  return "trip";
}

function scrubReviewEvidence(value: unknown) {
  if (typeof value !== "string") return value;

  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[private contact removed]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (candidate) =>
      (candidate.match(/\d/g)?.length ?? 0) >= 9
        ? "[private contact removed]"
        : candidate
    )
    .replace(
      /\b(?:customer|traveler|guest)\s*:\s*[^.\n]+(?:\.|$)/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalReviewSemanticTarget(detail: Record<string, unknown>) {
  const text = normalizeText(
    [detail.targetField, detail.prompt, detail.reason].filter(Boolean).join(" ")
  );

  if (/\b(ticket|ticket choice|ticket type)\b/.test(text)) return "ticket";
  if (/\b(tour|guided|self guided|visit mode|booking status)\b/.test(text)) {
    return "visit-mode";
  }
  if (/\b(check in|checkin)\b/.test(text)) return "check-in";
  if (/\b(check out|checkout)\b/.test(text)) return "check-out";
  if (/\b(date|day|placement)\b/.test(text)) return "date";
  if (/\b(name|title)\b/.test(text)) return "name";
  return normalizeText(String(detail.targetField ?? "general"));
}

export function canonicalizeCanonicalReviewDetails(
  details: unknown[],
  pieces: CanonicalEvidencePiece[]
) {
  const canonical: Record<string, unknown>[] = details.map((value) => {
    const detail = asRecord(value);
    const piece = pieceForMissingDetail(detail, pieces);
    const reviewText = normalizeText(reviewDetailText(detail));
    const internalTrace =
      /\b(source anchor|source anchors|source-anchor|source backed repair|repaired from source|repaired using source|audit diagnostic|lineage|ocr|qa bundle|duplicate suppression|routine assembly)\b/.test(
        reviewText
      );
    const disposition =
      internalTrace
        ? "dismissed"
        : stringValue(detail, "_canonicalReviewDisposition") === "call" ||
      stringValue(detail, "resolverDecisionId")
        ? "call"
        : "question";

    return {
      ...detail,
      _canonicalReviewDisposition: disposition,
      evidence: scrubReviewEvidence(detail.evidence),
      relatedCanonicalPieceId:
        piece?.id ?? stringValue(detail, "relatedCanonicalPieceId"),
      subjectType: piece
        ? canonicalReviewSubjectType(piece)
        : detail.subjectType ?? "trip",
    };
  });
  const seen = new Set<string>();

  return canonical.filter((detail) => {
    const semanticTarget = canonicalReviewSemanticTarget(detail);
    const key = [
      detail._canonicalReviewDisposition,
      detail.relatedCanonicalPieceId ?? detail.subjectType,
      semanticTarget,
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((detail) => ({
    ...detail,
    _canonicalReviewId: `review_${stableHash({
      disposition: detail._canonicalReviewDisposition,
      semanticTarget: canonicalReviewSemanticTarget(detail),
      subjectCanonicalId:
        detail.relatedCanonicalPieceId ?? detail.subjectType ?? "trip",
    })}`,
  }));
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
        const noteEntries = kind === "note"
          ? explicitCityNoteEntries(payload)
          : null;

        if (noteEntries) {
          pushUniqueObservation(
            observations,
            createObservation({
              kind: "context",
              ordinal,
              payload: {
                ...payload,
                _canonicalNoteEntries: noteEntries.entries,
              },
              role: "context",
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

          for (const entry of noteEntries.entries) {
            ordinal += 1;
            const entryPayload = {
              ...payload,
              _canonicalNoteCollectionLabel: noteEntries.collectionLabel,
              _canonicalNoteEntry: true,
              date: null,
              description: noteEntries.collectionLabel
                ? `${noteEntries.collectionLabel}: ${entry}`
                : entry,
              itemType: "note",
              title: entry,
            };
            pushUniqueObservation(
              observations,
              createObservation({
                kind: "note",
                ordinal,
                payload: entryPayload,
                role: "city_note_candidate",
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
          continue;
        }
        const role = evidenceRoleFromPayload(payload, kind);
        pushUniqueObservation(
          observations,
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

    const sourceDecisions = sourceDecisionObservations({
      stageInput,
      startingOrdinal: ordinal,
    });
    ordinal = sourceDecisions.ordinal;
    sourceDecisions.observations.forEach((observation) =>
      pushUniqueObservation(observations, observation)
    );
  }

  reclassifySourceContainers(observations);

  for (const anchor of sourceTransportAnchors) {
    ordinal += 1;
    pushUniqueObservation(
      observations,
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
    if (
      observation.kind === "context" ||
      observation.role === "rejected" ||
      observation.role === "accessory_detail"
    ) {
      pieces.push(createPiece(observation, false));
      continue;
    }

    let matchedReason: string | null = null;
    const match = pieces.find((piece) => {
      const promotableAccessory =
        !piece.outputEligible &&
        piece.role === "accessory_detail" &&
        observation.role === "atomic_candidate";
      if (
        piece.kind !== observation.kind ||
        (!piece.outputEligible && !promotableAccessory)
      ) {
        return false;
      }
      matchedReason =
        matchReason(piece.kind, piece.payload, observation.payload) ??
        crossSourceActivityConflictReason({ observation, observations, piece });
      return Boolean(matchedReason);
    });

    if (match) {
      if (!match.outputEligible && match.role === "accessory_detail") {
        match.outputEligible = true;
      }
      mergeObservationIntoPiece(
        match,
        observation,
        matchedReason ?? "compatible evidence"
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

  attachCanonicalSourceDecisions(pieces);
  attachArrivalOnlyTransportPieces(pieces);
  routeCanonicalTravelBoundaries(pieces);
  mergeReclassifiedCanonicalPieces(pieces);
  attachCanonicalAccessoryDetails(pieces);
  suppressRedundantTransportParents(pieces);
  pruneNonOvernightPlaces(pieces);
  routeUnbookedDayTripTransport(pieces);
  mergeReclassifiedCanonicalPieces(pieces);
  finalizeCanonicalPlaceFields(pieces);
  attachGenericStayFragments(pieces);
  applyCanonicalGuessedStayNames(missingDetails, pieces);
  applyCanonicalGuessedStayDates(missingDetails, pieces, tripYear);
  finalizeCanonicalStayFields(pieces);
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
  applyExplicitSourceUpdates(pieces);
  routeCanonicalAccessoryEvidence({
    actions: {
      addAction: addCanonicalAction,
      mergePiece: mergeCanonicalPieceInto,
      suppressPiece: suppressCanonicalPiece,
    },
    pieces,
    tripYear,
  });
  assignProvisionalActivityDates({ observations, pieces });
  executeCanonicalGroupingDecisions({
    decisions: groupingDecisions,
    observations,
    pieces,
  });
  enforceCanonicalOutputActivityRoles(pieces);
  suppressIsolatedUntimedGenericMeals(pieces);
  suppressUnresolvedIsolatedTerms({ observations, pieces });
  mergeCanonicalCityNotes(pieces);
  finalizeCanonicalOutputFields(pieces);
  reconcileCanonicalConflicts(pieces, observations);
  const canonicalGroupingCalls = createCanonicalGroupingCalls(
    groupingDecisions,
    pieces
  );
  const canonicalSourceUpdateCalls = createCanonicalSourceUpdateCalls(pieces);
  const canonicalConflictQuestions = createCanonicalConflictQuestions(pieces);
  const canonicalOwnedQuestions = createCanonicalOwnedQuestions(pieces);

  const outputFor = (kind: EvidenceKind) =>
    pieces
      .filter((piece) => piece.outputEligible && piece.kind === kind)
      .map((piece) => ({
        ...canonicalPiecePublicPayload(piece.payload),
        _canonicalId: piece.id,
        _canonicalPieceId: piece.id,
      }));
  const activities = [...outputFor("activity"), ...outputFor("note")];
  const places = outputFor("place");
  const stays = outputFor("stay");
  const transport = outputFor("transport");
  const canonicalSpineQuestions = createCanonicalTripSpineReviewDetails({
    activities,
    places,
    stays,
    transport,
    tripOverview,
  });
  const finalMissingDetails = canonicalizeCanonicalReviewDetails(
    unresolvedMissingDetails({
      details: [
        ...canonicalGroupingCalls,
        ...canonicalSourceUpdateCalls,
        ...canonicalConflictQuestions,
        ...canonicalOwnedQuestions,
        ...canonicalSpineQuestions,
        ...missingDetails,
      ],
      pieces,
      tripOverview,
    }),
    pieces
  );
  assignCanonicalEvidenceDispositions({ observations, pieces });
  const draft = {
    activities,
    missingDetails: finalMissingDetails,
    places,
    sensitiveDetails: dedupeObjects(sensitiveDetails),
    stays,
    transport,
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
      canonicalEntityIds: pieces
        .filter((piece) => piece.outputEligible)
        .map((piece) => piece.id),
      dispositions: observations.map((observation) => ({
        ...observation.disposition,
        observationId: observation.id,
      })),
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
      dispositionCount: observations.filter((observation) => observation.disposition)
        .length,
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
