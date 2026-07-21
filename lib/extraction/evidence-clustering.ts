import { createHash } from "node:crypto";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";
import { routeCanonicalAccessoryEvidence } from "@/lib/extraction/canonical-accessory-routing";
import {
  normalizeParserStageArtifacts,
  type ParserArtifactRepair,
} from "@/lib/extraction/parser-artifact-normalization";
import { resolveStructuralActivityDates } from "@/lib/extraction/canonical-placement-policy";
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
  PRICE_SIGNAL_PATTERN,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import {
  chooseMergeWinner,
  classifyMergeEligibility,
  type MergeWinnerCard,
} from "@/lib/extraction/entity-winner";
import { segmentCarriesIdentityValues } from "@/lib/extraction/identity-prose";
import {
  classifyIdeaListSections,
  classifyOwnTextEvidence,
  isSiteComponentTitlePair,
  resolveMentionCommitment,
  SITE_CONTAINER_NOUN_PATTERN,
  type IdeaListEntry,
  type MentionCommitment,
} from "@/lib/extraction/activity-classifier";
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
  parserArtifactRepairs: ParserArtifactRepair[];
  pieces: CanonicalEvidencePiece[];
  summary: {
    canonicalPieceCount: number;
    clusteredObservationCount: number;
    contextObservationCount: number;
    dispositionCount: number;
    observationCount: number;
    parserArtifactRepairCount: number;
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

  // A parseable date in the item's own section label/heading places the item
  // on that day. "unknown" sections qualify too (live-run 7.17.2 PB-3: the
  // parser tagged the Kutná Hora day-trip lines sourceSectionType "unknown",
  // stranding Silver mines and Koscom undated); city_reference and
  // booking_detail sections stay excluded — a ticket PDF's print date is not
  // an itinerary day.
  if (
    !stringValue(normalized, "date") &&
    stringValue(normalized, "itemType") !== "note" &&
    (stringValue(normalized, "sourceSectionType") === "dated_itinerary" ||
      stringValue(normalized, "sourceSectionType") === "unknown" ||
      !stringValue(normalized, "sourceSectionType"))
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
    _sourceSupport,
    _verificationNotes,
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

// Same-venue repeat detection must survive meal-prefix phrasing: "Breakfast
// at Cafe Central" (Jan 20) and "Cafe Central" (Jan 19) are one venue, not
// two (live-run 7.17.2 duplicate). Meal words are stripped ONLY for repeat
// keying — meal-slot commitment itself is judged on the full text.
function mentionComparableTitle(value: unknown) {
  const normalized = normalizedComparable(value);
  if (!normalized) return "";
  const stripped = normalized
    .replace(/^(?:breakfast|brunch|lunch|dinner|coffee|drinks?)\s+(?:at|in)?\s*/,"")
    .trim();
  return stripped || normalized;
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

// Phase 1 (audit B4): exported so audit detectors join titles with the
// pipeline's OWN identity tokenizer (plural folding + one stopword set)
// instead of a diverged private token model.
export function identityTokens(value: unknown) {
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
  if (!compatibleField(left, right, "checkIn")) {
    return null;
  }

  // A checkout disagreement between two records of the SAME stay is a field
  // conflict to reconcile, never proof of a second stay (live-run 7.18.0:
  // parser chunks reported the Prague Airbnb as Jan 14–17 and Jan 14–18 and
  // the hard checkOut guard tripled the stay). Strong venue identity merges;
  // checkout reconciliation happens against the leg boundary downstream.
  const checkOutConflicts = valuesConflict(left.checkOut, right.checkOut);
  const strongIdentityOnly = (reason: string | null) =>
    checkOutConflicts &&
    reason !== "same stay address" &&
    reason !== "same stay booking" &&
    reason !== "same stay identity" &&
    reason !== "same distinctive stay identity"
      ? null
      : reason;
  return strongIdentityOnly(stayIdentityMatchReason(left, right));
}

function stayIdentityMatchReason(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {

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

// --- Phase 1 winner-ladder adapters (audit findings A1/A4) ---
//
// Every collapse/dedup rule keeps its own trigger but shares ONE winner
// decision (lib/extraction/entity-winner.ts): eligibility first (overview,
// day-arc, and heading-fragment cards can never win a merge), then
// booking > named-venue tokens > commitment > specificity > title quality.

function pieceTripCityNames(pieces: CanonicalEvidencePiece[]) {
  return pieces
    .filter((piece) => piece.kind === "place")
    .flatMap((piece) => [
      stringValue(piece.payload, "city"),
      stringValue(piece.payload, "name"),
      stringValue(piece.payload, "title"),
    ])
    .filter((value): value is string => Boolean(value));
}

function pieceSourceHeadingPath(piece: CanonicalEvidencePiece) {
  const headingPath = piece.payload.sourceHeadingPath;

  return Array.isArray(headingPath)
    ? headingPath.filter((value): value is string => typeof value === "string")
    : null;
}

function mergeWinnerCardForPiece(
  piece: CanonicalEvidencePiece,
  timedCounts: Map<string, number>
): MergeWinnerCard {
  const commitmentRankByLevel: Record<MentionCommitment, number> = {
    fixed: 2,
    none: 0,
    sequenced: 1,
  };

  return {
    city: stringValue(piece.payload, "city"),
    commitmentRank: commitmentRankByLevel[mentionCommitment(piece, timedCounts)],
    confirmation: confirmationFrom(piece.payload) || null,
    description: stringValue(piece.payload, "description"),
    sourceHeadingPath: pieceSourceHeadingPath(piece),
    sourceSectionLabel: stringValue(piece.payload, "sourceSectionLabel"),
    time: timeFrom(piece.payload) || null,
    title: stringValue(piece.payload, "title"),
  };
}

function pieceCanWinMerge(
  piece: CanonicalEvidencePiece,
  tripCities: string[]
) {
  return classifyMergeEligibility(
    {
      city: stringValue(piece.payload, "city"),
      sourceHeadingPath: pieceSourceHeadingPath(piece),
      sourceSectionLabel: stringValue(piece.payload, "sourceSectionLabel"),
      title: stringValue(piece.payload, "title"),
    },
    { tripCities }
  ).eligible;
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

// Intake own-text classification stamp (Arc B): while a piece's payload is
// still its own evidence (only same-identity intake merges have happened),
// record whether ITS OWN text carries a hedge marker or fixed commitment.
// Later merge passes append absorbed sibling text to descriptions; doubt
// demotion and commitment (PB-8) must keep judging the entity's own words.
function stampOwnTextClassification(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[]
) {
  const byId = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  for (const piece of pieces) {
    if (piece.kind !== "activity" && piece.kind !== "note") continue;
    if (typeof piece.payload._ownTextHedge === "boolean") continue;
    const own = piece.observationIds
      .map((id) => byId.get(id))
      .filter(
        (observation): observation is EvidenceObservation =>
          Boolean(observation) && observation?.kind === "activity"
      )
      .map((observation) => ({
        ...activityInput(observation.payload),
        confirmation: stringValue(observation.payload, "confirmation"),
      }));
    const judged = own.length
      ? own
      : [
          {
            ...activityInput(piece.payload),
            confirmation: stringValue(piece.payload, "confirmation"),
          },
        ];
    const classification = classifyOwnTextEvidence(judged);
    piece.payload._ownTextHedge = classification.hasHedgeMarker;
    piece.payload._ownTextFixedCommitment = classification.hasFixedCommitment;
  }
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
  // Own-text classification stamps propagate ONLY between copies of the
  // same entity (comparable titles): a folded repeat's own doubt or own
  // commitment belongs to the entity; an absorbed fragment's does not.
  const sourceComparable = mentionComparableTitle(
    stringValue(source.payload, "title")
  );
  const targetComparable = mentionComparableTitle(
    stringValue(target.payload, "title")
  );
  if (sourceComparable && sourceComparable === targetComparable) {
    if (source.payload._ownTextHedge === true) {
      target.payload._ownTextHedge = true;
    }
    if (source.payload._ownTextFixedCommitment === true) {
      target.payload._ownTextFixedCommitment = true;
    }
  }
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

    // Shared winner-ladder veto (Phase 1): a day-arc/heading-fragment card
    // can never be the surviving home for generic evidence.
    if (!pieceCanWinMerge(target, pieceTripCityNames(pieces))) {
      continue;
    }

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

// Transport-shaped text: the movement-word gate plus the airline flight-code
// shape. Live-run 7.18.3 PB-1(b): "Ryanair FR8331 to Prague" carries no
// movement word at all, so the word-only gate never entered the shadow
// branch and the duplicate activity shipped WITH its confirmation code in
// public prose. A carrier-prefix flight code (two uppercase letters plus a
// 3-4 digit number) is transport shape on its own; so is sharing a
// confirmation code with any canonical transport segment.
const TRANSPORT_SHAPE_WORD_PATTERN = /\b(?:flight|fly|train|bus|ferry|transfer)\b/;
const FLIGHT_CODE_PATTERN = /\b[A-Z]{2} ?\d{3,4}\b/;

function rawActivityTransportText(record: Record<string, unknown>) {
  return [record.title, record.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function isTransportShapedActivityPayload(record: Record<string, unknown>) {
  return (
    TRANSPORT_SHAPE_WORD_PATTERN.test(activityText(record)) ||
    FLIGHT_CODE_PATTERN.test(rawActivityTransportText(record))
  );
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

    // Airport-prep lines attach to their travel card, never as separate
    // activities (RW-TRV-001; run5 PB-7 hard-warning family: "Leave for
    // Airport" shipped as a card for a 4th run). Title-gated and
    // foreign-token safe: a prep title with a same-date transport segment
    // is that segment's prep note.
    const prepTitle = normalizeText(stringValue(activity.payload, "title") ?? "");
    if (
      /\b(?:leave|leaving|depart(?:ing)?|head(?:ing)?|wake(?:\s?up)?|get up|taxi|uber)\b/.test(prepTitle) &&
      /\b(?:airport|flight|station|train)\b/.test(prepTitle) &&
      prepTitle
        .split(/\s+/)
        .every((token) =>
          /^(?:leave|leaving|depart|departing|departure|head|heading|wake|up|get|taxi|uber|for|to|the|at|early|airport|flight|station|train|am|pm|a|an|and)$/.test(
            token
          ) || /^\d/.test(token)
        )
    ) {
      const prepTransport = transports.find((transport) =>
        sameCanonicalDate(activity.payload, transport.payload)
      );
      if (prepTransport) {
        activity.payload._representedByPieceId = prepTransport.id;
        activity.payload._representedByTitle =
          stringValue(prepTransport.payload, "title") ?? "its Travel row";
        suppressCanonicalPiece(
          activity,
          "airport-prep line attaches to its travel card as a prep note, never a separate activity (RW-TRV-001)"
        );
        continue;
      }
    }
    const activityConfirmationForGate = confirmationFrom(activity.payload);
    const sharesTransportConfirmation = Boolean(
      activityConfirmationForGate &&
        transports.some(
          (transport) =>
            confirmationFrom(transport.payload) === activityConfirmationForGate
        )
    );

    if (
      isTransportShapedActivityPayload(activity.payload) ||
      sharesTransportConfirmation
    ) {
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

      // One matching transport row = represented. MULTIPLE matching rows
      // (a two-flight connection day) = even more represented — the old
      // `=== 1` guard preserved exactly those shadows (defect docket
      // 2026-07-17: "Fly to Rome"/"Flight to Rome" on the Jan 12 two-segment
      // day, and the Delta 1043 AM/PM twin).
      if (matches.length >= 1) {
        suppressCanonicalPiece(
          activity,
          "traveler movement represented by canonical transport"
        );
        continue;
      }

      // Date-agnostic ticket-copy fallback (live-run 7.18.0 P0): the parser
      // re-emitted the RegioJet and ÖBB ticket pages as Jan 24 activities, so
      // same-date matching never saw them and both booking codes shipped in
      // public card prose. A transport-shaped activity that shares an exact
      // clock time plus route identity — or a booking code — with ANY
      // canonical segment is that segment's ticket content on the wrong day,
      // not a second journey (two typed agreements, RW-AUD-001 style).
      const activityRouteTokens = identityTokens(
        [
          activity.payload.title,
          activity.payload.description,
        ]
          .filter(Boolean)
          .join(" ")
      );
      const activityStart = timeFrom(activity.payload);
      const activityEnd = normalizedClockTime(activity.payload.endTime);
      const activityConfirmation = confirmationFrom(activity.payload);
      const crossDateMatch = transports.find((transport) => {
        if (
          movementKind &&
          normalizedComparable(transport.payload.type) !== movementKind
        ) {
          return false;
        }
        const transportTokens = identityTokens(
          [
            transport.payload.title,
            transport.payload.departure,
            transport.payload.arrival,
            transport.payload.number,
            transport.payload.provider,
          ]
            .filter(Boolean)
            .join(" ")
        );
        const routeOverlap = overlapCount(activityRouteTokens, transportTokens);
        const transportConfirmation = confirmationFrom(transport.payload);
        if (
          activityConfirmation &&
          transportConfirmation &&
          activityConfirmation === transportConfirmation
        ) {
          return true;
        }
        const departureTime = normalizedClockTime(
          transport.payload.departureTime
        );
        const arrivalTime = normalizedClockTime(transport.payload.arrivalTime);
        const exactTimeMatch = Boolean(
          (activityStart && departureTime && activityStart === departureTime) ||
            (activityEnd && arrivalTime && activityEnd === arrivalTime)
        );
        return exactTimeMatch && routeOverlap >= 2;
      });

      if (crossDateMatch) {
        activity.payload._representedByPieceId = crossDateMatch.id;
        activity.payload._representedByTitle =
          stringValue(crossDateMatch.payload, "title") ?? "its Travel row";
        suppressCanonicalPiece(
          activity,
          "traveler movement represented by canonical transport: ticket content re-emitted on the wrong day"
        );
        continue;
      }
    }

    // A bare stay-name activity ("AirBNB") duplicating a stay record: every
    // meaningful title word belongs to a stay's name and the date falls in
    // that stay's range → the stay row is the single home (RW-ASM-001).
    //
    // Live-run 7.17.2 defect (PB-2): this rule previously used
    // distinctiveTitleTokens, whose venue-type stopwords ("castle",
    // "cathedral", "museum"…) reduced "Prague Castle" to the single token
    // "prague" — fully contained in "Prague Airbnb" — so a real sight was
    // suppressed as a lodging shadow. Bare-stay matching must keep venue-type
    // words: a title that names a castle is never a bare stay alias.
    const bareTitleTokens = stayAliasTitleTokens(
      stringValue(activity.payload, "title") ?? ""
    );
    if (
      bareTitleTokens.length > 0 &&
      !timeFrom(activity.payload) &&
      activity.payload._canonicalGroupRole !== "parent" &&
      activity.payload._canonicalGroupRole !== "child"
    ) {
      const owningStay = stays.find((stay) => {
        const stayTokens = new Set(
          foldForSourceSupport(stringValue(stay.payload, "name") ?? "")
            .split(/\s+/)
            .filter(Boolean)
        );
        if (stayTokens.size === 0) return false;
        if (!bareTitleTokens.every((token) => stayTokens.has(token))) {
          return false;
        }
        const activityDate = stringValue(activity.payload, "date");
        const checkIn = stringValue(stay.payload, "checkIn") ??
          stringValue(stay.payload, "firstNightDate");
        const checkOut = stringValue(stay.payload, "checkOut");

        return Boolean(
          activityDate &&
            checkIn &&
            activityDate >= checkIn &&
            (!checkOut || activityDate <= checkOut)
        );
      });

      if (owningStay) {
        suppressCanonicalPiece(
          activity,
          "lodging already represented by canonical stay record"
        );
        continue;
      }
    }

    // The routine-check-in gate reads the TITLE, not the whole text: a named
    // sight whose description merely mentions the day's check-in ("Check in
    // to hostel and walk to Albertina") is a real activity, never lodging
    // evidence (live-run 7.18.0 destroyed Albertina through this rule; same
    // defect family as the 7.17.2 castle-as-lodging suppression).
    const routineTitle = normalizeText(
      stringValue(activity.payload, "title") ?? ""
    );
    if (
      !/\b(?:check(?:ing)? in(?:to)?|check-in|check out|check-out|drop bags?|bag drop|arriv(?:e|al))\b/.test(
        routineTitle
      )
    ) {
      continue;
    }
    // And the title must not name a non-lodging entity of its own: every
    // distinctive title token has to belong to a stay name or check-in/arrival
    // vocabulary for the card to count as routine lodging flow.
    const routineVocabulary =
      /^(?:check|checkin|checkout|in|into|out|to|the|and|at|drop|bags?|bag|start|starting|begin|beginning|head|heading|arrive|arrival|arriving|hostel|hotel|airbnb|apartment|room|luggage|then|walk|tour|touring|spend|spending|sightsee|sightseeing|explore|exploring|land|landing|day)$/;
    const stayNameTokens = new Set(
      stays.flatMap((stay) =>
        foldForSourceSupport(stringValue(stay.payload, "name") ?? "")
          .split(/\s+/)
          .filter(Boolean)
      )
    );
    const cityTokens = new Set(
      [
        ...pieces
          .filter((piece) => piece.kind === "place")
          .map((piece) => stringValue(piece.payload, "city") ?? ""),
        ...stays.map((stay) => stringValue(stay.payload, "city") ?? ""),
        ...transports.flatMap((transport) => [
          stringValue(transport.payload, "departure") ?? "",
          stringValue(transport.payload, "arrival") ?? "",
        ]),
        stringValue(activity.payload, "city") ?? "",
      ].flatMap((value) =>
        foldForSourceSupport(value).split(/\s+/).filter(Boolean)
      )
    );
    const foreignTitleTokens = foldForSourceSupport(routineTitle)
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3 &&
          !routineVocabulary.test(token) &&
          !stayNameTokens.has(token) &&
          !cityTokens.has(token)
      );
    if (foreignTitleTokens.length > 0) {
      continue;
    }

    // Live-run 7.17.2 defect: "Arrive in Rome and drop bags" at the flight's
    // own arrival time survived as an activity because "spend the day
    // touring" context counted as a distinct arrival action. A bag drop that
    // happens AT a same-date transport arrival time IS the arrival — it folds
    // into the stay (ground truth v2 night/stay rules). Only a bag drop at a
    // clearly different time than every same-date arrival is a separate
    // luggage movement.
    const activityTime = timeFrom(activity.payload);
    const distinctArrivalAction = Boolean(
      activityTime &&
        /\b(?:drop bags?|bag drop|luggage)\b/.test(text) &&
        transports.some((transport) =>
          sameCanonicalDate(activity.payload, transport.payload)
        ) &&
        !transports.some(
          (transport) =>
            sameCanonicalDate(activity.payload, transport.payload) &&
            normalizedClockTime(transport.payload.arrivalTime) === activityTime
        )
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
      if (!stayName || text.includes(stayName)) return true;
      // Alias-token match: "Check in to AirBNB" names the "Prague Airbnb"
      // stay even though the full stay name never appears in the card text
      // (live-run 7.18.0: the full-name check failed and the card shipped
      // with the address, Wi-Fi password, and door code in cleartext).
      const aliasTokens = stayAliasTitleTokens(stayName);
      const haystack = foldForSourceSupport(text);
      return (
        aliasTokens.length > 0 &&
        aliasTokens.some((token) => haystack.includes(token))
      );
    });

    // ANY same-date stay match means the check-in flow is represented — with
    // duplicate or ambiguous stay rows, requiring exactly one match preserved
    // exactly the duplicated card (live-run 7.18.0).
    if (matchingStays.length >= 1 || sameDateStays.length >= 1) {
      const owner = matchingStays[0] ?? sameDateStays[0];
      const instructions = stringValue(activity.payload, "description");
      if (instructions && STAY_ACCESS_INSTRUCTION_PATTERN.test(instructions)) {
        const existing = stringValue(owner.payload, "accessInstructions");
        if (!existing) {
          owner.payload.accessInstructions = instructions;
        }
      }
      suppressCanonicalPiece(
        activity,
        "routine check-in or bag-drop evidence attached to stay"
      );
    }
  }
}

// Lodging access/arrival content is stay material, never a traveler activity
// (live-run 7.17.2 PB-3/AS-3: "Vitae Hostel arrival directions" became a
// dated activity with a date question and a public buzzer number; "Rome
// arrival / key pickup" carried apartment access instructions into a card).
const STAY_ACCESS_INSTRUCTION_PATTERN =
  /\b(?:key (?:will be|to be|is) (?:prepared|ready|left)|key pickup|lockbox|lock box|buzzer(?:\s+number)?|door code|access code|entry code|wifi password|wi-fi password|apartment is on the|door on the (?:left|right)|directions? (?:from|to) .{0,60}\b(?:station|airport|hostel|hotel|apartment|airbnb|stay)\b)/i;

function applyAccessTaskPolicy(pieces: CanonicalEvidencePiece[]) {
  const stays = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );

  // Stay-name arrival material: an activity whose title/text names a stay and
  // reads as directions/access instructions attaches to that stay silently —
  // and never generates a placement question (stays never get item date
  // questions, defect docket 2026-07-17).
  for (const activity of pieces.filter(
    (piece) => piece.kind === "activity" && piece.outputEligible
  )) {
    const text = activityText(activity.payload);
    const title = stringValue(activity.payload, "title") ?? "";

    if (
      !STAY_ACCESS_INSTRUCTION_PATTERN.test(text) &&
      !/\barrival directions\b|\bgetting there\b/i.test(title)
    ) {
      continue;
    }

    const namedStay = stays.find((stay) => {
      const stayTokens = stayAliasTitleTokens(
        stringValue(stay.payload, "name") ?? ""
      );
      if (stayTokens.length === 0) return false;
      const haystack = foldForSourceSupport(`${title} ${text}`);
      return stayTokens.every((token) => haystack.includes(token));
    });

    if (namedStay) {
      const instructions = stringValue(activity.payload, "description");
      if (instructions) {
        const existing = stringValue(namedStay.payload, "accessInstructions");
        if (!existing) {
          namedStay.payload.accessInstructions = instructions;
        }
      }
      suppressCanonicalPiece(
        activity,
        "stay arrival/access instructions attached to stay record"
      );
      continue;
    }

    // Access instructions that name no known stay still never ship as a
    // traveler card WHEN stay records exist to carry access details: a
    // mis-attributed access card is a privacy leak (7.17.2 "Rome arrival /
    // key pickup" carried another stay's apartment instructions). With no
    // stay records at all, the card survives so the source text is preserved
    // for card-detail protection instead of vanishing (RW-ING-001).
    // A check-in time does not make credentials card-safe: Wi-Fi passwords,
    // door/lockbox codes, and buzzer numbers are stay material regardless of
    // whether the card carries a time (live-run 7.18.0: "Check in to AirBNB"
    // at 15:00 shipped the Wi-Fi password and door code because the time
    // guard preserved it).
    const carriesCredential =
      /\b(?:wi-?fi\s+password|door\s+code|access\s+code|entry\s+code|lock\s*box|buzzer)\b/i.test(
        text
      );
    if (
      stays.length > 0 &&
      STAY_ACCESS_INSTRUCTION_PATTERN.test(text) &&
      (carriesCredential || !timeFrom(activity.payload))
    ) {
      suppressCanonicalPiece(
        activity,
        "access instructions are stay material, not a traveler activity"
      );
      continue;
    }
  }

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
      (/(?:[$€£]\s*\d|\b\d{2,4}\s*(?:usd|eur|gbp|czk|kc|huf|ft)\b)/i.test(raw) ||
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
    // Strip a previously applied disambiguation date suffix so a re-run after
    // stay dedup can restore the clean venue name (the suffix is an internal
    // disambiguator, never durable identity).
    const suffixed = stringValue(stay.payload, "name");
    if (suffixed && /\s·\s\d{4}-\d{2}-\d{2}/.test(suffixed)) {
      stay.payload.name = suffixed.replace(/\s·\s\d{4}-\d{2}-\d{2}.*$/, "").trim();
    }
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

// Protected-value scrub at the output boundary (RW-PRI-001, live-run 7.18.0
// P0): any value the privacy model protects — stay addresses, access codes,
// Wi-Fi credentials, stay and inter-city travel booking identifiers — must
// not survive inside PUBLIC activity or note prose, no matter which upstream
// rule failed to suppress the card carrying it. Activity/tour/restaurant
// booking references stay public (Δ2 scope): only values sourced from
// canonical STAY and TRANSPORT records are denied, plus credential-shaped
// sentences (Wi-Fi password / door code / lockbox / buzzer), which are stay
// material by definition.
const CREDENTIAL_SENTENCE_PATTERN =
  /\b(?:wi-?fi(?:\s+(?:password|network|name))?\s*:|wi-?fi\s+password|password\s*:|door\s+code|access\s+code|entry\s+code|lock\s*box(?:\s+code)?|buzzer(?:\s+number)?|(?:^|\s)code\s+[A-Z0-9]{6,})/i;

// Inter-city travel booking identifiers are protected class (RW-PRI-001
// Δ2 scope) even when they ride on an ACTIVITY-shaped card: a transport
// shadow that survives every suppression pass (live-run 7.18.3 PB-1(b):
// "Ryanair FR8331 to Prague" as a Jan 14 activity) must still not ship its
// confirmation code in public prose. Activity/tour/restaurant booking
// references on NON-transport-shaped cards stay public.
const TRAVEL_CONFIRMATION_SENTENCE_PATTERN =
  /\b(?:confirmation(?:\s+(?:code|number))?|booking\s+(?:code|number|reference)|reservation\s+(?:code|number)|ticket\s*code|travel\s+code|pnr)\b\s*[:#]?\s*[A-Za-z0-9]/i;

function collectProtectedValueDenyList(pieces: CanonicalEvidencePiece[]) {
  const values: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim().length >= 5) {
      values.push(value.trim());
    }
  };
  for (const piece of pieces) {
    if (piece.kind === "stay") {
      push(piece.payload.address);
      push(piece.payload.confirmation);
      push(piece.payload.confirmationLabel);
    }
    if (piece.kind === "transport" && piece.outputEligible) {
      push(piece.payload.confirmation);
      push(piece.payload.confirmationLabel);
      push(piece.payload.bookingReference);
    }
  }
  // Longest first so full addresses are removed before their fragments.
  return Array.from(new Set(values)).sort((a, b) => b.length - a.length);
}

function scrubProtectedValuesFromText(
  value: string,
  denyList: string[],
  dropCredentialSentences: boolean
) {
  let result = value;
  for (const denied of denyList) {
    if (!denied) continue;
    let index = result.toLowerCase().indexOf(denied.toLowerCase());
    while (index !== -1) {
      result = `${result.slice(0, index)}${result.slice(index + denied.length)}`;
      index = result.toLowerCase().indexOf(denied.toLowerCase());
    }
  }
  // Sentence-level credential removal: a segment stating a Wi-Fi password,
  // door/lockbox/access code, or buzzer number is dropped whole — but only
  // when a stay record exists to own that material. With no stays at all the
  // text is preserved so card-detail protection can still act on it
  // (RW-ING-001 fail-safe; covered by the private-source-text test).
  const segments = result
    .split(PROSE_SEGMENT_SPLIT)
    .filter(
      (segment) =>
        !dropCredentialSentences || !CREDENTIAL_SENTENCE_PATTERN.test(segment)
    );
  const rebuilt = segments
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/(?:^|\s)[·,;:–-]+\s*$/g, "")
    .trim();
  return rebuilt;
}

function scrubProtectedValuesFromPublicProse(pieces: CanonicalEvidencePiece[]) {
  const denyList = collectProtectedValueDenyList(pieces);
  const staysExist = pieces.some(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  for (const piece of pieces) {
    if (!piece.outputEligible) continue;
    if (piece.kind !== "activity" && piece.kind !== "note") continue;
    let scrubbed = false;
    const transportShaped =
      piece.kind === "activity" &&
      isTransportShapedActivityPayload(piece.payload);
    if (transportShaped) {
      for (const field of ["confirmation", "confirmationLabel", "bookingReference"]) {
        if (stringValue(piece.payload, field)) {
          piece.payload[field] = null;
          scrubbed = true;
        }
      }
      const description = stringValue(piece.payload, "description");
      if (description) {
        const kept = description
          .split(PROSE_SEGMENT_SPLIT)
          .filter(
            (segment) => !TRAVEL_CONFIRMATION_SENTENCE_PATTERN.test(segment)
          )
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (kept !== description) {
          piece.payload.description = kept || null;
          scrubbed = true;
        }
      }
    }
    for (const field of ["description", "title", "address", "locationName", "location"]) {
      const value = stringValue(piece.payload, field);
      if (!value) continue;
      const cleaned =
        field === "title" || field === "address" || field === "locationName" || field === "location"
          ? denyList.reduce(
              (current, denied) =>
                current.toLowerCase().includes(denied.toLowerCase())
                  ? ""
                  : current,
              value
            )
          : scrubProtectedValuesFromText(value, denyList, staysExist);
      if (cleaned !== value) {
        piece.payload[field] = cleaned || null;
        scrubbed = true;
      }
    }
    if (scrubbed) {
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason:
          "protected stay/travel values scrubbed from public card prose (RW-PRI-001 output boundary)",
        type: "recovered",
      });
    }
  }
}

// One stay per venue per leg (RW-TRV-001 night coverage + RW-CAN-001 one
// occurrence, live-run 7.18.0 P0: three Prague Airbnb stay rows shipped —
// two real chunks disagreeing on checkout plus a Costs day-price line that
// manufactured a public third stay). Same-city stays with matching venue
// identity and overlapping ranges merge; the checkout is reconciled against
// the leg departure boundary; cost/context stay fragments are absorbed by
// the stay that covers their night.
const GENERIC_STAY_IDENTITY_TOKENS = new Set([
  "accommodation", "airbnb", "apartment", "hostel", "hotel", "lodging",
  "rental", "stay", "room", "private", "ensuite",
]);

function stayVenueIdentityTokens(payload: Record<string, unknown>) {
  return identityTokens(stringValue(payload, "name") ?? "").filter(
    (token) => !GENERIC_STAY_IDENTITY_TOKENS.has(token) && !/^\d/.test(token)
  );
}

function stayRangesOverlapOrTouch(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const leftIn = stringValue(left, "checkIn") ?? stringValue(left, "firstNightDate");
  const rightIn = stringValue(right, "checkIn") ?? stringValue(right, "firstNightDate");
  if (!leftIn || !rightIn) return false;
  const leftOut = stringValue(left, "checkOut") ?? leftIn;
  const rightOut = stringValue(right, "checkOut") ?? rightIn;
  return leftIn <= rightOut && rightIn <= leftOut;
}

function stayPayloadRichness(payload: Record<string, unknown>) {
  return (
    (stringValue(payload, "address") ? 4 : 0) +
    (stringValue(payload, "confirmation") ?? stringValue(payload, "confirmationLabel") ? 2 : 0) +
    (stringValue(payload, "checkOut") ? 1 : 0) +
    (stringValue(payload, "checkInTime") ? 1 : 0)
  );
}

function reconcileCanonicalStayIdentity(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[] = []
) {
  const places = pieces.filter(
    (piece) => piece.kind === "place" && piece.outputEligible
  );
  const legLeaveDates = new Map<string, string>();
  for (const place of places) {
    const city = normalizeText(stringValue(place.payload, "city"));
    const leave =
      stringValue(place.payload, "leaveDate") ??
      stringValue(place.payload, "departureDate");
    if (city && leave) legLeaveDates.set(city, leave);
  }

  const stays = () =>
    pieces.filter((piece) => piece.kind === "stay" && piece.outputEligible);

  // Pass 0: a single stay piece whose own observations disagree on checkout
  // reconciles against the leg departure boundary (night coverage); with no
  // boundary, the later checkout wins — a merge can extend coverage, never
  // silently shorten it.
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  for (const stay of stays()) {
    const observed = Array.from(
      new Set(
        stay.observationIds
          .map((id) => observationById.get(id))
          .filter((observation): observation is EvidenceObservation =>
            Boolean(observation && observation.kind === "stay")
          )
          .map((observation) => stringValue(observation.payload, "checkOut"))
          .filter((value): value is string =>
            Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value ?? ""))
          )
      )
    );
    if (observed.length < 2) continue;
    const city = normalizeText(stayCity(stay, places));
    const legBoundary = legLeaveDates.get(city) ?? null;
    const reconciled =
      (legBoundary && observed.find((value) => value === legBoundary)) ??
      observed.sort().at(-1) ??
      null;
    if (reconciled && stringValue(stay.payload, "checkOut") !== reconciled) {
      stay.payload.checkOut = reconciled;
      addCanonicalAction(stay, {
        absorbedTitles: [],
        observationIds: [...stay.observationIds],
        reason: `conflicting source checkouts reconciled to ${reconciled}${
          legBoundary === reconciled ? " (leg departure boundary)" : ""
        }`,
        type: "field_selected",
      });
    }
  }

  // Pass 1: merge same-venue same-city overlapping stays.
  let merged = true;
  while (merged) {
    merged = false;
    const current = stays();
    outer: for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const left = current[i];
        const right = current[j];
        const leftCity = normalizeText(stayCity(left, places));
        const rightCity = normalizeText(stayCity(right, places));
        if (!leftCity || leftCity !== rightCity) continue;
        if (!stayRangesOverlapOrTouch(left.payload, right.payload)) continue;
        const leftTokens = stayVenueIdentityTokens(left.payload);
        const rightTokens = stayVenueIdentityTokens(right.payload);
        const strippedName = (payload: Record<string, unknown>) =>
          normalizedComparable(
            (stringValue(payload, "name") ?? "").replace(
              /\s·\s\d{4}-\d{2}-\d{2}.*$/,
              ""
            )
          );
        // Distinct named venues ("Hotel A" vs "Hotel B") never merge; only a
        // shared distinctive venue token or the exact same name (after
        // stripping an internal date-suffix disambiguator) is the same stay.
        const sharedVenue =
          overlapCount(leftTokens, rightTokens) >= 1 ||
          (Boolean(strippedName(left.payload)) &&
            strippedName(left.payload) === strippedName(right.payload));
        if (!sharedVenue) continue;

        const target =
          stayPayloadRichness(left.payload) >= stayPayloadRichness(right.payload)
            ? left
            : right;
        const source = target === left ? right : left;
        const targetOut = stringValue(target.payload, "checkOut");
        const sourceOut = stringValue(source.payload, "checkOut");
        const targetIn = stringValue(target.payload, "checkIn");
        const sourceIn = stringValue(source.payload, "checkIn");
        // Night coverage: the reconciled range is the union; a checkout that
        // matches the leg departure boundary wins outright.
        const legBoundary = legLeaveDates.get(leftCity) ?? null;
        const reconciledOut =
          sourceOut && targetOut
            ? legBoundary && (sourceOut === legBoundary || targetOut === legBoundary)
              ? sourceOut === legBoundary
                ? sourceOut
                : targetOut
              : sourceOut > targetOut
                ? sourceOut
                : targetOut
            : targetOut ?? sourceOut ?? null;
        const reconciledIn =
          targetIn && sourceIn
            ? targetIn < sourceIn
              ? targetIn
              : sourceIn
            : targetIn ?? sourceIn ?? null;
        mergeCanonicalPieceInto({
          reason:
            "same stay reported with conflicting dates: one stay per venue per leg, range reconciled against the leg boundary",
          source,
          target,
        });
        if (reconciledOut) target.payload.checkOut = reconciledOut;
        if (reconciledIn) target.payload.checkIn = reconciledIn;
        addCanonicalAction(target, {
          absorbedTitles: [],
          observationIds: [...target.observationIds],
          reason: `stay range reconciled to ${reconciledIn ?? "?"}–${reconciledOut ?? "?"}${
            legBoundary && reconciledOut === legBoundary
              ? " (leg departure boundary)"
              : ""
          }`,
          type: "field_selected",
        });
        merged = true;
        break outer;
      }
    }
  }

  // Pass 2: absorb cost/context stay fragments — a generic-name stay with no
  // address, no booking, and no checkout whose night is already covered by a
  // surviving same-city stay is planning residue, never a second stay.
  const survivors = stays();
  for (const fragment of survivors) {
    if (!fragment.outputEligible) continue;
    const hasAnchor =
      stringValue(fragment.payload, "address") ||
      stringValue(fragment.payload, "confirmation") ||
      stringValue(fragment.payload, "confirmationLabel");
    if (hasAnchor || stringValue(fragment.payload, "checkOut")) continue;
    if (stayVenueIdentityTokens(fragment.payload).length > 0) continue;
    const fragmentIn =
      stringValue(fragment.payload, "checkIn") ??
      stringValue(fragment.payload, "firstNightDate");
    if (!fragmentIn) continue;
    const fragmentCity = normalizeText(stayCity(fragment, places));
    const covering = survivors.find((stay) => {
      if (stay === fragment || !stay.outputEligible) return false;
      if (normalizeText(stayCity(stay, places)) !== fragmentCity) return false;
      const checkIn = stringValue(stay.payload, "checkIn");
      const checkOut = stringValue(stay.payload, "checkOut");
      return Boolean(
        checkIn && checkOut && fragmentIn >= checkIn && fragmentIn < checkOut
      );
    });
    if (covering) {
      mergeCanonicalPieceInto({
        reason:
          "stay cost/context fragment absorbed by the stay covering its night",
        source: fragment,
        target: covering,
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
    const description = sanitizeCanonicalCardDescription(
      stringValue(piece.payload, "description")
    );
    piece.payload.description = description;
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

// Card prose hygiene at the output boundary (live-run 7.17.2 PB-1): merged
// evidence must not echo the same sentence three times, and enrichment must
// never carry a booking document's customer-identity block (name, home
// address, email, phone) into traveler-visible text. Reservation numbers are
// deliberately NOT stripped here — under the 2026-07-17 privacy scope,
// activity booking references are public; personal identity data is not trip
// content at all.
//
// Live-run 7.18.3 PB-1: the private pattern here required "Customer:" WITH a
// colon, so the colon-less "Customer Eli kamerow. 1225 Harvard street nw,
// 20009 Washington, USA." block shipped verbatim (phrasing evasion, not an
// ordering defect — this pass runs after every merge). The identity shapes
// now live in lib/extraction/identity-prose.ts, shared with the audit's
// identity-leak P0 detector so scrub and detector can never drift (B4).


// Sentence segmentation that never splits after a title abbreviation:
// "St. Stephen's Cathedral" is one segment, not "St." plus an orphan
// (live-run 7.18.0 truncated the Vienna note mid-entity at "St.").
const PROSE_SEGMENT_SPLIT = /(?<=[.!?])(?<!\b(?:st|mt|dr|mr|mrs|ms|vs|no|approx)\.)\s+/i;

function sanitizeCanonicalCardDescription(value: string | null) {
  if (!value) return value;

  const segments = value
    .split(PROSE_SEGMENT_SPLIT)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const kept: string[] = [];

  const keptTokenSets: Array<Set<string>> = [];

  for (const segment of segments) {
    if (segmentCarriesIdentityValues(segment)) continue;
    const normalized = normalizeText(segment).replace(/[^a-z0-9 ]/g, "");
    if (normalized && seen.has(normalized)) continue;
    const tokens = new Set(normalized.split(" ").filter(Boolean));
    // Near-duplicate echo ("Pick up car at 9:00 AM." / "Pick up car at
    // 9 am."): high token overlap on substantial sentences is the same
    // sentence merged twice, not new information.
    if (tokens.size >= 4) {
      const isEcho = keptTokenSets.some((existing) => {
        const smaller = Math.min(existing.size, tokens.size);
        if (smaller < 4) return false;
        let shared = 0;
        for (const token of tokens) if (existing.has(token)) shared += 1;
        return shared / smaller >= 0.8;
      });
      if (isEcho) continue;
    }
    if (normalized) seen.add(normalized);
    keptTokenSets.push(tokens);
    kept.push(segment);
  }

  const rebuilt = kept.join(" ").trim();
  return rebuilt || null;
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
        .split(/(?:\r?\n)+|\s*;\s*/).flatMap((part) => part.split(PROSE_SEGMENT_SPLIT))
        .map((segment) => segment.trim())
        .filter(Boolean)
    );
  const retained: string[] = [];

  for (const segment of segments) {
    const normalized = normalizeText(segment);
    if (!normalized) continue;
    const segmentTokens = new Set(normalized.split(" ").filter(Boolean));
    const duplicateIndex = retained.findIndex((candidate) => {
      const existing = normalizeText(candidate);
      if (
        existing === normalized ||
        (existing.length >= 20 && normalized.includes(existing)) ||
        (normalized.length >= 20 && existing.includes(normalized))
      ) {
        return true;
      }
      // Near-duplicate segments with different phrasing (defect docket
      // 2026-07-17, Budapest note self-redundancy): high token overlap on
      // substantial segments is the same tip twice.
      const existingTokens = new Set(existing.split(" ").filter(Boolean));
      const smaller = Math.min(segmentTokens.size, existingTokens.size);
      if (smaller < 4) return false;
      let shared = 0;
      for (const token of segmentTokens) {
        if (existingTokens.has(token)) shared += 1;
      }
      return shared / smaller >= 0.8;
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

// Booking identifiers never belong in public note prose (RW-PRI-001, defect
// docket 2026-07-17: a Colosseum ticket barcode landed inside Prague Notes).
function sanitizeCityNoteText(value: unknown) {
  if (typeof value !== "string") return value;

  return value
    .replace(
      /\b(?:booking|confirmation|reservation|reference|ref|voucher|ticket)\s*(?:code|number|no\.?|#)?\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{3,}\b/gi,
      " "
    )
    .replace(/\b\d{8,}\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// City-note sections (Eli-approved taxonomy, 2026-07-17 evening): one City
// Note per city, organized into universal sections. Splitting later is
// additive; merging later breaks fixtures — start with the merged seven.
export const CITY_NOTE_SECTIONS = [
  "Food",
  "Drinks & Nightlife",
  "Sights & Culture",
  "Shopping",
  "Getting Around",
  "Local Tips",
  "Notes",
] as const;

export type CityNoteSection = (typeof CITY_NOTE_SECTIONS)[number];

// Costs/budget planning artifacts are excluded from the traveler app
// entirely (ground truth v2 "Excluded entirely"; live-run 7.17.2 shipped
// "Budget notes: $1200 total, $100/day" inside the Budapest note).
const COSTS_CONTENT_PATTERN =
  /\bbudget\b|[$€£]\s?\d[\d,.]*\s*(?:total|\/\s*day|per\s+(?:day|night|person))|\btotal\b[^.]{0,20}[$€£]\s?\d|\bcosts?\s*:/i;

const SECTION_LABEL_HINTS: Array<[RegExp, CityNoteSection]> = [
  [/\b(?:eat|food|restaurants?|cafes?|bakery|bakeries|pastry|brunch|breakfast|lunch|dinner)\b/i, "Food"],
  [/\b(?:drinks?|bars?|beer|beer halls?|wine|cocktails?|nightlife|pubs?|breweries|brewery)\b/i, "Drinks & Nightlife"],
  [/\b(?:shop|shopping|markets?|souvenirs?|boutiques?|buy)\b/i, "Shopping"],
  [/\b(?:transit|transport|metro|tram|bus|getting around|city pass|pass(?:es)?|luggage|arrival)\b/i, "Getting Around"],
  [/\b(?:tips?|customs?|language|phrases?|safety|etiquette|good to know|practical|currency|money)\b/i, "Local Tips"],
  [/\b(?:sights?|see|landmarks?|views?|museums?|galler(?:y|ies)|churche?s?|culture|monuments?)\b/i, "Sights & Culture"],
];

const SECTION_TEXT_HINTS: Array<[RegExp, CityNoteSection]> = [
  [/\b(?:currency|huf|exchange rate|phrases?|pronunciation|pronounce|etiquette|customs?|safety|skippable|good to know|tipping)\b/i, "Local Tips"],
  [/\b(?:metro|tram|transit|public transport|city pass|train ticket tip|airport bus|getting around)\b/i, "Getting Around"],
  [/\b(?:shop|shopping|souvenir|boutique|watch shop|market for)\b/i, "Shopping"],
  [/\b(?:bar|bars|beer|wine|cocktail|nightlife|pub|brewery|cellar|ruin bar)\b/i, "Drinks & Nightlife"],
  [/\b(?:eat|food|restaurant|cafe|café|pastry|bakery|langos|lángos|trdelnik|soup|dish|meal|pizza|schnitzel|strudel)\b/i, "Food"],
  [/\b(?:museum|gallery|church|cathedral|basilica|synagogue|castle|palace|tower|statue|monument|landmark|view|sight)\b/i, "Sights & Culture"],
];

function classifyCityNoteSection({
  category,
  label,
  text,
}: {
  category: string | null;
  label: string | null;
  text: string;
}): CityNoteSection {
  if (label) {
    for (const [pattern, section] of SECTION_LABEL_HINTS) {
      if (pattern.test(label)) return section;
    }
  }
  for (const [pattern, section] of SECTION_TEXT_HINTS) {
    if (pattern.test(text)) return section;
  }
  switch (category) {
    case "food_dining":
      return "Food";
    case "nightlife_entertainment":
      return "Drinks & Nightlife";
    case "shopping_tailor":
      return "Shopping";
    case "admin_logistics":
      return "Getting Around";
    case "art_culture":
    case "temple_shrine":
    case "tours_tickets":
    case "scenic_ride":
      return "Sights & Culture";
    default:
      return "Notes";
  }
}

function cityNoteCollectionSections(notes: CanonicalEvidencePiece[]) {
  const sections = new Map<CityNoteSection, string[]>();
  const excludedCosts: string[] = [];

  const addEntry = (
    section: CityNoteSection,
    entry: string
  ) => {
    const existing = sections.get(section) ?? [];
    sections.set(
      section,
      mergeCityNoteDescription(existing.join("\n"), entry)?.split("\n") ?? existing
    );
  };

  for (const note of notes) {
    const label =
      stringValue(note.payload, "_canonicalNoteCollectionLabel") ?? null;
    const category = stringValue(note.payload, "category");
    const title = stringValue(note.payload, "title");

    if (note.payload._canonicalNoteEntry === true && title) {
      const text = sanitizeCityNoteText(title);
      if (typeof text !== "string" || !text) continue;
      if (COSTS_CONTENT_PATTERN.test(text)) {
        excludedCosts.push(text);
        continue;
      }
      addEntry(classifyCityNoteSection({ category, label, text }), text);
      continue;
    }

    const raw = sanitizeCityNoteText(
      note.payload.description ?? note.payload.title
    );
    if (typeof raw !== "string" || !raw) continue;
    // Classify segment by segment so mixed prose lands in the right
    // sections and budget lines can be excluded without losing neighbors.
    const segments = raw
      .split(/(?:\r?\n)+/).flatMap((part) => part.split(PROSE_SEGMENT_SPLIT))
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (COSTS_CONTENT_PATTERN.test(segment)) {
        excludedCosts.push(segment);
        continue;
      }
      addEntry(
        classifyCityNoteSection({ category, label, text: segment }),
        segment
      );
    }
  }

  const orderedSections = CITY_NOTE_SECTIONS.filter((section) =>
    (sections.get(section) ?? []).length > 0
  ).map((section) => ({
    entries: sections.get(section) ?? [],
    section,
  }));

  return { excludedCosts, sections: orderedSections };
}

function renderCityNoteSectionEntries(entries: string[]) {
  let rendered = "";
  for (const entry of entries) {
    if (!rendered) {
      rendered = entry;
      continue;
    }
    rendered += /[.!?]$/.test(rendered) ? ` ${entry}` : `, ${entry}`;
  }
  return rendered;
}

function renderCityNoteSections(
  sections: Array<{ entries: string[]; section: CityNoteSection }>
) {
  return sections
    .map(
      ({ entries, section }) =>
        `${section}: ${renderCityNoteSectionEntries(entries)}`
    )
    .join("\n");
}

function cityNoteCollectionDescription(notes: CanonicalEvidencePiece[]) {
  const { sections } = cityNoteCollectionSections(notes);
  if (sections.length === 0) return null;

  return renderCityNoteSections(sections);
}

// Content beats context (defect docket 2026-07-17): appendix material — a
// Colosseum ticket sitting among the Prague lockbox pages — inherits the
// wrong city from its surroundings. Before notes consolidate, any note whose
// text names a canonical entity that lives in a DIFFERENT city routes to
// that entity's lineage instead of polluting this city's notes.
function rerouteCrossCityNoteContent(pieces: CanonicalEvidencePiece[]) {
  const cityForDate = canonicalCityForDate(pieces);
  const entities = pieces.filter(
    (piece) =>
      piece.outputEligible &&
      (piece.kind === "activity" || piece.kind === "stay" || piece.kind === "transport") &&
      piece.payload._canonicalGroupRole !== "child"
  );
  const entityIndex = entities
    .map((piece) => {
      const title =
        stringValue(piece.payload, "title") ?? stringValue(piece.payload, "name");
      const tokens = title ? distinctiveTitleTokens(title) : [];
      const date =
        stringValue(piece.payload, "date") ??
        stringValue(piece.payload, "checkIn") ??
        stringValue(piece.payload, "firstNightDate");
      const city =
        normalizedComparable(stringValue(piece.payload, "city")) ||
        cityForDate(date);
      return tokens.length > 0 && city ? { city, piece, tokens } : null;
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  for (const note of pieces) {
    if (!note.outputEligible || note.kind !== "note") continue;
    if (
      note.payload._canonicalGroupRole === "parent" ||
      note.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    const noteCity =
      normalizedComparable(stringValue(note.payload, "city")) ||
      cityForDate(stringValue(note.payload, "date"));
    if (!noteCity) continue;
    const text = foldForSourceSupport(
      [note.payload.title, note.payload.description].filter(Boolean).join(" ")
    );
    if (!text) continue;

    // A wholesale reroute is destructive: it moves the ENTIRE note onto the
    // named entity. That is only safe when the note is genuinely about that
    // entity — a short, single-topic note with a distinctive multi-token
    // match. A multi-segment tips blob that merely mentions a name from
    // another leg keeps its city home (live-run 7.18.0 killed the Budapest
    // public-transport tip through this rule).
    const owner = entityIndex.find(
      (entity) =>
        entity.city !== noteCity &&
        entity.tokens.every((token) => text.includes(token))
    );
    if (!owner) continue;
    // A named tips/ideas collection is multi-topic city content: mentioning
    // an entity from another leg does not make the whole note that entity's
    // material (live-run 7.18.0 killed the "Budapest public transportation
    // tip" this way). Single-topic notes (a stray ticket screenshot) still
    // route wholesale.
    if (
      /\b(?:tips?|ideas?|notes?|recommendations?|guide)\b/i.test(
        stringValue(note.payload, "title") ?? ""
      )
    ) {
      continue;
    }

    note.payload.description = sanitizeCityNoteText(
      stringValue(note.payload, "description")
    );
    mergeCanonicalPieceInto({
      reason:
        "content beats context: note text names an entity in another leg, so it routes to that entity instead of this city's notes",
      source: note,
      target: owner.piece,
    });
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
    const { excludedCosts, sections } = cityNoteCollectionSections(group);
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
        _canonicalNoteSections: sections,
        category: first.payload.category,
        city,
        date: null,
        description:
          sections.length > 0
            ? renderCityNoteSections(sections)
            : cityNoteCollectionDescription(group),
        itemType: "note",
        title: `${city} Notes & Tips`,
      },
      role: "city_note_candidate",
    };
    pieces.splice(insertionIndex >= 0 ? insertionIndex : pieces.length, 0, target);

    if (excludedCosts.length > 0) {
      addCanonicalAction(target, {
        absorbedTitles: excludedCosts,
        observationIds: [],
        reason:
          "costs/budget planning content excluded from traveler notes (ground truth: Costs section is a planning artifact)",
        type: "rejected",
      });
    }

    for (const note of group) {
      mergeCanonicalPieceInto({
        preserveTargetIdentity: true,
        reason: `canonical ${city} note collection`,
        source: note,
        target,
      });
    }

    // Collection integrity (live-run 7.18.0: Mistral Cafe, Cafe Louvre,
    // Malostranská Beseda, Country Life, and Pontoon were all routed into
    // their city collection yet absent from the final note text): every
    // routed note's content must land in the rendered note or carry an
    // explicit exclusion disposition. Anything else is silent content loss —
    // restore it into its classified section and record the recovery.
    const renderedNow = () =>
      normalizedComparable(stringValue(target.payload, "description") ?? "");
    const excludedNormalized = excludedCosts.map((entry) =>
      normalizedComparable(entry)
    );
    const restored: string[] = [];
    for (const note of group) {
      const label =
        stringValue(note.payload, "_canonicalNoteCollectionLabel") ?? null;
      const category = stringValue(note.payload, "category");
      const candidates =
        note.payload._canonicalNoteEntry === true
          ? [stringValue(note.payload, "title")]
          : [
              ...(sanitizeCityNoteText(
                note.payload.description ?? note.payload.title
              ) as string | null ?? "")
                .split(PROSE_SEGMENT_SPLIT)
                .map((segment) => segment.trim()),
            ];
      for (const candidate of candidates) {
        if (!candidate || candidate.length < 4) continue;
        const normalized = normalizedComparable(candidate);
        if (!normalized || normalized.length < 4) continue;
        if (renderedNow().includes(normalized)) continue;
        if (
          excludedNormalized.some(
            (excluded) =>
              excluded.includes(normalized) || normalized.includes(excluded)
          )
        ) {
          continue;
        }
        if (COSTS_CONTENT_PATTERN.test(candidate)) continue;
        const section = classifyCityNoteSection({
          category,
          label,
          text: candidate,
        });
        const description = stringValue(target.payload, "description");
        const line = `${section}: ${candidate}`;
        target.payload.description = description
          ? `${description}\n${line}`
          : line;
        restored.push(candidate);
      }
    }
    if (restored.length > 0) {
      addCanonicalAction(target, {
        absorbedTitles: restored.slice(0, 12),
        observationIds: [],
        reason:
          "note content restored by the city-note collection integrity check (routed content must land or carry an explicit disposition)",
        type: "recovered",
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
    // A same-site visit owns its timed sub-stops (approved answer key:
    // Changing of the Guard 12:00 inside Prague Castle). Booking-carrying
    // stops are already excluded by the decision creator. Route walks keep
    // the standard rule: independently timed stops stay standalone.
    const sameSiteVisitDecision = decision.claim.startsWith("same-site visit");

    // Same-site membership is VERIFIED, never taken on the decision's word
    // (live-run 7.18.0: a resolver decision claimed Chain Bridge and
    // Gerbeaud's sat "within 300 m" of the Royal Palace with no coordinates
    // anywhere in the payload, and a parser-manufactured "Prague Castle and
    // Lesser Town visit" container swallowed Lesser Town sights, KGB, and a
    // lodging-cost note). Doctrine v3: a same-site child needs parser-
    // coordinate proof or source-hierarchy proof; a container naming two
    // distinct sites is not one site; cost/budget fragments are never
    // tourist stops; and the call claim must state the rule that actually
    // held.
    let verifiedSourcePieces = sourcePieces;
    if (sameSiteVisitDecision) {
      const siteContainer = explicitContainer ?? promotedParent ?? requestedAnchor;
      const containerRawTitle = stringValue(siteContainer.payload, "title") ?? "";
      const multiSiteTitle =
        /^(.{3,}?)\s+(?:and|&|to)\s+(.{3,}?)(?:\s+visit)?$/i.test(containerRawTitle) &&
        SAME_SITE_CONTAINER_PATTERN.test(containerRawTitle);
      if (multiSiteTitle) {
        continue;
      }
      // Run5 PB-4: a passing mention is never a visit container, whichever
      // layer proposed the decision.
      if (PASSING_MENTION_TITLE_PATTERN.test(containerRawTitle)) {
        continue;
      }
      const origin = precisePieceCoordinates(siteContainer);
      const containerText = normalizedComparable(
        [siteContainer.payload.title, siteContainer.payload.description]
          .filter(Boolean)
          .join(" ")
      );
      const containerTokens = distinctiveTitleTokens(containerRawTitle);
      let geoVerifiedCount = 0;
      verifiedSourcePieces = sourcePieces.filter((piece) => {
        if (piece === siteContainer) return true;
        const text = activityText(piece.payload);
        if (COSTS_CONTENT_PATTERN.test(text)) return false;
        // Run5 PB-4: the geo path requires precise coordinates on both
        // ends; a timed stop joins by coordinates only when it shares the
        // container's category (RW-GRP-001 timed-child rule). Source
        // hierarchy below still admits timed children.
        const coords = precisePieceCoordinates(piece);
        const timedCategoryOk =
          !timeFrom(piece.payload) ||
          (Boolean(stringValue(piece.payload, "category")) &&
            stringValue(piece.payload, "category") ===
              stringValue(siteContainer.payload, "category"));
        if (
          origin &&
          coords &&
          timedCategoryOk &&
          haversineKm(origin, coords) <= SAME_SITE_RADIUS_KM
        ) {
          geoVerifiedCount += 1;
          return true;
        }
        const childRawTitle = stringValue(piece.payload, "title");
        const childTitle = normalizedComparable(childRawTitle);
        if (!childTitle) return false;
        if (
          childRawTitle &&
          containerListsComponent(
            stringValue(siteContainer.payload, "description"),
            childRawTitle
          )
        ) {
          return true;
        }
        return containerTokens.some(
          (token) => token.length >= 5 && childTitle.includes(token)
        );
      });
      if (
        verifiedSourcePieces.filter((piece) => piece !== siteContainer).length < 2
      ) {
        continue;
      }
      if (/within\s+\d+\s*m/i.test(decision.claim) && geoVerifiedCount === 0) {
        const childCount = verifiedSourcePieces.filter(
          (piece) => piece !== siteContainer
        ).length;
        decision.claim = `same-site visit: the source lists ${childCount} stops inside ${containerRawTitle}'s own visit, so one visit card owns them`;
      }
    }

    const independentFixedPieces = sameSiteVisitDecision
      ? []
      : fixedPieces.filter((piece) => piece !== promotedParent);
    const groupedChildPieces = verifiedSourcePieces.filter(
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
      // The call must state the rule that actually fired (defect docket
      // 2026-07-17), not a generic source-structure claim.
      reason: decision.claim,
      resolverDecisionId: decision.decisionId,
      relatedCanonicalPieceId: parent.id,
      relatedTitle: stringValue(parent.payload, "title"),
      subjectType: "item",
      targetField: "presentation",
    });
  }

  return calls;
}

// Maker-visible record of a duplicate fold (Eli, 2026-07-17 wave 1): a
// transport/stay duplicate card that previously surfaced as a hard collision
// warning now merges silently at assembly, with one statement-style call so
// the maker can see what happened ("We merged 'Train to Budapest' into your
// Travel row"). Routine same-day shadows (fly-to/check-in lines the parser
// always re-emits) stay silent — only the cross-date ticket-copy fold, which
// a maker might genuinely miss, gets the call.
function createCanonicalDuplicateFoldCalls(pieces: CanonicalEvidencePiece[]) {
  const calls: Array<Record<string, unknown>> = [];
  for (const piece of pieces) {
    if (piece.outputEligible) continue;
    const representedBy = stringValue(piece.payload, "_representedByPieceId");
    if (!representedBy) continue;
    const target = pieces.find((candidate) => candidate.id === representedBy);
    if (!target || !target.outputEligible) continue;
    const foldedTitle = stringValue(piece.payload, "title") ?? "A duplicate card";
    const targetTitle =
      stringValue(piece.payload, "_representedByTitle") ??
      stringValue(target.payload, "title") ??
      "its Travel row";
    calls.push({
      _canonicalReviewDisposition: "call",
      answerType: "confirm",
      assemblySource: "canonical_evidence",
      confidence: "high",
      evidence: `"${foldedTitle}" repeats the ${targetTitle} segment's ticket details on a different day, so the Travel row is its single home.`,
      guessedValue: targetTitle,
      prompt: `We merged the duplicate card "${foldedTitle}" into your ${targetTitle} travel row.`,
      reason:
        "duplicate transport card folded into its canonical travel row (one traveler-visible home, RW-ASM-001)",
      relatedCanonicalPieceId: target.id,
      relatedTitle: targetTitle,
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

// --- Source-truth support stamping (RW-EVD-001, defect docket 2026-07-17) ---
//
// Each model observation is checked against the source text of the chunk
// that produced it. A record whose distinctive title words appear NOWHERE in
// its producing chunk is a model invention ("Prague Walking Tour" dated into
// the Rome leg) and is suppressed to evidence-only lineage — silently, per
// CEO decision. Confirmation codes that do not appear verbatim in the chunk
// text are scrubbed. Deliberately conservative: only zero-support suppresses,
// and stages without sourceText (spine, fixtures) are never judged.

const SOURCE_SUPPORT_STOPWORDS = new Set([
  "and", "bar", "breakfast", "cafe", "castle", "cathedral", "church", "day",
  "dinner", "for", "hostel", "hotel", "lunch", "museum", "note", "notes",
  "restaurant", "route", "the", "tour", "tours", "trip", "visit", "walk",
  "walking", "with",
]);

function foldForSourceSupport(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

function distinctiveTitleTokens(title: string) {
  return foldForSourceSupport(title)
    .split(/\s+/)
    .filter(
      (token) => token.length >= 3 && !SOURCE_SUPPORT_STOPWORDS.has(token)
    );
}

// Structural words only — venue-type words ("castle", "museum", "hostel")
// stay MEANINGFUL here. Used by bare-stay-name shadow matching, where
// dropping venue words caused the 7.17.2 Prague Castle suppression (PB-2).
const STAY_ALIAS_STRUCTURAL_STOPWORDS = new Set([
  "and", "the", "for", "with", "day", "trip", "visit", "check", "checkin",
  // Lodging-role words never distinguish an activity title from its stay
  // ("Vitae Hostel stay" ≡ Vitae Hostel — live-run 7.18.0 shipped it as a
  // public activity card carrying the stay address).
  "stay", "staying", "night", "nights", "lodging", "accommodation",
  "arrive", "arrival", "checkout",
]);

function stayAliasTitleTokens(title: string) {
  return foldForSourceSupport(title)
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 && !STAY_ALIAS_STRUCTURAL_STOPWORDS.has(token)
    );
}

function stampSourceSupport(
  payload: Record<string, unknown>,
  collection: string,
  sourceText: string | null
) {
  if (!sourceText) return;
  const corpus = foldForSourceSupport(sourceText);

  const confirmation = stringValue(payload, "confirmation");
  if (
    confirmation &&
    confirmation.length >= 4 &&
    !corpus.includes(foldForSourceSupport(confirmation).trim())
  ) {
    payload.confirmation = null;
    payload._verificationNotes = "confirmation code not present in source text";
  }

  if (collection !== "activities") return;
  const title = stringValue(payload, "title");
  if (!title) return;
  const tokens = distinctiveTitleTokens(title);
  if (tokens.length === 0) return;

  payload._sourceSupport = tokens.some((token) => corpus.includes(token))
    ? "supported"
    : "unsupported";
}

function suppressUnsupportedModelInventions(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[]
) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );

  for (const piece of pieces) {
    if (!piece.outputEligible) continue;
    if (piece.kind !== "activity" && piece.kind !== "note") continue;

    let judged = 0;
    let unsupported = 0;
    for (const observationId of piece.observationIds) {
      const support = stringValue(
        observationById.get(observationId)?.payload ?? {},
        "_sourceSupport"
      );
      if (!support) continue;
      judged += 1;
      if (support === "unsupported") unsupported += 1;
    }

    if (judged > 0 && unsupported === judged) {
      suppressCanonicalPiece(
        piece,
        "no source support: distinctive title words absent from the producing chunk text (model invention)"
      );
    }
  }
}

// --- Slot-collision collapse (defect docket 2026-07-17, triple lunch) ---
//
// Identity matching keyed on title tokens misses the same real-world thing
// wearing different names: "U Malířů" / "Restaurant Festival reservation at
// U Malířů 1543" / "Lunch", all at 13:00 on the same day. A day has one
// 13:00 food slot: same date + same clock time + same category is one
// entity unless the copies carry two DIFFERENT booking codes (affirmative
// evidence of two bookings). The booking-anchored copy wins identity; the
// best proper-name title wins the label (existing field-rank rules); losers
// stay in lineage per the CEO's merge-bias decision.

// A card whose title is nothing but a place fragment ("Prague Downtown")
// sharing the exact slot of a real card is a shard of that card's source
// line, not an activity (live-run 7.17.2: the rental-car line "Revoluční
// 1044/23, Prague Downtown … Return 8:00 PM" shed a 9:00 "Prague Downtown"
// card with description "Return").
const LOCATION_GENERIC_TOKENS = new Set([
  "downtown", "city", "center", "centre", "central", "district", "old",
  "town", "new", "street", "avenue", "square", "area", "quarter",
]);

function absorbLocationFragmentCards(pieces: CanonicalEvidencePiece[]) {
  const absorbTripCities = pieceTripCityNames(pieces);
  const cityTokens = new Set(
    pieces
      .filter((piece) => piece.kind === "place")
      .flatMap((piece) =>
        foldForSourceSupport(stringValue(piece.payload, "city") ?? "")
          .split(/\s+/)
          .filter(Boolean)
      )
  );
  const slots = new Map<string, CanonicalEvidencePiece[]>();
  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const date = stringValue(piece.payload, "date");
    const time = normalizedClockTime(timeFrom(piece.payload));
    if (!date || !time) continue;
    const key = `${date}|${time}`;
    const slot = slots.get(key);
    if (slot) slot.push(piece);
    else slots.set(key, [piece]);
  }

  for (const slot of slots.values()) {
    if (slot.length < 2) continue;
    for (const fragment of slot) {
      if (!fragment.outputEligible) continue;
      if (confirmationFrom(fragment.payload)) continue;
      const titleTokens = foldForSourceSupport(
        stringValue(fragment.payload, "title") ?? ""
      )
        .split(/\s+/)
        .filter(Boolean);
      if (titleTokens.length === 0) continue;
      const isLocationFragment = titleTokens.every(
        (token) =>
          cityTokens.has(token) ||
          LOCATION_GENERIC_TOKENS.has(token) ||
          token.length < 3
      );
      if (!isLocationFragment) continue;
      const target = slot.find(
        (candidate) =>
          candidate !== fragment &&
          candidate.outputEligible &&
          distinctiveTitleTokens(stringValue(candidate.payload, "title") ?? "")
            .length > 0 &&
          // Shared winner-ladder veto (Phase 1): an overview/day-arc/heading-
          // fragment card can never absorb a fragment as merge winner.
          pieceCanWinMerge(candidate, absorbTripCities)
      );
      if (!target) continue;
      mergeCanonicalPieceInto({
        reason:
          "place-fragment card absorbed by the real card sharing its exact source slot",
        source: fragment,
        target,
      });
    }
  }
}

// One unresolved choice is ONE card (RW-QUE-001 disjunction rule; live-run
// 7.18.1 shipped "Lunch option" + "Lunch in Buda" + "Pest-Buda Bistro" +
// "Cafe Pierrot" — four cards and a question for one lunch). Two passes:
// same-day near-identical descriptions collapse to one card, then cards
// titled after an option named in a surviving card's "X or Y" description
// fold into that slot card.
function collapseAlternativeSlotCards(pieces: CanonicalEvidencePiece[]) {
  const winnerTimedCounts = timedActivityCountsByDate(pieces);
  const winnerTripCities = pieceTripCityNames(pieces);
  const candidates = () =>
    pieces.filter(
      (piece) =>
        committedMentionPieceCandidate(piece) &&
        piece.payload._canonicalGroupRole !== "parent" &&
        piece.payload._canonicalGroupRole !== "child"
    );

  // Pass 1: near-identical same-day descriptions ("Stroll through Castle
  // Hill and Buda Castle" twice at 10:30) are one plan.
  let merged = true;
  while (merged) {
    merged = false;
    const current = candidates();
    outer: for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) {
        const left = current[i];
        const right = current[j];
        if (!sameCanonicalDate(left.payload, right.payload)) continue;
        // A site container and an "X at <site>" component are grouping
        // structure, never duplicates — sameEntity refuses the pair
        // outright (Arc B, live-run 7.18.3 PB-2: "Palm house at
        // Schonbrunn" beat "Schonbrunn Palace visit" here and the palace
        // was deleted downstream).
        if (
          isSiteComponentTitlePair(
            stringValue(left.payload, "title"),
            stringValue(right.payload, "title")
          )
        ) {
          continue;
        }
        const leftTime = timeFrom(left.payload);
        const rightTime = timeFrom(right.payload);
        if (leftTime && rightTime && leftTime !== rightTime) continue;
        const leftDesc = identityTokens(
          stringValue(left.payload, "description") ?? ""
        );
        const rightDesc = identityTokens(
          stringValue(right.payload, "description") ?? ""
        );
        if (leftDesc.length < 4 || rightDesc.length < 4) continue;
        const overlap = overlapCount(leftDesc, rightDesc);
        const smaller = Math.min(leftDesc.length, rightDesc.length);
        if (overlap / smaller < 0.9) continue;
        // The copy carrying the unresolved "X or Y" choice is the slot's most
        // complete representation and must win the merge — losing it to a
        // better-titled option card silently resolves the maker's choice.
        // EXCEPT against merge-ineligible cards: a day-arc/heading-fragment
        // card ("Explore Vienna") whose description merely summarizes the day
        // can never beat a named venue ("Schonbrunn Palace") — the exact live
        // run 7.18.2 mechanism that deleted Schönbrunn (PB-3, audit A1).
        const orBonus = (piece: CanonicalEvidencePiece) =>
          /\bor\b/i.test(stringValue(piece.payload, "description") ?? "")
            ? 1
            : 0;
        const decision = chooseMergeWinner(
          mergeWinnerCardForPiece(left, winnerTimedCounts),
          mergeWinnerCardForPiece(right, winnerTimedCounts),
          {
            leftBonus: orBonus(left),
            rightBonus: orBonus(right),
            tripCities: winnerTripCities,
          }
        );
        const target = decision.winner === "left" ? left : right;
        const source = target === left ? right : left;
        mergeCanonicalPieceInto({
          reason:
            "same plan described twice on one day: near-identical descriptions collapse to one card",
          source,
          target,
        });
        merged = true;
        break outer;
      }
    }
  }

  // Pass 2: an option named inside a surviving card's "at X or Y" choice is
  // that slot's alternative, never its own card — unless it carries its own
  // time or booking.
  const optionPattern = /\bat\s+([^.;]{3,60}?)\s+or\s+([^.;]{3,60}?)(?=[.;]|$)/i;
  for (const slotCard of candidates()) {
    const description = stringValue(slotCard.payload, "description") ?? "";
    const match = optionPattern.exec(description);
    if (!match) continue;
    const optionNames = [match[1], match[2]]
      .map((value) => normalizedComparable(value))
      .filter((value) => value.length >= 4);
    if (optionNames.length === 0) continue;
    for (const piece of candidates()) {
      if (piece === slotCard) continue;
      if (!sameCanonicalDate(piece.payload, slotCard.payload)) continue;
      if (timeFrom(piece.payload) || confirmationFrom(piece.payload)) continue;
      const title = normalizedComparable(stringValue(piece.payload, "title"));
      if (!title || !optionNames.some((option) => option === title)) continue;
      mergeCanonicalPieceInto({
        reason:
          "alternative-slot option folded into the committed slot card (one unresolved choice, one card)",
        source: piece,
        target: slotCard,
      });
    }
  }
}

function collapseSlotCollisions(pieces: CanonicalEvidencePiece[]) {
  const winnerTimedCounts = timedActivityCountsByDate(pieces);
  const winnerTripCities = pieceTripCityNames(pieces);
  const slots = new Map<string, CanonicalEvidencePiece[]>();

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const date = stringValue(piece.payload, "date");
    const time = normalizedClockTime(timeFrom(piece.payload));
    const category = stringValue(piece.payload, "category");
    if (!date || !time || !category) continue;
    const key = `${date}|${time}|${category}`;
    const slot = slots.get(key);
    if (slot) slot.push(piece);
    else slots.set(key, [piece]);
  }

  for (const slot of slots.values()) {
    if (slot.length < 2) continue;

    const confirmations = new Set(
      slot
        .map((piece) => confirmationFrom(piece.payload))
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizedComparable(value))
    );
    // Two different booking codes = two real bookings; leave untouched.
    if (confirmations.size > 1) continue;

    // Winner comes from the shared ladder (Phase 1, audit A1/A4):
    // eligibility (day-arc/heading-fragment cards can never win) > booking >
    // named venue > commitment > specificity > title quality.
    const ranked = [...slot].sort((left, right) =>
      chooseMergeWinner(
        mergeWinnerCardForPiece(left, winnerTimedCounts),
        mergeWinnerCardForPiece(right, winnerTimedCounts),
        { tripCities: winnerTripCities }
      ).winner === "left"
        ? -1
        : 1
    );
    const winner = ranked[0];
    const mergedLosers: CanonicalEvidencePiece[] = [];

    for (const loser of ranked.slice(1)) {
      // Semantic guard (live-run 7.18.1: "Prague Castle" carried the 12:00
      // time bled from "Changing of the Guard at 12:00 PM" and slot
      // collision merged the SITE into the timed EVENT, deleting the castle
      // from the app — same defect family as castle-as-lodging). Sharing a
      // slot is only identity evidence when the titles are related (token
      // overlap), one title is generic, or one text cross-references the
      // other title AND the pair is not a site-vs-event mismatch.
      const winnerTitle = stringValue(winner.payload, "title") ?? "";
      const loserTitle = stringValue(loser.payload, "title") ?? "";
      const winnerTokens = identityTokens(winnerTitle);
      const loserTokens = identityTokens(loserTitle);
      const loserGeneric = distinctiveTitleTokens(loserTitle).length === 0;
      const winnerGeneric = distinctiveTitleTokens(winnerTitle).length === 0;
      const titlesRelated = overlapCount(winnerTokens, loserTokens) >= 1;
      const crossReferenced = (() => {
        const winnerText = normalizedComparable(
          `${winnerTitle} ${stringValue(winner.payload, "description") ?? ""}`
        );
        const loserText = normalizedComparable(
          `${loserTitle} ${stringValue(loser.payload, "description") ?? ""}`
        );
        const winnerNeedle = normalizedComparable(winnerTitle);
        const loserNeedle = normalizedComparable(loserTitle);
        return Boolean(
          (loserNeedle.length >= 4 && winnerText.includes(loserNeedle)) ||
            (winnerNeedle.length >= 4 && loserText.includes(winnerNeedle))
        );
      })();
      const siteVsEvent =
        SAME_SITE_CONTAINER_PATTERN.test(winnerTitle) !==
        SAME_SITE_CONTAINER_PATTERN.test(loserTitle);
      const sameEntity =
        loserGeneric ||
        winnerGeneric ||
        titlesRelated ||
        (crossReferenced && !siteVsEvent);
      if (!sameEntity) continue;
      mergeCanonicalPieceInto({
        reason:
          "slot collision: same day, time, and category describe one planned entity; duplicate copies merged into the booking-anchored card",
        source: loser,
        target: winner,
      });
      mergedLosers.push(loser);
    }

    // The venue name wins the label: a copy's title that is cross-referenced
    // inside another copy's text ("Restaurant Festival reservation at U
    // Maliru 1543") is the entity's real name. The retitle only considers
    // copies that actually merged (audit A2: the old whole-slot scan could
    // retitle the winner after an excluded site card's name even though that
    // site never merged, re-opening the castle-eaten-by-event path).
    const retitleParticipants = [winner, ...mergedLosers];
    const participantTexts = retitleParticipants.map((piece) =>
      normalizedComparable(
        `${stringValue(piece.payload, "title") ?? ""} ${
          stringValue(piece.payload, "description") ?? ""
        }`
      )
    );
    const crossReferencedTitle = retitleParticipants
      .map((piece, index) => ({
        index,
        title: stringValue(piece.payload, "title"),
      }))
      .find(({ index, title }) => {
        if (!title || title.length < 4) return false;
        // Generic meal-slot words ("Lunch") are not venue names.
        if (distinctiveTitleTokens(title).length === 0) return false;
        const needle = normalizedComparable(title);
        if (!needle || needle.length < 4) return false;
        return participantTexts.some(
          (text, textIndex) => textIndex !== index && text.includes(needle)
        );
      })?.title;

    if (mergedLosers.length > 0 && crossReferencedTitle) {
      winner.payload.title = crossReferencedTitle;
      piecePayloadTitleLock(winner);
    }
  }
}

function piecePayloadTitleLock(piece: CanonicalEvidencePiece) {
  piece.fieldWinnerRanks.title = Math.max(
    piece.fieldWinnerRanks.title ?? 0,
    90_000
  );
}

// --- Title-containment collapse (defect docket 2026-07-17) ---
//
// "Parliament" vs "Parliament tour", "Baths" vs "Budapest baths": same-day
// unbooked mentions where one title's distinctive words are a subset of the
// other's are one entity. Tokens are compared with naive plural folding so
// "bath house" and "baths" can meet. The more specific title survives.

function collapseTitleContainmentAliases(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[] = []
) {
  const containmentTripCities = pieceTripCityNames(pieces);
  const containmentObservationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  // Post-merge title drift evades noun guards (PB-2b): guards must judge
  // the titles of a piece's OBSERVATIONS too, not just its current payload
  // title ("Palm house at Schonbrunn" after a merge still holds the
  // "Schonbrunn Palace visit" observation).
  const observationTitles = (piece: CanonicalEvidencePiece) =>
    piece.observationIds
      .map((id) => containmentObservationById.get(id))
      .filter(
        (observation): observation is EvidenceObservation =>
          Boolean(observation) && observation?.kind === "activity"
      )
      .map((observation) => stringValue(observation.payload, "title"))
      .filter((title): title is string => Boolean(title));
  const byDate = new Map<
    string,
    Array<{ phrase: string; piece: CanonicalEvidencePiece }>
  >();

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    if (confirmationFrom(piece.payload)) continue;
    const date = stringValue(piece.payload, "date");
    const title = stringValue(piece.payload, "title");
    if (!date || !title) continue;
    if (distinctiveTitleTokens(title).length === 0) continue;
    const phrase = normalizedComparable(title);
    if (!phrase) continue;
    const group = byDate.get(date);
    const entry = { phrase, piece };
    if (group) group.push(entry);
    else byDate.set(date, [entry]);
  }

  for (const group of byDate.values()) {
    if (group.length < 2) continue;
    // Longer phrases are more specific; whole-phrase containment only
    // ("Parliament" inside "Parliament tour"), never token-subset matching
    // ("Tour Rome" is NOT inside "Watches in Rome").
    const ordered = [...group].sort(
      (left, right) => right.phrase.length - left.phrase.length
    );

    for (let i = 0; i < ordered.length; i += 1) {
      const specific = ordered[i];
      if (!specific.piece.outputEligible) continue;
      for (let j = i + 1; j < ordered.length; j += 1) {
        const generic = ordered[j];
        if (!generic.piece.outputEligible) continue;
        if (generic.phrase.length >= specific.phrase.length) continue;
        // A trailing/leading generic activity word does not defeat identity:
        // "Chain Bridge walk" and "Szechenyi Chain Bridge / Four Seasons
        // Hotel" are the same crossing (live-run 7.17.2 same-day dup). The
        // stripped phrase must still carry at least two tokens.
        const strippedGeneric = generic.phrase
          .replace(/^(?:walk|visit|stroll)\s+|\s+(?:walk|visit|stroll)$/g, "")
          .trim();
        const genericPhrase =
          strippedGeneric.split(" ").filter(Boolean).length >= 2
            ? strippedGeneric
            : generic.phrase;
        if (!` ${specific.phrase} `.includes(` ${genericPhrase} `)) continue;
        // Same-site containers ("River Palace" vs "River Palace Gardens")
        // are parent/child structure for the grouping layer, not aliases.
        // Judged on payload titles AND observation titles (PB-2b: title
        // drift after a merge must not evade the noun guard).
        const guardTitles = [
          generic.phrase,
          specific.phrase,
          ...observationTitles(generic.piece),
          ...observationTitles(specific.piece),
        ];
        if (guardTitles.some((title) => SAME_SITE_CONTAINER_PATTERN.test(title))) {
          continue;
        }
        // A component and its site (or two components of one site) are
        // never aliases (PB-2).
        if (
          isSiteComponentTitlePair(generic.phrase, specific.phrase) ||
          observationTitles(specific.piece).some((title) =>
            isSiteComponentTitlePair(generic.phrase, title)
          ) ||
          observationTitles(generic.piece).some((title) =>
            isSiteComponentTitlePair(title, specific.phrase)
          )
        ) {
          continue;
        }
        // Shared winner-ladder veto (Phase 1, audit A1/A4): the longer
        // phrase wins containment by design, but a merge-ineligible card
        // (overview/day-arc/heading fragment) can never absorb a real card.
        if (
          !pieceCanWinMerge(specific.piece, containmentTripCities) &&
          pieceCanWinMerge(generic.piece, containmentTripCities)
        ) {
          continue;
        }

        mergeCanonicalPieceInto({
          reason:
            "title containment: a less specific same-day mention names the same entity; folded into the specific card",
          source: generic.piece,
          target: specific.piece,
        });
      }
    }
  }
}

// --- Commitment rule of evidence (RW-CLS-001 / RW-CAN-001, 2026-07-17) ---
//
// A mention is COMMITTED when it carries a time, a booking/confirmation, or
// explicit planned language — or when it is hedge-free inside a sequenced day
// (a day with three or more explicitly timed activities), which is how an
// untimed stop inherits plannedness from a fully sequenced source day.
// Repeated same-name mentions with at least one committed copy keep the best
// copy and silently drop the rest; repeats where NO copy is committed become
// one City Note with no cards and no Question. Single uncommitted mentions
// keep the benefit of the doubt unless they carry a hedge marker such as
// "maybe", "if time", or "(far away)".

function committedMentionPieceCandidate(piece: CanonicalEvidencePiece) {
  return (
    piece.outputEligible &&
    piece.kind === "activity" &&
    piece.payload._canonicalGroupRole !== "parent" &&
    piece.payload._canonicalGroupRole !== "child" &&
    stringValue(piece.payload, "itemType") !== "note"
  );
}

function pieceHasHedgeMarker(piece: CanonicalEvidencePiece) {
  // Doubt is judged on the piece's OWN observation text, stamped at intake
  // (Arc B, live-run 7.18.3 PB-8: Prague Castle was hedge-demoted on a
  // doubt marker that rode in on ABSORBED sibling description fragments).
  // Pieces that never went through intake stamping (reapply paths,
  // fixtures) fall back to the merged-payload judgement.
  const stamped = piece.payload._ownTextHedge;
  if (typeof stamped === "boolean") return stamped;
  return classifyDraftActivityCard(activityInput(piece.payload))
    .hasWeakRecommendationMarker;
}

function timedActivityCountsByDate(pieces: CanonicalEvidencePiece[]) {
  const counts = new Map<string, number>();
  for (const piece of pieces) {
    if (!piece.outputEligible || piece.kind !== "activity") continue;
    const date = stringValue(piece.payload, "date");
    if (!date || !timeFrom(piece.payload)) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

function mentionCommitment(
  piece: CanonicalEvidencePiece,
  timedCounts: Map<string, number>
): MentionCommitment {
  // Fixed commitment: a (merged) time or confirmation on the payload, or
  // first-person planned language on the piece's OWN text (intake stamp;
  // absorbed sibling residue never fixes an entity — Arc B). Unstamped
  // pieces fall back to the merged-payload judgement.
  const stampedFixed = piece.payload._ownTextFixedCommitment;
  const hasFixedEvidence = Boolean(
    timeFrom(piece.payload) ||
      confirmationFrom(piece.payload) ||
      (typeof stampedFixed === "boolean"
        ? stampedFixed
        : classifyDraftActivityCard(activityInput(piece.payload))
            .hasStrongPlannedActivityLanguage)
  );
  const date = stringValue(piece.payload, "date");
  return resolveMentionCommitment({
    date,
    hasFixedEvidence,
    ownTextHedge: pieceHasHedgeMarker(piece),
    timedCardCountForDate: date ? timedCounts.get(date) ?? 0 : 0,
  });
}

function reviewSubjectTitles(missingDetails: unknown[]) {
  const titles = new Set<string>();
  for (const detail of missingDetails) {
    const related = stringValue(asRecord(detail), "relatedTitle");
    if (related) titles.add(normalizedComparable(related));
  }
  return titles;
}

function demoteCanonicalPieceToCityNote(
  piece: CanonicalEvidencePiece,
  reason: string
) {
  piece.kind = "note";
  piece.payload.itemType = "note";
  piece.payload.date = null;
  piece.payload.startTime = null;
  piece.payload.endTime = null;
  addCanonicalAction(piece, {
    absorbedTitles: [],
    observationIds: [...piece.observationIds],
    reason,
    type: "recovered",
  });
}

function canonicalCityForDate(pieces: CanonicalEvidencePiece[]) {
  const ranges: Array<{ arrive: string; city: string; leave: string }> = [];
  for (const piece of pieces) {
    if (piece.kind !== "place") continue;
    const city = stringValue(piece.payload, "city");
    const arrive = stringValue(piece.payload, "arriveDate");
    const leave = stringValue(piece.payload, "leaveDate");
    if (city && arrive && leave) ranges.push({ arrive, city, leave });
  }
  return (date: string | null) => {
    if (!date) return "";
    const match = ranges.find(
      (range) => date >= range.arrive && date <= range.leave
    );
    return match ? normalizedComparable(match.city) : "";
  };
}

function canonicalCitiesForDate(pieces: CanonicalEvidencePiece[]) {
  const ranges: Array<{ arrive: string; city: string; leave: string }> = [];
  for (const piece of pieces) {
    if (piece.kind !== "place") continue;
    const city = stringValue(piece.payload, "city");
    const arrive = stringValue(piece.payload, "arriveDate");
    const leave = stringValue(piece.payload, "leaveDate");
    if (city && arrive && leave) ranges.push({ arrive, city, leave });
  }
  return (date: string | null) => {
    const cities = new Set<string>();
    if (!date) return cities;
    for (const range of ranges) {
      if (date >= range.arrive && date <= range.leave) {
        cities.add(normalizedComparable(range.city));
      }
    }
    return cities;
  };
}

function citySetsOverlap(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return true;
  for (const city of left) if (right.has(city)) return true;
  return false;
}

function observationMentionDatesAndCommitment(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  const dates = new Set<string>();
  let anyCommitted = false;
  for (const observationId of piece.observationIds) {
    const observation = observationById.get(observationId);
    if (!observation || observation.kind !== "activity") continue;
    const date = stringValue(observation.payload, "date");
    if (date) dates.add(date);
    if (
      timeFrom(observation.payload) ||
      confirmationFrom(observation.payload) ||
      classifyDraftActivityCard(activityInput(observation.payload))
        .hasStrongPlannedActivityLanguage
    ) {
      anyCommitted = true;
    }
  }
  return { anyCommitted, dates };
}

// A dated DAY-PLAN section label ("Sunday, January 20th") versus the source's
// trailing notes/idea blob: membership in a deliberate day plan is the
// "stronger planned sighting" of RW-CLS-001 even without a time. The key's
// dedup rule (approved ground truth v2): St. Stephen's in Jan 19's idea list
// AND in Jan 20's short deliberate list → the Jan 20 planned visit wins and
// the note copy is removed. Live run 7.18.0 inverted this and killed the
// Jan 20 card.
const DAY_PLAN_SECTION_LABEL_PATTERN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i;

function pieceObservationLabels(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  return piece.observationIds
    .map((id) => observationById.get(id))
    .filter((observation): observation is EvidenceObservation =>
      Boolean(observation)
    )
    .flatMap((observation) =>
      [
        observation.sourceLabel,
        observation.sourceStructure?.sectionLabel ?? null,
      ].filter((value): value is string => Boolean(value))
    );
}

function isDeliberateDayPlanMention(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  const labels = pieceObservationLabels(piece, observationById);
  if (!labels.some((label) => DAY_PLAN_SECTION_LABEL_PATTERN.test(label))) {
    return false;
  }
  const text = [
    activityText(piece.payload),
    stringValue(piece.payload, "evidence") ?? "",
  ].join(" ");
  if (PRICE_MARKER_PATTERN.test(text)) return false;
  if (pieceHasHedgeMarker(piece)) return false;
  const classification = classifyDraftActivityCard(activityInput(piece.payload));
  return !classification.hasAvailabilityMarker;
}

function notesShareSourceSection(
  piece: CanonicalEvidencePiece,
  notePieces: CanonicalEvidencePiece[],
  observationById: Map<string, EvidenceObservation>
) {
  // Compare against the card's DAY-PLAN section labels ONLY. A merged copy
  // from the trailing notes blob must not poison this veto: in live run
  // 7.18.1 the parser emitted the Vienna venues both as day-section
  // activities and as a notes-blob reference list, the activity copies
  // merged (so every card carried the notes-blob label too), the veto saw a
  // "shared section" everywhere, and the entire Vienna leg folded into the
  // city note. The question the veto answers is: did the source list this
  // venue as a reference IN THE SAME DAY SECTION the card came from?
  const dayPlanLabels = new Set(
    pieceObservationLabels(piece, observationById).filter((label) =>
      DAY_PLAN_SECTION_LABEL_PATTERN.test(label)
    )
  );
  if (dayPlanLabels.size === 0) return true;
  return notePieces.some((note) =>
    pieceObservationLabels(note, observationById).some((label) =>
      dayPlanLabels.has(label)
    )
  );
}

function resolveUncommittedRepeatMentions(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const cityForDate = canonicalCityForDate(pieces);
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const groups = new Map<string, CanonicalEvidencePiece[]>();
  const undatedByTitle = new Map<string, CanonicalEvidencePiece[]>();

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const title = mentionComparableTitle(stringValue(piece.payload, "title"));
    if (!title) continue;
    const date = stringValue(piece.payload, "date");
    if (!date) {
      // Undated placeholders join their dated repeat group below (run6
      // smaller item: St. Stephen's ×4 + an undated placeholder + a date
      // question — the placeholder is the same entity, not a fifth copy).
      const bucket = undatedByTitle.get(title);
      if (bucket) bucket.push(piece);
      else undatedByTitle.set(title, [piece]);
      continue;
    }
    // Same name in a DIFFERENT leg is never a duplicate (RW-CAN-001):
    // key repeats by the city their date falls in.
    const key = `${title}|${cityForDate(date)}`;
    const group = groups.get(key);
    if (group) group.push(piece);
    else groups.set(key, [piece]);
  }

  for (const [title, undatedPieces] of undatedByTitle) {
    if (questionSubjects.has(title)) continue;
    const datedKeys = [...groups.keys()].filter(
      (key) => key.slice(0, key.lastIndexOf("|")) === title
    );
    if (datedKeys.length === 1) {
      groups.get(datedKeys[0])?.push(
        ...undatedPieces.filter(
          (piece) =>
            !questionSubjects.has(
              normalizedComparable(stringValue(piece.payload, "title"))
            )
        )
      );
    }
  }

  const commitmentRank: Record<MentionCommitment, number> = {
    fixed: 2,
    none: 0,
    sequenced: 1,
  };

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const title = key.slice(0, key.lastIndexOf("|"));

    const ranked = group
      .map((piece) => ({
        commitment: mentionCommitment(piece, timedCounts),
        piece,
      }))
      .sort(
        (left, right) =>
          commitmentRank[right.commitment] - commitmentRank[left.commitment]
      );
    const winner = ranked[0];

    if (winner.commitment !== "none") {
      // Only EXPLICITLY committed copies (own time, booking, first-person
      // language) survive as a second visit — multiple fixed copies are a
      // genuine planned double visit. A sequence-inherited copy is
      // placement evidence, not repeat evidence (RW-CAN-001 supersession;
      // live-run 7.18.3 PB-7: sequence-inheritance + distinct dates kept a
      // sixth-run Pinball duplicate — that is "dates alone" in disguise).
      // Sequenced and loose copies fold into the strongest copy.
      for (const entry of ranked.slice(1)) {
        if (entry.commitment === "fixed") continue;
        mergeCanonicalPieceInto({
          reason:
            entry.commitment === "sequenced"
              ? "repeat mention: sequence-inherited copy folds into the strongest copy (distinct dates alone are not repeat evidence)"
              : "repeat mention of a planned activity: the committed copy wins and the loose copy is silently removed",
          source: entry.piece,
          target: winner.piece,
        });
      }
      continue;
    }

    // No copy is committed. If exactly ONE copy sits in a deliberate
    // day-plan section, that membership is the "stronger planned sighting"
    // (RW-CLS-001; ground truth v2: the Jan 20 St. Stephen's plan beats
    // the Jan 19 idea copy) — it keeps the card and the other copies fold
    // into it. Otherwise: repeated but never committed → one City Note.
    if (questionSubjects.has(title)) continue;
    const deliberate = group.filter((piece) =>
      isDeliberateDayPlanMention(piece, observationById)
    );
    if (deliberate.length === 1) {
      const winnerPiece = deliberate[0];
      for (const extra of group) {
        if (extra === winnerPiece) continue;
        mergeCanonicalPieceInto({
          reason:
            "cross-day repeat: the deliberate day-plan copy is the planned sighting; the loose copy folds in (ground truth v2 dedup)",
          source: extra,
          target: winnerPiece,
        });
      }
      continue;
    }
    const [kept, ...rest] = group;
    for (const extra of rest) {
      mergeCanonicalPieceInto({
        reason:
          "repeated but never committed: duplicate mention folded into one city note",
        source: extra,
        target: kept,
      });
    }
    demoteCanonicalPieceToCityNote(
      kept,
      "repeated but never committed anywhere in the source: one city note, no cards, no question"
    );
  }

  // Repeat mentions the upstream identity merge already collapsed into one
  // piece: multiple activity observations on DISTINCT dates, none committed
  // (a same-day double listing stays a normal single card). Repeated but
  // never committed → one city note.
  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || questionSubjects.has(title)) continue;
    if (mentionCommitment(piece, timedCounts) !== "none") continue;
    const mentions = observationMentionDatesAndCommitment(piece, observationById);
    if (mentions.dates.size < 2 || mentions.anyCommitted) continue;

    demoteCanonicalPieceToCityNote(
      piece,
      "repeated across days but never committed anywhere in the source: one city note, no cards, no question"
    );
  }

  // Repeats split across kinds at intake: a hedged copy becomes a note piece
  // while the bare copy stays an activity. Same name in the same leg has one
  // home (RW-ASM-001): an uncommitted activity yields to its note copy, a
  // committed activity removes the note copy. Leg matching uses city-set
  // overlap because a travel day belongs to two legs at once.
  const citiesForDate = canonicalCitiesForDate(pieces);
  const noteCopies: Array<{
    cities: Set<string>;
    piece: CanonicalEvidencePiece;
    title: string;
  }> = [];
  for (const piece of pieces) {
    // Absorbed note copies (folded into a city note collection) still count
    // as the entity's note home, so eligibility is intentionally not checked.
    if (piece.kind !== "note") continue;
    if (
      piece.payload._canonicalGroupRole === "parent" ||
      piece.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title) continue;
    noteCopies.push({
      cities: citiesForDate(stringValue(piece.payload, "date")),
      piece,
      title,
    });
  }

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || questionSubjects.has(title)) continue;
    const cities = citiesForDate(stringValue(piece.payload, "date"));
    const matches = noteCopies.filter(
      (note) => note.title === title && citySetsOverlap(cities, note.cities)
    );
    if (matches.length === 0) continue;

    if (mentionCommitment(piece, timedCounts) === "none") {
      // Deliberate day-plan membership beats an idea-list note copy from a
      // DIFFERENT source section (ground truth v2 dedup: the planned copy
      // wins). A note copy from the SAME section means the source listed the
      // venue once as a reference and the note stays the single home.
      if (
        isDeliberateDayPlanMention(piece, observationById) &&
        !notesShareSourceSection(
          piece,
          matches.map((match) => match.piece),
          observationById
        )
      ) {
        for (const match of matches) {
          if (!match.piece.outputEligible) continue;
          suppressCanonicalPiece(
            match.piece,
            "planned day-plan visit wins over its loose city-note copy in the same leg"
          );
        }
        continue;
      }
      suppressCanonicalPiece(
        piece,
        "repeated but never committed: the city-note copy is this entity's single home"
      );
      continue;
    }
    for (const match of matches) {
      if (!match.piece.outputEligible) continue;
      suppressCanonicalPiece(
        match.piece,
        "planned activity wins over its loose city-note copy in the same leg"
      );
    }
  }
}

// Dedup hierarchy across the card/note boundary (ground truth v2, approved
// 2026-07-17): an uncommitted dated card whose venue also sits in a same-city
// note list was "repeated but never committed" — the note copy is the single
// home and the card disappears (live-run 7.17.2 promoted Konyv Bar, Mazel
// Tov, the Hilton wine cellar and friends to Jan 21 activity cards while the
// same venues sat in the Budapest note). Conversely, a committed card removes
// its duplicate note-list entry ("planned wins, rec copy removed" —
// Borkonyha).
function reconcileCardsAgainstCityNotes(
  pieces: CanonicalEvidencePiece[],
  missingDetails: unknown[],
  observations: EvidenceObservation[] = []
) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const citiesForDate = canonicalCitiesForDate(pieces);
  const notes = pieces.filter((piece) => piece.kind === "note");
  if (notes.length === 0) return;

  const placeCities = pieces
    .filter((piece) => piece.kind === "place" && piece.outputEligible)
    .map((piece) => normalizedComparable(stringValue(piece.payload, "city")))
    .filter(Boolean);
  const noteCity = (note: CanonicalEvidencePiece) => {
    const explicit = normalizedComparable(stringValue(note.payload, "city"));
    if (explicit) return explicit;
    // Note collections often carry their city only in the title ("Budapest
    // food ideas") until the later merge pass assigns it; split note ENTRIES
    // carry it in their parent collection's title.
    const text = normalizedComparable(
      [
        note.payload.title,
        note.payload._canonicalNoteCollectionTitle,
        note.payload.description,
      ]
        .filter(Boolean)
        .join(" ")
    );
    return placeCities.find((city) => text.includes(city)) ?? "";
  };
  const noteText = (note: CanonicalEvidencePiece) =>
    normalizedComparable(
      [note.payload.title, note.payload.description]
        .filter(Boolean)
        .join(" ")
    );

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    // A card with its own standalone anchor (address, confirmation,
    // provider details) is identifiable trip content — a note mentioning the
    // same venue is enrichment, not a competing home ("Watches in Rome" with
    // its street address stays a card).
    if (
      hasIndependentActivityAnchor(piece.payload) ||
      stringValue(piece.payload, "address")
    ) {
      continue;
    }
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || title.length < 4) continue;
    if (questionSubjects.has(title)) continue;
    // A leg-boundary day (arrive Budapest = leave Vienna) belongs to BOTH
    // cities for matching purposes.
    const cities = citiesForDate(stringValue(piece.payload, "date"));
    if (cities.size === 0) continue;
    const commitment = mentionCommitment(piece, timedCounts);
    const candidateNotes = notes.filter(
      (note) => cities.has(noteCity(note)) && noteText(note).includes(title)
    );
    const matchingNote =
      candidateNotes.find((note) => note.outputEligible) ??
      candidateNotes[0] ??
      null;
    if (!matchingNote) continue;

    // Deliberate day-plan membership counts as the planned sighting (ground
    // truth v2 dedup: planned copy wins) when the note copy comes from a
    // different source section.
    const deliberateDayPlanWins =
      commitment === "none" &&
      observations.length > 0 &&
      isDeliberateDayPlanMention(piece, observationById) &&
      !notesShareSourceSection(piece, [matchingNote], observationById);

    if (commitment === "none" && !deliberateDayPlanWins) {
      if (matchingNote.outputEligible) {
        mergeCanonicalPieceInto({
          reason:
            "repeated but never committed: the city-note copy is the single home",
          source: piece,
          target: matchingNote,
        });
      } else {
        // The matching note list was itself routed elsewhere; the card still
        // demotes — an uncommitted repeat never ships as a dated card.
        demoteCanonicalPieceToCityNote(
          piece,
          "repeated but never committed: demoted to the city notes"
        );
      }
      continue;
    }

    // Committed card wins: silently remove the duplicate note-list entry.
    const description = stringValue(matchingNote.payload, "description");
    if (!description) continue;
    const segments = description.split(/([,;]\s*|(?<=[.!?])\s+)/);
    const kept = segments.filter((segment, index) => {
      if (index % 2 === 1) return true; // separators
      const normalized = normalizedComparable(segment);
      return !normalized || normalized !== title;
    });
    const rebuilt = kept
      .join("")
      .replace(/,\s*,/g, ", ")
      .replace(/:\s*,/g, ": ")
      .replace(/,\s*\./g, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (rebuilt !== description) {
      matchingNote.payload.description = rebuilt;
      addCanonicalAction(matchingNote, {
        absorbedTitles: [stringValue(piece.payload, "title") ?? title],
        observationIds: [...matchingNote.observationIds],
        reason:
          "planned activity wins over its note-list copy: duplicate entry removed",
        type: "recovered",
      });
    }
  }
}

// Idea-list section demotion (Arc B centerpiece, RW-CLS-001; live-run
// 7.18.3 PB-4: the Jan 21 idea list shipped as 8 dated activity cards —
// Great Synagogue / Konyv Bar / Mazel Tov / gypsy music / Popped-up statue
// / Pinball / Wine Cellar / Ruszwurm). Judged by the unified classifier on
// source structure + list shape + commitment language: a same-day source
// section of 3+ entries with NO fixed commitment anywhere, carrying idea
// vocabulary or a name-only list shape, is City Notes as a unit. Fixed
// entries always stay; a section with even one fixed entry is a day plan.
function demoteIdeaListMentions(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );

  // STRUCTURAL labels only (the piece's own sourceSectionLabel or its
  // observations' section labels) — a stage's sourceLabel is a chunk name,
  // not source structure, and must never feed the notes-blob signal.
  const sectionLabelFor = (piece: CanonicalEvidencePiece) => {
    const own = stringValue(piece.payload, "sourceSectionLabel");
    if (own) return own;
    for (const id of piece.observationIds) {
      const observation = observationById.get(id);
      const label = observation?.sourceStructure?.sectionLabel ?? null;
      if (label) return label;
    }
    return null;
  };

  const entries: Array<{ entry: IdeaListEntry; piece: CanonicalEvidencePiece }> = [];
  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || questionSubjects.has(title)) continue;
    // Researched entries (prices/hours) belong to the researched-list
    // question (RW-QUE-001 "planned for this day, or just ideas?"), never
    // to silent idea-list demotion — the maker decides those.
    const researchedText = [
      activityText(piece.payload),
      stringValue(piece.payload, "evidence") ?? "",
    ].join(" ");
    if (
      PRICE_MARKER_PATTERN.test(researchedText) ||
      classifyDraftActivityCard(activityInput(piece.payload)).hasAvailabilityMarker
    ) {
      continue;
    }
    // An unresolved "X or Y" slot is one committed flexible card
    // (RW-QUE-001) — never an idea-list member.
    if (/\bor\b/i.test(stringValue(piece.payload, "title") ?? "")) {
      continue;
    }
    entries.push({
      entry: {
        category: stringValue(piece.payload, "category"),
        date: stringValue(piece.payload, "date"),
        description: stringValue(piece.payload, "description"),
        hasFixedEvidence: mentionCommitment(piece, timedCounts) === "fixed",
        headingPath: pieceSourceHeadingPath(piece),
        id: piece.id,
        ownTextHedge: pieceHasHedgeMarker(piece),
        sectionLabel: sectionLabelFor(piece),
        title: stringValue(piece.payload, "title"),
      },
      piece,
    });
  }

  const demoted = classifyIdeaListSections(entries.map((item) => item.entry));
  for (const { entry, piece } of entries) {
    if (!demoted.has(entry.id)) continue;
    demoteCanonicalPieceToCityNote(
      piece,
      "dated idea list: the section commits nothing, so its entries stay city notes (RW-CLS-001, unified classifier)"
    );
  }
}

function demoteHedgedSingleUncommittedMentions(
  pieces: CanonicalEvidencePiece[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || questionSubjects.has(title)) continue;
    if (mentionCommitment(piece, timedCounts) !== "none") continue;
    if (!pieceHasHedgeMarker(piece)) continue;

    demoteCanonicalPieceToCityNote(
      piece,
      "source doubt marker (maybe / if time / far away): demoted to city note without a question"
    );
  }
}

// --- Deterministic geo grouping v3 (RW-GRP-001, defect docket 2026-07-17) ---
//
// Grouping happens because it is the clean interpretation, and expects a
// HANDFUL of groups per trip. Two modes, both geographically verified with
// parser-emitted approximate coordinates:
//
// SAME-SITE VISIT (~300 m): a named site (castle/palace/complex) owns the
// stops inside its grounds — timed sub-stops allowed (Changing of the Guard
// inside Prague Castle), title stays the site's own source title.
//
// DISCOVERED WALK (~1.5 km ≈ 15-18 min): only on crowded (>6 visible cards),
// UNSEQUENCED days (<3 timed stops), only untimed/unbooked/hedge-free
// sights, at most one walk per day, named by the shared source-derived area
// label — no label, no group. Day pressure is the reason to look;
// coordinates are only the permission.
//
// Area labels equal to a trip city never group (a day-trip town is not a
// walking route). Calls state the actual rule that fired.

const SAME_SITE_RADIUS_KM = 0.3;
// Calibrated to the approved Malá Strana & Hradčany ruling (max pairwise
// ~1.57 km) plus parser-coordinate fuzz; the crowded-day and unsequenced-day
// gates carry the discrimination burden, not this radius.
const WALK_RADIUS_KM = 1.8;
const CROWDED_DAY_VISIBLE_CARDS = 6;
// Exported (Phase 1, audit B4) so audit detectors share the container-noun
// vocabulary instead of hand-rolling a subset.
// Defined in the unified classifier so the site↔component merge refusal and
// same-site grouping share one vocabulary (Arc B).
export const SAME_SITE_CONTAINER_PATTERN = SITE_CONTAINER_NOUN_PATTERN;

// Source-listing membership requires a COMPONENT-LIST shape, not a substring
// of narrative prose (live-run 7.18.1: "Fisherman's Bastion to Castle Hill"
// carried the whole day's walking narrative in its description, which made
// every venue it mentioned — including St. Stephen's Basilica across the
// river — look source-listed). A component is a delimited list entry equal
// to the child title, or the child title plus a short qualifier ("KGB museum
// for 1 hour", "Changing of the Guard - 12:00 PM").
function containerListsComponent(
  containerDescription: string | null,
  childTitle: string
) {
  if (!containerDescription) return false;
  const child = normalizedComparable(childTitle);
  if (!child || child.length < 6) return false;
  return containerDescription
    .split(/[,;:•·]|(?:\r?\n)+/)
    .map((segment) => normalizedComparable(segment.replace(/[.()]/g, " ")))
    .filter(Boolean)
    .some(
      (segment) =>
        segment === child ||
        (segment.startsWith(child) && segment.length - child.length <= 24)
    );
}

function pieceCoordinates(piece: CanonicalEvidencePiece) {
  // Verified coordinates from the geocoding lane (Arc B) outrank parser
  // approximations. They are attached with provenance and consumed only
  // here — grouping proximity — per the standing CEO decision.
  const verifiedLat = piece.payload.verifiedLatitude;
  const verifiedLng = piece.payload.verifiedLongitude;
  if (
    piece.payload._geoVerified === true &&
    typeof verifiedLat === "number" &&
    typeof verifiedLng === "number" &&
    Number.isFinite(verifiedLat) &&
    Number.isFinite(verifiedLng) &&
    (verifiedLat !== 0 || verifiedLng !== 0)
  ) {
    return { lat: verifiedLat, lng: verifiedLng, verified: true };
  }
  const lat = piece.payload.approxLatitude;
  const lng = piece.payload.approxLongitude;

  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    (lat !== 0 || lng !== 0)
    ? { lat, lng, verified: false }
    : null;
}

// Run5 geo calibration (live run 7.18.2, PB-4): 2-decimal model coordinates
// quantize to ~1.1 km, which collapsed half of central Pest onto shared
// rounded points and let a "Quick look inside the Gresham Palace" card claim
// St. Istvan's Basilica (~650 m away) "within 300 m". Coordinates below
// 3-decimal precision are ineligible for any geo-radius rule; they can still
// support membership through source hierarchy (listing / "X at Site").
const COORDINATE_MIN_DECIMALS = 3;

function coordinateDecimals(value: number) {
  const text = String(value);

  if (text.includes("e") || text.includes("E")) {
    return 0;
  }

  const dot = text.indexOf(".");

  return dot === -1 ? 0 : text.length - dot - 1;
}

function precisePieceCoordinates(piece: CanonicalEvidencePiece) {
  const coords = pieceCoordinates(piece);

  // Verified lookup results are precise by construction — the decimals
  // gate only defends against model quantization.
  if (coords?.verified) {
    return coords;
  }

  // Quantization hits BOTH components at once; a single round-number
  // component (50.09, 14.4106) is not quantization evidence, and JSON
  // numbers cannot preserve trailing zeros ("50.090" parses to 50.09).
  return coords &&
    (coordinateDecimals(coords.lat) >= COORDINATE_MIN_DECIMALS ||
      coordinateDecimals(coords.lng) >= COORDINATE_MIN_DECIMALS)
    ? coords
    : null;
}

// A same-site container must be an actual site-visit card (run5 PB-4): a
// passing mention ("Quick look inside the Gresham Palace") never owns other
// stops as a visit container.
const PASSING_MENTION_TITLE_PATTERN =
  /\b(?:quick (?:look|peek|stop)|peek (?:inside|at)|glimpse|pass(?:ing)? by|walk (?:past|by)|drive by|photo (?:stop|op)|look (?:inside|at)|view (?:of|from)|from (?:the )?outside)\b/i;

// A discovered walk's members must match the walk's area label from their
// OWN source context (run5 PB-4: "Old Town walk" absorbed Dancing House and
// Lucerna Arcade, which are in Nové Město — the parser invented their area).
// The contract already requires area to come from the source day title or
// heading; this verifies it per piece instead of trusting the model field.
function pieceAreaSourceSupported(piece: CanonicalEvidencePiece) {
  const area = stringValue(piece.payload, "area");

  if (!area) {
    return false;
  }

  const sectionLabel = stringValue(piece.payload, "sourceSectionLabel");
  const headingPath = pieceSourceHeadingPath(piece) ?? [];

  // Pieces without source-structure context are never judged (the same
  // posture as source-text support: structure-less fixtures fail open; live
  // parser output, which always carries section labels, is verified).
  if (!sectionLabel && headingPath.length === 0) {
    return true;
  }

  const areaComparable = normalizedComparable(area);
  const corpus = normalizedComparable(
    [
      sectionLabel,
      ...headingPath,
      stringValue(piece.payload, "title"),
      stringValue(piece.payload, "description"),
    ]
      .filter(Boolean)
      .join(" ")
  );

  return areaComparable.length > 0 && corpus.includes(areaComparable);
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function maxPairwiseKm(coords: Array<{ lat: number; lng: number }>) {
  let max = 0;
  for (let i = 0; i < coords.length; i += 1) {
    for (let j = i + 1; j < coords.length; j += 1) {
      max = Math.max(max, haversineKm(coords[i], coords[j]));
    }
  }
  return max;
}

function createDeterministicGeoGroupingDecisions({
  existingDecisions = [],
  missingDetails,
  observations,
  pieces,
}: {
  existingDecisions?: CanonicalGroupingDecision[];
  missingDetails: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}): CanonicalGroupingDecision[] {
  // Candidates the resolver has already ruled on stay with the resolver's
  // decision — the deterministic pass never re-groups or overrides them.
  const claimedCandidateIds = new Set(
    existingDecisions.flatMap((decision) => decision.candidateIds)
  );
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const timedCounts = timedActivityCountsByDate(pieces);
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const tripCities = new Set(
    pieces
      .filter((piece) => piece.kind === "place")
      .map((piece) => normalizedComparable(stringValue(piece.payload, "city")))
      .filter(Boolean)
  );
  const candidateIdFor = (piece: CanonicalEvidencePiece) => {
    const observationId = piece.observationIds[0];
    const observation = observationId
      ? observationById.get(observationId)
      : null;
    if (!observation) return null;
    const candidateId =
      stringValue(observation.payload, "_resolverCandidateId") ??
      observation.id;
    observation.payload._resolverCandidateId = candidateId;
    return candidateId;
  };

  const pieceIsClaimed = (piece: CanonicalEvidencePiece) => {
    if (claimedCandidateIds.size === 0) return false;
    const resolverId = stringValue(piece.payload, "_resolverCandidateId");
    if (resolverId && claimedCandidateIds.has(resolverId)) return true;
    return piece.observationIds.some((observationId) => {
      const observation = observationById.get(observationId);
      const candidateId = observation
        ? stringValue(observation.payload, "_resolverCandidateId") ??
          observation.id
        : null;
      return Boolean(candidateId && claimedCandidateIds.has(candidateId));
    });
  };

  const byDate = new Map<string, CanonicalEvidencePiece[]>();
  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    if (pieceIsClaimed(piece)) continue;
    const date = stringValue(piece.payload, "date");
    if (!date) continue;
    const group = byDate.get(date);
    if (group) group.push(piece);
    else byDate.set(date, [piece]);
  }

  const decisions: CanonicalGroupingDecision[] = [];
  const grouped = new Set<CanonicalEvidencePiece>();
  // Live-run 7.21.0: when the geocode lane ran on this build, radius rules
  // trust ONLY verified coordinates (the parser fabricates precise-looking
  // ones). Without the lane (no key), the precise-parser fallback stands —
  // the env-keyed contract promises no behavior change when disabled.
  const geocodeLaneRan = pieces.some(
    (piece) => piece.payload._geoVerified === true
  );
  const radiusCoordinates = (piece: CanonicalEvidencePiece) => {
    const coords = precisePieceCoordinates(piece);
    if (!coords) return null;
    return geocodeLaneRan && !coords.verified ? null : coords;
  };

  for (const [date, dayPieces] of byDate) {
    const located = dayPieces.filter((piece) => pieceCoordinates(piece));

    // SAME-SITE VISITS: a container-named site owning stops within ~300 m,
    // or stops the source itself places inside the container (RW-GRP-001
    // source hierarchy: a child listed in the container's own description, or
    // titled "<stop> at <Site>", belongs to the visit even when the parser
    // gave that stop no coordinates — live-run 7.17.2 left Apple Strudel
    // Show and Panorama Train outside Schönbrunn for lack of coords).
    for (const container of dayPieces) {
      if (grouped.has(container)) continue;
      const containerTitle = stringValue(container.payload, "title");
      if (
        !containerTitle ||
        !SAME_SITE_CONTAINER_PATTERN.test(containerTitle)
      ) {
        continue;
      }
      // Run5 PB-4: a passing mention is never a visit container. Live-run
      // 7.21.0 (Gresham, 3rd appearance): the passing mention lived in the
      // card's own DESCRIPTION ("Take a peek inside the Four Seasons Hotel /
      // Gresham Palace") while the title stayed clean — judge both.
      const containerOwnProse = [
        containerTitle,
        stringValue(container.payload, "description") ?? "",
      ].join(" ");
      if (PASSING_MENTION_TITLE_PATTERN.test(containerOwnProse)) {
        continue;
      }
      const origin = precisePieceCoordinates(container);
      const containerText = normalizedComparable(
        [container.payload.title, container.payload.description]
          .filter(Boolean)
          .join(" ")
      );
      const containerTokens = distinctiveTitleTokens(containerTitle);
      const children = dayPieces.filter((piece) => {
        if (piece === container || grouped.has(piece)) return false;
        if (confirmationFrom(piece.payload)) return false;
        const childRawTitle = stringValue(piece.payload, "title");
        const childTitle = normalizedComparable(childRawTitle);
        if (!childTitle) return false;
        // Source-hierarchy membership: a child the container's own
        // description lists, or a child titled with the container's own
        // name ("Palm House at Schönbrunn"). This path admits timed
        // children (the guard change inside the castle) because the SOURCE
        // places them inside the visit.
        const sourceHierarchyMember = Boolean(
          (childRawTitle &&
            containerListsComponent(
              stringValue(container.payload, "description"),
              childRawTitle
            )) ||
            containerTokens.some(
              (token) =>
                token.length >= 5 && ` ${childTitle} `.includes(` ${token} `)
            )
        );
        if (sourceHierarchyMember) return true;
        // Live-run 7.21.0 (Gresham, 3rd appearance): a piece that is itself
        // a named site container (Buda Castle) is grouping structure in its
        // own right — it never joins ANOTHER site's visit by coordinates.
        if (
          childRawTitle &&
          SAME_SITE_CONTAINER_PATTERN.test(childRawTitle)
        ) {
          return false;
        }
        // Geo-radius membership. Live-run 7.21.0: the parser fabricated
        // 3-decimal coordinates for the whole Jan-22 day (Parliament, Buda
        // Castle, Vörösmarty tér all "within 300 m" of Gresham Palace), so
        // when the geocode lane ran, the radius rule accepts only VERIFIED
        // coordinates on both ends (radiusCoordinates). A TIMED stop joins
        // by coordinates only when it shares the container's own category
        // (RW-GRP-001 locked reconciliation: the timed guard change stays
        // inside the castle visit).
        const timedCategoryOk =
          !timeFrom(piece.payload) ||
          (Boolean(stringValue(piece.payload, "category")) &&
            stringValue(piece.payload, "category") ===
              stringValue(container.payload, "category"));
        if (!timedCategoryOk) return false;
        const originCoords = origin ? radiusCoordinates(container) : null;
        const coords = radiusCoordinates(piece);
        return Boolean(
          originCoords &&
            coords &&
            haversineKm(originCoords, coords) <= SAME_SITE_RADIUS_KM
        );
      });
      if (children.length < 2) continue;

      // Call claims state the actual rule that fired (doctrine v3). A geo
      // child is one admitted by the radius path (verified-only when the
      // lane ran).
      const claimOrigin = radiusCoordinates(container);
      const geoChildCount = claimOrigin
        ? children.filter((piece) => {
            const timedOk =
              !timeFrom(piece.payload) ||
              (Boolean(stringValue(piece.payload, "category")) &&
                stringValue(piece.payload, "category") ===
                  stringValue(container.payload, "category"));
            if (!timedOk) return false;
            const coords = radiusCoordinates(piece);
            return Boolean(
              coords &&
                haversineKm(claimOrigin, coords) <= SAME_SITE_RADIUS_KM
            );
          }).length
        : 0;
      const membershipClaim =
        geoChildCount === children.length
          ? `${children.length} stops sit inside ${containerTitle}'s grounds (within ${Math.round(SAME_SITE_RADIUS_KM * 1000)} m)`
          : geoChildCount === 0
            ? `the source lists ${children.length} stops inside ${containerTitle}'s own visit`
            : `${geoChildCount} stops sit inside ${containerTitle}'s grounds (within ${Math.round(SAME_SITE_RADIUS_KM * 1000)} m) and the source places ${children.length - geoChildCount} more inside the same visit`;

      const containerId = candidateIdFor(container);
      const childIds = children
        .map(candidateIdFor)
        .filter((value): value is string => Boolean(value));
      if (!containerId || childIds.length < 2) continue;

      decisions.push({
        callRequired: true,
        candidateIds: [containerId, ...childIds],
        claim: `same-site visit: ${membershipClaim}, so one visit card owns them`,
        containerCandidateId: containerId,
        decisionId: `deterministic-site-${stableHash({ date, title: containerTitle })}`,
        parentCandidateId: containerId,
        parentTitle: `${containerTitle} visit`,
        source: "canonical_resolver",
      });
      grouped.add(container);
      children.forEach((child) => grouped.add(child));
    }

    // DISCOVERED WALK: at most one per day, crowded unsequenced days only.
    const visibleCount = dayPieces.length;
    if (visibleCount <= CROWDED_DAY_VISIBLE_CARDS) continue;
    if ((timedCounts.get(date) ?? 0) >= 3) continue;

    const walkers = located.filter((piece) => {
      if (grouped.has(piece)) return false;
      if (timeFrom(piece.payload) || confirmationFrom(piece.payload)) {
        return false;
      }
      if (pieceHasHedgeMarker(piece)) return false;
      // A tour or ticketed experience is its own plan, never a walk stop
      // (live-run 7.21.0: "Catacombs tour" was absorbed into the Charles
      // Bridge walk).
      if (/tours?_tickets/i.test(stringValue(piece.payload, "category") ?? "")) {
        return false;
      }
      if (/\btour\b/i.test(stringValue(piece.payload, "title") ?? "")) {
        return false;
      }
      // A source-narrated route ("walk by the Dancing House", "stop by the
      // Astronomical Clock on the hour") is already authored by the maker —
      // the system never re-parents it into an invented walk (approved
      // answer key: the Jan-14 Old Town evening route ships as standalone
      // cards, no call; the Malá Strana walk's members are a bare list).
      const ownProse = [
        stringValue(piece.payload, "title") ?? "",
        stringValue(piece.payload, "description") ?? "",
      ].join(" ");
      if (
        /\b(?:walk (?:by|past|to|across|over|along)|stop by|on the (?:hour|way)|head (?:to|over|down)|then (?:walk|go|head))\b/i.test(
          ownProse
        )
      ) {
        return false;
      }
      const title = normalizedComparable(stringValue(piece.payload, "title"));
      return Boolean(title) && !questionSubjects.has(title);
    });
    const byArea = new Map<string, CanonicalEvidencePiece[]>();
    for (const piece of walkers) {
      const area = stringValue(piece.payload, "area");
      if (!area) continue;
      const normalizedArea = normalizedComparable(area);
      // A trip city or day-trip town is never a walking route.
      if (!normalizedArea || tripCities.has(normalizedArea)) continue;
      // Run5 PB-4: a walk member's area label must come from its OWN source
      // context — a model-invented area cannot pull a Nové Město sight into
      // an "Old Town walk".
      if (!pieceAreaSourceSupported(piece)) continue;
      const group = byArea.get(normalizedArea);
      if (group) group.push(piece);
      else byArea.set(normalizedArea, [piece]);
    }

    const bestWalk = [...byArea.values()]
      .filter((group) => group.length >= 3)
      .filter((group) => {
        // Run5 PB-4: the 15-minute-walk radius is only meaningful on
        // precise coordinates. Live-run 7.21.0 hardening: the parser now
        // fabricates precise-LOOKING coordinates, so when the geocode lane
        // ran on this build (any verified member exists), the radius test
        // accepts only VERIFIED coordinates; with the lane disabled the
        // precise-parser fallback stands (no behavior change without a
        // key), because the walk still demands per-member source-supported
        // area labels as independent evidence.
        const coords = group
          .map(precisePieceCoordinates)
          .filter(
            (value): value is { lat: number; lng: number; verified: boolean } =>
              Boolean(value)
          );
        const usable = geocodeLaneRan
          ? coords.filter((value) => value.verified)
          : coords;
        return (
          usable.length === group.length &&
          maxPairwiseKm(usable) <= WALK_RADIUS_KM
        );
      })
      .sort((left, right) => right.length - left.length)[0];

    if (!bestWalk) continue;

    const walkIds = bestWalk
      .map(candidateIdFor)
      .filter((value): value is string => Boolean(value));
    if (walkIds.length < 3) continue;
    const areaLabel = stringValue(bestWalk[0].payload, "area") ?? "Walking";

    decisions.push({
      callRequired: true,
      candidateIds: walkIds,
      claim: `discovered walk: this day has ${visibleCount} cards, and ${bestWalk.length} untimed sights sit within a 15-minute walk in ${areaLabel}, so they read cleaner as one route`,
      containerCandidateId: null,
      decisionId: `deterministic-walk-${stableHash({ areaLabel, date })}`,
      parentCandidateId: walkIds[0],
      parentTitle: `${areaLabel} walk`,
      source: "canonical_resolver",
    });
    bestWalk.forEach((piece) => grouped.add(piece));
  }

  return decisions;
}

// --- Researched-but-uncommitted list question (RW-REV-001, 2026-07-17) ---
//
// Two or more same-day untimed, unbooked activities whose source text carries
// research metadata (prices, opening hours) but no commitment do not reveal
// intent: researched effort alone is not a strong enough planned signal. They
// generate ONE question — "planned for this day, or just ideas?" — instead of
// silently becoming activities or city notes.

// Phase 1 (audit B5): the price marker now comes from the shared detector in
// traveler-text.ts — the private copy here was missing £/gbp entirely.
const PRICE_MARKER_PATTERN = PRICE_SIGNAL_PATTERN;

function createResearchedListQuestions(
  pieces: CanonicalEvidencePiece[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const cityForDate = canonicalCityForDate(pieces);
  const byDate = new Map<string, CanonicalEvidencePiece[]>();

  const questionSubjectPieceIds = new Set(
    missingDetails
      .map((detail) => stringValue(asRecord(detail), "relatedCanonicalPieceId"))
      .filter(Boolean)
  );

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    // A grouped parent or child is committed structure, never a researched
    // idea — live run 7.18.0 asked "planned or ideas?" about the Prague
    // Castle group and its own KGB child while the castle's ticket question
    // targeted the same piece.
    if (
      piece.payload._canonicalGroupRole === "parent" ||
      piece.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    if (questionSubjectPieceIds.has(piece.id)) continue;
    const date = stringValue(piece.payload, "date");
    const rawTitle = stringValue(piece.payload, "title") ?? "";
    const title = normalizedComparable(rawTitle);
    if (!date || !title || questionSubjects.has(title)) continue;
    // "X at Site" component titles are same-site grouping structure, never
    // researched ideas (run5 PB-3: the orphaned "Orangeriegarten at
    // Schönbrunn" component leaked into a bogus planned-or-ideas question).
    // The site is recognized by the container-noun vocabulary OR by another
    // same-day activity carrying the site's name in its own title.
    const atSiteTail = /\s+at\s+(.+)$/i.exec(rawTitle)?.[1];
    if (atSiteTail) {
      const tailComparable = normalizedComparable(atSiteTail);
      // Any piece may name the site — in live run 7.18.2 the Schönbrunn
      // container itself was suppressed when the components leaked into the
      // question, so suppressed and demoted copies count as site evidence.
      const siteNamedByPeer =
        tailComparable.length >= 4 &&
        pieces.some(
          (peer) =>
            peer !== piece &&
            ` ${normalizedComparable(stringValue(peer.payload, "title"))} `.includes(
              ` ${tailComparable} `
            )
        );
      if (SAME_SITE_CONTAINER_PATTERN.test(atSiteTail) || siteNamedByPeer) {
        continue;
      }
    }
    if (mentionCommitment(piece, timedCounts) !== "none") continue;
    if (pieceHasHedgeMarker(piece)) continue;
    // Research markers can sit in any parser text field (live run 7.17.1
    // carried the trio's prices in `evidence`, not description).
    const text = [
      activityText(piece.payload),
      stringValue(piece.payload, "evidence") ?? "",
    ].join(" ");
    const classification = classifyDraftActivityCard(activityInput(piece.payload));
    if (!PRICE_MARKER_PATTERN.test(text) && !classification.hasAvailabilityMarker) {
      continue;
    }
    const group = byDate.get(date);
    if (group) group.push(piece);
    else byDate.set(date, [piece]);
  }

  const questions: Array<Record<string, unknown>> = [];

  for (const [date, group] of byDate) {
    if (group.length < 2) continue;
    const titles = group
      .map((piece) => stringValue(piece.payload, "title"))
      .filter((value): value is string => Boolean(value));
    if (titles.length < 2) continue;

    // Pending-question state (Eli, 2026-07-17 wave 1): while the
    // planned-or-ideas question is open, the candidates live as city IDEAS —
    // not committed cards. Member snapshots ride on the question so the
    // "planned" answer can recreate them as dated activity cards end to end
    // (RW-QUE-001); "ideas" simply resolves, because they are already home.
    const memberSnapshots = group.map((piece) => ({
      canonicalPieceId: piece.id,
      category: stringValue(piece.payload, "category"),
      city: stringValue(piece.payload, "city"),
      date: stringValue(piece.payload, "date"),
      description: stringValue(piece.payload, "description"),
      title: stringValue(piece.payload, "title"),
    }));
    for (const piece of group) {
      // Preserve the city so the demoted idea joins its city-note collection
      // (demotion clears the date, which is how notes usually find a city).
      const city =
        stringValue(piece.payload, "city") ||
        cityForDate(stringValue(piece.payload, "date"));
      if (city) piece.payload.city = city;
      demoteCanonicalPieceToCityNote(
        piece,
        "held as a city idea pending the maker's planned-or-ideas answer"
      );
    }

    questions.push({
      _canonicalMemberSnapshots: memberSnapshots,
      _canonicalReviewDisposition: "question",
      _canonicalQuestionKind: "researched_list",
      answerOptions: [
        { label: "Planned for this day", value: "planned" },
        { label: "Just ideas for the city", value: "ideas" },
      ],
      answerType: "single_choice",
      confidence: "medium",
      evidence: `Listed with prices/hours but no booking or times: ${titles.join(", ")}.`,
      guessedValue: null,
      prompt: `This day also lists ${titles.join(", ")} — planned for the day, or just ideas?`,
      reason:
        "Researched prices and hours without a booking, time, or sequence do not reveal traveler intent.",
      // The members are demoted to city ideas, so the question cannot target
      // a member's canonical id (a suppressed piece would violate the
      // identity manifest at finalization). The trip is the subject; the
      // member snapshots carry the typed answer targets.
      relatedCanonicalPieceId: null,
      relatedTitle: stringValue(group[0].payload, "title"),
      resolverDecisionId: `deterministic-researched-list-${stableHash({ date, titles })}`,
      subjectType: "item",
      targetField: "itemType",
    });
  }

  return questions;
}

// Day-title slot rule (ground truth v2, question #3): when a source day
// TITLE commits an activity slot ("… // Budapest Bathing") but the matching
// entries read as options (untimed, unbooked, alias variants), the slot is
// committed and the venue is not — that is a maker question, not silent
// demotion. Live runs 7.17.1/7.17.2 never fired the baths question.
const DAY_SLOT_LEXICON: Array<{ pattern: RegExp; slot: string; stems: RegExp }> = [
  {
    pattern: /\bbath(?:s|ing)?\b|\bspa day\b|\bthermal\b/i,
    slot: "bathing",
    stems: /\bbaths?\b|\bspa\b|\bthermal\b/i,
  },
];

function piecePayloadAppendOption(
  payload: Record<string, unknown>,
  optionTitle: string
) {
  const existing = stringValue(payload, "description") ?? "";
  if (normalizedComparable(existing).includes(normalizedComparable(optionTitle))) {
    return;
  }
  const optionLine = `Option: ${optionTitle}.`;
  payload.description = existing ? `${existing} ${optionLine}` : optionLine;
}

function createDayLabelSlotQuestions(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const questions: Array<Record<string, unknown>> = [];

  for (const { pattern, slot, stems } of DAY_SLOT_LEXICON) {
    // Section labels that commit the slot.
    const slotLabels = new Set(
      observations
        .flatMap((observation) => [
          observation.sourceStructure.sectionLabel,
          observation.sourceLabel,
          ...observation.sourceStructure.headingPath,
        ])
        .filter((value): value is string => Boolean(value))
        .filter((label) => pattern.test(label))
    );
    if (slotLabels.size === 0) continue;

    const candidates = pieces.filter((piece) => {
      if (!committedMentionPieceCandidate(piece)) return false;
      const title = stringValue(piece.payload, "title");
      if (!title || !stems.test(title)) return false;
      if (questionSubjects.has(normalizedComparable(title))) return false;
      return mentionCommitment(piece, timedCounts) === "none";
    });
    // Slot override (run5 PB-6, 6th-run baths defect): a committed day
    // title RESERVES its venue options. Options an earlier pass demoted to
    // city notes (doubt demotion, idea-list, researched-hold) still count —
    // the day title is stronger source intent than the demotion, so
    // matching note pieces rejoin the slot flow as options.
    const demotedOptions = pieces.filter((piece) => {
      if (!piece.outputEligible || piece.kind !== "note") return false;
      const title = stringValue(piece.payload, "title");
      if (!title || !stems.test(title)) return false;
      if (questionSubjects.has(normalizedComparable(title))) return false;
      return true;
    });
    if (candidates.length === 0 && demotedOptions.length > 0) {
      // Restore the most generic demoted option as the slot's flexible
      // subject card; the day title committed the slot (RW-QUE-001).
      const restored = demotedOptions[0];
      restored.kind = "activity";
      restored.payload.itemType = "activity";
      addCanonicalAction(restored, {
        absorbedTitles: [],
        observationIds: [...restored.observationIds],
        reason:
          "day-title slot override: the committed day title reserves this venue option (restored from city notes)",
        type: "recovered",
      });
      candidates.push(restored);
    }
    for (const option of demotedOptions) {
      if (candidates.includes(option)) continue;
      candidates.push(option);
    }
    if (candidates.length === 0) continue;

    // Already asked by the parser or another rule?
    const alreadyAsked = questions.some((question) =>
      stems.test(String(question.prompt ?? ""))
    );
    if (alreadyAsked) continue;

    const titles = Array.from(
      new Set(
        candidates
          .map((piece) => stringValue(piece.payload, "title"))
          .filter((value): value is string => Boolean(value))
      )
    );
    // The slot is committed (flavor 2): ONE flexible slot card owns the
    // choice, the other venue options fold into it as description options —
    // they are alternatives for the same committed slot, never additional
    // cards (live run 7.18.0 shipped a Gellert Baths card AND a Baths card
    // while the question asked which one). The most generic title (the slot
    // stem itself) is the flexible card.
    const ordered = [...candidates].sort((left, right) => {
      const leftTitle = stringValue(left.payload, "title") ?? "";
      const rightTitle = stringValue(right.payload, "title") ?? "";
      const genericScore = (title: string) =>
        (stems.test(title) ? 0 : 1) + title.trim().split(/\s+/).length;
      return genericScore(leftTitle) - genericScore(rightTitle);
    });
    const subject = ordered[0];
    // Alias dedupe before asking (second-audit finding on live run 7.18.1:
    // the baths question offered "Gellert Baths", "Baths", and "Gellert Bath
    // House" as if they were competing venues — they are one place). Count
    // DISTINCT venues by their non-slot distinctive tokens; a venue question
    // needs at least two genuinely different venues, otherwise the options
    // fold silently and the slot card simply carries the venue.
    const venueKeys = new Set(
      ordered
        .map((piece) =>
          distinctiveTitleTokens(stringValue(piece.payload, "title") ?? "")
            .filter((token) => !stems.test(token) && !/^house?s?$/.test(token))
            .join(" ")
        )
        .filter(Boolean)
    );
    for (const option of ordered.slice(1)) {
      const optionTitle = stringValue(option.payload, "title");
      if (optionTitle) {
        piecePayloadAppendOption(subject.payload, optionTitle);
      }
      mergeCanonicalPieceInto({
        reason:
          "venue option folded into the committed slot card pending the maker's answer (one committed slot, choice in description)",
        source: option,
        target: subject,
      });
    }
    if (venueKeys.size < 2) {
      continue;
    }
    const subjectObservation = subject.observationIds
      .map((id) => observationById.get(id))
      .find(Boolean);

    questions.push({
      _canonicalReviewDisposition: "question",
      _canonicalQuestionKind: "day_label_slot",
      answerType: "text",
      confidence: "medium",
      evidence: `The day title commits ${slot}, and the source lists ${titles.join(
        ", "
      )} as options.`,
      guessedValue: null,
      prompt: `The itinerary plans ${slot}, but ${
        titles.length > 1 ? `${titles.join(" and ")} both` : `${titles[0]} only`
      } appear${titles.length > 1 ? "" : "s"} as options — which one, or keep as ideas?`,
      reason:
        "The source day title commits this slot but does not choose the venue.",
      relatedCanonicalPieceId: subject.id,
      relatedTitle: stringValue(subject.payload, "title"),
      resolverDecisionId: `deterministic-day-slot-${stableHash({
        slot,
        sourceLabel: subjectObservation?.sourceLabel ?? null,
        titles,
      })}`,
      subjectType: "item",
      targetField: "description",
    });
  }

  return questions;
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

    // A same-site container (castle/palace/complex visit) whose description
    // lists its component stops is GROUPING STRUCTURE, not redundant
    // context: it becomes the parent of one same-site visit (RW-GRP-001,
    // doctrine v3). Only generic day/list containers demote to context.
    if (SAME_SITE_CONTAINER_PATTERN.test(title)) {
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

    // Internal-trace details are already marked dismissed by subject
    // resolution; they pass through untouched (projection hides them).
    if (stringValue(detail, "_canonicalReviewDisposition") === "dismissed") {
      return true;
    }

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

    // Source-obvious transport questions reconcile against canonical records
    // before reaching the maker (docket fix 6, third-run repeat: live run
    // 7.18.0 asked for the Prague→Vienna departure time and the
    // Budapest→Rome confirmation while both sat completed in the final
    // travel rows — the parser's chunk-scoped uncertainty is not the
    // maker's problem once assembly has the answer).
    if (
      (subjectType === "transport" || subjectType === "trip") &&
      /(?:departuretime|arrivaltime|confirmation|time|date)/.test(targetField)
    ) {
      const detailGuess = stringValue(detail, "guessedValue");
      const detailTokens = identityTokens(reviewDetailText(detail));
      const answeringRow = pieces.find((candidate) => {
        if (!candidate.outputEligible || candidate.kind !== "transport") {
          return false;
        }
        const rowTokens = identityTokens(
          [
            candidate.payload.title,
            candidate.payload.departure,
            candidate.payload.arrival,
            candidate.payload.provider,
            candidate.payload.number,
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (overlapCount(detailTokens, rowTokens) < 2) return false;
        if (/confirmation/.test(targetField)) {
          return Boolean(confirmationFrom(candidate.payload));
        }
        if (/date/.test(targetField)) {
          // Wave-2.1 (live-run 7.18.2 PB-2): a transport date question is
          // source-obvious when the matched final row already carries a firm
          // date and the question proposes nothing different.
          const rowDate = stringValue(candidate.payload, "date");
          const provisional =
            Array.isArray(candidate.payload._canonicalProvisionalFields) &&
            (candidate.payload._canonicalProvisionalFields as unknown[]).includes(
              "date"
            );
          return Boolean(
            rowDate &&
              !provisional &&
              (!detailGuess || tripDatesMatch(detailGuess, rowDate))
          );
        }
        if (/arrivaltime/.test(targetField)) {
          return Boolean(normalizedClockTime(candidate.payload.arrivalTime));
        }
        return Boolean(normalizedClockTime(candidate.payload.departureTime));
      });
      if (answeringRow) {
        return false;
      }
    }

    // Parser question leaks beyond transport fields (live run 7.18.1):
    // (a) "which X was chosen" — when an active card's description already
    // carries the unresolved "X or Y" choice, the slot card IS the answer
    // surface (RW-QUE-001 disjunction: choice in description, no question);
    // (b) "which X should be added as the planned activity … note" — asking
    // the maker to promote note-list content is presentation mechanics,
    // never a material decision (RW-REV-001; the beer-spot question).
    if (
      !stringValue(detail, "resolverDecisionId") &&
      stringValue(detail, "_canonicalReviewDisposition") !== "call"
    ) {
      const detailTokens = identityTokens(reviewDetailText(detail));
      if (/\bwhich\b[\s\S]{0,80}\bchosen\b/.test(questionText)) {
        const slotCard = pieces.find((piece) => {
          if (!piece.outputEligible || piece.kind !== "activity") return false;
          const description = stringValue(piece.payload, "description") ?? "";
          if (!/\bor\b/i.test(description)) return false;
          return (
            overlapCount(detailTokens, identityTokens(description)) >= 2
          );
        });
        if (slotCard) return false;
      }
      if (
        /\bwhich\b[\s\S]{0,90}\bshould be added\b/.test(questionText) ||
        (/\bshould be added as the planned activity\b/.test(questionText) &&
          /\bnote\b/.test(questionText))
      ) {
        return false;
      }
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
      // Guess-aware (Phase 2): a question proposing a DIFFERENT date than the
      // bound piece is a genuine disagreement and must reach the maker.
      const dateGuess = stringValue(detail, "guessedValue");
      if (!dateGuess || tripDatesMatch(dateGuess, String(payload.date))) {
        return false;
      }
    }

    if (/(?:city|leg)/.test(targetField) && payload.city) {
      return false;
    }

    if (targetField === "address" && payload.address) {
      return false;
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

    // Disjunction rule (2026-07-17 ground truth, supersedes the automatic
    // alternative-slot question): an explicit "or" slot stays ONE flexible
    // traveler card with the unresolved choice in its title/description.
    // No question is generated; the maker can edit the card directly.

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

// Maps a question's targetField to the canonical value the final piece
// already carries (Phase 2 question gate, docs/code-audit-2026-07-18.md §C).
function canonicalReviewFieldValue(
  piece: CanonicalEvidencePiece,
  targetField: string
): { field: string; value: string } | null {
  const payload = piece.payload;
  const pick = (field: string, value: unknown) => {
    const text = typeof value === "number" ? String(value) : stringValue(asRecord({ value }), "value");
    return text ? { field, value: text } : null;
  };

  if (/checkin/.test(targetField)) {
    return (
      pick("checkIn", payload.checkIn) ??
      pick("firstNightDate", payload.firstNightDate)
    );
  }
  if (/checkout/.test(targetField)) return pick("checkOut", payload.checkOut);
  if (/nights/.test(targetField)) return pick("nights", payload.nights);
  if (/date|placement/.test(targetField)) {
    return (
      pick("date", payload.date) ??
      pick("checkIn", payload.checkIn) ??
      pick("departureDate", payload.departureDate)
    );
  }
  if (/departuretime|starttime|^time$/.test(targetField)) {
    return (
      pick("departureTime", payload.departureTime) ??
      pick("startTime", payload.startTime)
    );
  }
  if (/arrivaltime|endtime/.test(targetField)) {
    return (
      pick("arrivalTime", payload.arrivalTime) ?? pick("endTime", payload.endTime)
    );
  }
  if (/confirmation/.test(targetField)) {
    const confirmation = confirmationFrom(payload);
    return confirmation ? { field: "confirmation", value: confirmation } : null;
  }
  if (/address/.test(targetField)) return pick("address", payload.address);
  if (/city/.test(targetField)) return pick("city", payload.city);
  if (/name|title/.test(targetField)) {
    return pick("name", payload.name) ?? pick("title", payload.title);
  }
  return null;
}

function reviewValuesMatch(field: string, guessed: string, finalValue: string) {
  if (/date|checkin|checkout/i.test(field)) {
    return tripDatesMatch(guessed, finalValue);
  }
  if (/time/i.test(field)) {
    const left = normalizedClockTime(guessed);
    const right = normalizedClockTime(finalValue);
    return Boolean(left && right && left === right);
  }
  return normalizedComparable(guessed) === normalizedComparable(finalValue);
}

function resolveReviewPieceWithFold(
  detail: Record<string, unknown>,
  pieces: CanonicalEvidencePiece[]
) {
  const direct = pieceForMissingDetail(detail, pieces);
  if (!direct) return null;
  if (direct.outputEligible) return direct;
  // Follow the fold chain: a question about a suppressed duplicate should
  // reconcile against the surviving representative (audit gap C-12).
  const representedBy = stringValue(direct.payload, "_representedByPieceId");
  if (representedBy) {
    const survivor = pieces.find(
      (piece) => piece.id === representedBy && piece.outputEligible
    );
    if (survivor) return survivor;
  }
  return direct;
}

// Phase-2 final reconciliation gate: runs AFTER subject resolution and the
// legacy filters, on FINAL canonical subjects and values. Every question
// crosses one semantic gate before the maker sees it (RW-QA-001/RW-QUE-001;
// live-run 7.18.2 PB-2: two false-conflict date questions shipped whose
// guessedValue equaled the final canonical state).
function applyFinalReviewReconciliation(
  details: Record<string, unknown>[],
  pieces: CanonicalEvidencePiece[]
) {
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const outputPieces = pieces.filter((piece) => piece.outputEligible);

  return details.filter((detail) => {
    const disposition = stringValue(detail, "_canonicalReviewDisposition");

    if (disposition === "dismissed") return true;

    if (disposition === "call") {
      // R7 — a call anchored to a piece that is no longer output is stale.
      // Exception: source-update calls (RW-SRC-001) explain cancellations,
      // so their subject is suppressed BY DESIGN.
      const targetFieldForCall = normalizedComparable(detail.targetField);
      if (targetFieldForCall !== "source update") {
        const relatedId = stringValue(detail, "relatedCanonicalPieceId");
        if (relatedId) {
          const related = pieceById.get(relatedId);
          if (related && !related.outputEligible) return false;
        }
      }
      return true;
    }

    const targetField = normalizedComparable(detail.targetField).replace(
      /\s+/g,
      ""
    );
    const guessed = stringValue(detail, "guessedValue");
    const piece = resolveReviewPieceWithFold(detail, pieces);

    if (piece) {
      const resolved = canonicalReviewFieldValue(piece, targetField);
      if (resolved) {
        const provisional =
          Array.isArray(piece.payload._canonicalProvisionalFields) &&
          (piece.payload._canonicalProvisionalFields as unknown[]).includes(
            resolved.field
          );
        const conflicted = piece.conflicts.some(
          (conflict) => conflict.requiresReview && conflict.field === resolved.field
        );

        if (!provisional && !conflicted) {
          // R2 — the question's own suggested answer equals the final
          // canonical state: resolve silently (RW-SRC-001 posture).
          if (guessed && reviewValuesMatch(resolved.field, guessed, resolved.value)) {
            return false;
          }
          // R1 — canon already holds a firm value for the asked field and
          // the question proposes nothing different: nothing to decide.
          if (
            !guessed &&
            /date|checkin|checkout|time|confirmation/.test(targetField)
          ) {
            return false;
          }
        }
      }
    }

    // R2 without a piece binding (the 7.18.2 escape): a date question whose
    // guessed date already sits on a token-matching final transport/stay row.
    if (guessed && /date/.test(targetField)) {
      const detailTokens = identityTokens(reviewDetailText(detail));
      const answering = outputPieces.find((candidate) => {
        if (candidate.kind !== "transport" && candidate.kind !== "stay") {
          return false;
        }
        const candidateTokens = identityTokens(
          [
            candidate.payload.title,
            candidate.payload.name,
            candidate.payload.departure,
            candidate.payload.arrival,
            candidate.payload.city,
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (overlapCount(detailTokens, candidateTokens) < 2) return false;
        const candidateDate =
          stringValue(candidate.payload, "date") ??
          stringValue(candidate.payload, "checkIn");
        return Boolean(candidateDate && tripDatesMatch(guessed, candidateDate));
      });
      if (answering) return false;
    }

    return true;
  });
}

export function canonicalizeCanonicalReviewDetails(
  details: unknown[],
  pieces: CanonicalEvidencePiece[],
  tripOverview: unknown = {}
) {
  const subjectResolved: Record<string, unknown>[] = details.map((value) => {
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
        : stringValue(detail, "_canonicalReviewDisposition") === "question"
        ? "question"
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
  // Phase-2 ordering fix (audit finding A3): the legacy filters used to run
  // BEFORE subject resolution, so a question whose subject was rewritten
  // afterwards escaped every subject-keyed check. Filters now see FINAL
  // subjects, then the reconciliation gate checks final values.
  const filtered = unresolvedMissingDetails({
    details: subjectResolved,
    pieces,
    tripOverview,
  }) as Record<string, unknown>[];
  const canonical = applyFinalReviewReconciliation(filtered, pieces);
  // Ticket/tour decision consolidation (defect docket 2026-07-17): one
  // source decision ("Need to decide which ticket") scattered into four
  // question variants across the castle, its sub-stops, and a parser meta
  // question. Group by the subject's group-root entity and keep ONE question
  // attached to the root, with the variants' evidence folded in.
  const pieceById = new Map(pieces.map((piece) => [piece.id, piece]));
  const ticketRoots = new Map<string, Record<string, unknown>[]>();
  for (const detail of canonical) {
    if (detail._canonicalReviewDisposition !== "question") continue;
    const text = normalizeText(
      [detail.prompt, detail.evidence].filter(Boolean).join(" ")
    );
    if (!/\bticket\b|\btour or (?:just a )?visit\b|\btour option\b/.test(text)) {
      continue;
    }
    const subjectId = stringValue(detail, "relatedCanonicalPieceId");
    if (!subjectId) continue;
    const subject = pieceById.get(subjectId);
    if (!subject) continue;
    const rootId =
      subject.payload._canonicalGroupRole === "child"
        ? stringValue(subject.payload, "_canonicalParentPieceId") ?? subjectId
        : subjectId;
    ticketRoots.set(rootId, [...(ticketRoots.get(rootId) ?? []), detail]);
  }
  // One venue complex, one open decision (CEO 2026-07-17 evening: St. Vitus
  // folds into ONE castle ticket question). Even when grouping has not
  // parented the sub-stop, same-day ticket/tour questions are one source
  // decision — dedupe by normalized decision, root at the container-named
  // subject.
  const ticketRootIds = [...ticketRoots.keys()];
  for (const rootId of ticketRootIds) {
    if (!ticketRoots.has(rootId)) continue;
    const rootPiece = pieceById.get(rootId);
    if (!rootPiece) continue;
    const rootDate = stringValue(rootPiece.payload, "date");
    if (!rootDate) continue;
    for (const otherId of ticketRootIds) {
      if (otherId === rootId || !ticketRoots.has(otherId) || !ticketRoots.has(rootId)) {
        continue;
      }
      const otherPiece = pieceById.get(otherId);
      if (!otherPiece) continue;
      const otherDate = stringValue(otherPiece.payload, "date");
      const sameVenue =
        overlapCount(
          identityTokens(stringValue(rootPiece.payload, "title") ?? ""),
          identityTokens(stringValue(otherPiece.payload, "title") ?? "")
        ) >= 2;
      // An undated same-venue subject (live-run 7.18.2: the "Prague Castle"
      // placeholder) folds into the dated root; otherwise dates must match.
      if (otherDate ? otherDate !== rootDate : !sameVenue) continue;
      const rootIsContainer = SAME_SITE_CONTAINER_PATTERN.test(
        stringValue(rootPiece.payload, "title") ?? ""
      );
      const otherIsContainer = SAME_SITE_CONTAINER_PATTERN.test(
        stringValue(otherPiece.payload, "title") ?? ""
      );
      if (!rootIsContainer && otherIsContainer) continue; // handled from the other side
      const keepId = rootId; // container preference: the non-container side was skipped above
      const foldId = otherId;
      ticketRoots.set(keepId, [
        ...(ticketRoots.get(keepId) ?? []),
        ...(ticketRoots.get(foldId) ?? []),
      ]);
      ticketRoots.delete(foldId);
    }
  }
  const droppedTicketVariants = new Set<Record<string, unknown>>();
  for (const [rootId, variants] of ticketRoots) {
    if (variants.length < 2 && stringValue(variants[0], "relatedCanonicalPieceId") === rootId) {
      continue;
    }
    const root = pieceById.get(rootId);
    const rootTitle = root ? stringValue(root.payload, "title") : null;
    const keeper =
      variants.find(
        (detail) => stringValue(detail, "relatedCanonicalPieceId") === rootId
      ) ?? variants[0];

    keeper.relatedCanonicalPieceId = rootId;
    if (rootTitle) {
      keeper.prompt = `Which ticket or tour option should be listed for ${rootTitle}?`;
      keeper.relatedTitle = rootTitle;
    }
    keeper.evidence = scrubReviewEvidence(
      Array.from(
        new Set(
          variants
            .map((detail) => stringValue(detail, "evidence"))
            .filter((value): value is string => Boolean(value))
        )
      ).join(" · ")
    );
    for (const variant of variants) {
      if (variant !== keeper) droppedTicketVariants.add(variant);
    }
  }

  const seen = new Set<string>();

  return canonical.filter((detail) => {
    if (droppedTicketVariants.has(detail)) return false;
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
  // Wave-2 parser pass: deterministic repair of known parser artifact
  // families (degenerate times, provider text-bleed, day-title cards,
  // cost-line cards, split disjunctions, ticket-page re-emissions) BEFORE
  // observations are created, with every repair recorded for telemetry.
  const parserNormalization = normalizeParserStageArtifacts(stages);
  const normalizedStages = parserNormalization.stages;
  const parserArtifactRepairs = parserNormalization.repairs;
  const observations: EvidenceObservation[] = [];
  const missingDetails: unknown[] = [];
  const sensitiveDetails: unknown[] = [];
  const tripYear = inferTripYear(
    tripOverview,
    ...normalizedStages.map((stageInput) => stageInput.stage),
    sourceTransportAnchors
  );
  let ordinal = 0;

  for (const stageInput of normalizedStages) {
    const stage = asRecord(stageInput.stage);
    missingDetails.push(...asArray(stage.missingDetails));
    sensitiveDetails.push(...asArray(stage.sensitiveDetails));

    for (const { collection, kind: defaultKind } of COLLECTIONS) {
      for (const item of asArray(stage[collection])) {
        const payload = normalizePayloadDates(asRecord(item), tripYear);
        if (Object.keys(payload).length === 0) continue;
        stampSourceSupport(payload, collection, stageInput.sourceText ?? null);
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
              _canonicalNoteCollectionTitle: stringValue(payload, "title"),
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

  stampOwnTextClassification(pieces, observations);
  attachCanonicalSourceDecisions(pieces);
  suppressUnsupportedModelInventions(pieces, observations);
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
  reconcileCanonicalStayIdentity(pieces, observations);
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
  // Card/note reconciliation must see the ORIGINAL note lists before
  // accessory routing strips matched sentences onto activity records —
  // otherwise an uncommitted venue card eats its own note evidence and
  // survives (live-run 7.17.2 Budapest promotions).
  reconcileCardsAgainstCityNotes(pieces, missingDetails, observations);
  routeCanonicalAccessoryEvidence({
    actions: {
      addAction: addCanonicalAction,
      mergePiece: mergeCanonicalPieceInto,
      suppressPiece: suppressCanonicalPiece,
    },
    pieces,
    tripYear,
  });
  resolveStructuralActivityDates({
    addAction: addCanonicalAction,
    observations,
    pieces,
    tripBounds: tripDateBounds(pieces),
    tripYear,
  });
  assignProvisionalActivityDates({ observations, pieces });
  // Second shadow-suppression pass now that structural + provisional dates
  // are final (audit A11: the first pass runs before dates resolve, so a
  // transport shadow whose date was assigned late — the 7.18.3 FR8331
  // Jan 14 duplicate — was invisible to same-date matching). The pass only
  // suppresses represented duplicates, so re-running it is safe.
  suppressRepresentedTravelAndStayActivities(pieces);
  absorbLocationFragmentCards(pieces);
  collapseSlotCollisions(pieces);
  collapseAlternativeSlotCards(pieces);
  collapseTitleContainmentAliases(pieces, observations);
  resolveUncommittedRepeatMentions(pieces, observations, missingDetails);
  reconcileCardsAgainstCityNotes(pieces, missingDetails, observations);
  demoteIdeaListMentions(pieces, observations, missingDetails);
  demoteHedgedSingleUncommittedMentions(pieces, missingDetails);
  const combinedGroupingDecisions = [
    ...groupingDecisions,
    ...createDeterministicGeoGroupingDecisions({
      existingDecisions: groupingDecisions,
      missingDetails,
      observations,
      pieces,
    }),
  ];
  executeCanonicalGroupingDecisions({
    decisions: combinedGroupingDecisions,
    observations,
    pieces,
  });
  enforceCanonicalOutputActivityRoles(pieces);
  // Question creation runs AFTER grouping so committed group structure is
  // visible: a grouped parent or child can never be mistaken for a
  // researched idea (live-run 7.18.0 castle/KGB question misfire).
  const researchedListQuestions = createResearchedListQuestions(
    pieces,
    missingDetails
  );
  const dayLabelSlotQuestions = createDayLabelSlotQuestions(
    pieces,
    observations,
    [...missingDetails, ...researchedListQuestions]
  );
  suppressIsolatedUntimedGenericMeals(pieces);
  suppressUnresolvedIsolatedTerms({ observations, pieces });
  rerouteCrossCityNoteContent(pieces);
  mergeCanonicalCityNotes(pieces);
  finalizeCanonicalOutputFields(pieces);
  scrubProtectedValuesFromPublicProse(pieces);
  reconcileCanonicalConflicts(pieces, observations);
  const canonicalGroupingCalls = createCanonicalGroupingCalls(
    combinedGroupingDecisions,
    pieces
  );
  const canonicalDuplicateFoldCalls = createCanonicalDuplicateFoldCalls(pieces);
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
    [
      ...canonicalGroupingCalls,
      ...canonicalDuplicateFoldCalls,
      ...canonicalSourceUpdateCalls,
      ...canonicalConflictQuestions,
      ...canonicalOwnedQuestions,
      ...researchedListQuestions,
      ...dayLabelSlotQuestions,
      ...canonicalSpineQuestions,
      ...missingDetails,
    ],
    pieces,
    tripOverview
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
    parserArtifactRepairs,
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
      parserArtifactRepairCount: parserArtifactRepairs.length,
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
