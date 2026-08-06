import { createHash } from "node:crypto";
import {
  isBoilerplateSourceLine,
  isExcludedPlanningCostLine,
  isPlanningCostMaterial,
} from "@/lib/extraction/source-coverage";
import { injectVerbatimActivityEvidence } from "@/lib/extraction/evidence-injection";
import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import {
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
  sourceTransportAnchorMatchesRecord,
} from "@/lib/extraction/source-transport-anchors";
import type {
  TransportFieldRepair,
  TransportRepairQuestion,
} from "@/lib/extraction/transport-field-repair";
import {
  repairTransportFieldBleed,
  TRANSPORT_REPAIR_FIELD_ALIASES,
} from "@/lib/extraction/transport-field-repair";
import type {
  ContainmentDecision,
  ContainmentEvidenceKind,
  ContainmentLedger,
  ContainmentLedgerTelemetry,
  ContainmentMemberDecision,
  ContainmentRejection,
  ContainmentRelationType,
  GroupingClaimLedgerTelemetry,
} from "@/lib/extraction/grouping-claim-ledger";
import {
  containmentTitleConflict,
  createContainmentLedger,
  createGroupingClaimLedger,
} from "@/lib/extraction/grouping-claim-ledger";
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
  differsByOneEdit,
  normalizeTripClockTime,
  normalizeText,
  normalizeTripDate,
  PRICE_SIGNAL_PATTERN,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import {
  chooseMergeWinner,
  classifyMergeEligibility,
  isDayArcTitle,
  tripCityTokenSet,
  type MergeWinnerCard,
} from "@/lib/extraction/entity-winner";
import {
  dropIdentityProseSegments,
  findIdentityProseSignal,
  scrubProtectedCodeShapedTokens,
  segmentCarriesIdentityValues,
} from "@/lib/extraction/identity-prose";
import { applyReviewIdentityGate } from "@/lib/extraction/review-identity-gate";
import {
  classifyIntentBlocks,
  classifyIdeaListSections,
  classifyOwnTextEvidence,
  decideActivityCandidacy,
  DAY_PLAN_LABEL_PATTERN,
  isRecommendationActivityCategory,
  resolveMentionCommitment,
  SITE_CONTAINER_NOUN_PATTERN,
  type IdeaListEntry,
  type ActivityCandidacyDecision,
  type IntentBlockDecision,
  type IntentBlockEntry,
  type IntentBlockType,
  type MentionCommitment,
} from "@/lib/extraction/activity-classifier";
import {
  classifyDraftActivityCard,
  hasLooseTipVocabulary,
  hasWeakRecommendationLanguage,
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
import { classifySensitiveText } from "@/lib/trip-privacy-policy";

export const EVIDENCE_CLUSTER_VERSION = 19;

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
  // Arc G.3: verification must apply the SAME rule the decision was built
  // under. The deterministic geo lane refuses unverified parser
  // coordinates once the geocode lane has run anywhere in the trip; the
  // resolver lane was never built under that rule, and geocoding is
  // budget-limited and fail-soft, so partial verification is normal.
  // Applying the strict policy to a resolver decision silently deletes
  // valid groups.
  verificationPolicy?: "strict_verified_coordinates";
  candidateIds: string[];
  claim: string;
  containerCandidateId?: string | null;
  decisionId: string;
  parentCandidateId: string;
  parentTitle: string;
  source: "canonical_resolver";
};

export type CanonicalGroupingExecutionDecision = {
  callPolicy: "required" | "silent";
  claim: string;
  date: string;
  decisionId: string;
  members: Array<{
    evidence: ContainmentEvidenceKind[];
    observationIds: string[];
    pieceId: string;
    sourceOrder: number;
    title: string;
  }>;
  parent: {
    observationIds: string[];
    pieceId: string;
    synthetic: boolean;
    title: string;
  };
  provenance: {
    containmentDecisionId: string;
    relationType: ContainmentRelationType;
    source: ContainmentDecision["source"];
  };
  rejections: ContainmentRejection[];
};

export type CanonicalGroupingExecutionLedger = {
  decisions: CanonicalGroupingExecutionDecision[];
  unresolvedMappings: Array<{
    containmentDecisionId: string;
    observationIds: string[];
    pieceId: string | null;
    role: "member" | "parent";
  }>;
  version: 1;
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

// Task B1 (restructure work order 2026-08-04, "the removal gate"). Every
// place that can remove a record must resolve to one of these three shapes.
// Before this type existed, `mergeCanonicalPieceInto` (26 call sites)
// always named a destination while `suppressCanonicalPiece` (23 call
// sites) named none at all — that asymmetry is what let three City Note
// records ship short with nothing downstream able to notice. The product
// owner's ruling (2026-08-04) is that there is no "forbidden" removal, only
// an unlabelled one: deleting a record outright is always allowed, as long
// as it says so.
export type CanonicalPieceDisposition =
  | { kind: "survivor"; survivorId: string }
  // A few sites suppress against a SET of equally-valid candidates instead
  // of one chosen winner (survey §2, "several suppress against a set of
  // candidates"). The existing code never picked a single winner among them
  // either — recording the whole set is the behaviour-neutral choice; if
  // the gate forced a single id here it would be inventing a decision the
  // pipeline never made, which is a behaviour change, not a labelling one.
  | { kind: "survivors"; survivorIds: string[] }
  // The 13 sites the survey audited as genuinely terminal, plus a small
  // number of conditional branches inside otherwise-MIXED sites that reduce
  // to "no survivor was found this time" (see call sites below and
  // docs/assembly-findings-inbox.md for the two/three that still need
  // restructuring so the removal itself is conditioned on the lookup).
  // `code` is closed — see CanonicalTerminalDisposalCode — specifically so
  // a free-text reason string can never again stand in for "we don't know
  // where this went."
  | { kind: "terminal"; code: CanonicalTerminalDisposalCode };

// Named for what each disposal MEANS, not for the pass that fires it —
// several call sites across different functions share a code because the
// underlying judgement is the same one
// (docs/assembly-restructure-survey-2026-08-04.md §2, "13 are a policy
// decision, not a code change"). Grouped by the families the survey named.
// The array (not just the type) is exported so the summary counter below
// can be seeded with every code at zero — an absent key would read as "this
// code doesn't exist" rather than "this code fired zero times" (AGENTS.md
// rule 8(b): absent reads as zero, so the field must actually be present).
export const CANONICAL_TERMINAL_DISPOSAL_CODES = [
  // -- planning-cost material --
  "PLANNING_COST_SECTION_LINE",
  "RECOVERY_ONLY_COST_DERIVED_PLACE",
  // -- explicit cancellation --
  "EXPLICIT_SOURCE_CANCELLATION",
  // -- candidacy floor not met --
  "TRANSPORT_CANDIDACY_FLOOR_NOT_MET",
  "ROUTE_LESS_TRANSPORT_FRAGMENT_NO_HOST",
  "HOME_DEPARTURE_OR_RETURN_NOT_A_LEG",
  "SAME_DAY_DESTINATION_NOT_A_LEG",
  "STAY_CANDIDACY_NO_NIGHT_EVIDENCE",
  "STAY_CANDIDACY_PERSON_NAME_SHAPED",
  "ISOLATED_UNTIMED_GENERIC_MEAL",
  "ACCESS_MATERIAL_NO_OWNING_STAY",
  "PRIVATE_STAY_ACCESS_NO_COMPATIBLE_STAY",
  // -- unsupported model invention --
  "UNSUPPORTED_MODEL_INVENTION",
  // -- no source support --
  "ISOLATED_TERM_NO_SOURCE_SUPPORT",
  "NOTE_CONTENT_REDISTRIBUTED_NO_SINGLE_SURVIVOR",
  "EMPTY_CITY_NOTE_AFTER_EXCLUSIONS",
  // -- structural/overview artifact --
  "GENERIC_DAY_OVERVIEW",
  "STAY_NAME_DOCUMENT_ARTIFACT",
  // -- identity-collision repair --
  "PIECE_IDENTITY_COLLISION_REPAIR",
  "PUBLIC_TITLE_IDENTITY_VALUE",
] as const;

export type CanonicalTerminalDisposalCode =
  (typeof CANONICAL_TERMINAL_DISPOSAL_CODES)[number];

export type CanonicalEvidencePiece = {
  actions: CanonicalEvidenceAction[];
  confidence: "high" | "medium";
  conflicts: CanonicalEvidenceConflict[];
  disposition?: CanonicalPieceDisposition;
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

export type AssemblyStageWriterTraceEntry = {
  afterHash: string;
  beforeHash: string;
  changed: boolean;
  changedPieceCount: number | null;
  decisionDomain:
    | "source_normalization"
    | "pre_classification_mutation"
    | "classification"
    | "containment"
    | "identity"
    | "grouping"
    | "review"
    | "final_projection";
  ordinal: number;
  writer: string;
  writes: string[];
};

export type CanonicalIdentityLedgerTelemetry = {
  decisions: Array<{
    acceptedFactDigests: string[];
    decisionId: string;
    finalDate: string | null;
    finalHome: "activity" | "city_note";
    loserPieceIds: string[];
    observationIds: string[];
    priorDates: string[];
    reasonCode:
      | "city_note_evidence_wins"
      | "committed_activity_wins"
      | "cross_referenced_same_day_venue"
      | "identity_lane_merge"
      | "repeated_uncommitted_to_city_note"
      | "source_sequenced_occurrence_wins";
    survivorPieceId: string;
    usefulFactDigests: string[];
  }>;
  unresolvedCarrierCount: number;
  version: 1;
};

export type EvidenceClusteringResult = {
  draft: unknown;
  observations: EvidenceObservation[];
  parserArtifactRepairs: ParserArtifactRepair[];
  pieces: CanonicalEvidencePiece[];
  transportFieldRepairs: TransportFieldRepair[];
  summary: {
    activityCandidacyDecisions: Array<{
      activityCandidate: boolean;
      blockDecisionId: string | null;
      canonicalPieceIds: string[];
      commitmentObservationIds: string[];
      commitmentSignals: string[];
      contradiction: boolean;
      decisionId: string;
      destination: string;
      ideaContextBefore: boolean;
      ideaContextObservationId: string | null;
      referenceNoteObservationId: string | null;
      inputEvidenceRole: string | null;
      inputItemType: string | null;
      observationId: string;
      observationDate: string | null;
      observationOrdinal: number;
      observationTitle: string | null;
      reasonCode: string;
      title: string | null;
      winningSignal: string;
    }>;
    ambiguousIntentHomes: AmbiguousIntentHomeDecision[];
    canonicalPieceCount: number;
    clusteredObservationCount: number;
    contextObservationCount: number;
    dispositionCount: number;
    observationCount: number;
    parserArtifactRepairCount: number;
    sourceBoundedDisjunctionRepairs: Array<{
      afterRoles: [string | null, string | null];
      beforeRoles: [string | null, string | null];
      canonicalPieceIds: string[];
      observationIds: string[];
      rule: "explicit_local_or_v1";
      spanEnd: number;
      spanHash: string;
      spanStart: number;
    }>;
    rejectedObservationCount: number;
    containmentLedger: ContainmentLedgerTelemetry;
    groupingClaims: GroupingClaimLedgerTelemetry;
    groupingExecution: CanonicalGroupingExecutionLedger;
    identityLedger: CanonicalIdentityLedgerTelemetry;
    finalProjectionSafety: FinalProjectionSafetyLedger;
    stageWriterTrace: AssemblyStageWriterTraceEntry[];
    intentBlocks: {
      blocks: IntentBlockDecision[];
      version: 1;
    };
    sourceAnchorObservationCount: number;
    suppressedWeakAnchorCount: number;
    // Task B ("Tell it fired"): a disposal count by reason code, on the
    // served audit surface rather than only computable from `usage`. Per
    // AGENTS.md rule 8(b) an absent field reads as zero, so a field that
    // exists but a code that never fires is indistinguishable from "this
    // code doesn't exist" without this being present and total. Counts are
    // read from final piece state (`piece.disposition`), not accumulated
    // as passes run, so a piece disposed more than once (should not
    // happen — see suppressCanonicalPiece) is never double-counted.
    terminalDisposalCountsByCode: Record<CanonicalTerminalDisposalCode, number>;
    survivorDisposalCount: number;
    transportFieldRepairCount: number;
    transportFieldRepairQuestionCount: number;
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
  if (kind === "context") return "context";
  if (kind !== "activity" && kind !== "note") {
    return explicit && EVIDENCE_ROLES.has(explicit)
      ? explicit
      : "atomic_candidate";
  }
  return activityCandidacyDecisionForPayload(payload, {
    evidenceRole:
      explicit && EVIDENCE_ROLES.has(explicit)
        ? explicit
        : kind === "note"
          ? "city_note_candidate"
          : null,
  }).evidenceRole;
}

function activityCandidacyDecisionForPayload(
  payload: Record<string, unknown>,
  overrides: {
    evidenceRole?: EvidenceRole | null;
    hasAuditedCommitment?: boolean;
    intentBlockType?: IntentBlockType | null;
    isGenericOverview?: boolean;
  } = {}
): ActivityCandidacyDecision {
  const recoveryDecision = asRecord(
    payload._canonicalRecoveryCandidacyDecision
  );
  const recoveredEvidenceRole = stringValue(
    recoveryDecision,
    "inputEvidenceRole"
  ) as EvidenceRole | null;
  const recoveredItemType = stringValue(recoveryDecision, "inputItemType");
  const explicitRole =
    overrides.evidenceRole === undefined
      ? recoveredEvidenceRole ??
        (stringValue(payload, "evidenceRole") as EvidenceRole | null)
      : overrides.evidenceRole;
  const approvedGrouping =
    Array.isArray(payload._canonicalGroupingDecisionIds) &&
    payload._canonicalGroupingDecisionIds.length > 0;
  const itemType = recoveredItemType ?? stringValue(payload, "itemType");
  const roleOrTypeRefusesImplicitPromotion = Boolean(
    explicitRole === "accessory_detail" ||
      explicitRole === "city_note_candidate" ||
      explicitRole === "context" ||
      explicitRole === "rejected" ||
      itemType === "note" ||
      /^(?:admin|administrative|accessory|evidence|logistics|receipt|ticket_detail)$/i.test(
        itemType ?? ""
      )
  );
  const sourceCommitment = Boolean(
    !roleOrTypeRefusesImplicitPromotion &&
      (stringValue(payload, "startTime") ||
        stringValue(payload, "confirmation"))
  );
  return decideActivityCandidacy({
    ...activityInput(payload),
    evidenceRole: explicitRole,
    hasStandaloneAnchor: hasIndependentActivityAnchor(payload),
    hasAuditedCommitment:
      overrides.hasAuditedCommitment ??
      ((approvedGrouping && !roleOrTypeRefusesImplicitPromotion) ||
        sourceCommitment),
    intentBlockType:
      overrides.intentBlockType ??
      (stringValue(payload, "_intentBlockType") as IntentBlockType | null),
    isGenericOverview:
      overrides.isGenericOverview ?? payload._canonicalSourceContainer === true,
    itemType,
  });
}

function hasSourceBackedIntakeCommitment(
  payload: Record<string, unknown>
) {
  const provenance = stringValue(payload, "_evidenceProvenance");
  const evidence = stringValue(payload, "evidence");
  if (
    !evidence ||
    (provenance !== "model_verbatim" &&
      provenance !== "line_match_injected")
  ) {
    return false;
  }

  return classifyOwnTextEvidence([
    {
      ...activityInput(payload),
      confirmation: stringValue(payload, "confirmation"),
      // Commitment must come from the verified source line, not a model
      // paraphrase in the card description. This lets an undated explicit
      // plan survive long enough for canonical placement to assign its
      // provisional city date, while an unverified "we plan to" rewrite
      // remains unable to promote a loose reference.
      description: evidence,
    },
  ]).hasFixedCommitment;
}

function originalActivityCandidacyInputs(payload: Record<string, unknown>) {
  const recoveryDecision = asRecord(
    payload._canonicalRecoveryCandidacyDecision
  );
  return {
    evidenceRole:
      stringValue(recoveryDecision, "inputEvidenceRole") ??
      stringValue(payload, "evidenceRole"),
    itemType:
      stringValue(recoveryDecision, "inputItemType") ??
      stringValue(payload, "itemType"),
  };
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
    _canonicalPriorPieceIds,
    _evidenceProvenance,
    _canonicalNoteCollectionLabel,
    _canonicalNoteEntries,
    _canonicalNoteEntry,
    _canonicalRoleDecision,
    _canonicalProvisionalFields,
    _canonicalRepairedTransportFields,
    _canonicalSourceDecisions,
    _canonicalSourceOccurrences,
    _canonicalSourcePosition,
    // Arc G.3a: the geocoder's formatted address is grouping evidence and
    // nothing else. RW-GRP-001's lane posture says results are consumed
    // ONLY by proximity checks, so a postal address must not ride into the
    // persisted draft with the card. (The pre-existing verifiedLatitude /
    // verifiedLongitude / _geoVerified fields have the same gap; they are
    // left alone deliberately — changing them is a behavior change to make
    // on purpose, not on the way past.)
    verifiedFormattedAddress: _verifiedFormattedAddress,
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

// Two parser passes over the SAME document can disagree by one missing or
// substituted character in a proper name (live run 8.1: `Trdlnik` versus
// `Trdelnik`). Treat that as source-level spelling drift only when the whole
// occurrence agrees: same dated city, same source file, same token shape,
// and no conflicting booking identity. The long-token + shared-edge guards
// keep short neighboring venues (for example Gallery East/West) distinct.
function sameSourceSingleEditActivityAlias(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  leftTokens: string[],
  rightTokens: string[]
) {
  const leftDate = stringValue(left, "date");
  const rightDate = stringValue(right, "date");
  const leftCity = normalizedComparable(left.city);
  const rightCity = normalizedComparable(right.city);
  const leftSource = normalizedComparable(left.sourceFilename);
  const rightSource = normalizedComparable(right.sourceFilename);
  const leftConfirmation = confirmationFrom(left);
  const rightConfirmation = confirmationFrom(right);

  if (
    !leftDate ||
    !rightDate ||
    !tripDatesMatch(leftDate, rightDate) ||
    !leftCity ||
    leftCity !== rightCity ||
    !leftSource ||
    leftSource !== rightSource ||
    (leftConfirmation &&
      rightConfirmation &&
      leftConfirmation !== rightConfirmation) ||
    leftTokens.length === 0 ||
    leftTokens.length !== rightTokens.length
  ) {
    return false;
  }

  let fuzzyPairs = 0;
  for (let index = 0; index < leftTokens.length; index += 1) {
    const leftToken = leftTokens[index];
    const rightToken = rightTokens[index];
    if (leftToken === rightToken) continue;
    if (
      Math.min(leftToken.length, rightToken.length) < 7 ||
      leftToken.slice(0, 2) !== rightToken.slice(0, 2) ||
      leftToken.slice(-2) !== rightToken.slice(-2) ||
      !differsByOneEdit(leftToken, rightToken)
    ) {
      return false;
    }
    fuzzyPairs += 1;
  }

  return fuzzyPairs === 1;
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

  if (
    containmentTitleConflict(
      stringValue(left, "title"),
      stringValue(right, "title")
    )
  ) {
    return null;
  }

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
    sameSourceSingleEditActivityAlias(left, right, leftTitle, rightTitle)
  ) {
    return "same dated source occurrence with one-character spelling drift";
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
  const priorId = piece.id;
  piece.id = `piece_${stableHash({
    kind: piece.kind,
    observations: [...piece.observationIds].sort(),
  })}`;
  // Run 7.23.0 (Arc E): a merge refreshes the WINNER's id, so anything that
  // bound to the prior id — question subjects resolved before the fold —
  // dangles and kills finalization ("missingDetails[n] targets missing
  // canonical identity"). The prior ids ride on the payload so review
  // subjects can be re-keyed to the same entity's current id (identity
  // forwarding is the represented-by chain's sibling, never title
  // similarity — RW-QUE-001).
  if (priorId && priorId !== piece.id) {
    const priors = Array.isArray(piece.payload._canonicalPriorPieceIds)
      ? (piece.payload._canonicalPriorPieceIds as unknown[]).filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    if (!priors.includes(priorId)) {
      piece.payload._canonicalPriorPieceIds = [...priors, priorId];
    }
  }
}

// Re-key review subjects through canonical id forwarding (Arc E, live-run
// 7.23.0 assembly-recovery failure): a detail whose relatedCanonicalPieceId
// is no longer a live piece id follows the prior-id index to the same
// entity's current id. Truly dead subjects are left for the dead-target
// sweep to dismiss — a question cannot outlive its subject, but it must
// never be orphaned by a mere id refresh.
function rekeyReviewSubjectsThroughPriorIds(
  details: unknown[],
  pieces: CanonicalEvidencePiece[]
) {
  const currentIds = new Set(pieces.map((piece) => piece.id));
  const currentByPriorId = new Map<string, string>();
  for (const piece of pieces) {
    const priors = piece.payload._canonicalPriorPieceIds;
    if (!Array.isArray(priors)) continue;
    for (const prior of priors) {
      if (typeof prior === "string" && !currentIds.has(prior)) {
        currentByPriorId.set(prior, piece.id);
      }
    }
  }
  if (currentByPriorId.size === 0) return;

  for (const detail of details) {
    const record = asRecord(detail);
    const related = stringValue(record, "relatedCanonicalPieceId");
    if (!related || currentIds.has(related)) continue;
    const forwarded = currentByPriorId.get(related);
    if (forwarded) {
      record.relatedCanonicalPieceId = forwarded;
      record._canonicalSubjectRekeyedFrom = related;
    }
  }
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
      // List disposition (Task B5, "several suppress against a set of
      // candidates"): the existing rule never picked ONE specific segment
      // this generic parent is represented by — any candidate matching
      // date+type+confirmation/reason qualifies, and more than one
      // routinely does (a same-day round trip on the same provider, for
      // example). Naming a single survivorId here would invent a choice
      // the pipeline never made; the gate records the whole candidate set
      // instead so the audit shows every plausible absorber.
      disposeCanonicalPiece(piece, {
        kind: "survivors",
        survivorIds: candidates.map((candidate) => candidate.id),
      });
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

// Question gate v2 (live-run 7.21.0, run7 PC-8/PC-1; RW-QUE-001 "material
// decisions only", Δ2 amendment 2). Four off-contract families are
// dismissed in place — dismissal keeps the record and its reason auditable
// while removing the maker interruption:
// - date questions carrying a parseable guessed value (the pipeline already
//   dated the day's records; asking is the bogus-date family back);
// - type/travel-mode questions with a guessed value ("what is the travel
//   mode for the 9:00 AM pick-up" — the source names the action);
// - sensitive-details questions (RW-PRI-001: identity protection is
//   automatic and final, never a maker decision);
// - receipt-identification questions (asking the maker to name raw
//   booking/payment fragments);
// plus the Δ2 fold: when several OPEN decision questions rise from the SAME
// day section and one targets the section's heading-named entity, the
// sub-component questions fold into that container question (St. Vitus's
// tour angle belongs inside the one castle ticket decision).
function guessYearFromPieces(pieces: CanonicalEvidencePiece[]) {
  for (const piece of pieces) {
    const date = stringValue(piece.payload, "date");
    const match = date ? /^(\d{4})-/.exec(date) : null;
    if (match) return Number(match[1]);
  }
  return null;
}

function gateOffContractQuestions(
  details: unknown[],
  pieces: CanonicalEvidencePiece[]
) {
  const records = details
    .map((detail) => asRecord(detail))
    .filter(
      (record) =>
        stringValue(record, "_canonicalReviewDisposition") === "question"
    );

  const dismiss = (record: Record<string, unknown>, reason: string) => {
    record._canonicalReviewDisposition = "dismissed";
    record._canonicalQuestionGate = reason;
  };

  // Dead-target sweep (run7 hotfix, live trip e0f1db42): a question whose
  // subject piece is no longer output-eligible (e.g. a transport fragment
  // the fragment rule rejected) violates the finalization identity
  // invariant ("missingDetails[n] targets missing canonical identity").
  // Dismissal is the invariant's own exemption — the question dies with
  // its subject, auditable in place. Arc E: the sweep now also catches a
  // subject id that matches NO live piece at all (the 7.23.0 shape) — the
  // rekey pass above has already rescued every forwardable subject, so
  // whatever remains is genuinely dead.
  const eligibleIds = new Set(
    pieces.filter((piece) => piece.outputEligible).map((piece) => piece.id)
  );
  for (const record of records) {
    const related = stringValue(record, "relatedCanonicalPieceId");
    if (related && !eligibleIds.has(related)) {
      dismiss(
        record,
        "subject entity was suppressed by assembly; a question cannot outlive its subject"
      );
    }
  }

  for (const record of records) {
    if (stringValue(record, "_canonicalReviewDisposition") !== "question") {
      continue;
    }
    const targetField = stringValue(record, "targetField") ?? "";
    const guessed = stringValue(record, "guessedValue");
    const evidence = stringValue(record, "evidence") ?? "";
    if (/date/i.test(targetField) && guessed) {
      // Dismiss ONLY when the pipeline already holds the guessed date as a
      // settled fact (run7 hotfix: genuine date uncertainty — provisional
      // dates — keeps its question per the locked Phase-2 doctrine; the
      // 7.21.0 bogus case asked about a day whose records were already
      // firmly dated).
      const guessedIso = normalizeTripDate(guessed, guessYearFromPieces(pieces));
      const settled =
        guessedIso !== null &&
        pieces.some((piece) => {
          if (!piece.outputEligible || piece.kind !== "activity") return false;
          if (stringValue(piece.payload, "date") !== guessedIso) return false;
          const provisional = piece.payload._canonicalProvisionalFields;
          return !(
            Array.isArray(provisional) && provisional.includes("date")
          );
        });
      if (settled) {
        dismiss(
          record,
          "auto-applied guessed date: the surrounding itinerary already dates this day (Phase 2 bogus-date family)"
        );
        continue;
      }
    }
    if (/^(?:type|itemtype)$/i.test(targetField) && guessed) {
      dismiss(
        record,
        "the source names the action; mode/type curiosity is not a material decision (RW-QUE-001)"
      );
      continue;
    }
    if (/sensitive|access.?code/i.test(targetField)) {
      dismiss(
        record,
        "identity/access protection is automatic and final (RW-PRI-001), never a maker question"
      );
      continue;
    }
    // Run8: a question whose own reason admits the excerpt is cut off is
    // asking the maker to complete an OCR fragment — never a material
    // decision ("what comes after 'Turn left onto…'", receipt-title asks).
    if (
      /\bcut off\b|\bcut-off\b|excerpt (?:is|appears)\b[^.]{0,40}(?:cut|truncat|incomplete)/i.test(
        stringValue(record, "reason") ?? ""
      )
    ) {
      dismiss(
        record,
        "the excerpt is an OCR fragment; completing it is not a maker decision (RW-QUE-001)"
      );
      continue;
    }
    if (
      /^title$/i.test(targetField) &&
      /status\s*:\s*paid|total\s+\d|\bx\s*\d+\s*x\b|\[private contact removed\]/i.test(
        evidence
      )
    ) {
      dismiss(
        record,
        "receipt/payment fragments identify themselves through booking anchors; naming them is not a maker decision"
      );
    }
  }

  // Δ2 same-section fold: group remaining OPEN questions by the day-heading
  // prefix of their evidence.
  const open = records.filter(
    (record) =>
      stringValue(record, "_canonicalReviewDisposition") === "question"
  );
  const headingOf = (record: Record<string, unknown>) => {
    const evidence = stringValue(record, "evidence") ?? "";
    const match =
      /^((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^:]{0,80}?)(?::|$)/i.exec(
        evidence.trim()
      );
    return match ? normalizedComparable(match[1]) : null;
  };
  const byHeading = new Map<string, Array<Record<string, unknown>>>();
  for (const record of open) {
    const heading = headingOf(record);
    if (!heading) continue;
    byHeading.set(heading, [...(byHeading.get(heading) ?? []), record]);
  }
  for (const [heading, group] of byHeading) {
    if (group.length < 2) continue;
    const paddedHeading = ` ${heading} `;
    const container = group.find((record) => {
      const related = normalizedComparable(
        stringValue(record, "relatedTitle") ?? ""
      );
      const tokens = related
        .split(" ")
        .filter((token) => token.length >= 4)
        .filter((token) => paddedHeading.includes(` ${token} `));
      return tokens.length >= 2 || /castle|palace|complex/.test(related);
    });
    if (!container) continue;
    for (const record of group) {
      if (record === container) continue;
      dismiss(
        record,
        "folded into the container's open decision (Δ2: one venue complex, one open decision)"
      );
    }
  }
}

// A route-less, time-less, number-less transport piece is a ticket
// fragment, never a travel row (live-run 7.21.0, run7 PC-5: a recovered
// GoEuro receipt line minted a 9th "GOEURO" train row on Jan 24 with no
// route and no times, plus a "What time does GOEURO depart?" question — the
// real segment was the Jan-21 ÖBB train already represented). If a specific
// segment shares its confirmation or provider, the fragment folds there as
// evidence; otherwise it is rejected with a recorded disposition. Deleting
// beats asking (CEO direction, run7).
// Run 7.23.0r P1: a 9th transport row shipped — "Home flight FCO to JFK",
// JFK 02:45 -> FCO 10:15 on Jan 25, description "Delta Flight 1043", conf
// #GHFHPG — a garbled duplicate of the anchored Delta 1043 (FCO 14:45 ->
// JFK 18:45). Every existing twin basis failed: no number field, route
// REVERSED, times corrupted, dated titles differ. But the phantom shares
// its confirmation with an anchored same-date row over the SAME endpoint
// set — and it matches no source anchor of its own (the run's own
// transport_row_without_source_anchor advisory flagged it; nothing acted).
// Shared confirmation alone is NOT sufficient: one booking legitimately
// covers several segments (all four Delta rows carry #GHFHPG), so the fold
// additionally requires same date AND the same unordered endpoint pair.
function transportAnchorRecordFromPayload(payload: Record<string, unknown>) {
  return {
    arrivalLocation:
      stringValue(payload, "arrival") ?? stringValue(payload, "arrivalLocation"),
    arrivalTime: stringValue(payload, "arrivalTime"),
    confirmationLabel:
      stringValue(payload, "confirmation") ??
      stringValue(payload, "confirmationLabel") ??
      stringValue(payload, "bookingReference"),
    date: stringValue(payload, "date"),
    departureLocation:
      stringValue(payload, "departure") ??
      stringValue(payload, "departureLocation"),
    departureTime: stringValue(payload, "departureTime"),
    provider: stringValue(payload, "provider"),
    routeLabel: stringValue(payload, "title") ?? "",
    transportType: stringValue(payload, "type"),
  };
}

function transportEndpoints(payload: Record<string, unknown>) {
  return {
    arrival: payload.arrival ?? payload.arrivalLocation,
    departure: payload.departure ?? payload.departureLocation,
  };
}

function sameUnorderedEndpointPair(
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  const a = transportEndpoints(left);
  const b = transportEndpoints(right);
  return (
    (locationsMatch(a.departure, b.departure) &&
      locationsMatch(a.arrival, b.arrival)) ||
    (locationsMatch(a.departure, b.arrival) &&
      locationsMatch(a.arrival, b.departure))
  );
}

function foldUnanchoredConfirmationTwinTransport(
  pieces: CanonicalEvidencePiece[],
  anchors: SourceTransportAnchor[]
) {
  if (anchors.length === 0) return;
  const transports = pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  );
  if (transports.length < 2) return;
  const anchoredPieces = new Set(
    transports.filter((piece) =>
      anchors.some((anchor) =>
        sourceTransportAnchorMatchesRecord(
          anchor,
          transportAnchorRecordFromPayload(piece.payload)
        )
      )
    )
  );

  for (const piece of transports) {
    if (!piece.outputEligible) continue;
    if (anchoredPieces.has(piece)) continue;
    const confirmation = confirmationFrom(piece.payload);
    if (!confirmation) continue;
    const twin = transports.find(
      (candidate) =>
        candidate !== piece &&
        candidate.outputEligible &&
        anchoredPieces.has(candidate) &&
        confirmationFrom(candidate.payload) === confirmation &&
        sameCanonicalDate(piece.payload, candidate.payload) &&
        sameUnorderedEndpointPair(piece.payload, candidate.payload)
    );
    if (!twin) continue;
    mergeCanonicalPieceInto({
      reason:
        "unanchored travel row sharing its confirmation, date, and endpoint pair with an anchored segment folds into it (7.23.0r phantom twin)",
      source: piece,
      target: twin,
    });
  }
}

function suppressRouteLessTransportFragments(
  pieces: CanonicalEvidencePiece[],
  sourceTransportAnchors: SourceTransportAnchor[] = []
) {
  const transportPieces = pieces.filter(
    (piece) => piece.kind === "transport" && piece.outputEligible
  );

  // Transport candidacy floor (Arc F.2 C2, run 7.24.1 chain A): a row with
  // NEITHER endpoint location AND no matching source anchor is booking
  // material, never a traveler travel row — the 9th row ("Train ticket",
  // Jan 24, null→null) was a second reading of the ÖBB FAHRSCHEIN OCR
  // block whose 10:42 departure time kept it alive through the
  // route-less-fragment pass below (a time is not a route). The two P2s
  // that saw it live (transport_row_without_source_anchor,
  // critical_transport_missing_soft_details) are the detection; this is
  // their disposition. Negative controls (fixture-proven): real endpoints
  // with a null confirmation survive (Delta 2934); a missing arrival time
  // alone survives; an endpoint-less row whose identity matches a source
  // anchor survives (the anchor is the endpoints' source of truth).
  // The suppressed piece keeps its evidence and observations
  // (RW-ING-001/RW-EVD-001), and its captured confirmation still feeds
  // the protected-value deny list (T2's stay property, mirrored).
  for (const piece of transportPieces) {
    if (!piece.outputEligible) continue;
    if (hasSpecificTransportRoute(piece.payload)) continue;
    if (
      routeEndpoint(piece.payload, "departure") ||
      routeEndpoint(piece.payload, "arrival")
    ) {
      continue;
    }
    const anchored = sourceTransportAnchors.some((anchor) =>
      sourceTransportAnchorMatchesRecord(
        anchor,
        transportAnchorRecordFromPayload(piece.payload)
      )
    );
    if (anchored) continue;
    // Terminal (survey §2, "13 genuinely terminal"): a row with no route
    // and no anchor never had a candidate segment to fold into — it is
    // booking material, not evidence of a movement, so there is nothing to
    // name as a survivor.
    suppressCanonicalPiece(
      piece,
      "transport candidacy floor: no departure or arrival location and no matching source anchor — booking material, not a travel row (run 7.24.1 chain A)",
      { kind: "terminal", code: "TRANSPORT_CANDIDACY_FLOOR_NOT_MET" }
    );
  }

  // Run8 (7.21.1a): the ÖBB ticket's VIA stations minted a second row with
  // the SAME provider and SAME departure/arrival times as the real segment
  // ("Train ticket" Gramatneusiedl→Gyor, 10:42→13:19). Times+provider are a
  // stronger identity signal than route names: the unconfirmed twin folds.
  for (const piece of transportPieces) {
    if (piece.outputEligible === false) continue;
    if (confirmationFrom(piece.payload)) continue;
    const dep = stringValue(piece.payload, "departureTime");
    const arr = stringValue(piece.payload, "arrivalTime");
    const prov = normalizedComparable(stringValue(piece.payload, "provider") ?? "");
    if (!dep || !arr || !prov) continue;
    const twin = transportPieces.find(
      (candidate) =>
        candidate !== piece &&
        candidate.outputEligible &&
        Boolean(confirmationFrom(candidate.payload)) &&
        stringValue(candidate.payload, "departureTime") === dep &&
        stringValue(candidate.payload, "arrivalTime") === arr &&
        normalizedComparable(stringValue(candidate.payload, "provider") ?? "") === prov
    );
    if (twin) {
      // Direct outputEligible assignment (one of Task B's 5 bypass sites),
      // but the survivor is right here in scope — mechanical to gate.
      disposeCanonicalPiece(piece, { kind: "survivor", survivorId: twin.id });
      piece.outputEligible = false;
      addCanonicalAction(piece, {
        absorbedTitles: [stringValue(twin.payload, "title") ?? ""],
        observationIds: [...piece.observationIds],
        reason:
          "unconfirmed twin row shares provider and exact times with a confirmed segment: ticket routing detail, not a second journey",
        type: "rejected",
      });
    }
  }

  for (const piece of transportPieces) {
    if (piece.outputEligible === false) continue;
    if (
      hasSpecificTransportRoute(piece.payload) ||
      transportNumber(piece.payload) ||
      timeFrom(piece.payload) ||
      stringValue(piece.payload, "departureTime") ||
      stringValue(piece.payload, "arrivalTime")
    ) {
      continue;
    }

    const confirmation = normalizedComparable(
      confirmationFrom(piece.payload) ?? ""
    );
    const provider = normalizedComparable(
      stringValue(piece.payload, "provider") ?? ""
    );
    const host = transportPieces.find(
      (candidate) =>
        candidate !== piece &&
        candidate.outputEligible &&
        hasSpecificTransportRoute(candidate.payload) &&
        Boolean(
          (confirmation &&
            normalizedComparable(confirmationFrom(candidate.payload) ?? "") ===
              confirmation) ||
            (provider &&
              provider.length >= 3 &&
              normalizedComparable(
                stringValue(candidate.payload, "provider") ?? ""
              ) === provider)
        )
    );

    // NOT restructured here on purpose (work order Task B5): this removal
    // runs unconditionally and `host` is only looked up afterward to decide
    // the label — the same shape as applyAccessTaskPolicy's two branches
    // below. Making the removal conditional on finding `host` is a
    // behaviour change (a piece that has no host today would then survive
    // as an activity/note instead of being dropped) and is explicitly
    // out of scope for this step; recorded in
    // docs/assembly-findings-inbox.md. The disposition below is the most
    // accurate label available under the CURRENT (unconditional) control
    // flow — it reads the same `host` the reason string already branches on.
    disposeCanonicalPiece(
      piece,
      host
        ? { kind: "survivor", survivorId: host.id }
        : { kind: "terminal", code: "ROUTE_LESS_TRANSPORT_FRAGMENT_NO_HOST" }
    );
    piece.outputEligible = false;
    // Identity-manifest hygiene (run7 hotfix): the fragment's observations
    // stay on the fragment piece — moving observation ids between pieces
    // desynchronizes the evidence identity manifest. The action record
    // alone documents the fold.
    addCanonicalAction(piece, {
      absorbedTitles: host
        ? [stringValue(host.payload, "title") ?? ""]
        : [],
      observationIds: [...piece.observationIds],
      reason: host
        ? "route-less ticket fragment folded into its represented transport segment"
        : "route-less, time-less transport fragment rejected: booking material without a movement is never a travel row",
      type: "rejected",
    });
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

// Task B2 (restructure work order 2026-08-04): the single gate every
// removal goes through, whether it arrives via suppressCanonicalPiece,
// mergeCanonicalPieceInto, or one of the 5 direct `outputEligible = false`
// sites. It deliberately does NOT touch outputEligible, actions, or
// mergeReasons — each call site keeps setting those exactly as it already
// did (this step is behaviour-neutral by contract; only the disposition is
// new). Recording nothing here for a removal is the bug this gate exists
// to make impossible: three City Note records shipped short with no
// disposition anywhere and nothing noticed.
// Exported: canonical-trip-assembly.ts's id-collision repair
// (Task B6, one of the 5 direct `outputEligible = false` sites) lives
// outside this file and does not go through suppressCanonicalPiece or
// mergeCanonicalPieceInto, so it needs the gate itself, not just the
// primitives built on it.
export function disposeCanonicalPiece(
  piece: CanonicalEvidencePiece,
  disposition: CanonicalPieceDisposition
) {
  piece.disposition = disposition;
}

function suppressCanonicalPiece(
  piece: CanonicalEvidencePiece,
  reason: string,
  disposition: CanonicalPieceDisposition
) {
  disposeCanonicalPiece(piece, disposition);
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
        // The verbatim source excerpt joins the judged text (run7: the
        // parser rewrites list entries into invented prose — "Dinner at
        // Mazel Tov restaurant." — and strips hedges like "(far away)";
        // hedge/commitment judgment must see the source's own words).
        description: [
          stringValue(observation.payload, "description"),
          stringValue(observation.payload, "evidence"),
        ]
          .filter(Boolean)
          .join(" "),
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
  // A merge always names its destination by construction (`target`) — this
  // is the mechanical case B3 describes, not a judgement call. Read
  // target.id AFTER the possible refresh above so the disposition points at
  // the id the target actually carries once this merge lands, matching how
  // `_representedByPieceId`-style snapshots already work elsewhere in this
  // file (survey §4: identity churn is a pre-existing, out-of-scope issue).
  suppressCanonicalPiece(source, reason, {
    kind: "survivor",
    survivorId: target.id,
  });
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
  const places = pieces.filter(
    (piece) => piece.kind === "place" && piece.outputEligible
  );
  const stayTargets = pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );

  for (const accessory of accessories) {
    const text = activityText(accessory.payload);
    const rawAccessoryProse = [
      stringValue(accessory.payload, "title"),
      stringValue(accessory.payload, "description"),
    ]
      .filter(Boolean)
      .join(" ");
    const stayAccessShaped =
      STAY_ACCESS_INSTRUCTION_PATTERN.test(rawAccessoryProse) ||
      isArrivalDirectionsProse(rawAccessoryProse) ||
      /\barrival directions\b|\bgetting there\b|\baccess details?\b/i.test(
        stringValue(accessory.payload, "title") ?? ""
      );
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

      if (candidate.kind === "stay") {
        if (stayAccessShaped) {
          const accessoryCity = normalizedComparable(
            stringValue(accessory.payload, "city")
          );
          return Boolean(
            (accessoryCity &&
              normalizedComparable(stayCity(candidate, places)) ===
                accessoryCity) ||
              stayTargets.length === 1
          );
        }
        if (/\b(?:airbnb|check in|hostel|hotel|lodging|room|stay)\b/.test(text)) {
          return tokenMatch || Boolean(
            normalizedComparable(candidate.payload.address) &&
            text.includes(normalizedComparable(candidate.payload.address))
          );
        }
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
    const accessoryProse = stringValue(accessory.payload, "description") ??
      stringValue(accessory.payload, "title");
    if (
      target.kind === "stay" &&
      accessoryProse &&
      stayAccessShaped
    ) {
      target.payload.accessInstructions = uniqueDescription(
        target.payload.accessInstructions,
        accessoryProse
      );
    } else {
      target.payload.description = uniqueDescription(
        target.payload.description,
        accessoryProse
      );
    }
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
      if (!time || !candidateTime || time !== candidateTime) return false;
      // Entity affinity (live-run 7.21.0, run7: the "Colosseum
      // skip-the-line ticket" — its own receipt page dated 15.01 14:30 —
      // attached to the Klementinum Tour purely on the date+time
      // coincidence). An accessory naming a venue attaches only to a
      // candidate whose own text names that venue; a generic ticket line
      // with no venue token may still attach by slot.
      const accessoryVenueTokens = normalizedComparable(
        stringValue(accessory.payload, "title")
      )
        .split(" ")
        .filter(
          (token) =>
            token.length >= 5 &&
            !/^(?:admission|entry|skip|the|line|ticket|tickets|voucher|pass)$/.test(
              token
            )
        );
      if (accessoryVenueTokens.length === 0) return true;
      const candidateText = ` ${normalizedComparable(
        activityText(candidate.payload)
      )} `;
      return accessoryVenueTokens.some((token) =>
        candidateText.includes(` ${token} `)
      );
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
          "airport-prep line attaches to its travel card as a prep note, never a separate activity (RW-TRV-001)",
          { kind: "survivor", survivorId: prepTransport.id }
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
        // List disposition (Task B5): unlike the crossDateMatch branch
        // below, this rule never narrows `matches` to one row before
        // suppressing — the comment above explicitly treats MULTIPLE
        // matches as stronger evidence, not a tie to break. Recording all
        // of `matches` is the behaviour-neutral read of that comment;
        // picking matches[0] would silently prefer one real segment over
        // an equally-matching one the pipeline never distinguished.
        suppressCanonicalPiece(
          activity,
          "traveler movement represented by canonical transport",
          { kind: "survivors", survivorIds: matches.map((transport) => transport.id) }
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
          "traveler movement represented by canonical transport: ticket content re-emitted on the wrong day",
          { kind: "survivor", survivorId: crossDateMatch.id }
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
          "lodging already represented by canonical stay record",
          { kind: "survivor", survivorId: owningStay.id }
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
      // Chain 3b: arrival-directions prose is stay material too — before
      // Arc F this attach step only kept credential/"directions" shapes,
      // so a directions block routed through the routine check-in fold
      // was dropped instead of retained on the stay.
      if (
        instructions &&
        (STAY_ACCESS_INSTRUCTION_PATTERN.test(instructions) ||
          isArrivalDirectionsProse(instructions))
      ) {
        const existing = stringValue(owner.payload, "accessInstructions");
        if (!existing) {
          owner.payload.accessInstructions = instructions;
        }
      }
      suppressCanonicalPiece(
        activity,
        "routine check-in or bag-drop evidence attached to stay",
        { kind: "survivor", survivorId: owner.id }
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

// Run 7.23.2 chain 3b (Eli 2026-07-24: full fix in Arc F). GT protects
// stay "getting there" material, but the rules above only matched text
// that NAMED a known stay, carried an address, or used a credential/
// "directions" word — so arrival-directions prose that names neither
// shipped publicly at two live sites: the admin card "The RomeHello
// Hostel access details" (the full walk from Termini) and the Rome city
// note carrying The Yellow's block verbatim ("Exit the train station onto
// Via Marsala by track 1. Find Via Marghera…"). The arrival-directions
// SHAPE — a station-exit/from-station opener, or turn-by-turn prose —
// now routes to the leg's stay regardless of whether the stay is named,
// and city notes are swept by the same rule.
const ARRIVAL_DIRECTIONS_STRONG_PATTERN =
  /\b(?:directions?\s+(?:from|to)\b[^.!?]{0,60}\b(?:station|airport|terminal)|exit\s+the\s+(?:train\s+|bus\s+|metro\s+)?station|from\s+the\s+(?:train\s+|bus\s+)?(?:station|airport)\b[^.!?]{0,40}\b(?:exit|walk|turn|head|cross))/i;
const ARRIVAL_DIRECTIONS_CUE_PATTERNS = [
  /\bturn\s+(?:left|right)\b/i,
  /\bon\s+your\s+(?:left|right)\b/i,
  /\b(?:walk|continue|head|go)\s+(?:straight|along|down|up)\b/i,
  /\bcross\s+the\s+(?:street|road|square)\b/i,
  // Street-grammar cues ("Find Via Marghera", "onto Via Marsala") — the
  // preposition+street-word pair, not a bare street mention, so a
  // sightseeing note that names an avenue is not a cue by itself.
  /\b(?:find|onto|into|take)\s+(?:via|viale|rua|calle|ulice|utca|strasse|straße)\b/i,
  /\bafter\s+(?:about\s+)?\d+\s*(?:m|meters|metres|blocks)\b/i,
  /\bby\s+track\s+\d+\b/i,
];

function arrivalDirectionsCueCount(text: string) {
  return ARRIVAL_DIRECTIONS_CUE_PATTERNS.filter((pattern) =>
    pattern.test(text)
  ).length;
}

function isArrivalDirectionsProse(text: string) {
  if (!text) return false;
  if (ARRIVAL_DIRECTIONS_STRONG_PATTERN.test(text)) return true;
  return arrivalDirectionsCueCount(text) >= 2;
}

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
    // Direction-shape detection runs on the RAW prose (activityText
    // normalizes case/punctuation away from the street-grammar cues).
    const rawProse = [title, stringValue(activity.payload, "description")]
      .filter(Boolean)
      .join(" ");
    const directionShaped = isArrivalDirectionsProse(rawProse);

    if (
      !STAY_ACCESS_INSTRUCTION_PATTERN.test(text) &&
      !/\barrival directions\b|\bgetting there\b|\baccess details?\b/i.test(
        title
      ) &&
      !directionShaped
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
        "stay arrival/access instructions attached to stay record",
        { kind: "survivor", survivorId: namedStay.id }
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
      (STAY_ACCESS_INSTRUCTION_PATTERN.test(text) || directionShaped) &&
      // Directions are stay material regardless of a card time, exactly
      // like credentials (chain 3b: the arrival walk is the protected
      // "getting there" block whether or not the parser stamped a time).
      (carriesCredential || directionShaped || !timeFrom(activity.payload))
    ) {
      // Chain 3b: route the material to the leg's stay even though no
      // stay is NAMED — the activity's own city picks the owner; a
      // single-stay trip falls back to that stay.
      const activityCity = normalizedComparable(
        stringValue(activity.payload, "city")
      );
      const places = pieces.filter(
        (piece) => piece.kind === "place" && piece.outputEligible
      );
      const cityStay =
        stays.find(
          (stay) =>
            activityCity &&
            normalizedComparable(stayCity(stay, places)) === activityCity
        ) ?? (stays.length === 1 ? stays[0] : null);
      const instructions = stringValue(activity.payload, "description");
      if (cityStay && instructions) {
        const existing = stringValue(cityStay.payload, "accessInstructions");
        if (!existing) {
          cityStay.payload.accessInstructions = instructions;
        }
        addCanonicalAction(cityStay, {
          absorbedTitles: [title].filter(Boolean),
          observationIds: [...activity.observationIds],
          reason:
            "arrival-directions material routed to the leg's stay (RW-PRI-001 chain 3b: stay 'getting there' prose is protected even when the stay is unnamed)",
          type: "recovered",
        });
      }
      // NOT restructured here on purpose (work order Task B5's ~3615 note
      // applies to this branch too — see docs/assembly-findings-inbox.md):
      // the activity is suppressed unconditionally below regardless of
      // whether `cityStay` was found; `cityStay` only conditions whether
      // the stay actually recorded the absorption above. The disposition
      // mirrors that exact condition (`absorbedByCityStay`) rather than
      // inventing a stricter gate.
      suppressCanonicalPiece(
        activity,
        "access instructions are stay material, not a traveler activity",
        cityStay && instructions
          ? { kind: "survivor", survivorId: cityStay.id }
          : { kind: "terminal", code: "ACCESS_MATERIAL_NO_OWNING_STAY" }
      );
      continue;
    }
  }

  // Chain 3b, note lane: the same arrival-directions shape is swept from
  // city-note prose (live 7.23.2: the Rome Notes & Tips carried The
  // Yellow's walking-directions block verbatim). A qualifying block — a
  // contiguous run of direction segments containing a strong opener, or
  // two-plus cue segments — moves to the same-city stay's access
  // instructions; single incidental cue sentences ("walk down the
  // avenue" sightseeing advice) stay note content. The sweep only acts
  // when a stay exists to own the material (RW-ING-001 preservation).
  for (const note of pieces.filter(
    (piece) => piece.kind === "note" && piece.outputEligible
  )) {
    const description = stringValue(note.payload, "description");
    if (!description || stays.length === 0) continue;
    const segments = description.split(PROSE_SEGMENT_SPLIT);
    if (segments.length === 0) continue;
    // Arc F.2 C4 (run 7.24.1 chain D): access-instruction shapes join the
    // note-lane sweep vocabulary — the live "HOW TO GET IN … use the key"
    // block carried no arrival-directions cue and sailed through. An
    // access/credential sentence is STRONG on its own (credential-class
    // material, never incidental sightseeing advice).
    const accessShaped = (segment: string) =>
      STAY_ACCESS_INSTRUCTION_PATTERN.test(segment) ||
      NOTE_ACCESS_SHAPE_PATTERN.test(segment) ||
      CREDENTIAL_SENTENCE_PATTERN.test(segment);
    const marks = segments.map(
      (segment) =>
        ARRIVAL_DIRECTIONS_STRONG_PATTERN.test(segment) ||
        arrivalDirectionsCueCount(segment) >= 1 ||
        accessShaped(segment)
    );
    const strong = segments.map(
      (segment) =>
        ARRIVAL_DIRECTIONS_STRONG_PATTERN.test(segment) ||
        accessShaped(segment)
    );
    // Maximal runs of marked segments; a run qualifies with a strong
    // opener or length >= 2.
    const removed: boolean[] = segments.map(() => false);
    let start = -1;
    for (let index = 0; index <= segments.length; index += 1) {
      if (index < segments.length && marks[index]) {
        if (start === -1) start = index;
        continue;
      }
      if (start !== -1) {
        const runLength = index - start;
        const runHasStrong = strong.slice(start, index).some(Boolean);
        if (runHasStrong || runLength >= 2) {
          for (let cursor = start; cursor < index; cursor += 1) {
            removed[cursor] = true;
          }
        }
        start = -1;
      }
    }
    if (!removed.some(Boolean)) continue;
    const removedText = segments
      .filter((_, index) => removed[index])
      .join(" ")
      .trim();
    const keptText = segments
      .filter((_, index) => !removed[index])
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
    const noteCity = normalizedComparable(stringValue(note.payload, "city"));
    const places = pieces.filter(
      (piece) => piece.kind === "place" && piece.outputEligible
    );
    const cityStay =
      stays.find(
        (stay) =>
          noteCity &&
          normalizedComparable(stayCity(stay, places)) === noteCity
      ) ?? (stays.length === 1 ? stays[0] : null);
    if (!cityStay) continue;
    note.payload.description = keptText || null;
    const existing = stringValue(cityStay.payload, "accessInstructions");
    if (!existing) {
      cityStay.payload.accessInstructions = removedText;
    }
    addCanonicalAction(note, {
      absorbedTitles: [],
      observationIds: [...note.observationIds],
      reason:
        "arrival-directions block swept from public note to the leg's stay (RW-PRI-001 chain 3b)",
      type: "recovered",
    });
    addCanonicalAction(cityStay, {
      absorbedTitles: [],
      observationIds: [...note.observationIds],
      reason:
        "arrival-directions material routed to the leg's stay (RW-PRI-001 chain 3b: stay 'getting there' prose is protected even when the stay is unnamed)",
      type: "recovered",
    });
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

    // NOT restructured here on purpose (work order Task B5, the ~3615
    // site): the removal already IS conditioned on `matchingPrivateStay`
    // for the label but the terminal branch (no matching stay at all)
    // still runs the same suppress call the survivor branch does — see
    // docs/assembly-findings-inbox.md. The disposition below reads the
    // same `matchingPrivateStay` the reason string already branches on.
    if (!matchingPrivateStay || !explicitSeparateAction) {
      suppressCanonicalPiece(
        activity,
        matchingPrivateStay
          ? "routine access instructions attached to private stay"
          : "access instructions had no compatible private stay",
        matchingPrivateStay
          ? { kind: "survivor", survivorId: matchingPrivateStay.id }
          : { kind: "terminal", code: "PRIVATE_STAY_ACCESS_NO_COMPATIBLE_STAY" }
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

// Mirrors SOURCE_RECOVERY_STAGE_LABEL in source-recovery.ts (kept local:
// source-recovery already imports this module's types, and a value import
// back would create a cycle). The "(failed)" variant shares the prefix.
const SOURCE_RECOVERY_LABEL_PREFIX = "source recovery";

function observationHasLegCorroboration(observation: EvidenceObservation) {
  if (observation.source === "model_spine") return true;
  const label = observation.sourceLabel ?? "";
  if (label.toLowerCase().startsWith(SOURCE_RECOVERY_LABEL_PREFIX)) {
    return false;
  }
  // Any real source section (a day heading or the document's own notes
  // blob) counts — the guard only refuses places whose ENTIRE existence is
  // recovery output.
  return label.trim().length > 0;
}

function pruneNonOvernightPlaces(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[] = []
) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
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
    // Run 7.23.0r P1 (RW-TRV-001): source recovery re-extracted the Costs
    // section's per-night price lines and minted two phantom overnight
    // legs (Prague Jan 15-17 piece_4443af…, Budapest Jan 21-23
    // piece_4f1f87…) nested INSIDE the real spine legs. A leg asserts
    // where the traveler SLEEPS — that claim needs the trip spine or a
    // real source section behind it. A place piece whose every
    // observation is recovery output never mints a leg; its city text is
    // recovery evidence, not itinerary structure.
    const observed = place.observationIds
      .map((id) => observationById.get(id))
      .filter((observation): observation is EvidenceObservation =>
        Boolean(observation)
      );
    const recoveryOnly =
      observed.length > 0 &&
      observed.every(
        (observation) => !observationHasLegCorroboration(observation)
      );
    if (recoveryOnly) {
      // Terminal (planning-cost material family): the comment above traces
      // this to Costs-section per-night price lines minting phantom legs —
      // there is no real spine or day-heading record for this piece to be
      // absorbed by, by construction.
      suppressCanonicalPiece(
        place,
        "recovery-only place evidence never mints a trip leg: spine or day-heading corroboration required",
        { kind: "terminal", code: "RECOVERY_ONLY_COST_DERIVED_PLACE" }
      );
      return;
    }
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
      // Terminal (candidacy floor not met): a place that is the traveler's
      // own home or a same-day stop was never a candidate to BE a trip leg
      // — there is no leg record for it to be represented by, it simply
      // fails the "asserts where the traveler sleeps" test above.
      suppressCanonicalPiece(
        place,
        departureHome || returnHome
          ? "home departure or return is not an overnight trip leg"
          : "same-day destination is an activity, not an overnight trip leg",
        {
          kind: "terminal",
          code:
            departureHome || returnHome
              ? "HOME_DEPARTURE_OR_RETURN_NOT_A_LEG"
              : "SAME_DAY_DESTINATION_NOT_A_LEG",
        }
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
  /\b(?:wi-?fi(?:\s+(?:password|network|name))?\s*:|wi-?fi\s+password|password\s*:|door\s+code|access\s+code|entry\s+code|lock\s*box(?:\s+code)?|buzzer(?:\s+number)?|(?:^|\s)code\s+[A-Z0-9]{6,}|(?:use|enter|open[^.]{0,30}with)\s+the\s+code\s+\d{3,}|safe\s+box\s+with\s+your\s+key)/i;

// Inter-city travel booking identifiers are protected class (RW-PRI-001
// Δ2 scope) even when they ride on an ACTIVITY-shaped card: a transport
// shadow that survives every suppression pass (live-run 7.18.3 PB-1(b):
// "Ryanair FR8331 to Prague" as a Jan 14 activity) must still not ship its
// confirmation code in public prose. Activity/tour/restaurant booking
// references on NON-transport-shaped cards stay public.
const TRAVEL_CONFIRMATION_SENTENCE_PATTERN =
  /\b(?:confirmation(?:\s+(?:code|number))?|booking\s+(?:code|number|reference)|reservation\s+(?:code|number)|ticket\s*code|travel\s+code|pnr)\b\s*[:#]?\s*[A-Za-z0-9]/i;

// Run 7.23.0r P0 (RW-PRI-001): the ÖBB ticket code "2 159 1990 1842 0436"
// shipped verbatim inside a PUBLIC activity card description while the
// privacy layer gated the SAME value behind traveler_password — the deny
// list only knew stay/transport payload FIELDS, so a code that rides in
// via ticket-page prose (captured as a draft-level sensitive detail, never
// as a payload field) sailed through. Code-shaped tokens are extracted
// from the sensitive-detail titles themselves; extraction NEVER pattern
// -matches public prose directly, so venue names, flight numbers, and
// times cannot false-positive — only tokens that provably belong to a
// protected value are swept.
const PROTECTED_TOKEN_FLIGHT_CODE_PATTERN = /^[A-Z]{1,2}\d{3,4}$/;
const PROTECTED_TOKEN_DATE_PATTERNS = [
  /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/,
  /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/,
];
const PROTECTED_TOKEN_STOP_WORDS = new Set([
  "CONFIRMATION", "RESERVATION", "BOOKING", "NUMBER", "TICKET", "PASSWORD",
  "ADDRESS", "FLIGHT", "TRAIN", "HOSTEL", "AIRBNB", "STREET",
]);

function protectedCodeTokensFromSensitiveValue(value: string) {
  const tokens: string[] = [];
  const isDateShaped = (token: string) =>
    PROTECTED_TOKEN_DATE_PATTERNS.some((pattern) => pattern.test(token));

  for (const match of value.matchAll(
    /[A-Za-z0-9][A-Za-z0-9'._-]*@[A-Za-z0-9.-]+/g
  )) {
    tokens.push(match[0]);
  }
  // Spaced/dashed digit groups (ticket codes, booking numbers, phones):
  // require ≥7 digits total and exclude date shapes.
  for (const match of value.matchAll(/\+?\d[\d ()./-]{5,}\d/g)) {
    const token = match[0].trim();
    const digitCount = (token.match(/\d/g) ?? []).length;
    if (digitCount >= 7 && !isDateShaped(token)) tokens.push(token);
  }
  for (const match of value.matchAll(/#?\b[A-Za-z0-9-]{5,}\b/g)) {
    const token = match[0].replace(/^#/, "");
    const hasLetter = /[A-Za-z]/.test(token);
    const hasDigit = /\d/.test(token);
    const allCapsCode =
      /^[A-Z0-9-]{6,}$/.test(token) &&
      hasLetter &&
      !PROTECTED_TOKEN_STOP_WORDS.has(token);
    const mixedCode = hasLetter && hasDigit;
    if (
      (mixedCode || allCapsCode) &&
      !PROTECTED_TOKEN_FLIGHT_CODE_PATTERN.test(token) &&
      !isDateShaped(token)
    ) {
      tokens.push(token);
    }
  }
  return tokens;
}

function collectProtectedValueDenyList(
  pieces: CanonicalEvidencePiece[],
  sensitiveDetails: unknown[] = []
) {
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
    // Arc F.2 C2: like stays (T2), transport pieces feed the deny list
    // REGARDLESS of output eligibility — a fragment the candidacy floor
    // suppressed as booking material still carries a real captured
    // confirmation (run 7.24.1 chain A: 0648… on the "Train ticket"
    // fragment), and that code must stay swept wherever the same source
    // text resurfaces in public prose.
    if (piece.kind === "transport") {
      push(piece.payload.confirmation);
      push(piece.payload.confirmationLabel);
      push(piece.payload.bookingReference);
    }
  }
  for (const detail of sensitiveDetails) {
    const record = asRecord(detail);
    for (const field of ["title", "value", "detail", "code"]) {
      const value = stringValue(record, field);
      if (!value) continue;
      for (const token of protectedCodeTokensFromSensitiveValue(value)) {
        if (token.length >= 5) values.push(token);
      }
    }
  }
  // Longest first so full addresses are removed before their fragments.
  return Array.from(new Set(values)).sort((a, b) => b.length - a.length);
}

// Booking-field personal names in public prose ("Client: Eli J Kamerow",
// "Passenger and Ticket Details Eli Kamerow", "Reserved by: Kamerow, Eli")
// are content hygiene (ground truth Δ2): identity is never trip content.
// Marker-anchored so ordinary prose ("client meetings") cannot match: the
// name run must be 2-4 capitalized tokens (initials allowed) immediately
// after a booking field marker.
// Case classes are explicit (no /i flag): the marker tolerates either
// case, but the NAME run must stay strictly capitalized so ordinary prose
// ("client meetings happen here") can never match.
const BOOKING_NAME_FIELD_PATTERN =
  /\b([Cc]lient|[Cc]ustomer|[Gg]uest|[Tt]raveler|[Pp]assenger(?:\s+[Aa]nd\s+[Tt]icket\s+[Dd]etails)?|[Rr]eserved\s+[Bb]y)(\s*:?\s+)((?:[A-ZÀ-Þ][a-zà-ÿA-ZÀ-Þ'.-]+|[A-Z]\.?)(?:,?\s+(?:[A-ZÀ-Þ][a-zà-ÿA-ZÀ-Þ'.-]*|[A-Z]\.?)){1,3})/g;

function scrubBookingFieldNames(value: string) {
  return value.replace(
    BOOKING_NAME_FIELD_PATTERN,
    (_full: string, marker: string, sep: string) => `${marker}${sep}[private]`
  );
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

type FinalProjectionSafetyDecision = {
  canonicalPieceId: string;
  outcome: "excluded" | "redacted";
  rawSafety: CityNoteSegmentSafety;
  sanitizedSafety: CityNoteSegmentSafety;
  segmentDigest: string;
};

type ContentCarrierDecision = {
  carrierField: "description";
  carrierPieceId: string | null;
  factDigest: string;
  outcome: "already_present" | "explicitly_excluded" | "restored" | "unresolved";
  sourcePieceId: string;
};

type FinalProjectionSafetyLedger = {
  contentCarrierDecisions: ContentCarrierDecision[];
  decisions: FinalProjectionSafetyDecision[];
  finalPublicProtectedSegmentCount: number;
  unresolvedFactCount: number;
  version: 1;
};

// Arc F identity output gate (run 7.23.2 chains 1-3; CEO decision 2).
// This is the SAME pass as the protected-value sweep (tripwire T1: extend
// the existing "LAST text mutation before outputFor" position, never add a
// later one). Guarantees, per output-eligible record:
// - identity predicates (identity-prose.ts) run over every public field
//   the audit detector scans — chain 1 shipped an email as a card TITLE
//   because the scrub covered descriptions while the detector covered
//   [title, description, summary, address, locationName];
// - a card/note whose TITLE carries an identity value is SUPPRESSED whole
//   with an auditable disposition — no maker review item, no scrubbed
//   husks (CEO decision 2). Structural records (transport, stays) are
//   never suppressed here: the leaked value is removed and the row kept
//   (Eli, 2026-07-24 — the 5/8 spine bar outranks a husk-free ideal);
// - protected-code-shaped tokens are swept from transport and stay prose
//   DIRECTLY (chain 3): the deny list is capture-dependent and run 7.23.2
//   captured neither leaked ticket code anywhere protected, so an empty
//   deny list swept nothing while both codes shipped.
function scrubProtectedValuesFromPublicProse(
  pieces: CanonicalEvidencePiece[],
  sensitiveDetails: unknown[] = []
): FinalProjectionSafetyLedger {
  const denyList = collectProtectedValueDenyList(pieces, sensitiveDetails);
  const contentCarrierDecisions: ContentCarrierDecision[] = [];
  const decisions: FinalProjectionSafetyDecision[] = [];
  const staysExist = pieces.some(
    (piece) => piece.kind === "stay" && piece.outputEligible
  );
  // Arc F.3: this was a local closure over a private duplicate of the
  // segment-split regex; it now calls the shared implementation in
  // identity-prose.ts (same split, same filter, same join) so the card lane
  // and the review surface cannot drift apart.
  const dropIdentitySegments = dropIdentityProseSegments;
  const projectPublicCityNoteSegment = (
    segment: string
  ): CityNoteSegmentProjection => {
    const rawProjection = projectCityNoteSegment(segment);
    const withoutProtectedCode = TRAVEL_CONFIRMATION_SENTENCE_PATTERN.test(
      segment
    )
      ? scrubProtectedCodeShapedTokens(segment)
      : segment;
    const redacted = dropIdentitySegments(
      scrubBookingFieldNames(
        scrubProtectedValuesFromText(
          withoutProtectedCode,
          denyList,
          staysExist
        )
      )
    );
    let publicCandidate = redacted;
    let publicProjection = projectCityNoteSegment(publicCandidate);
    const hasPublicRemainder =
      /(?:[$€£]\s?\d|\b(?:czk|eur|huf|usd)\s?\d|\d[.,]\d{2}\s*[$€£]|\bhttps?:\/\/|\bwww\.|\bdigital\b|\bopen(?:s|ing)?\b)/i.test(
        publicCandidate
      );
    if (publicProjection.safety === "booking" && hasPublicRemainder) {
      publicCandidate = publicCandidate
        .replace(new RegExp(NOTE_TICKET_OCR_PATTERN.source, "gi"), " ")
        .replace(
          /\bpassenger and ticket details(?:\s+\[private\])?/gi,
          " "
        )
        .replace(/\s{2,}/g, " ")
        .trim();
      publicProjection = projectCityNoteSegment(publicCandidate);
    }
    return {
      rawSafety: rawProjection.rawSafety,
      sanitized: publicProjection.sanitized,
      sanitizedSafety: publicProjection.sanitizedSafety,
      // A mixed segment is judged on the public remainder after every
      // proven protected value is removed. Pure access/booking/cost prose
      // remains non-content because its marker survives the redaction.
      safety: publicProjection.safety,
    };
  };
  for (const piece of pieces) {
    if (piece.kind === "context") {
      const contextTitle = stringValue(piece.payload, "title");
      const contextTitleSignal = contextTitle
        ? findIdentityProseSignal(contextTitle)
        : null;
      if (contextTitleSignal) {
        // Classification correctly routes admin/accessory material away from
        // Activities before this boundary. It still needs an explicit final
        // disposition when its label is itself protected identity material;
        // silently leaving it as generic context loses the reason the source
        // fact has no public carrier.
        suppressCanonicalPiece(
          piece,
          `identity-shaped value (${contextTitleSignal}) in public title: record suppressed at the output boundary (RW-PRI-001 — identity is never trip content; no scrubbed husks)`,
          { kind: "terminal", code: "PUBLIC_TITLE_IDENTITY_VALUE" }
        );
      }
      continue;
    }
    if (!piece.outputEligible) continue;
    // Run 7.23.0r: transport piece DESCRIPTIONS also carry ticket-page
    // prose (route via-stations are fine; codes are not) — token-sweep
    // them too. Titles/routeLabels stay untouched for transport.
    if (piece.kind === "transport") {
      const description = stringValue(piece.payload, "description");
      if (description) {
        // Deny-list + booking-name scrub (7.23.0r), then the chain-3
        // prose-side code pass, then identity segment removal — transport
        // rows keep the row and lose the leak, never the reverse.
        const cleaned = dropIdentitySegments(
          scrubProtectedCodeShapedTokens(
            scrubBookingFieldNames(
              scrubProtectedValuesFromText(description, denyList, false)
            )
          )
        );
        if (cleaned !== description) {
          piece.payload.description = cleaned || null;
          addCanonicalAction(piece, {
            absorbedTitles: [],
            observationIds: [...piece.observationIds],
            reason:
              "protected stay/travel values scrubbed from public card prose (RW-PRI-001 output boundary)",
            type: "recovered",
          });
        }
      }
      continue;
    }
    // Chain 2 half (b): stay fields were never swept at all — stays only
    // CONTRIBUTED to the deny list. Stay name and prose now get the
    // identity + code-shape pass; the row itself is structural and stays.
    if (piece.kind === "stay") {
      let stayScrubbed = false;
      const name = stringValue(piece.payload, "name");
      if (name) {
        const cleanedName = scrubProtectedCodeShapedTokens(
          scrubBookingFieldNames(name)
        );
        if (cleanedName !== name) {
          piece.payload.name = cleanedName || null;
          stayScrubbed = true;
        }
      }
      for (const field of ["description", "notes"]) {
        const value = stringValue(piece.payload, field);
        if (!value) continue;
        const cleaned = dropIdentitySegments(
          scrubProtectedCodeShapedTokens(scrubBookingFieldNames(value))
        );
        if (cleaned !== value) {
          piece.payload[field] = cleaned || null;
          stayScrubbed = true;
        }
      }
      if (stayScrubbed) {
        addCanonicalAction(piece, {
          absorbedTitles: [],
          observationIds: [...piece.observationIds],
          reason:
            "identity/protected-code values scrubbed from public stay fields (RW-PRI-001 output boundary)",
          type: "recovered",
        });
      }
      continue;
    }
    if (piece.kind !== "activity" && piece.kind !== "note") continue;
    let scrubbed = false;
    // City Notes are sectioned prose. Sweep each newline/sentence segment
    // independently through the same raw+sanitized safety projection used by
    // initial rendering and restore. A protected later section can therefore
    // never delete an unrelated earlier fact (the production R2D2 shape).
    if (piece.kind === "note") {
      const description = stringValue(piece.payload, "description");
      if (description) {
        const kept: string[] = [];
        for (const segment of splitCityNoteSegments(description)) {
          const projection = projectPublicCityNoteSegment(segment);
          const segmentDigest = stableHash({
            normalized: normalizedComparable(segment),
            version: 1,
          });
          if (projection.safety !== "content") {
            decisions.push({
              canonicalPieceId: piece.id,
              outcome: "excluded",
              rawSafety: projection.rawSafety,
              sanitizedSafety: projection.sanitizedSafety,
              segmentDigest,
            });
            scrubbed = true;
            continue;
          }
          const cleaned = dropIdentityProseSegments(
            scrubBookingFieldNames(
              scrubProtectedValuesFromText(
                projection.sanitized,
                denyList,
                staysExist
              )
            )
          );
          const finalProjection = projectPublicCityNoteSegment(cleaned);
          if (!cleaned || finalProjection.safety !== "content") {
            decisions.push({
              canonicalPieceId: piece.id,
              outcome: "excluded",
              rawSafety: projection.rawSafety,
              sanitizedSafety: finalProjection.sanitizedSafety,
              segmentDigest,
            });
            scrubbed = true;
            continue;
          }
          kept.push(cleaned);
          if (cleaned !== segment) {
            decisions.push({
              canonicalPieceId: piece.id,
              outcome: "redacted",
              rawSafety: projection.rawSafety,
              sanitizedSafety: finalProjection.sanitizedSafety,
              segmentDigest,
            });
            scrubbed = true;
          }
        }
        const rebuilt = kept.join("\n").trim();
        if (rebuilt !== description) {
          piece.payload.description = rebuilt || null;
          scrubbed = true;
        }
      }
    }
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
        const redacted = scrubProtectedValuesFromText(
          scrubProtectedCodeShapedTokens(description),
          denyList,
          false
        );
        const kept = redacted
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
      if (piece.kind === "note" && field === "description") continue;
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
          : scrubBookingFieldNames(
              scrubProtectedValuesFromText(value, denyList, staysExist)
            );
      if (cleaned !== value) {
        piece.payload[field] = cleaned || null;
        scrubbed = true;
      }
    }
    // Chain 1: identity predicates over the SAME field list the audit
    // detector scans — after the scrubs above, so anything a scrub can fix
    // (a marker-anchored name, a deny-list value, a credential sentence)
    // survives as before and only a REMAINING identity value acts here.
    for (const field of ["description", "summary"]) {
      const value = stringValue(piece.payload, field);
      if (!value) continue;
      const kept = dropIdentitySegments(value);
      if (kept !== value) {
        piece.payload[field] = kept || null;
        scrubbed = true;
      }
    }
    for (const field of ["address", "locationName", "location"]) {
      const value = stringValue(piece.payload, field);
      if (value && findIdentityProseSignal(value)) {
        piece.payload[field] = null;
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
    // The title IS the record's public identity: an identity value there
    // cannot be scrubbed without leaving a husk, so the whole card is
    // suppressed with an auditable disposition and no maker review item
    // (CEO decision 2; chain 1's "Eli.kamerow@..." card title). The
    // dead-subject sweep and disposition assignment both run AFTER this
    // pass (T1), so questions about the record die with it and manifests
    // agree by construction.
    const finalTitle = stringValue(piece.payload, "title");
    const titleSignal = finalTitle ? findIdentityProseSignal(finalTitle) : null;
    if (titleSignal) {
      // Terminal (identity-collision repair family, read broadly: an
      // identity VALUE colliding with public trip content, same as the
      // piece-id collision at canonical-trip-assembly.ts). There is no
      // scrubbed husk to keep and nothing else to name as a survivor —
      // that is the whole point of "no scrubbed husks" above.
      suppressCanonicalPiece(
        piece,
        `identity-shaped value (${titleSignal}) in public title: record suppressed at the output boundary (RW-PRI-001 — identity is never trip content; no scrubbed husks)`,
        { kind: "terminal", code: "PUBLIC_TITLE_IDENTITY_VALUE" }
      );
    }
  }

  // Content conservation is part of this same final-projection authority,
  // after every ordinary mutation and scrub. A survivor id alone is not
  // acceptance: the final carrier must contain the normalized fact. Safe
  // note facts that disappeared are restored to the declared same-identity
  // Activity or to their city-keyed City Note. Protected facts receive an
  // explicit exclusion decision and are never reinserted.
  const outputPieces = () => pieces.filter((piece) => piece.outputEligible);
  const carrierText = (piece: CanonicalEvidencePiece) =>
    normalizedComparable(
      [piece.payload.title, piece.payload.description]
        .filter(Boolean)
        .join(" ")
    );
  const noteCollectionForCity = (city: string | null) => {
    const normalizedCity = normalizedComparable(city);
    if (!normalizedCity) return null;
    return (
      outputPieces().find(
        (piece) =>
          piece.kind === "note" &&
          normalizedComparable(stringValue(piece.payload, "city")) ===
            normalizedCity &&
          /\bnotes?\s*(?:&|and)?\s*tips?\b/i.test(
            stringValue(piece.payload, "title") ?? ""
          )
      ) ?? null
    );
  };
  const sameIdentityCarrier = (
    source: CanonicalEvidencePiece,
    candidate: CanonicalEvidencePiece | null
  ) => {
    if (!candidate || !candidate.outputEligible) return false;
    if (candidate.kind !== "activity" && candidate.kind !== "note") {
      return false;
    }
    const sourceTokens = identityTokens(stringValue(source.payload, "title"));
    const candidateTokens = identityTokens(
      stringValue(candidate.payload, "title")
    );
    if (sourceTokens.length === 0 || candidateTokens.length === 0) return false;
    const sourceCity = normalizedComparable(stringValue(source.payload, "city"));
    const candidateCity = normalizedComparable(
      stringValue(candidate.payload, "city")
    );
    if (sourceCity && candidateCity && sourceCity !== candidateCity) {
      return false;
    }
    const genericOnlyIdentity =
      sourceTokens.every((token) => GENERIC_SINGLE_IDENTITY_TOKENS.has(token)) ||
      candidateTokens.every((token) => GENERIC_SINGLE_IDENTITY_TOKENS.has(token));
    if (genericOnlyIdentity && (!sourceCity || !candidateCity)) return false;
    const genericGeographicIdentity = new Set([
      "area",
      "castle",
      "city",
      "district",
      "hill",
      "hills",
      "old",
      "town",
    ]);
    for (const token of identityTokens(
      [
        source.payload.area,
        source.payload.city,
        candidate.payload.area,
        candidate.payload.city,
      ]
        .filter(Boolean)
        .join(" ")
    )) {
      genericGeographicIdentity.add(token);
    }
    const sharedDistinctiveIdentity = sourceTokens.some(
      (token) =>
        !genericGeographicIdentity.has(token) &&
        candidateTokens.includes(token)
    );
    if (
      !sharedDistinctiveIdentity &&
      normalizedComparable(stringValue(source.payload, "title")) !==
        normalizedComparable(stringValue(candidate.payload, "title"))
    ) {
      return false;
    }
    return (
      overlapCount(sourceTokens, candidateTokens) >=
      Math.min(2, sourceTokens.length, candidateTokens.length)
    );
  };
  const escapedPattern = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const removeFactFromNoteCollections = (fact: string) => {
    if (!fact.trim()) return;
    const pattern = new RegExp(escapedPattern(fact.trim()), "giu");
    for (const note of outputPieces()) {
      if (note.kind !== "note" || !note.payload._canonicalNoteSections) {
        continue;
      }
      const description = stringValue(note.payload, "description");
      if (!description || !pattern.test(description)) continue;
      pattern.lastIndex = 0;
      const next = description
        .replace(pattern, " ")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:])/g, "$1")
        .replace(/(?:^|\n)(?:Food|Drinks & Nightlife|Sights & Culture|Shopping|Getting Around|Local Tips|Notes):\s*(?=\n|$)/g, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
      note.payload.description = next || null;
    }
  };
  const activityCarrierForFact = (
    source: CanonicalEvidencePiece,
    fact: string
  ) => {
    const activities = outputPieces().filter(
      (piece) => piece.kind === "activity"
    );
    const sameIdentity = activities.find((piece) =>
      sameIdentityCarrier(source, piece)
    );
    if (sameIdentity) return sameIdentity;

    // A generic note wrapper can carry one explicit planned clause. Route
    // only the verb-bound subject ("go to X"), not every venue merely
    // mentioned as context (for example a recommendation near a castle).
    const normalizedFact = normalizedComparable(fact);
    return (
      activities.find((piece) => {
        const title = normalizedComparable(
          stringValue(piece.payload, "title")
        );
        return Boolean(
          title &&
            normalizedFact.includes(title) &&
            (new RegExp(
              `\\b(?:go|head|return)\\s+(?:back\\s+)?(?:to\\s+)?${escapedPattern(title)}\\b`
            ).test(normalizedFact) ||
              /\b(?:admission|admit|booking|confirmation|entry|reservation|ticket)\b/.test(
                normalizedFact
              ))
        );
      }) ?? null
    );
  };
  const structuredHomeForFact = (
    source: CanonicalEvidencePiece,
    fact: string
  ) => {
    const normalizedFact = normalizedComparable(fact);
    const namedStay = outputPieces().find((piece) => {
      if (piece.kind !== "stay") return false;
      const name = normalizedComparable(stringValue(piece.payload, "name"));
      return Boolean(name && normalizedFact.includes(name));
    });
    if (namedStay) return namedStay;

    // A note copy may preserve a typo in the venue name while retaining the
    // exact scheduled slot. When exactly one Activity has the same category
    // and clock time, that structured card is the durable home and the note
    // fragment is explicitly excluded instead of being restored as a loose
    // tip. Ambiguous slots deliberately do not match.
    const clockMatch =
      /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i.exec(fact);
    const factTime = clockMatch
      ? normalizeTripClockTime(clockMatch[1])
      : null;
    if (!factTime) return null;
    const sourceCategory = normalizedComparable(
      stringValue(source.payload, "category")
    );
    const scheduledMatches = outputPieces().filter(
      (piece) =>
        piece.kind === "activity" &&
        normalizedClockTime(timeFrom(piece.payload)) === factTime &&
        (!sourceCategory ||
          normalizedComparable(stringValue(piece.payload, "category")) ===
            sourceCategory)
    );
    return scheduledMatches.length === 1 ? scheduledMatches[0] : null;
  };

  for (const source of pieces) {
    if (
      source.payload._canonicalNoteSections ||
      source.role === "context" ||
      source.role === "grouping_proposal"
    ) {
      continue;
    }
    const candidacy = canonicalCandidacyDecision(source);
    const noteShaped = Boolean(
      source.kind === "note" ||
        source.role === "city_note_candidate" ||
        stringValue(candidacy, "destination") === "city_note"
    );
    if (!noteShaped) continue;
    const title = stringValue(source.payload, "title");
    const descriptionSegments = splitCityNoteSegments(
      source.payload.description
    );
    const evidenceSegments = splitCityNoteSegments(source.payload.evidence);
    const titleIsGenericWrapper = Boolean(
      title &&
        /^(?:(?:budapest|prague|rome|vienna)\s+)?(?:city\s+)?(?:food\s+)?(?:ideas?|notes?|tips?)(?:\s*&\s*tips?)?$/i.test(
          title
        )
    );
    const splitEnumeratedFacts = (value: string) => {
      const listShaped = Boolean(
        /\//.test(title ?? "") ||
          /^\s*[-•]?\s*(?:eat|food|cafes?|restaurants?|shopping)\s*:/i.test(
            value
          )
      );
      if (!listShaped || !/[,;]/.test(value)) return [value];
      const parts = value
        .split(/[,;]/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3);
      return parts.length >= 2 && parts.length <= 10 ? parts : [value];
    };
    const candidates = Array.from(
      new Map(
        [
          ...descriptionSegments,
          // Deterministically split list entries all retain the shared source
          // line for lineage. That evidence names siblings too; treating it
          // as this entry's own fact lets one scheduled sibling absorb and
          // delete the rest of the list. Entry conservation therefore uses
          // its scoped description/title while the unsplit wrapper still
          // conserves the complete source line.
          ...(source.payload._canonicalNoteEntry === true
            ? []
            : evidenceSegments),
          ...(!titleIsGenericWrapper && title ? [title] : []),
        ]
          .flatMap(splitEnumeratedFacts)
          .filter(Boolean)
          .map((value) => [normalizedComparable(value), value])
      ).values()
    );
    const declaredSurvivorId =
      source.disposition?.kind === "survivor"
        ? source.disposition.survivorId
        : null;
    const declaredCarrier =
      declaredSurvivorId
        ? pieces.find((piece) => piece.id === declaredSurvivorId) ?? null
        : outputPieces().find((piece) =>
            source.observationIds.every((id) =>
              piece.observationIds.includes(id)
            )
          ) ?? null;
    const city =
      stringValue(source.payload, "city") ??
      rawCityForDate(pieces, stringValue(source.payload, "date"));
    const cityNote = noteCollectionForCity(city);
    const sourceReferenceSegments = [
      ...descriptionSegments,
      ...evidenceSegments,
    ].filter(Boolean);
    const isUnplacedLinkOnlyReference = Boolean(
      !city &&
        sourceReferenceSegments.length > 0 &&
        sourceReferenceSegments.every((segment) =>
          /^\s*[-•]?\s*https?:\/\/\S+\s*$/i.test(segment)
        )
    );

    for (const rawCandidate of candidates) {
      const projection = projectPublicCityNoteSegment(rawCandidate);
      const factDigest = stableHash({
        normalized: normalizedComparable(rawCandidate),
        version: 1,
      });
      if (!projection.sanitized || projection.sanitized.length < 4) continue;
      if (projection.safety !== "content") {
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: null,
          factDigest,
          outcome: "explicitly_excluded",
          sourcePieceId: source.id,
        });
        continue;
      }
      const cleaned = dropIdentityProseSegments(
        scrubBookingFieldNames(
          scrubProtectedValuesFromText(
            projection.sanitized,
            denyList,
            staysExist
          )
        )
      );
      if (!cleaned || projectPublicCityNoteSegment(cleaned).safety !== "content") {
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: null,
          factDigest,
          outcome: "explicitly_excluded",
          sourcePieceId: source.id,
        });
        continue;
      }
      const structuredHome = structuredHomeForFact(source, cleaned);
      if (structuredHome) {
        removeFactFromNoteCollections(rawCandidate);
        if (cleaned !== rawCandidate) {
          removeFactFromNoteCollections(cleaned);
        }
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: structuredHome.id,
          factDigest,
          outcome: "explicitly_excluded",
          sourcePieceId: source.id,
        });
        continue;
      }
      if (
        source.payload._sourceSupport === "unsupported" ||
        isUnplacedLinkOnlyReference ||
        (!city && /^https?:\/\/\S+$/i.test(cleaned.trim()))
      ) {
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: null,
          factDigest,
          outcome: "explicitly_excluded",
          sourcePieceId: source.id,
        });
        continue;
      }
      const normalizedFact = normalizedComparable(cleaned);
      const normalizedListEntry =
        /^\s*(?:cafes?|eat|food|restaurants?|shopping|sights?|tips?)\s*:/i.test(
          cleaned
        )
          ? normalizedFact.replace(
              /^(?:cafes?|eat|food|restaurants?|shopping|sights?|tips?)\s+/,
              ""
            )
          : "";
      const activityCarrier = activityCarrierForFact(source, cleaned);
      if (activityCarrier) {
        const alreadyPresent = carrierText(activityCarrier).includes(
          normalizedFact
        );
        if (!alreadyPresent) {
          activityCarrier.payload.description = mergeCityNoteDescription(
            stringValue(activityCarrier.payload, "description"),
            cleaned
          );
          addCanonicalAction(activityCarrier, {
            absorbedTitles: [stringValue(source.payload, "title")].filter(
              (value): value is string => Boolean(value)
            ),
            observationIds: [...source.observationIds],
            reason:
              "final content-carrier check routed a safe fact to its output-eligible same-identity Activity",
            type: "recovered",
          });
        }
        removeFactFromNoteCollections(rawCandidate);
        if (cleaned !== rawCandidate) {
          removeFactFromNoteCollections(cleaned);
        }
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: activityCarrier.id,
          factDigest,
          outcome: alreadyPresent ? "already_present" : "restored",
          sourcePieceId: source.id,
        });
        continue;
      }
      const existingCarrier = outputPieces().find((piece) => {
        const text = carrierText(piece);
        return (
          text.includes(normalizedFact) ||
          (normalizedListEntry.length >= 4 && text.includes(normalizedListEntry))
        );
      });
      if (existingCarrier) {
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: existingCarrier.id,
          factDigest,
          outcome: "already_present",
          sourcePieceId: source.id,
        });
        continue;
      }
      const carrier = sameIdentityCarrier(source, declaredCarrier)
        ? declaredCarrier
        : cityNote;
      if (!carrier) {
        contentCarrierDecisions.push({
          carrierField: "description",
          carrierPieceId: null,
          factDigest,
          outcome: "unresolved",
          sourcePieceId: source.id,
        });
        continue;
      }
      const existingDescription = stringValue(
        carrier.payload,
        "description"
      );
      if (carrier.kind === "note") {
        const section = classifyCityNoteSection({
          category: stringValue(source.payload, "category"),
          label:
            stringValue(source.payload, "_canonicalNoteCollectionLabel") ??
            null,
          text: cleaned,
        });
        const line = `${section}: ${cleaned}`;
        carrier.payload.description = existingDescription
          ? `${existingDescription}\n${line}`
          : line;
      } else {
        carrier.payload.description = mergeCityNoteDescription(
          existingDescription,
          cleaned
        );
      }
      addCanonicalAction(carrier, {
        absorbedTitles: [stringValue(source.payload, "title")].filter(
          (value): value is string => Boolean(value)
        ),
        observationIds: [...source.observationIds],
        reason:
          "final content-carrier check restored a safe fact whose declared survivor did not contain its digest",
        type: "recovered",
      });
      contentCarrierDecisions.push({
        carrierField: "description",
        carrierPieceId: carrier.id,
        factDigest,
        outcome: "restored",
        sourcePieceId: source.id,
      });
    }
  }

  // Restoring or redirecting a fact is the last text mutation, so run the
  // same segment projection once more on the resulting City Notes. This is
  // a local scrub, not a second semantic writer: the classifier and ledger
  // above remain the sole authority, and any newly exposed unsafe/generic
  // remainder receives an exclusion decision before it is removed.
  for (const piece of outputPieces()) {
    if (piece.kind !== "note") continue;
    const description = stringValue(piece.payload, "description");
    if (!description) continue;
    const kept: string[] = [];
    for (const segment of splitCityNoteSegments(description)) {
      const projection = projectPublicCityNoteSegment(segment);
      const cleaned =
        projection.safety === "content"
          ? dropIdentityProseSegments(
              scrubBookingFieldNames(
                scrubProtectedValuesFromText(
                  projection.sanitized,
                  denyList,
                  staysExist
                )
              )
            )
          : "";
      const finalProjection = projectPublicCityNoteSegment(cleaned);
      if (
        !cleaned ||
        projection.safety !== "content" ||
        finalProjection.safety !== "content"
      ) {
        decisions.push({
          canonicalPieceId: piece.id,
          outcome: "excluded",
          rawSafety: projection.rawSafety,
          sanitizedSafety: finalProjection.sanitizedSafety,
          segmentDigest: stableHash({
            normalized: normalizedComparable(segment),
            version: 1,
          }),
        });
        continue;
      }
      kept.push(cleaned);
    }
    piece.payload.description = kept.join("\n").trim() || null;
    if (!stringValue(piece.payload, "description")) {
      suppressCanonicalPiece(
        piece,
        "City Note collection has no public content after every source fact received a protected carrier or explicit exclusion",
        { kind: "terminal", code: "EMPTY_CITY_NOTE_AFTER_EXCLUSIONS" }
      );
    }
  }

  let finalPublicProtectedSegmentCount = 0;
  for (const piece of pieces) {
    if (!piece.outputEligible || piece.kind !== "note") continue;
    for (const segment of splitCityNoteSegments(piece.payload.description)) {
      const projection = projectPublicCityNoteSegment(segment);
      const containsDeniedValue = denyList.some((denied) =>
        segment.toLowerCase().includes(denied.toLowerCase())
      );
      if (
        projection.safety !== "content" ||
        containsDeniedValue ||
        Boolean(findIdentityProseSignal(segment))
      ) {
        finalPublicProtectedSegmentCount += 1;
      }
    }
  }
  return {
    contentCarrierDecisions,
    decisions,
    finalPublicProtectedSegmentCount,
    unresolvedFactCount: contentCarrierDecisions.filter(
      (decision) => decision.outcome === "unresolved"
    ).length,
    version: 1,
  };
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

// Run-2 §3 / Task 3: the 6th stay. `Rome Stay` (Jan 12-14) shipped beside
// `The Yellow` (Jan 13-14) on the same leg, because Pass 1 merges on VENUE
// identity and the two names share no token — so the reconciler correctly
// declined, and the bar item ("5 stays") correctly failed.
//
// The discriminator is NOT overlap (two real hostels in one city on
// overlapping dates must never collapse) and NOT the generic word list alone
// ("Rome Stay" and "The Yellow" both survive `GENERIC_STAY_IDENTITY_TOKENS`
// with one token each). It is whether a name carries venue identity BEYOND
// ITS OWN CITY. `finalizeCanonicalStayFields` has already rewritten every
// unnamed stay to `<City> <Type>` by the time the reconciler runs, so a
// placeholder's only surviving token IS the city token — which identifies the
// leg, never the venue.
function stayVenueIdentityBeyondCity(
  payload: Record<string, unknown>,
  city: string | null
) {
  const cityTokens = new Set(identityTokens(city ?? ""));
  return stayVenueIdentityTokens(payload).filter(
    (token) => !cityTokens.has(token)
  );
}

function stayPayloadRichness(payload: Record<string, unknown>) {
  return (
    (stringValue(payload, "address") ? 4 : 0) +
    (stringValue(payload, "confirmation") ?? stringValue(payload, "confirmationLabel") ? 2 : 0) +
    (stringValue(payload, "checkOut") ? 1 : 0) +
    (stringValue(payload, "checkInTime") ? 1 : 0)
  );
}

// Arc F stay candidacy gate (run 7.23.2 chain 2, tripwire T2). Live shape:
// records.stays[5] = "Eli J Kamerow" — a stay-kind piece named from a
// booking passenger/Client field, with no dates, no leg, no address —
// shipped publicly because stays had NO candidacy rule: activities have
// committed-mention candidacy, transports have anchor/fragment rules, and
// the stay reconciler only merges same-venue OVERLAPPING ranges, so a
// dateless stay merges with nothing and nothing else ever judges it.
// The rule (GT night-coverage): a stay record represents at least one
// night — check-in, check-out, or first-night evidence. It runs HERE, at
// reconcileCanonicalStayIdentity time, AFTER guessed stay dates are
// applied (a legit stay whose date arrives from a maker guess must not be
// killed) and BEFORE the deny-list build, accessory attachment, and
// stay-collision warnings, so every downstream pass sees a consistent
// world. A suppressed phantom still CONTRIBUTES to the protected-value
// deny list — collectProtectedValueDenyList deliberately reads stays
// regardless of outputEligible (T2's keep-property).
const PERSON_NAME_STAY_LODGING_TOKENS =
  /\b(?:airbnb|apartment|apartments|b&b|bnb|camp|casa|flat|guesthouse|guest house|hostal|hostel|hotel|house|inn|lodge|lodging|palace|pension|rental|residence|room|rooms|stay|suites?|villa)\b/i;

function isPersonNameShapedStayName(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /\d/.test(raw)) return false;
  if (PERSON_NAME_STAY_LODGING_TOKENS.test(raw)) return false;
  const tokens = raw.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  // Every token is a capitalized name token or a bare initial.
  return tokens.every((token) =>
    /^(?:[A-ZÀ-Þ][\wà-ÿ'’.-]*|[A-Z]\.?)$/.test(token)
  );
}

// Arc F.2 C3 (run 7.24.1 chain B): a stay whose NAME is document-artifact
// shaped is source-document material, never lodging — REGARDLESS of night
// evidence. The live 6th stay "Visitacity itinerary by day 3" (an
// itinerary-app export title) carried a full Jan 18-21 range inherited
// from the document's coverage window, so the night-evidence rule PASSED
// it; venue names do not look like document titles. Shapes per the
// approved F.2 plan: "itinerary", "by day N" pagination, and filename
// extensions. Negative controls (fixture-proven): Wombats "The Lounge"
// and the Prague Airbnb pass untouched.
const DOCUMENT_ARTIFACT_STAY_NAME_PATTERN =
  /\bitinerar(?:y|ies)\b|\bby day \d+\b|\.(?:pdf|docx?|xlsx?|txt|html?|md|png|jpe?g)\b/i;

function isDocumentArtifactShapedStayName(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return Boolean(raw) && DOCUMENT_ARTIFACT_STAY_NAME_PATTERN.test(raw);
}

function applyStayCandidacyGate(pieces: CanonicalEvidencePiece[]) {
  for (const stay of pieces.filter(
    (piece) => piece.kind === "stay" && piece.outputEligible
  )) {
    if (isDocumentArtifactShapedStayName(stay.payload.name)) {
      // Suppressed artifacts keep feeding the protected-value deny list
      // (T2's keep-property — collectProtectedValueDenyList reads stays
      // regardless of outputEligible). Terminal (structural/overview
      // artifact family): a source-document title is not lodging evidence
      // for any OTHER stay to absorb.
      suppressCanonicalPiece(
        stay,
        "stay candidacy: document-artifact-shaped name (itinerary/by-day/filename shape) is source-document booking material, never a lodging record (run 7.24.1 chain B)",
        { kind: "terminal", code: "STAY_NAME_DOCUMENT_ARTIFACT" }
      );
      continue;
    }
    const nightEvidence =
      stringValue(stay.payload, "checkIn") ??
      stringValue(stay.payload, "checkOut") ??
      stringValue(stay.payload, "firstNightDate");
    if (nightEvidence) continue;
    // Terminal (candidacy floor not met): two distinct diagnoses share this
    // gate — a person's name misread as a stay, and a genuine stay record
    // with no night evidence at all — kept as separate codes because they
    // are different fact patterns for the scorecard to distinguish, even
    // though neither has an absorbing record.
    const personNameShaped = isPersonNameShapedStayName(stay.payload.name);
    suppressCanonicalPiece(
      stay,
      personNameShaped
        ? "stay candidacy: person-name-shaped, dateless stay is booking material, never a stay record (RW-TRV-001 night rule; run 7.23.2 phantom shape)"
        : "stay candidacy: no night evidence (no check-in, check-out, or first-night date); suppressed with disposition (RW-TRV-001 night rule)",
      {
        kind: "terminal",
        code: personNameShaped
          ? "STAY_CANDIDACY_PERSON_NAME_SHAPED"
          : "STAY_CANDIDACY_NO_NIGHT_EVIDENCE",
      }
    );
  }
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

  // Pass 3: a GENERIC PLACEHOLDER stay is the same stay as the one named
  // venue it overlaps (run-2 §3, the live 6th stay). Runs LAST so Pass 1's
  // venue-identity merge and Pass 2's cost/context absorption get first
  // refusal; this pass only sees what both declined.
  //
  // Three guards, each protecting a fixture-proven negative control:
  //  - NO VENUE IDENTITY beyond the city on the placeholder side, so two
  //    independently named stays ("Hotel Central" / "Hotel Plaza", identical
  //    Paris dates) can never see each other here, and two unnamed
  //    `<City> Airbnb` rentals cannot collapse into one another either —
  //    neither side qualifies as the named target.
  //  - NO ANCHOR: a placeholder-named stay carrying an address or a booking
  //    code is real lodging evidence, not residue. Leave it and let the
  //    same_leg_stay_night_overlap advisory speak.
  //  - EXACTLY ONE named candidate. An ambiguous fragment with two named
  //    same-city stays in range ("Lisbon" beside "Hotel A" and "Hotel B")
  //    stays put; guessing which venue it duplicates is a wrong merge, and a
  //    wrong merge is worse than a duplicate.
  //
  // The named venue's dates ALWAYS win (Eli, 2026-07-31). The placeholder
  // contributes no dates, so absorbing `Rome Stay` cannot extend `The Yellow`
  // back to Jan 12 — RW-TRV-001 forbids fabricating a stay for a night spent
  // in transit, and Jan 12 is covered by the overnight Delta 444 arrival. The
  // discarded range is recorded on the action so the dropped coverage claim
  // stays auditable rather than silent.
  for (const placeholder of stays()) {
    if (!placeholder.outputEligible) continue;
    if (
      stringValue(placeholder.payload, "address") ||
      stringValue(placeholder.payload, "confirmation") ||
      stringValue(placeholder.payload, "confirmationLabel")
    ) {
      continue;
    }
    const placeholderCity = stayCity(placeholder, places);
    if (!placeholderCity) continue;
    if (
      stayVenueIdentityBeyondCity(placeholder.payload, placeholderCity).length >
      0
    ) {
      continue;
    }
    const named = stays().filter(
      (candidate) =>
        candidate !== placeholder &&
        candidate.outputEligible &&
        normalizeText(stayCity(candidate, places)) ===
          normalizeText(placeholderCity) &&
        stayVenueIdentityBeyondCity(
          candidate.payload,
          stayCity(candidate, places)
        ).length > 0 &&
        stayRangesOverlapOrTouch(placeholder.payload, candidate.payload)
    );
    if (named.length !== 1) continue;
    const target = named[0];
    const placeholderIn =
      stringValue(placeholder.payload, "checkIn") ??
      stringValue(placeholder.payload, "firstNightDate");
    const placeholderOut = stringValue(placeholder.payload, "checkOut");
    mergeCanonicalPieceInto({
      reason:
        "generic placeholder stay absorbed by the one named venue it overlaps on this leg: a name whose only token is its own city carries no venue identity, so it is the same stay reported twice",
      source: placeholder,
      target,
    });
    addCanonicalAction(target, {
      absorbedTitles: [],
      observationIds: [...target.observationIds],
      reason: `named venue dates kept over the absorbed placeholder range ${
        placeholderIn ?? "?"
      }–${placeholderOut ?? "?"}`,
      type: "field_selected",
    });
  }
}

// Arc G.2 adapter. The defect predicates and the repair decision live in
// `transport-field-repair.ts`; this function is the only part that knows
// about canonical pieces, so the repair stays testable without a pipeline
// and this file gains no new decision surface.
//
// Ordering (the call site carries the authoritative note): AFTER
// `finalizeCanonicalOutputFields` so the alias coalesce has happened, and
// AFTER `reconcileCanonicalConflicts` — that pass rebuilds conflicts from
// the observations and recomputes `requiresReview`, so running before it
// would have the repair's decision silently reverted. The repaired fields
// are also recorded on the piece, so the conflict-question lane cannot
// re-ask regardless of ordering.
function applyCanonicalTransportFieldRepair({
  anchors,
  pieces,
}: {
  anchors: SourceTransportAnchor[];
  pieces: CanonicalEvidencePiece[];
}) {
  const transportPieces = pieces.filter(
    (piece) => piece.outputEligible && piece.kind === "transport"
  );
  if (transportPieces.length === 0) {
    return { questions: [] as TransportRepairQuestion[], repairs: [] as TransportFieldRepair[] };
  }

  const byId = new Map(transportPieces.map((piece) => [piece.id, piece]));
  const { questions, repairs, resolvedFields } = repairTransportFieldBleed({
    anchors,
    targets: transportPieces.map((piece) => ({
      id: piece.id,
      payload: piece.payload,
    })),
  });

  for (const resolved of resolvedFields) {
    const piece = byId.get(resolved.pieceId);
    if (!piece) continue;
    const aliases = TRANSPORT_REPAIR_FIELD_ALIASES[resolved.field];
    // A repaired field is DECIDED, not contested.
    //
    // Clearing `requiresReview` alone is NOT enough and was a real defect:
    // `reconcileCanonicalConflicts` rebuilds every conflict from the
    // observations and recomputes that flag, so the mutation survives only
    // until the next pass touches the piece. The decision is therefore
    // recorded ON THE PIECE, and the conflict-question lane consults it —
    // ordering can change without the maker inheriting a question about a
    // field we already settled. The competing values stay in the conflict
    // record for the audit trail.
    const decided = new Set([
      ...asArray(piece.payload._canonicalRepairedTransportFields).filter(
        (value): value is string => typeof value === "string"
      ),
      ...aliases,
    ]);
    piece.payload._canonicalRepairedTransportFields = [...decided];
    for (const conflict of piece.conflicts) {
      if (decided.has(conflict.field)) {
        conflict.requiresReview = false;
      }
    }
  }

  for (const repair of repairs) {
    const piece = byId.get(repair.pieceId);
    if (!piece) continue;
    addCanonicalAction(piece, {
      absorbedTitles: [],
      observationIds: [],
      reason:
        repair.outcome === "repaired_from_source_anchor"
          ? `Repaired ${repair.field} from source text: ${repair.before} cannot belong to this ${repair.transportType ?? "travel"} card.`
          : `Removed an impossible ${repair.field} (${repair.before}); the source text does not state the right one.`,
      type: "field_selected",
    });
  }

  return { questions, repairs };
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
    // City Notes are assembled as one newline-delimited line per universal
    // section. Treat those newlines as real prose boundaries before the
    // privacy/identity scrub: otherwise an identity value in a later section
    // can make the sanitizer discard an unrelated earlier section too (run
    // 8.1.0: a phone number under Getting Around deleted R2D2 from Sights &
    // Culture). Each line still passes through the identical fail-closed
    // segmentCarriesIdentityValues gate below.
    .split(/(?:\r?\n)+/)
    .flatMap((part) => part.split(PROSE_SEGMENT_SPLIT))
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
        const larger = Math.max(existing.size, tokens.size);
        if (smaller < 4) return false;
        // A short entity sentence that is merely contained in a much longer
        // city-note list is not an echo. Near-duplicate prose must be similar
        // in scope as well as vocabulary.
        if (smaller / larger < 0.65) return false;
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
      /\b(?:booking|confirmation|reservation|reference|ref|voucher|ticket)\s*(code|number|no\.?|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/gi,
      (full: string, qualifier: string | undefined, token: string) =>
        qualifier || /\d/.test(token) || /^[A-Z0-9-]{5,}$/.test(token)
          ? " "
          : full
    )
    // Preserve the shared head on both sides of a compact alternative.
    // "onion or garlic soup" otherwise loses the standalone "onion soup"
    // fact even though the source states both variants.
    .replace(
      /\b([a-z][a-z-]{2,})\s+or\s+([a-z][a-z-]{2,})\s+(soup|tea|wine|beer|coffee|cake|bread)\b/gi,
      "$1 $3 or $2 $3"
    )
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

// Arc F.2 C4 (run 7.24.1 chain D; CEO decisions 1+2, F.2 session). The
// run8 fix gave the RESTORE pass credential/access/OCR filters, but the
// INITIAL section render excluded nothing except COSTS_CONTENT_PATTERN —
// so the live Rome Notes & Tips shipped the "HOW TO GET IN … use the key"
// apartment access block, raw ÖBB FAHRSCHEIN OCR, and a lodging-cost line
// through the front door. Notes are the RW-CLS-001 recommendation
// taxonomy: there is NO scenario in which booking/receipt/access/cost
// material belongs in Notes & Tips (CEO decision 1). One segment
// classifier now gates BOTH the initial render and the restore pass;
// access material routes to the same-city stay's protected
// accessInstructions, and every exclusion is recorded as a disposition
// (RW-ING-001 — nothing is silently dropped).
const NOTE_ACCESS_SHAPE_PATTERN =
  /\bhow to get in\b|\buse the key\b|\bwhere to find the key\b|\bkey.?pickup\b|\bfor entering the (?:building|apartment|flat|house)\b|\bstep \d+\s*:/i;
const NOTE_TICKET_OCR_PATTERN =
  /\b(?:fahrschein|zugbindung|hinfahrt|r(?:ü|ue)ckfahrt|erwachsener|sparschiene|kein umtausch|keine erstattung|verkehrsmittel|steward on board)\b/i;
// CEO decision 2 (final, stated for at least the third time): no lodging
// cost ships anywhere public — the sole exception (amount due at
// check-in) lives as a PROTECTED stay detail, never note prose. A
// currency amount beside lodging vocabulary is a lodging-cost line.
// Negative controls: HUF-only prose and priced venue/idea lines carry no
// lodging word and stay note content.
const NOTE_LODGING_COST_PATTERN =
  /[$€£]\s?\d[\d,.]*[^\n]{0,60}\b(?:room|rooms|airbnb|hostel|hotel|lodging|apartment|ensuite|en-suite|guesthouse|bnb|per night|a night|stay)\b|\b(?:room|rooms|airbnb|hostel|hotel|lodging|apartment|ensuite|en-suite|guesthouse|bnb|stay)\b[^\n]{0,60}[$€£]\s?\d|\b(?:lodging|accommodation|airbnb|hostel|hotel|room)\s+(?:cost|price|pricing)\s+note\b|\bprivate room\b[^\n]{0,50}\b(?:cost|price|pricing)\b/i;
const NOTE_STAY_ADMIN_PATTERN =
  /\bcheck[ -]?in (?:to|at)\b[^\n]{0,80}\b(?:airbnb|hostel|hotel|lodging|apartment|guesthouse|bnb)\b|\bfrom\b[^\n]{0,80}\b(?:station|airport)\b[^\n]{0,180}\b(?:take|turn|walk|reach|located|number)\b|\bstay\s*:\s*[^\n]{0,100}\b(?:airbnb|hostel|hotel|lodging|apartment|guesthouse|bnb)\b|\b(?:airbnb|hostel|hotel|lodging|apartment|guesthouse|bnb)\b[^\n]{0,80}\b(?:access directions?|check[ -]?in|stay note)\b|\bstay note\b|\breach\b[^\n]{0,160}\b(?:take|turn|first street|located at number)\b/i;
const NOTE_GENERIC_MEAL_PATTERN =
  /^(?:food:\s*)?(?:eat|grab|have)\s+(?:some\s+)?(?:breakfast|brunch|dinner|food|lunch|meal|pizza|[‘'’]?za)\s*[.!?]?(?:\s+(?:drinks & nightlife|getting around|local tips|notes|shopping|sights & culture):)?$/i;

type CityNoteSegmentSafety =
  | "access"
  | "booking"
  | "content"
  | "cost"
  | "generic"
  | "private";

function classifyCityNoteSegmentSafety(segment: string): CityNoteSegmentSafety {
  if (
    COSTS_CONTENT_PATTERN.test(segment) ||
    isExcludedPlanningCostLine(segment) ||
    NOTE_LODGING_COST_PATTERN.test(segment)
  ) {
    return "cost";
  }
  if (
    CREDENTIAL_SENTENCE_PATTERN.test(segment) ||
    STAY_ACCESS_INSTRUCTION_PATTERN.test(segment) ||
    NOTE_ACCESS_SHAPE_PATTERN.test(segment) ||
    NOTE_STAY_ADMIN_PATTERN.test(segment)
  ) {
    return "access";
  }
  if (NOTE_GENERIC_MEAL_PATTERN.test(segment.trim())) {
    return "generic";
  }
  if (
    NOTE_TICKET_OCR_PATTERN.test(segment) ||
    isBoilerplateSourceLine(segment)
  ) {
    return "booking";
  }
  if (classifySensitiveText(segment)) {
    return "private";
  }
  return "content";
}

type CityNoteSegmentProjection = {
  rawSafety: CityNoteSegmentSafety;
  sanitized: string;
  sanitizedSafety: CityNoteSegmentSafety;
  safety: CityNoteSegmentSafety;
};

function projectCityNoteSegment(segment: string): CityNoteSegmentProjection {
  const raw = segment.trim();
  const rawSafety = classifyCityNoteSegmentSafety(raw);
  const sanitizedValue = sanitizeCityNoteText(raw);
  const sanitized = typeof sanitizedValue === "string" ? sanitizedValue : "";
  const sanitizedSafety = sanitized
    ? classifyCityNoteSegmentSafety(sanitized)
    : rawSafety;
  return {
    rawSafety,
    sanitized,
    sanitizedSafety,
    safety: rawSafety === "content" ? sanitizedSafety : rawSafety,
  };
}

function splitCityNoteSegments(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .split(/(?:\r?\n)+/)
    .flatMap((part) => part.split(PROSE_SEGMENT_SPLIT))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

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
  const excludedAccess: string[] = [];
  const excludedBooking: string[] = [];
  const excludedCosts: string[] = [];
  const excludedGeneric: string[] = [];
  const excludedPrivate: string[] = [];

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

  // Arc F.2 C4: the SAME safety classifier the restore pass uses gates the
  // initial render — run 7.24.1 chain D shipped access/OCR/cost material
  // through this front door while the restore-lane filters sat idle.
  const routeEntry = (
    entry: string,
    classify: () => CityNoteSection
  ) => {
    const projection = projectCityNoteSegment(entry);
    switch (projection.safety) {
      case "cost":
        excludedCosts.push(entry);
        return;
      case "access":
        excludedAccess.push(entry);
        return;
      case "booking":
        excludedBooking.push(entry);
        return;
      case "private":
        excludedPrivate.push(entry);
        return;
      case "generic":
        excludedGeneric.push(entry);
        return;
      default:
        if (projection.sanitized) {
          addEntry(classify(), projection.sanitized);
        }
    }
  };

  for (const note of notes) {
    const label =
      stringValue(note.payload, "_canonicalNoteCollectionLabel") ?? null;
    const category = stringValue(note.payload, "category");
    const title = stringValue(note.payload, "title");

    if (note.payload._canonicalNoteEntry === true && title) {
      routeEntry(title, () =>
        classifyCityNoteSection({ category, label, text: title })
      );
      continue;
    }

    // Classify segment by segment so mixed prose lands in the right
    // sections and budget lines can be excluded without losing neighbors.
    const segments = splitCityNoteSegments(
      note.payload.description ?? note.payload.title
    );
    for (const segment of segments) {
      routeEntry(segment, () =>
        classifyCityNoteSection({ category, label, text: segment })
      );
    }
  }

  const orderedSections = CITY_NOTE_SECTIONS.filter((section) =>
    (sections.get(section) ?? []).length > 0
  ).map((section) => ({
    entries: sections.get(section) ?? [],
    section,
  }));

  return {
    excludedAccess,
    excludedBooking,
    excludedCosts,
    excludedGeneric,
    excludedPrivate,
    sections: orderedSections,
  };
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

  // Notes must find a leg home (live-run 7.21.0, run7: recovered "Eat" and
  // "Buy wine" Vienna notes shipped as leg-less standalone cards — their
  // dates were cleared, so the place-range fallback never fired). That fix
  // (headingDate below) only covers a DAY-shaped heading ("Saturday,
  // January 19th"). A topical heading ("Explore Vienna", an idea-list
  // section) is not date-shaped, normalizeTripDate returns null for it, and
  // a demoted piece with no city name in its own title/description (R2D2:
  // "far away", never says "Prague") had no path left to a city at all —
  // the B7 defect (2026-08-04: R2D2, and the Jan-19 Vienna idea list —
  // Ferris wheel, St. Stephen's, Apple Strudel Show, Schönbrunn visit —
  // routed nowhere and lost). Fixed at the source:
  // demoteCanonicalPieceToCityNote now stamps `city` from the piece's OWN
  // date, before nulling it, so this loop's `explicitCity` branch below
  // catches these instead of ever reaching this fallback chain. The
  // note's own day heading ("Saturday, January 19th") still carries the
  // day; parse it with the shared date parser, defaulting the year from
  // the trip's place ranges.
  const placeYear = (() => {
    for (const place of places) {
      const match = /^(\d{4})-/.exec(place.arriveDate ?? "");
      if (match) return Number(match[1]);
    }
    return null;
  })();

  for (const note of notes) {
    const explicitCity = stringValue(note.payload, "city");
    const headingDate = (() => {
      const headingPath = Array.isArray(note.payload.sourceHeadingPath)
        ? note.payload.sourceHeadingPath.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      for (const heading of [
        stringValue(note.payload, "sourceSectionLabel") ?? "",
        ...headingPath,
      ]) {
        const parsed = normalizeTripDate(heading, placeYear);
        if (parsed) return parsed;
      }
      return null;
    })();
    const date = stringValue(note.payload, "date") ?? headingDate;
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

    if (!city) continue;

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
    const {
      excludedAccess,
      excludedBooking,
      excludedCosts,
      excludedGeneric,
      excludedPrivate,
      sections,
    } =
      cityNoteCollectionSections(group);
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
    if (excludedGeneric.length > 0) {
      addCanonicalAction(target, {
        absorbedTitles: excludedGeneric,
        observationIds: [],
        reason:
          "generic meal text without a venue or durable traveler fact excluded from City Notes",
        type: "rejected",
      });
    }
    // Arc F.2 C4 (run 7.24.1 chain D): access/credential segments are STAY
    // material (RW-PRI-001) — routed to the same-city stay's protected
    // accessInstructions when a stay exists to own them, and always
    // excluded from the public note with a recorded disposition.
    if (excludedAccess.length > 0) {
      const stays = pieces.filter(
        (piece) => piece.kind === "stay" && piece.outputEligible
      );
      const stayPlaces = pieces.filter(
        (piece) => piece.kind === "place" && piece.outputEligible
      );
      const targetCityNorm = normalizedComparable(city);
      const cityStay =
        stays.find(
          (stay) =>
            targetCityNorm &&
            normalizedComparable(stayCity(stay, stayPlaces)) === targetCityNorm
        ) ?? (stays.length === 1 ? stays[0] : null);
      if (cityStay) {
        const existing = stringValue(cityStay.payload, "accessInstructions");
        if (!existing) {
          cityStay.payload.accessInstructions = excludedAccess.join(" ");
        }
        addCanonicalAction(cityStay, {
          absorbedTitles: [],
          observationIds: [],
          reason:
            "stay access material routed from the city note to the stay's protected access instructions (RW-PRI-001 chain 3b note lane; run 7.24.1 chain D)",
          type: "recovered",
        });
      }
      addCanonicalAction(target, {
        absorbedTitles: excludedAccess,
        observationIds: [],
        reason:
          "stay access/credential material excluded from traveler notes (RW-PRI-001: access instructions are stay material, never note content; run 7.24.1 chain D)",
        type: "rejected",
      });
    }
    if (excludedBooking.length > 0) {
      addCanonicalAction(target, {
        absorbedTitles: excludedBooking,
        observationIds: [],
        reason:
          "booking/receipt boilerplate excluded from traveler notes (RW-CLS-001: notes are the recommendation taxonomy; run 7.24.1 chain D raw ticket OCR)",
        type: "rejected",
      });
    }
    if (excludedPrivate.length > 0) {
      addCanonicalAction(target, {
        absorbedTitles: excludedPrivate.map((entry) =>
          `protected segment ${stableHash({
            normalized: normalizedComparable(entry),
            version: 1,
          })}`
        ),
        observationIds: [],
        reason:
          "personal or protected-class content excluded from traveler notes by the shared raw-and-sanitized segment classifier",
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

    // Content acceptance is verified once, after the final text mutation, by
    // scrubProtectedValuesFromPublicProse. This merger only renders the
    // classifier-approved segments above; it must not independently restore
    // text and create a second content-carrier authority.
  }
}

function groupingClaimFromContainment(decision: ContainmentDecision) {
  const count = decision.members.length;
  if (decision.relationType === "authored_route") {
    return `The source defines one route containing these ${count} stops in this order.`;
  }
  if (decision.relationType === "source_area_walk") {
    return `The source places these ${count} untimed stops in one area route; the frozen source order is preserved.`;
  }
  const evidence = new Set(
    decision.members.flatMap((member) => member.evidence)
  );
  const basis = evidence.has("source_hierarchy")
    ? "source hierarchy"
    : evidence.has("verified_address")
      ? "source order and verified site address"
      : evidence.has("verified_geo")
        ? "source order and verified site coordinates"
        : "source order";
  return `Same-site visit: the containment ledger places these ${count} stops inside one ${decision.containerTitle} visit using ${basis}.`;
}

function compileCanonicalGroupingAuthority({
  containment,
  pieces,
}: {
  containment: ContainmentLedgerTelemetry;
  pieces: CanonicalEvidencePiece[];
}): CanonicalGroupingExecutionLedger {
  const unresolvedMappings: CanonicalGroupingExecutionLedger["unresolvedMappings"] = [];
  const carrierFor = ({
    observationIds,
    pieceId,
  }: {
    observationIds: string[];
    pieceId: string | null;
  }) => {
    const carriers = pieces.filter(
      (piece) =>
        piece.outputEligible &&
        piece.kind === "activity" &&
        observationIds.every((id) => piece.observationIds.includes(id))
    );
    return (
      carriers.find((piece) => piece.id === pieceId) ??
      carriers[0] ??
      (pieceId
        ? pieces.find(
            (piece) =>
              piece.id === pieceId &&
              piece.outputEligible &&
              piece.kind === "activity"
          ) ?? null
        : null)
    );
  };
  const decisions: CanonicalGroupingExecutionDecision[] = [];

  for (const containmentDecision of containment.decisions) {
    const mappedMembers = containmentDecision.members.flatMap((member) => {
      const carrier = carrierFor({
        observationIds: member.observationIds,
        pieceId: member.pieceId,
      });
      if (!carrier || !hasAuthoritativeActivityRole(carrier)) {
        unresolvedMappings.push({
          containmentDecisionId: containmentDecision.decisionId,
          observationIds: [...member.observationIds],
          pieceId: member.pieceId,
          role: "member",
        });
        return [];
      }
      return [{
        evidence: [...member.evidence],
        observationIds: [...member.observationIds],
        pieceId: carrier.id,
        sourceOrder: member.sourceOrder,
        title: stringValue(carrier.payload, "title") ?? member.title,
      }];
    });
    const memberPieceIds = new Set(mappedMembers.map((member) => member.pieceId));
    if (
      mappedMembers.length !== containmentDecision.members.length ||
      memberPieceIds.size !== mappedMembers.length ||
      mappedMembers.length < 2
    ) {
      continue;
    }

    const mappedParent = containmentDecision.containerPieceId
      ? carrierFor({
          observationIds: containmentDecision.containerObservationIds,
          pieceId: containmentDecision.containerPieceId,
        })
      : null;
    if (
      containmentDecision.containerPieceId &&
      (!mappedParent || !hasAuthoritativeActivityRole(mappedParent))
    ) {
      unresolvedMappings.push({
        containmentDecisionId: containmentDecision.decisionId,
        observationIds: [...containmentDecision.containerObservationIds],
        pieceId: containmentDecision.containerPieceId,
        role: "parent",
      });
      continue;
    }
    if (mappedParent && memberPieceIds.has(mappedParent.id)) {
      unresolvedMappings.push({
        containmentDecisionId: containmentDecision.decisionId,
        observationIds: [...mappedParent.observationIds],
        pieceId: mappedParent.id,
        role: "parent",
      });
      continue;
    }

    const parentPieceId =
      mappedParent?.id ??
      `piece_${stableHash({
        containmentDecisionId: containmentDecision.decisionId,
        type: "frozen_group_parent",
      })}`;
    decisions.push({
      callPolicy: containmentDecision.callPolicy,
      claim: groupingClaimFromContainment(containmentDecision),
      date: containmentDecision.date,
      decisionId: containmentDecision.decisionId,
      members: mappedMembers.sort(
        (left, right) => left.sourceOrder - right.sourceOrder
      ),
      parent: {
        observationIds: mappedParent
          ? [...mappedParent.observationIds]
          : [...containmentDecision.containerObservationIds],
        pieceId: parentPieceId,
        synthetic: !mappedParent,
        title:
          stringValue(mappedParent?.payload ?? {}, "title") ??
          containmentDecision.containerTitle,
      },
      provenance: {
        containmentDecisionId: containmentDecision.decisionId,
        relationType: containmentDecision.relationType,
        source: containmentDecision.source,
      },
      rejections: containmentDecision.rejections.map((rejection) => ({
        ...rejection,
      })),
    });
  }

  return { decisions, unresolvedMappings, version: 1 };
}

function executeCanonicalGroupingAuthority({
  authority,
  pieces,
}: {
  authority: CanonicalGroupingExecutionLedger;
  pieces: CanonicalEvidencePiece[];
}) {
  for (const decision of authority.decisions) {
    const children = decision.members.map((member) =>
      pieces.find(
        (piece) =>
          piece.id === member.pieceId &&
          piece.outputEligible &&
          piece.kind === "activity"
      )
    );
    if (children.some((child) => !child)) continue;
    const groupedChildren = children.filter(
      (child): child is CanonicalEvidencePiece => Boolean(child)
    );
    let parent = pieces.find(
      (piece) =>
        piece.id === decision.parent.pieceId &&
        piece.outputEligible &&
        piece.kind === "activity"
    );
    if (!parent && decision.parent.synthetic) {
      const firstChild = groupedChildren[0];
      parent = {
        actions: [],
        confidence: "high",
        conflicts: [],
        fieldSources: {},
        fieldWinnerRanks: {},
        id: decision.parent.pieceId,
        kind: "activity",
        mergeReasons: ["frozen containment grouping parent"],
        observationIds: [...decision.parent.observationIds],
        outputEligible: true,
        payload: {
          category: firstChild.payload.category,
          city: firstChild.payload.city,
          date: decision.date,
          itemType: "activity",
          title: decision.parent.title,
        },
        role: "grouping_proposal",
      };
      const insertionIndex = Math.min(
        ...groupedChildren.map((piece) => pieces.indexOf(piece))
      );
      pieces.splice(
        insertionIndex >= 0 ? insertionIndex : pieces.length,
        0,
        parent
      );
    }
    if (!parent) continue;

    parent.payload._canonicalGroupDecisionId = decision.decisionId;
    parent.payload._canonicalGroupRole = "parent";
    parent.payload._canonicalGroupStopCount = groupedChildren.length;
    addCanonicalAction(parent, {
      absorbedTitles: decision.members.map((member) => member.title),
      decisionId: decision.decisionId,
      observationIds: decision.members.flatMap(
        (member) => member.observationIds
      ),
      reason: decision.claim,
      type: "grouped",
    });

    groupedChildren.forEach((child, index) => {
      child.payload._canonicalGroupDecisionId = decision.decisionId;
      child.payload._canonicalGroupOrder = index;
      child.payload._canonicalGroupRole = "child";
      child.payload._canonicalParentPieceId = parent?.id;
      addCanonicalAction(child, {
        absorbedTitles: [],
        decisionId: decision.decisionId,
        observationIds: [...child.observationIds],
        reason: `parented from frozen containment: ${decision.claim}`,
        type: "grouped",
      });
    });
  }
}

function groupingClaimTelemetryFromAuthority(
  authority: CanonicalGroupingExecutionLedger
): GroupingClaimLedgerTelemetry {
  const claimedPieceIds = new Set<string>();
  let sameSiteClaims = 0;
  let walkClaims = 0;
  for (const decision of authority.decisions) {
    claimedPieceIds.add(decision.parent.pieceId);
    for (const member of decision.members) claimedPieceIds.add(member.pieceId);
    if (decision.provenance.relationType === "same_site") {
      sameSiteClaims += decision.members.length;
    } else {
      walkClaims += decision.members.length;
    }
  }
  return {
    claimedPieceCount: claimedPieceIds.size,
    claimsByLane: { same_site: sameSiteClaims, walk: walkClaims },
    contestedPieceCount: 0,
    releasedDecisionCount: 0,
  };
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

    // Terminal (candidacy floor not met): a bare "Lunch" with no time,
    // confirmation, or group context never had a venue for anything else
    // to represent.
    suppressCanonicalPiece(
      piece,
      "isolated untimed generic meal has no traveler-meaningful venue or valid group context",
      { kind: "terminal", code: "ISOLATED_UNTIMED_GENERIC_MEAL" }
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

    // Terminal (no source support family): unknown-structure, 3-word-or-
    // fewer terms with no other field never had a canonical record to be
    // matched against.
    suppressCanonicalPiece(
      piece,
      "needs_identity_enrichment: isolated term has no source-supported planning context",
      { kind: "terminal", code: "ISOLATED_TERM_NO_SOURCE_SUPPORT" }
    );
  }
}

function createCanonicalGroupingCalls(
  decisions: CanonicalGroupingExecutionDecision[],
  pieces: CanonicalEvidencePiece[]
) {
  const calls: Array<Record<string, unknown>> = [];
  for (const decision of decisions) {
    if (decision.callPolicy === "silent") continue;

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
      // Direct outputEligible assignment (one of Task B's 5 bypass sites).
      // Terminal (explicit cancellation family): the source says the plan
      // will not happen — there is no surviving record for a cancelled
      // plan to be represented by.
      disposeCanonicalPiece(piece, {
        kind: "terminal",
        code: "EXPLICIT_SOURCE_CANCELLATION",
      });
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
    // Arc G.2: a field the transport repair has already settled is never
    // also a "which value should we use?" question, whatever order the
    // passes run in.
    const repairedFields = new Set(
      asArray(piece.payload._canonicalRepairedTransportFields).filter(
        (value): value is string => typeof value === "string"
      )
    );
    const conflict = piece.conflicts.find(
      (candidate) =>
        candidate.requiresReview &&
        materialFields.has(candidate.field) &&
        !repairedFields.has(candidate.field) &&
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

function splitExplicitPlanFromHedgedReference(
  payload: Record<string, unknown>
): Array<Record<string, unknown>> {
  const evidence = stringValue(payload, "evidence") ?? "";
  const match =
    /\b(?:go|walk|head|return)\s+to\s+([^,;.!?]{2,80}?)\s+and\s+(?:maybe|perhaps|if time)\s+([^,;.!?]{2,80})(?:[.;!?]|$)/i.exec(
      evidence
    );
  if (!match) return [];
  const selectedTitle = match[1].trim();
  const optionalTitle = match[2].trim();
  if (!selectedTitle || !optionalTitle) return [];
  const {
    _canonicalGroupingDecisionIds: _discardedGroupingDecisions,
    _canonicalIntakeCandidacyDecision: _discardedIntakeDecision,
    _canonicalRecoveryCandidacyDecision: _discardedRecoveryDecision,
    _canonicalRoleDecision: _discardedRoleDecision,
    _resolverCandidateId: _discardedResolverCandidateId,
    ...clauseBase
  } = payload;
  return [
    {
      ...clauseBase,
      _canonicalClauseRole: "explicit_plan" as const,
      category: "admin_logistics",
      description: `Go to ${selectedTitle}.`,
      evidenceRole: "atomic_candidate",
      itemType: "activity",
      title: selectedTitle,
    },
    {
      ...clauseBase,
      _canonicalClauseRole: "hedged_reference" as const,
      description: `Maybe ${optionalTitle}.`,
      evidenceRole: "city_note_candidate",
      itemType: "note",
      title: optionalTitle,
    },
  ];
}

type StampedIntentDecision = {
  blockId: string;
  blockType: IntentBlockType;
  classifiedTitle: string | null;
  piece: CanonicalEvidencePiece;
};

function enforceCanonicalOutputActivityRoles(
  stamps: StampedIntentDecision[]
) {
  for (const stamp of stamps) {
    const currentBlockId = stringValue(stamp.piece.payload, "_intentBlockId");
    const currentBlockType = stringValue(
      stamp.piece.payload,
      "_intentBlockType"
    );
    if (
      currentBlockId !== stamp.blockId ||
      currentBlockType !== stamp.blockType
    ) {
      throw new Error(
        `Canonical Activity role changed after classification for ${stamp.piece.id}: ` +
          `${stamp.blockId}/${stamp.blockType} became ` +
          `${currentBlockId ?? "missing"}/${currentBlockType ?? "missing"}.`
      );
    }
    if (!stamp.piece.outputEligible) continue;
    const decision = asRecord(
      stamp.piece.payload._canonicalCandidacyDecision
    );
    const destination = stringValue(decision, "destination");
    if (stamp.piece.kind === "activity") {
      const currentDecision = activityCandidacyDecisionForPayload(
        stamp.piece.payload,
        {
          evidenceRole: stringValue(
            decision,
            "inputEvidenceRole"
          ) as EvidenceRole | null,
          hasAuditedCommitment:
            decision.hasAuditedCommitment === true,
          intentBlockType: stamp.blockType,
        }
      );
      if (currentDecision.destination !== "activity") {
        throw new Error(
          `Canonical Activity role changed after classification for ${stamp.piece.id} ` +
            `(${stringValue(stamp.piece.payload, "title") ?? "untitled"}): ` +
            `stamped ${destination}, current payload resolves to ` +
            `${currentDecision.destination}; ` +
            `decision=${JSON.stringify(decision)}; ` +
            `classifiedTitle=${stamp.classifiedTitle ?? "untitled"}; ` +
            `actions=${JSON.stringify(stamp.piece.actions.slice(-4))}.`
        );
      }
    }
    // Classification is a promotion ceiling, not the final identity/home
    // decision. Identity may fold an uncommitted Activity candidate into a
    // City Note, but no later writer may resurrect material classification
    // refused as note/accessory/context/rejected into an Activity.
    if (destination !== "activity" && stamp.piece.kind === "activity") {
      throw new Error(
        `Canonical Activity role changed after classification for ${stamp.piece.id} ` +
          `(${stringValue(stamp.piece.payload, "title") ?? "untitled"}): ` +
          `decision ${destination}, final kind ${stamp.piece.kind}; ` +
          `decision=${JSON.stringify(decision)}; ` +
          `classifiedTitle=${stamp.classifiedTitle ?? "untitled"}; ` +
          `actions=${JSON.stringify(stamp.piece.actions.slice(-4))}.`
      );
    }
  }
}

function stampedIntentDecisionsFromPieces(
  pieces: CanonicalEvidencePiece[]
): StampedIntentDecision[] {
  return pieces.flatMap((piece) => {
    const blockId = stringValue(piece.payload, "_intentBlockId");
    const blockType = stringValue(piece.payload, "_intentBlockType");
    if (
      !blockId ||
      (blockType !== "plan" &&
        blockType !== "ideas" &&
        blockType !== "logistics" &&
        blockType !== "evidence" &&
        blockType !== "ambiguous")
    ) {
      return [];
    }
    return [
      {
        blockId,
        blockType,
        classifiedTitle: stringValue(piece.payload, "title"),
        piece,
      },
    ];
  });
}

function activityInput(payload: Record<string, unknown>) {
  return {
    category: stringValue(payload, "category"),
    date: stringValue(payload, "date"),
    description: stringValue(payload, "description"),
    endTime: stringValue(payload, "endTime"),
    itemType: stringValue(payload, "itemType"),
    sourceSectionType: stringValue(payload, "sourceSectionType"),
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

const GENERIC_SOURCE_SUPPORT_WRAPPER_PATTERN =
  /^(?:(?:city|food|local|restaurant|venue)\s+)?(?:ideas?|notes?|options?|recommendations?|references?|tips?)$/i;

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

  // Generic parser wrappers do not name the underlying source fact, so their
  // title cannot prove or disprove support. Accept such a wrapper only when
  // its preserved evidence is a substantial verbatim span of the producing
  // chunk. A fabricated named title still has to match by its own distinctive
  // tokens, so copied nearby prose cannot launder a model invention.
  const evidence = foldForSourceSupport(
    stringValue(payload, "evidence") ?? ""
  ).trim();
  const genericWrapperWithVerbatimEvidence = Boolean(
    GENERIC_SOURCE_SUPPORT_WRAPPER_PATTERN.test(title.trim()) &&
      evidence.length >= 16 &&
      corpus.includes(evidence)
  );

  payload._sourceSupport =
    genericWrapperWithVerbatimEvidence ||
    tokens.some((token) => corpus.includes(token))
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
      // Terminal (unsupported model invention family): every observation
      // behind this piece failed the source-support stamp, so by
      // definition no OTHER record is the real thing this was meant to be.
      suppressCanonicalPiece(
        piece,
        "no source support: distinctive title words absent from the producing chunk text (model invention)",
        { kind: "terminal", code: "UNSUPPORTED_MODEL_INVENTION" }
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

type ContainmentIdentityGuard = (
  left: CanonicalEvidencePiece,
  right: CanonicalEvidencePiece
) => boolean;

function absorbLocationFragmentCards(
  pieces: CanonicalEvidencePiece[],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
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
          !doNotMerge(fragment, candidate) &&
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
function collapseAlternativeSlotCards(
  pieces: CanonicalEvidencePiece[],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
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
        if (doNotMerge(left, right)) continue;
        // A dated site container is never this pass's "same plan described
        // twice" duplicate of a same-day sibling — recognising a component
        // only by the "<X> at <Site>" title shape (isSiteComponentTitlePair,
        // above) missed "Changing of the Guard", which has no "at <site>"
        // tail, and this pass merged the dated "Prague Castle visit"
        // container INTO it, deleting the castle's own card (defect docket
        // 2026-08-04). Same shared vocabulary the other two collapse passes
        // use (SAME_SITE_CONTAINER_PATTERN, ~L8141) — an undated container
        // is not this defect and is left to the description-overlap check
        // below, per rule that an undated survivor is the defect, not the
        // fix (see the reclassifySourceContainers rescue, ~L9354).
        const leftIsDatedContainer =
          SAME_SITE_CONTAINER_PATTERN.test(
            stringValue(left.payload, "title") ?? ""
          ) && Boolean(stringValue(left.payload, "date"));
        const rightIsDatedContainer =
          SAME_SITE_CONTAINER_PATTERN.test(
            stringValue(right.payload, "title") ?? ""
          ) && Boolean(stringValue(right.payload, "date"));
        if (leftIsDatedContainer || rightIsDatedContainer) continue;
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
      if (doNotMerge(piece, slotCard)) continue;
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

function collapseSlotCollisions(
  pieces: CanonicalEvidencePiece[],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
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
      if (doNotMerge(winner, loser)) continue;
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
  observations: EvidenceObservation[] = [],
  doNotMerge: ContainmentIdentityGuard = () => false
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
        if (doNotMerge(generic.piece, specific.piece)) continue;
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

// Same-day localized/alternate venue names are identity only when one
// occurrence's own prose explicitly names the other. Shared nouns alone are
// never enough, and containment has veto power before this lane can merge.
function collapseCrossReferencedSameDayVenueAliases(
  pieces: CanonicalEvidencePiece[],
  observations: EvidenceObservation[],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const tripCities = pieceTripCityNames(pieces);
  let changed = true;
  while (changed) {
    changed = false;
    const candidates = pieces.filter(committedMentionPieceCandidate);
    outer: for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      const left = candidates[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < candidates.length;
        rightIndex += 1
      ) {
        const right = candidates[rightIndex];
        if (!sameCanonicalDate(left.payload, right.payload)) continue;
        if (doNotMerge(left, right)) continue;
        const leftConfirmation = confirmationFrom(left.payload);
        const rightConfirmation = confirmationFrom(right.payload);
        if (
          leftConfirmation &&
          rightConfirmation &&
          normalizedComparable(leftConfirmation) !==
            normalizedComparable(rightConfirmation)
        ) {
          continue;
        }
        const leftCategory = canonicalCategoryId({
          category: stringValue(left.payload, "category"),
          description: stringValue(left.payload, "description"),
          itemType: "activity",
          title: stringValue(left.payload, "title"),
        });
        const rightCategory = canonicalCategoryId({
          category: stringValue(right.payload, "category"),
          description: stringValue(right.payload, "description"),
          itemType: "activity",
          title: stringValue(right.payload, "title"),
        });
        if (leftCategory && rightCategory && leftCategory !== rightCategory) {
          continue;
        }
        const leftTitle = normalizedComparable(
          stringValue(left.payload, "title")
        );
        const rightTitle = normalizedComparable(
          stringValue(right.payload, "title")
        );
        if (!leftTitle || !rightTitle || leftTitle === rightTitle) continue;
        // A site container that names one of its stops in prose is describing
        // containment, not declaring a localized/alternate name. Identity is
        // deliberately blind to that parent/component edge; the grouping
        // phase owns it after this ledger has finished.
        if (
          SAME_SITE_CONTAINER_PATTERN.test(leftTitle) ||
          SAME_SITE_CONTAINER_PATTERN.test(rightTitle)
        ) {
          continue;
        }
        const identityOwnedObservationText = (
          piece: CanonicalEvidencePiece,
          pieceTitle: string
        ) => piece.observationIds
          .map((id) => observations.find((observation) => observation.id === id))
          .filter(
            (observation): observation is EvidenceObservation =>
              Boolean(
                observation &&
                  observation.kind === "activity" &&
                  observation.role !== "context" &&
                  observation.role !== "grouping_proposal" &&
                  observation.payload._canonicalSourceContainer !== true
              )
          )
          // Prior identity/description folds can add broad overview
          // observations to a venue piece. Those observations describe a
          // list, not this venue's aliases. Only the atomic observation whose
          // own title identifies the current piece may prove a cross-name.
          .filter((observation) => {
            const observationTitle = identityTokens(
              stringValue(observation.payload, "title")
            );
            const currentTitle = identityTokens(pieceTitle);
            return (
              observationTitle.length > 0 &&
              currentTitle.length > 0 &&
              overlapCount(observationTitle, currentTitle) >=
                Math.min(2, observationTitle.length, currentTitle.length)
            );
          })
          .map((observation) =>
            normalizedComparable(
              `${stringValue(observation.payload, "title") ?? ""} ${
                stringValue(observation.payload, "description") ?? ""
              }`
            )
          );
        const leftOwnText = identityOwnedObservationText(left, leftTitle);
        const rightOwnText = identityOwnedObservationText(right, rightTitle);
        const crossReferenced =
          leftOwnText.some((text) => text.includes(rightTitle)) ||
          rightOwnText.some((text) => text.includes(leftTitle));
        if (!crossReferenced) continue;
        const decision = chooseMergeWinner(
          mergeWinnerCardForPiece(left, timedCounts),
          mergeWinnerCardForPiece(right, timedCounts),
          { tripCities }
        );
        const target = decision.winner === "left" ? left : right;
        const source = target === left ? right : left;
        mergeCanonicalPieceInto({
          reason:
            "same-day venue identity: one source occurrence explicitly names the alternate venue title",
          source,
          target,
        });
        changed = true;
        break outer;
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

function committedDetailReviewSubjectTitles(missingDetails: unknown[]) {
  const titles = new Set<string>();
  for (const detail of missingDetails) {
    const record = asRecord(detail);
    const related = stringValue(record, "relatedTitle");
    if (!related) continue;
    const text = normalizeText(
      [
        stringValue(record, "prompt"),
        stringValue(record, "reason"),
        stringValue(record, "evidence"),
      ]
        .filter(Boolean)
        .join(" ")
    );
    // A source-explicit ticket/entry/detail choice presupposes the visit and
    // is audited commitment evidence for candidacy. Planned-vs-ideas and
    // date questions do not establish that the subject belongs in the plan.
    const placementDecision =
      /\b(?:planned for (?:this|the) day|planned (?:or|versus|vs\.?) (?:just )?ideas?|just ideas?|keep (?:them|it) as ideas?|part of (?:the )?(?:day )?plan)\b/.test(
        text
      );
    if (
      placementDecision ||
      /\b(?:which day|what day|when|date)\b/.test(text) ||
      !/\b(?:ticket|entry|admission|tour|which option|need to decide which)\b/.test(
        text
      )
    ) {
      continue;
    }
    titles.add(normalizedComparable(related));
  }
  return titles;
}

// A question subject protects its entity under ALIASING too (live-run
// 7.21.0: the baths question's subject was "Gellert Bath House" while the
// piece shipped as "Gellert Baths" — exact-equality matching would have let
// a demotion pass eat the question's own anchor card).
function titleMatchesQuestionSubject(
  questionSubjects: Set<string>,
  title: string
) {
  if (questionSubjects.has(title)) return true;
  const tokens = title.split(" ").filter((token) => token.length >= 5);
  if (tokens.length === 0) return false;
  for (const subject of questionSubjects) {
    const padded = ` ${subject} `;
    if (tokens.some((token) => padded.includes(` ${token} `))) return true;
  }
  return false;
}

// Committed-day-content guard (live-run 7.21.0, run7 PC-1): an entity NAMED
// IN ITS OWN DAY-SECTION HEADING ("Lesser Town & Prague Castle") is the
// day's committed plan — never a researched idea, whatever research
// markers its prose carries. Two shared distinctive tokens (or a full
// single-token title hit) count as named.
function titleNamedInSourceLabels(titleValue: string | null, labels: string[]) {
  const heading = normalizedComparable(
    labels.filter(Boolean).join(" ")
  );
  if (!heading) return false;
  const title = normalizedComparable(titleValue);
  if (!title) return false;
  const padded = ` ${heading} `;
  const tokens = title
    .split(" ")
    .filter((token) => token.length >= 4)
    .filter((token) => padded.includes(` ${token} `));
  const titleTokenCount = title.split(" ").filter((token) => token.length >= 4).length;
  return tokens.length >= 2 || (titleTokenCount === 1 && tokens.length === 1);
}

function pieceNamedInDayHeading(piece: CanonicalEvidencePiece) {
  return titleNamedInSourceLabels(stringValue(piece.payload, "title"), [
    stringValue(piece.payload, "sourceSectionLabel") ?? "",
    ...(pieceSourceHeadingPath(piece) ?? []),
  ]);
}

// B7 city-note integrity gap, live-run defect 2026-08-04 (R2D2; the Jan-19
// Vienna idea list: St. Stephen's Cathedral, Ferris wheel, Apple Strudel
// Show, Schönbrunn visit). mergeCanonicalCityNotes resolves a note's city
// from an explicit `city` field, from a place name appearing in the note's
// OWN text, or — the fallback that matters here — from the note's own
// `date` falling inside a place's arrive/leave range. This function has
// always nulled `date` a few lines below, which was fine as long as the
// piece already carried an explicit city. A piece demoted with neither an
// explicit city nor its city's name in its own title/description (R2D2:
// "(far away)", no "Prague" anywhere in the text it owns) then resolves NO
// city at all once its date is gone, never joins any group in
// mergeCanonicalCityNotes, and ships nowhere: the doubt-marker/idea-list
// demotion action is recorded (so lineage shows it was "routed"), but the
// content itself reaches neither a card nor the note. One call site
// (createResearchedListQuestions) had already patched around exactly this
// by stamping `piece.payload.city` before calling in; folding that
// preservation into the shared function itself — instead of leaving it as
// a lone local patch — is the fix, per the work order's "extend the check
// that exists, don't grow a second one."
function demoteCanonicalPieceToCityNote(
  piece: CanonicalEvidencePiece,
  reason: string,
  pieces: CanonicalEvidencePiece[]
) {
  if (!stringValue(piece.payload, "city")) {
    const city = rawCityForDate(pieces, stringValue(piece.payload, "date"));
    if (city) piece.payload.city = city;
  }
  const title = stringValue(piece.payload, "title");
  const description = stringValue(piece.payload, "description");
  if (
    title &&
    description &&
    !normalizedComparable(description).includes(normalizedComparable(title))
  ) {
    // A City Note is the entity's durable home after demotion. Keep the
    // entity label with its useful detail so later collection rendering does
    // not conserve only an alias-like description (for example "Giant
    // wheel") while losing the observation's actual title.
    piece.payload.description = `${title}: ${description}`;
  }
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

// Shared by canonicalCityForDate, canonicalCitiesForDate, and
// demoteCanonicalPieceToCityNote's city-preservation fix above (Task B7,
// 2026-08-04) — one range scan instead of three independently maintained
// copies (the anti-pattern named in docs/assembly-findings-inbox.md's Task
// C entries).
function placeDateRanges(pieces: CanonicalEvidencePiece[]) {
  const ranges: Array<{ arrive: string; city: string; leave: string }> = [];
  for (const piece of pieces) {
    if (piece.kind !== "place") continue;
    const city = stringValue(piece.payload, "city");
    const arrive = stringValue(piece.payload, "arriveDate");
    const leave = stringValue(piece.payload, "leaveDate");
    if (city && arrive && leave) ranges.push({ arrive, city, leave });
  }
  return ranges;
}

// Case-PRESERVING date-range city lookup. canonicalCityForDate below
// normalizes its result for comparison/grouping-key use; a value stamped
// straight onto a note's own display title ("Vienna Notes & Tips") needs
// the place's original casing, not normalizedComparable's folded form.
function rawCityForDate(pieces: CanonicalEvidencePiece[], date: string | null) {
  if (!date) return null;
  const match = placeDateRanges(pieces).find(
    (range) => date >= range.arrive && date <= range.leave
  );
  return match ? match.city : null;
}

function canonicalCityForDate(pieces: CanonicalEvidencePiece[]) {
  const ranges = placeDateRanges(pieces);
  return (date: string | null) => {
    if (!date) return "";
    const match = ranges.find(
      (range) => date >= range.arrive && date <= range.leave
    );
    return match ? normalizedComparable(match.city) : "";
  };
}

function canonicalCitiesForDate(pieces: CanonicalEvidencePiece[]) {
  const ranges = placeDateRanges(pieces);
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

function observationMentionDates(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  const dates = new Set<string>();
  for (const observationId of piece.observationIds) {
    const observation = observationById.get(observationId);
    if (!observation) continue;
    const intakeDecision = asRecord(
      observation.payload._canonicalIntakeCandidacyDecision
    );
    // A hedged parser Activity is correctly typed as a note at intake, but it
    // remains an identity occurrence. Use its recorded input role instead of
    // letting the classification result erase the cross-day repeat evidence.
    if (
      observation.kind !== "activity" &&
      normalizeText(stringValue(intakeDecision, "inputItemType")) !==
        "activity"
    ) {
      continue;
    }
    const date = stringValue(observation.payload, "date");
    if (date) dates.add(date);
  }
  return dates;
}

type CanonicalSourceOccurrence = {
  date: string;
  line: number;
  sequencedDay: boolean;
  sourceIdentityHash: string;
  stageIndex: number;
};

function sourceOccurrencesForPiece(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>,
  { identityTitleOnly = false }: { identityTitleOnly?: boolean } = {}
) {
  const byKey = new Map<string, CanonicalSourceOccurrence>();
  const pieceTitle = normalizedComparable(stringValue(piece.payload, "title"));
  for (const observationId of piece.observationIds) {
    const observation = observationById.get(observationId);
    if (
      identityTitleOnly &&
      normalizedComparable(stringValue(observation?.payload ?? {}, "title")) !==
        pieceTitle
    ) {
      continue;
    }
    const value = observation?.payload._canonicalSourceOccurrences;
    if (!Array.isArray(value)) continue;
    for (const raw of value) {
      const occurrence = asRecord(raw);
      const date = stringValue(occurrence, "date");
      const sourceIdentityHash = stringValue(
        occurrence,
        "sourceIdentityHash"
      );
      const line = Number(occurrence.line);
      const stageIndex = Number(occurrence.stageIndex);
      if (
        !date ||
        !sourceIdentityHash ||
        !Number.isFinite(line) ||
        !Number.isFinite(stageIndex)
      ) {
        continue;
      }
      const typed: CanonicalSourceOccurrence = {
        date,
        line,
        sequencedDay: occurrence.sequencedDay === true,
        sourceIdentityHash,
        stageIndex,
      };
      byKey.set(
        `${typed.sourceIdentityHash}|${typed.date}|${typed.stageIndex}|${typed.line}`,
        typed
      );
    }
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.stageIndex - right.stageIndex ||
      left.line - right.line
  );
}

function sourceSequencedIdentityDate(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  const pieceTitleTokens = identityTokens(stringValue(piece.payload, "title"));
  const classifiedBlockTypesForDate = (date: string) => {
    const types = new Set<string>();
    for (const observation of observationById.values()) {
      const observationTitleTokens = identityTokens(
        stringValue(observation.payload, "title")
      );
      if (
        stringValue(observation.payload, "date") !== date ||
        observationTitleTokens.length === 0 ||
        pieceTitleTokens.length === 0 ||
        overlapCount(observationTitleTokens, pieceTitleTokens) <
          Math.min(2, observationTitleTokens.length, pieceTitleTokens.length)
      ) {
        continue;
      }
      const decision = asRecord(
        observation.payload._canonicalCandidacyDecision
      );
      const reason = stringValue(decision, "reasonCode");
      if (reason === "BLOCK_IDEAS") types.add("ideas");
      if (reason === "BLOCK_PLAN") types.add("plan");
      if (reason === "BLOCK_AMBIGUOUS") types.add("ambiguous");
    }
    return types;
  };
  const occurrences = sourceOccurrencesForPiece(piece, observationById, {
    identityTitleOnly: true,
  }).filter((occurrence) => occurrence.sequencedDay);
  // A deliberate plan occurrence outranks an earlier reference-list
  // occurrence. Only when no occurrence was classified as a plan do we
  // fall back to the earliest sequenced mention that was not ideas-only.
  return (
    occurrences.find((occurrence) =>
      classifiedBlockTypesForDate(occurrence.date).has("plan")
    )?.date ??
    occurrences.find((occurrence) => {
      const classified = classifiedBlockTypesForDate(occurrence.date);
      return classified.has("plan") || classified.size === 0;
    })?.date ??
    null
  );
}

function activityDecisionReferencesNote(
  piece: CanonicalEvidencePiece,
  note: CanonicalEvidencePiece
) {
  const referenceId = stringValue(
    canonicalCandidacyDecision(piece),
    "referenceNoteObservationId"
  );
  return Boolean(referenceId && note.observationIds.includes(referenceId));
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
  const blockType = stringValue(piece.payload, "_intentBlockType");
  if (blockType === "plan") return true;
  if (blockType === "ideas") return false;
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

// Classification may observe that source-selected peers make an item
// plan-shaped. It does not create a containment relation from that fact.
// The shared title-conflict primitive belongs to the containment authority;
// grouping later needs its own independent source/order evidence.
function pieceHasSourceSupportedPeerPlanShape(
  piece: CanonicalEvidencePiece,
  pieces: CanonicalEvidencePiece[]
) {
  const title = stringValue(piece.payload, "title") ?? "";
  const date = stringValue(piece.payload, "date");
  const peers = pieces.filter(
    (candidate) =>
      candidate !== piece &&
      candidate.kind === "activity" &&
      (!date || !stringValue(candidate.payload, "date") ||
        stringValue(candidate.payload, "date") === date)
  );
  if (
    peers.some((candidate) =>
      containmentTitleConflict(
        title,
        stringValue(candidate.payload, "title")
      )
    )
  ) {
    return true;
  }
  const comparableTitle = normalizedComparable(title);
  if (
    comparableTitle &&
    peers.some((candidate) => {
      const candidateTitle = stringValue(candidate.payload, "title") ?? "";
      const isNamedSite = peers.some(
        (other) =>
          other !== candidate &&
          containmentTitleConflict(
            candidateTitle,
            stringValue(other.payload, "title")
          )
      );
      return (
        isNamedSite &&
        normalizedComparable(
          stringValue(candidate.payload, "description") ?? ""
        ).includes(comparableTitle)
      );
    })
  ) {
    return true;
  }

  const area = normalizedComparable(stringValue(piece.payload, "area"));
  if (!area || !date || !pieceAreaSourceSupported(piece)) return false;
  return (
    pieces.filter(
      (candidate) =>
        candidate.kind === "activity" &&
        stringValue(candidate.payload, "date") === date &&
        normalizedComparable(stringValue(candidate.payload, "area")) === area &&
        pieceAreaSourceSupported(candidate)
    ).length >= 3
  );
}

function canonicalCandidacyDecision(piece: CanonicalEvidencePiece) {
  return asRecord(piece.payload._canonicalCandidacyDecision);
}

function hasAuthoritativeActivityRole(piece: CanonicalEvidencePiece) {
  const decision = canonicalCandidacyDecision(piece);
  return (
    Boolean(stringValue(decision, "blockDecisionId")) &&
    stringValue(decision, "destination") === "activity"
  );
}

function authoritativeActivityCommitment(piece: CanonicalEvidencePiece) {
  if (!hasAuthoritativeActivityRole(piece)) return "none" as const;
  const reason = stringValue(
    canonicalCandidacyDecision(piece),
    "reasonCode"
  );
  if (reason === "AUDITED_COMMITMENT") return "fixed" as const;
  if (reason === "BLOCK_PLAN") return "sequenced" as const;
  return "none" as const;
}

function activityHasIdentityWinningEvidence({
  note,
  observationById,
  piece,
}: {
  note?: CanonicalEvidencePiece;
  observationById: Map<string, EvidenceObservation>;
  piece: CanonicalEvidencePiece;
}) {
  const pieceDecision = canonicalCandidacyDecision(piece);
  const noteDecision = note ? canonicalCandidacyDecision(note) : {};
  const sameAuthoritativeOccurrence = Boolean(
    note &&
      authoritativeActivityCommitment(piece) === "sequenced" &&
      normalizedComparable(stringValue(piece.payload, "title")) ===
        normalizedComparable(stringValue(note.payload, "title")) &&
      stringValue(pieceDecision, "classifiedDate") &&
      stringValue(pieceDecision, "classifiedDate") ===
        stringValue(noteDecision, "classifiedDate")
  );
  return Boolean(
    authoritativeActivityCommitment(piece) !== "none" ||
      sourceSequencedIdentityDate(piece, observationById) ||
      (note && activityDecisionReferencesNote(piece, note)) ||
      sameAuthoritativeOccurrence ||
      (note &&
        authoritativeActivityCommitment(piece) === "sequenced" &&
        !notesShareSourceSection(piece, [note], observationById))
  );
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
  missingDetails: unknown[],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
  const questionSubjects = reviewSubjectTitles(missingDetails);
  const cityForDate = canonicalCityForDate(pieces);
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const groups = new Map<string, CanonicalEvidencePiece[]>();
  const undatedByTitle = new Map<string, CanonicalEvidencePiece[]>();

  // A parser lane can preserve an identity-bearing component qualifier in
  // a source note while another lane emits the dated Activity with only the
  // base venue title. Rehydrate that source-qualified identity before
  // repeat grouping, otherwise a tower/garden/chapel occurrence is folded
  // into the parent venue merely because the model dropped one title word.
  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const date = stringValue(piece.payload, "date");
    const title = stringValue(piece.payload, "title");
    if (!date || !title) continue;
    const qualifiedNote = pieces.find((candidate) => {
      if (candidate.kind !== "note") return false;
      const candidateTitle = stringValue(candidate.payload, "title");
      const baseTokens = aliasIdentityTokens(piece.payload);
      const qualifiedTokens = aliasIdentityTokens(candidate.payload);
      const addedTokens = qualifiedTokens.filter(
        (token) => !new Set(baseTokens).has(token)
      );
      if (
        !candidateTitle ||
        !tokenSetContains(qualifiedTokens, baseTokens) ||
        !addedTokens.some((token) => DISTINCT_COMPONENT_TOKENS.has(token))
      ) {
        return false;
      }
      const candidateDecision = canonicalCandidacyDecision(candidate);
      return stringValue(candidateDecision, "classifiedDate") === date;
    });
    const qualifiedTitle = qualifiedNote
      ? stringValue(qualifiedNote.payload, "title")
      : null;
    if (!qualifiedTitle) continue;
    piece.payload.title = qualifiedTitle;
    addCanonicalAction(piece, {
      absorbedTitles: [title],
      observationIds: [...qualifiedNote!.observationIds],
      reason:
        "source-qualified component identity restored before repeat resolution",
      type: "recovered",
    });
  }

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
    const distinctDates = new Set(
      group
        .map((piece) => stringValue(piece.payload, "date"))
        .filter((date): date is string => Boolean(date))
    );
    // Same-day duplicates are an identity collapse, not evidence that an
    // occurrence is an uncommitted cross-day repeat. Other same-day identity
    // passes choose their single carrier without changing its block role.
    if (distinctDates.size < 2) continue;

    const ranked = group
      .map((piece) => ({
        commitment: authoritativeActivityCommitment(piece),
        piece,
      }))
      .sort(
        (left, right) =>
          commitmentRank[right.commitment] - commitmentRank[left.commitment]
      );
    const winner = ranked[0];

    if (winner.commitment === "fixed") {
      // Only EXPLICITLY committed copies (own time, booking, first-person
      // language) survive as a second visit — multiple fixed copies are a
      // genuine planned double visit. A sequence-inherited copy is
      // placement evidence, not repeat evidence (RW-CAN-001 supersession;
      // live-run 7.18.3 PB-7: sequence-inheritance + distinct dates kept a
      // sixth-run Pinball duplicate — that is "dates alone" in disguise).
      // Sequenced and loose copies fold into the strongest copy.
      for (const entry of ranked.slice(1)) {
        if (entry.commitment === "fixed") continue;
        if (doNotMerge(entry.piece, winner.piece)) continue;
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

    const sourceSequenced = ranked
      .map((entry) => ({
        ...entry,
        sourceDate: sourceSequencedIdentityDate(entry.piece, observationById),
      }))
      .filter(
        (entry): entry is typeof entry & { sourceDate: string } =>
          Boolean(entry.sourceDate)
      )
      .sort((left, right) => left.sourceDate.localeCompare(right.sourceDate));
    const contrastedPlan = ranked.find((entry) =>
      pieces.some(
        (candidate) =>
          candidate.kind === "note" &&
          activityDecisionReferencesNote(entry.piece, candidate)
      )
    );
    const activityWinner =
      sourceSequenced[0]?.piece ??
      contrastedPlan?.piece;
    if (activityWinner) {
      const sourceDate =
        stringValue(canonicalCandidacyDecision(activityWinner), "classifiedDate") ??
        sourceSequenced.find((entry) => entry.piece === activityWinner)
          ?.sourceDate;
      if (sourceDate && stringValue(activityWinner.payload, "date") !== sourceDate) {
        activityWinner.payload.date = sourceDate;
        addCanonicalAction(activityWinner, {
          absorbedTitles: [],
          observationIds: [...activityWinner.observationIds],
          reason:
            "identity date resolved from the earliest source occurrence inside a sequenced day",
          type: "recovered",
        });
      }
      for (const entry of ranked) {
        if (entry.piece === activityWinner || entry.commitment === "fixed") {
          continue;
        }
        if (doNotMerge(entry.piece, activityWinner)) continue;
        mergeCanonicalPieceInto({
          reason:
            "repeat identity resolved to the source-supported planned occurrence; distinct dates alone do not prove separate visits",
          source: entry.piece,
          target: activityWinner,
        });
      }
      continue;
    }

    // No copy is committed by the authoritative candidacy decision:
    // repeated but never committed resolves to one City Note.
    if (questionSubjects.has(title)) continue;
    const [kept, ...rest] = group;
    for (const extra of rest) {
      if (doNotMerge(extra, kept)) continue;
      mergeCanonicalPieceInto({
        reason:
          "repeated but never committed: duplicate mention folded into one city note",
        source: extra,
        target: kept,
      });
    }
    demoteCanonicalPieceToCityNote(
      kept,
      "repeated but never committed anywhere in the source: one city note, no cards, no question",
      pieces
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
    if (authoritativeActivityCommitment(piece) === "fixed") continue;
    if (authoritativeActivityCommitment(piece) === "sequenced") {
      const authoritativeDate =
        sourceSequencedIdentityDate(piece, observationById) ??
        stringValue(canonicalCandidacyDecision(piece), "classifiedDate");
      if (
        authoritativeDate &&
        stringValue(piece.payload, "date") !== authoritativeDate
      ) {
        piece.payload.date = authoritativeDate;
        addCanonicalAction(piece, {
          absorbedTitles: [],
          observationIds: [...piece.observationIds],
          reason:
            "identity date follows the authoritative planned occurrence decision",
          type: "recovered",
        });
      }
      continue;
    }
    const sourceSequencedDate = sourceSequencedIdentityDate(
      piece,
      observationById
    );
    if (sourceSequencedDate) {
      if (stringValue(piece.payload, "date") !== sourceSequencedDate) {
        piece.payload.date = sourceSequencedDate;
        addCanonicalAction(piece, {
          absorbedTitles: [],
          observationIds: [...piece.observationIds],
          reason:
            "identity date resolved from the earliest source occurrence inside a sequenced day",
          type: "recovered",
        });
      }
      continue;
    }
    if (
      pieces.some(
        (candidate) =>
          candidate.kind === "note" &&
          activityDecisionReferencesNote(piece, candidate)
      )
    ) {
      continue;
    }
    const mentionDates = observationMentionDates(piece, observationById);
    for (const occurrence of sourceOccurrencesForPiece(piece, observationById, {
      identityTitleOnly: true,
    })) {
      mentionDates.add(occurrence.date);
    }
    if (mentionDates.size < 2) continue;

    demoteCanonicalPieceToCityNote(
      piece,
      "repeated across days but never committed anywhere in the source: one city note, no cards, no question",
      pieces
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
    const cities = citiesForDate(stringValue(piece.payload, "date"));
    const explicitCity = normalizedComparable(stringValue(piece.payload, "city"));
    if (explicitCity) cities.add(explicitCity);
    noteCopies.push({
      cities,
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
      (note) =>
        note.title === title &&
        citySetsOverlap(cities, note.cities) &&
        !doNotMerge(piece, note.piece)
    );
    if (matches.length === 0) continue;

    const outputNote = matches.find((match) => match.piece.outputEligible);
    const activityWins = matches.some((match) =>
      activityHasIdentityWinningEvidence({
        note: match.piece,
        observationById,
        piece,
      })
    );
    if (!activityWins) {
      if (outputNote) {
        mergeCanonicalPieceInto({
          reason:
            "identity home: explicit City Note evidence wins over an uncommitted dated repeat",
          source: piece,
          target: outputNote.piece,
        });
      } else {
        demoteCanonicalPieceToCityNote(
          piece,
          "identity home: repeated but uncommitted occurrence keeps one City Note home",
          pieces
        );
      }
      continue;
    }
    for (const match of matches) {
      if (!match.piece.outputEligible) continue;
      mergeCanonicalPieceInto({
        reason:
          "identity home: source-supported activity wins over its loose City Note copy",
        source: match.piece,
        target: piece,
      });
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
  observations: EvidenceObservation[] = [],
  doNotMerge: ContainmentIdentityGuard = () => false
) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
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
    const noteIdentityTitle = mentionComparableTitle(title)
      .replace(/^(?:visit|tour|walk|stroll)\s+|\s+(?:visit|tour|walk|stroll)$/g, "")
      .trim();
    if (noteIdentityTitle.length < 4) continue;
    // A leg-boundary day (arrive Budapest = leave Vienna) belongs to BOTH
    // cities for matching purposes.
    const cities = citiesForDate(stringValue(piece.payload, "date"));
    if (cities.size === 0) continue;
    const candidateNotes = notes.filter(
      (note) => {
        if (doNotMerge(piece, note)) return false;
        if (!cities.has(noteCity(note))) return false;
        const text = noteText(note);
        // A note is a competing identity home only when it actually names
        // the whole venue identity. Token overlap alone confuses a component
        // with its parent (for example a tower versus the basilica), and then
        // deletes a real occurrence from another day.
        return text.includes(noteIdentityTitle);
      }
    );
    const matchingNote =
      candidateNotes.find(
        (note) =>
          normalizedComparable(stringValue(note.payload, "title")) === title
      ) ??
      candidateNotes.find((note) => note.outputEligible) ??
      candidateNotes[0] ??
      null;
    if (!matchingNote) continue;
    const authoritativePlanCopy = activityHasIdentityWinningEvidence({
      note: matchingNote,
      observationById,
      piece,
    });

    // Deliberate day-plan membership counts as the planned sighting (ground
    // truth v2 dedup: planned copy wins) when the note copy comes from a
    // different source section.
    if (!authoritativePlanCopy) {
      if (matchingNote.outputEligible) {
        if (doNotMerge(piece, matchingNote)) continue;
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
          "repeated but never committed: demoted to the city notes",
          pieces
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

function identityUsefulFactDigest(observation: EvidenceObservation) {
  const fact = Object.fromEntries(
    [
      "address",
      "area",
      "category",
      "city",
      "confirmation",
      "date",
      "description",
      "endTime",
      "provider",
      "startTime",
      "title",
    ]
      .map((field) => [field, observation.payload[field]] as const)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
  return stableHash({ fact, observationId: observation.id, version: 1 });
}

function resolveCanonicalIdentity({
  doNotMerge,
  missingDetails,
  observations,
  pieces,
}: {
  doNotMerge: ContainmentIdentityGuard;
  missingDetails: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}): CanonicalIdentityLedgerTelemetry {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const before = pieces
    .filter(
      (piece) =>
        piece.outputEligible &&
        (piece.kind === "activity" || piece.kind === "note")
    )
    .map((piece) => ({
      date: stringValue(piece.payload, "date"),
      id: piece.id,
      kind: piece.kind,
      observationIds: [...piece.observationIds],
      piece,
    }));

  // These are evidence lanes inside ONE identity authority. None may run as
  // a later independent writer, and every merge is vetoed by containment.
  absorbLocationFragmentCards(pieces, doNotMerge);
  collapseSlotCollisions(pieces, doNotMerge);
  collapseAlternativeSlotCards(pieces, doNotMerge);
  collapseTitleContainmentAliases(pieces, observations, doNotMerge);
  collapseCrossReferencedSameDayVenueAliases(
    pieces,
    observations,
    doNotMerge
  );
  resolveUncommittedRepeatMentions(
    pieces,
    observations,
    missingDetails,
    doNotMerge
  );
  reconcileCardsAgainstCityNotes(
    pieces,
    missingDetails,
    observations,
    doNotMerge
  );

  let unresolvedCarrierCount = 0;
  const decisions: CanonicalIdentityLedgerTelemetry["decisions"] = [];
  for (const prior of before) {
    const carriers = pieces.filter(
      (piece) =>
        piece.outputEligible &&
        prior.observationIds.every((id) => piece.observationIds.includes(id))
    );
    const carrier = carriers[0] ?? null;
    if (!carrier) {
      unresolvedCarrierCount += 1;
      continue;
    }
    const changed =
      !prior.piece.outputEligible ||
      prior.kind !== carrier.kind ||
      prior.date !== stringValue(carrier.payload, "date") ||
      prior.id !== carrier.id;
    if (!changed) continue;
    const observationsForDecision = prior.observationIds
      .map((id) => observationById.get(id))
      .filter(
        (observation): observation is EvidenceObservation =>
          Boolean(observation)
      );
    const usefulFactDigests = observationsForDecision.map(
      identityUsefulFactDigest
    );
    const acceptedFactDigests = observationsForDecision
      .filter((observation) => carrier.observationIds.includes(observation.id))
      .map(identityUsefulFactDigest);
    const actionText = [
      ...prior.piece.actions,
      ...carrier.actions,
    ]
      .map((action) => action.reason)
      .join(" ")
      .toLowerCase();
    const reasonCode: CanonicalIdentityLedgerTelemetry["decisions"][number]["reasonCode"] =
      /same-day venue identity/.test(actionText)
        ? "cross_referenced_same_day_venue"
        : /source occurrence|source-supported planned occurrence/.test(
              actionText
            )
          ? "source_sequenced_occurrence_wins"
          : prior.kind === "note" && carrier.kind === "activity"
            ? "committed_activity_wins"
            : prior.kind === "activity" && carrier.kind === "note"
              ? /explicit city note evidence|identity home/.test(actionText)
                ? "city_note_evidence_wins"
                : "repeated_uncommitted_to_city_note"
              : "identity_lane_merge";
    const priorDates = new Set<string>();
    if (prior.date) priorDates.add(prior.date);
    for (const observation of observationsForDecision) {
      const date = stringValue(observation.payload, "date");
      if (date) priorDates.add(date);
    }
    for (const occurrence of sourceOccurrencesForPiece(
      prior.piece,
      observationById
    )) {
      priorDates.add(occurrence.date);
    }
    decisions.push({
      acceptedFactDigests,
      decisionId: `identity-${stableHash({
        carrier: carrier.id,
        observations: prior.observationIds,
        reasonCode,
        version: 1,
      })}`,
      finalDate: stringValue(carrier.payload, "date"),
      finalHome: carrier.kind === "note" ? "city_note" : "activity",
      loserPieceIds: prior.piece.outputEligible ? [] : [prior.id],
      observationIds: [...prior.observationIds],
      priorDates: [...priorDates].sort(),
      reasonCode,
      survivorPieceId: carrier.id,
      usefulFactDigests,
    });
  }

  return { decisions, unresolvedCarrierCount, version: 1 };
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
    // The coherent-block pass runs before identity and is authoritative. This
    // legacy section classifier remains for old direct callers/fixtures, but
    // it may not flatten a dated section back over a served block decision.
    if (stringValue(piece.payload, "_intentBlockType")) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title) continue;
    if (titleMatchesQuestionSubject(questionSubjects, title)) continue;
    // Run7 PC-1: day-heading-named entities are the day's committed plan.
    if (pieceNamedInDayHeading(piece)) continue;
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
      "dated idea list: the section commits nothing, so its entries stay city notes (RW-CLS-001, unified classifier)",
      pieces
    );
  }
}

function intentSourceKey(observation: EvidenceObservation) {
  return [
    observation.sourceUploadId ?? observation.sourceFilename ?? "(source)",
    observation.sourceLabel,
  ].join("|");
}

function finitePayloadNumber(
  record: Record<string, unknown>,
  key: string
) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceIntentSignalsForPiece(
  piece: CanonicalEvidencePiece,
  observations: EvidenceObservation[]
) {
  const ownObservationIds = new Set(piece.observationIds);
  const ownObservations = observations.filter((observation) =>
    ownObservationIds.has(observation.id)
  );
  const ownClauseRoles = ownObservations
    .map((observation) =>
      stringValue(observation.payload, "_canonicalClauseRole")
    );
  // The deterministic source-clause split is already a local source
  // decision. Both child observations retain the full sentence for lineage,
  // so honor the stamped clause role before scanning that shared sentence or
  // the optional sibling's hedge leaks back onto the explicit plan.
  if (ownClauseRoles.includes("explicit_plan")) {
    return {
      explicitPlanObservationIds: ownObservations
        .filter(
          (observation) =>
            stringValue(observation.payload, "_canonicalClauseRole") ===
            "explicit_plan"
        )
        .map((observation) => observation.id),
      hasExplicitPlanMention: true,
      hasHedgedMention: false,
      hedgedObservationIds: [],
    };
  }
  if (ownClauseRoles.includes("hedged_reference")) {
    return {
      explicitPlanObservationIds: [],
      hasExplicitPlanMention: false,
      hasHedgedMention: true,
      hedgedObservationIds: ownObservations
        .filter(
          (observation) =>
            stringValue(observation.payload, "_canonicalClauseRole") ===
            "hedged_reference"
        )
        .map((observation) => observation.id),
    };
  }
  const titleTokens = identityTokens(
    stringValue(piece.payload, "title") ?? ""
  );
  if (titleTokens.length === 0) {
    return {
      explicitPlanObservationIds: [] as string[],
      hasExplicitPlanMention: false,
      hasHedgedMention: false,
      hedgedObservationIds: [] as string[],
    };
  }
  let hasExplicitPlanMention = false;
  let hasHedgedMention = false;
  const explicitPlanObservationIds: string[] = [];
  const hedgedObservationIds: string[] = [];
  const sourceKeys = new Set(ownObservations.map(intentSourceKey));
  const pieceDate = stringValue(piece.payload, "date");
  // A clause explicitly split as the optional half of "X and maybe Y" is
  // source-backed negative commitment for the same entity even when another
  // parser lane emitted a bare dated copy. This is the only cross-occurrence
  // role signal classification consumes; ordinary prose remains day/lane
  // local and identity handles the later cross-day merge.
  for (const observation of observations) {
    if (
      stringValue(observation.payload, "_canonicalClauseRole") !==
      "hedged_reference"
    ) {
      continue;
    }
    const clauseTokens = identityTokens(
      stringValue(observation.payload, "title") ?? ""
    );
    if (
      overlapCount(titleTokens, clauseTokens) >=
      Math.min(2, titleTokens.length)
    ) {
      hasHedgedMention = true;
      hedgedObservationIds.push(observation.id);
    }
  }
  for (const observation of observations) {
    if (!sourceKeys.has(intentSourceKey(observation))) continue;
    if (
      pieceDate &&
      stringValue(observation.payload, "date") !== pieceDate
    ) {
      continue;
    }
    const preservedEvidence = stringValue(observation.payload, "evidence");
    const hasPreservedSourceStructure = Boolean(
      observation.sourceStructure.sectionLabel ||
        observation.sourceStructure.headingPath.length > 0
    );
    const evidence = normalizeText(
      preservedEvidence ??
        (hasPreservedSourceStructure
          ? stringValue(observation.payload, "description") ?? ""
          : "")
    );
    if (!evidence) continue;
    // Marker and entity must occur in the same source clause. Production's
    // injected evidence can contain a whole paragraph; a "go back" sentence
    // elsewhere in that paragraph is not commitment evidence for every
    // venue named later in the blob.
    const matchingClauses = evidence
      .split(/[.;!?\n]+/)
      .filter((clause) => {
        const clauseTokens = identityTokens(clause);
        return (
          overlapCount(titleTokens, clauseTokens) >=
          Math.min(2, titleTokens.length)
        );
      });
    if (matchingClauses.length === 0) continue;
    if (matchingClauses.some(hasWeakRecommendationLanguage)) {
      hasHedgedMention = true;
      hedgedObservationIds.push(observation.id);
    }
    if (
      stringValue(
        asRecord(observation.payload._canonicalIntakeCandidacyDecision),
        "inputEvidenceRole"
      ) !== "grouping_proposal" &&
      matchingClauses.some(
        (clause) =>
          /\b(?:go to|walk to|head to|return to|book(?:ed)?|reserv(?:e|ed)|tickets? for)\b/.test(
            clause
          ) &&
          !hasWeakRecommendationLanguage(clause)
      )
    ) {
      hasExplicitPlanMention = true;
      explicitPlanObservationIds.push(observation.id);
    }
  }
  return {
    explicitPlanObservationIds,
    hasExplicitPlanMention,
    hasHedgedMention,
    hedgedObservationIds,
  };
}

function referenceNoteObservationForPiece(
  piece: CanonicalEvidencePiece,
  observations: EvidenceObservation[],
  pieces: CanonicalEvidencePiece[]
) {
  const titleTokens = identityTokens(stringValue(piece.payload, "title"));
  if (titleTokens.length === 0) return null;
  const pieceCity = normalizedComparable(
    stringValue(piece.payload, "city") ??
      rawCityForDate(pieces, stringValue(piece.payload, "date"))
  );
  const tripCities = pieces
    .filter((candidate) => candidate.kind === "place")
    .map((candidate) => stringValue(candidate.payload, "city"))
    .filter((value): value is string => Boolean(value));

  return (
    observations.find((observation) => {
      const intake = asRecord(
        observation.payload._canonicalIntakeCandidacyDecision
      );
      const isReferenceNote = Boolean(
        observation.kind === "note" ||
          stringValue(intake, "destination") === "city_note"
      );
      if (!isReferenceNote) return false;
      if (
        observation.role === "context" ||
        observation.role === "grouping_proposal" ||
        isDayArcTitle(
          stringValue(observation.payload, "title"),
          tripCityTokenSet(tripCities)
        ) ||
        isDayArcTitle(
          stringValue(observation.payload, "description"),
          tripCityTokenSet(tripCities)
        ) ||
        classifyDraftActivityCard(activityInput(observation.payload))
          .isOverviewActivity
      ) {
        return false;
      }
      const text = normalizedComparable(
        [
          stringValue(observation.payload, "title"),
          stringValue(observation.payload, "description"),
          stringValue(observation.payload, "evidence"),
        ]
          .filter(Boolean)
          .join(" ")
      );
      const textTokens = identityTokens(text);
      if (
        overlapCount(titleTokens, textTokens) <
        Math.min(2, titleTokens.length)
      ) {
        return false;
      }
      const noteCity = normalizedComparable(
        stringValue(observation.payload, "city") ??
          tripCities.find((city) =>
            text.includes(normalizedComparable(city))
          )
      );
      return !pieceCity || !noteCity || pieceCity === noteCity;
    }) ?? null
  );
}

// RW-CLS-001 block typing. This is intentionally the first intent-changing
// pass after dates settle and before slot/title/repeat identity. It turns the
// source's smallest coherent blocks into durable decisions; later passes may
// follow an entity id but may not reclassify a whole day over this result.
function applyIntentBlockClassification({
  missingDetails,
  observations,
  pieces,
}: {
  missingDetails: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}) {
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const timedCounts = timedActivityCountsByDate(pieces);
  const committedDetailSubjects =
    committedDetailReviewSubjectTitles(missingDetails);
  const matchesCommittedDetailSubject = (title: string | null) => {
    const titleTokens = identityTokens(title ?? "");
    if (titleTokens.length === 0) return false;
    return [...committedDetailSubjects].some((subject) => {
      const subjectTokens = identityTokens(subject);
      if (subjectTokens.length === 0) return false;
      return (
        overlapCount(titleTokens, subjectTokens) >=
        Math.min(2, titleTokens.length, subjectTokens.length)
      );
    });
  };
  const geocodeVerificationRan = observations.some(
    (observation) =>
      finitePayloadNumber(observation.payload, "verifiedLatitude") !== null &&
      finitePayloadNumber(observation.payload, "verifiedLongitude") !== null
  );
  const pieceById = new Map<string, CanonicalEvidencePiece>();
  const intentTripCityTokens = tripCityTokenSet(
    pieces
      .filter((piece) => piece.kind === "place")
      .map((piece) => stringValue(piece.payload, "city"))
  );
  const sourceIntentByPieceId = new Map<
    string,
    ReturnType<typeof sourceIntentSignalsForPiece>
  >();
  const sourceSupportedVenueAddressPieceIds = new Set<string>();
  const entries: IntentBlockEntry[] = [];

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    const date = stringValue(piece.payload, "date");
    const title = stringValue(piece.payload, "title");
    if (!date || !title) continue;
    const ownObservations = piece.observationIds
      .map((id) => observationById.get(id))
      .filter((observation): observation is EvidenceObservation =>
        Boolean(observation)
      );
    // Classification is occurrence-local. Initial clustering can already
    // have collected a same-title reference from another day; its prose,
    // hedge, or note section must not retype this dated occurrence before
    // the identity loop decides whether the occurrences are the same home.
    const blockObservations = ownObservations.filter(
      (observation) =>
        stringValue(observation.payload, "date") === date
    );
    const localObservations =
      blockObservations.length > 0 ? blockObservations : ownObservations;
    const primaryCandidates = localObservations
      .filter(
        (observation) =>
          observation.kind === "activity" &&
          stringValue(observation.payload, "date") === date
      );
    const primary = primaryCandidates
      .sort((left, right) => {
        const dayPlanRank = (observation: EvidenceObservation) => {
          const labels = [
            observation.sourceLabel,
            observation.sourceStructure.sectionLabel ?? "",
            ...observation.sourceStructure.headingPath,
          ];
          return labels.some((label) => DAY_PLAN_LABEL_PATTERN.test(label))
            ? 1
            : 0;
        };
        return dayPlanRank(right) - dayPlanRank(left) ||
          left.ordinal - right.ordinal;
      })[0];
    if (!primary) continue;
    const verifiedObservation = localObservations.find(
      (observation) =>
        finitePayloadNumber(observation.payload, "verifiedLatitude") !== null &&
        finitePayloadNumber(observation.payload, "verifiedLongitude") !== null
    );
    const labels = localObservations.flatMap((observation) => [
      observation.sourceLabel,
      observation.sourceStructure.sectionLabel ?? "",
      ...observation.sourceStructure.headingPath,
    ]);
    const ownEvidenceText = localObservations
      .map((observation) => stringValue(observation.payload, "evidence") ?? "")
      .join(" ");
    const ownText = localObservations
      .flatMap((observation) => [
        stringValue(observation.payload, "title") ?? "",
        stringValue(observation.payload, "description") ?? "",
        stringValue(observation.payload, "evidence") ?? "",
      ])
      .join(" ");
    // A stage/source label identifies the parser lane (tests use values such
    // as `jan-19` and production uses chunk labels); it is useful when it
    // actually contains a dated day heading, but its mere presence is not a
    // source-authored section. Only parser-preserved section/heading fields
    // may prove that a record came from a notes blob.
    const structuralLabels = localObservations
      .flatMap((observation) => [
        observation.sourceStructure.sectionLabel ?? "",
        ...observation.sourceStructure.headingPath,
      ])
      .filter(Boolean);
    const namedInObservedDayHeading = titleNamedInSourceLabels(
      title,
      structuralLabels.filter((label) => DAY_PLAN_LABEL_PATTERN.test(label))
    );
    const notesBlobSignal =
      structuralLabels.length > 0 &&
      localObservations.every(
        (observation) =>
          observation.sourceStructure.sectionType !== "dated_itinerary"
      ) &&
      structuralLabels.every(
        (label) => !DAY_PLAN_LABEL_PATTERN.test(label)
      );
    const classification = classifyDraftActivityCard(activityInput(piece.payload));
    const sourceIntent = sourceIntentSignalsForPiece(piece, observations);
    const referenceNoteObservation = referenceNoteObservationForPiece(
      piece,
      observations,
      pieces
    );
    const referenceNoteIsAtomicTwin = Boolean(
      referenceNoteObservation &&
        [
          stringValue(referenceNoteObservation.payload, "title"),
          stringValue(referenceNoteObservation.payload, "description"),
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) =>
            [title, stringValue(piece.payload, "description")]
              .filter((candidate): candidate is string => Boolean(candidate))
              .some(
                (candidate) =>
                  normalizedComparable(value) ===
                  normalizedComparable(candidate)
              )
          )
    );
    const publicVenueAddressEvidence =
      stringValue(piece.payload, "address") ??
      (referenceNoteIsAtomicTwin
        ? stringValue(referenceNoteObservation?.payload ?? {}, "address")
        : null);
    const sourceSupportedPublicVenueAddress = Boolean(
      publicVenueAddressEvidence &&
        localObservations.some((observation) =>
          normalizedComparable(
            [
              observation.payload.evidence,
              observation.payload.description,
            ]
              .filter(Boolean)
              .join(" ")
          ).includes(normalizedComparable(publicVenueAddressEvidence))
        )
    );
    if (sourceSupportedPublicVenueAddress) {
      sourceSupportedVenueAddressPieceIds.add(piece.id);
    }
    sourceIntentByPieceId.set(piece.id, sourceIntent);
    const priorLaneObservations = localObservations.flatMap((ownObservation) => {
      const previous = observations
        .filter(
          (observation) =>
            observation.ordinal < ownObservation.ordinal &&
            stringValue(observation.payload, "date") === date &&
            intentSourceKey(observation) === intentSourceKey(ownObservation)
        )
        .sort((left, right) => right.ordinal - left.ordinal)[0];
      return previous ? [previous] : [];
    });
    const ideaContextObservation = priorLaneObservations.find(
      (observation) => {
        const noteShaped =
          observation.kind === "note" ||
          observation.role === "city_note_candidate" ||
          stringValue(
            asRecord(
              observation.payload._canonicalIntakeCandidacyDecision
            ),
            "destination"
          ) === "city_note";
        if (!noteShaped) return false;
        if (
          observation.role === "context" ||
          observation.role === "grouping_proposal" ||
          isDayArcTitle(
            stringValue(observation.payload, "title"),
            intentTripCityTokens
          ) ||
          isDayArcTitle(
            stringValue(observation.payload, "description"),
            intentTripCityTokens
          ) ||
          classifyDraftActivityCard(activityInput(observation.payload))
            .isOverviewActivity
        ) {
          return false;
        }
        const previousTitle = normalizedComparable(
          stringValue(observation.payload, "title")
        );
        const previousDate = stringValue(observation.payload, "date");
        // A recovery lane may call one copy a note while the primary lane
        // calls the same occurrence an Activity. That contradiction belongs
        // to the shared candidate decision; it is not an intervening source
        // note and must not retype the next sibling block.
        const hasActivityTwin = pieces.some(
          (candidate) =>
            candidate.kind === "activity" &&
            stringValue(candidate.payload, "date") === previousDate &&
            normalizedComparable(stringValue(candidate.payload, "title")) ===
              previousTitle
        );
        return !hasActivityTwin;
      }
    );
    const researchedText = [
      activityText(piece.payload),
      stringValue(piece.payload, "evidence") ?? "",
    ].join(" ");
    const inputEvidenceRole = stringValue(primary.payload, "evidenceRole");
    const hasDayPlanMembership = Boolean(
      normalizeText(stringValue(piece.payload, "itemType")) === "activity" &&
        (!inputEvidenceRole ||
          inputEvidenceRole === "atomic_candidate" ||
          inputEvidenceRole === "grouping_proposal") &&
        (!isRecommendationActivityCategory(
          stringValue(piece.payload, "category")
        ) || Boolean(publicVenueAddressEvidence)) &&
        [
          primary.sourceLabel,
          primary.sourceStructure.sectionLabel ?? "",
          ...primary.sourceStructure.headingPath,
        ].some((label) => DAY_PLAN_LABEL_PATTERN.test(label)) &&
        !labels.some((label) => hasLooseTipVocabulary(label)) &&
        !sourceIntent.hasHedgedMention &&
        !ideaContextObservation &&
        !hasLooseTipVocabulary(ownText) &&
        !classification.hasAvailabilityMarker &&
        !PRICE_MARKER_PATTERN.test(researchedText)
    );
    const hasSequencedDayPlan = Boolean(
      normalizeText(stringValue(piece.payload, "itemType")) === "activity" &&
        (!inputEvidenceRole ||
          inputEvidenceRole === "atomic_candidate" ||
          inputEvidenceRole === "grouping_proposal") &&
        (timedCounts.get(date) ?? 0) >= 3 &&
        !isRecommendationActivityCategory(
          stringValue(piece.payload, "category")
        ) &&
        !sourceIntent.hasHedgedMention &&
        !ideaContextObservation &&
        !hasLooseTipVocabulary(ownText)
    );
    const auditedFixedEvidence = Boolean(
      timeFrom(piece.payload) ||
        confirmationFrom(piece.payload) ||
        sourceIntent.hasExplicitPlanMention ||
        canonicalSourceDecisions(piece.payload).length > 0 ||
        pieceNamedInDayHeading(piece) ||
        namedInObservedDayHeading ||
        matchesCommittedDetailSubject(title) ||
        sourceSupportedPublicVenueAddress ||
        /\b(?:breakfast|brunch|lunch|dinner|supper)\b/i.test(title)
    );

    entries.push({
      approxLatitude: finitePayloadNumber(piece.payload, "approxLatitude"),
      approxLongitude: finitePayloadNumber(piece.payload, "approxLongitude"),
      boundaryBefore: false,
      category: stringValue(piece.payload, "category"),
      date,
      // A bounded X-or-Y title is a planned choice slot. Non-recommendation
      // venue rows may also inherit a source-clause choice (for example a
      // ticket-or-tour detail that proves the venue visit). A broad food or
      // shopping span cannot promote each loose recommendation merely
      // because it mentions an unrelated "or" (production's `Buy wine`).
      hasExplicitChoice:
        /\bor\b/i.test(title) ||
        (!isRecommendationActivityCategory(
          stringValue(piece.payload, "category")
        ) &&
          /\bor\b/i.test(ownEvidenceText.trim() ? ownEvidenceText : ownText)),
      hasFixedEvidence: auditedFixedEvidence,
      hasHedgeMarker:
        classifyOwnTextEvidence(
          localObservations.map((observation) =>
            activityInput(observation.payload)
          )
        ).hasHedgeMarker || sourceIntent.hasHedgedMention,
      hasDayPlanMembership,
      ideaContextBefore:
        Boolean(ideaContextObservation) && structuralLabels.length > 0,
      ideaContextObservationId:
        ideaContextObservation && structuralLabels.length > 0
          ? ideaContextObservation.id
          : null,
      hasIdeaSignal:
        notesBlobSignal ||
        hasLooseTipVocabulary(ownText) ||
        (Boolean(referenceNoteObservation) &&
          !referenceNoteIsAtomicTwin &&
          stringValue(referenceNoteObservation?.payload ?? {}, "date") ===
            date &&
          !hasIndependentActivityAnchor(piece.payload) &&
          !publicVenueAddressEvidence),
      hasResearchEvidence:
        PRICE_MARKER_PATTERN.test(researchedText) ||
        classification.hasAvailabilityMarker,
      hasSequencedDayPlan,
      hasSourceSupportedPlan:
        sourceIntent.hasExplicitPlanMention ||
        pieceNamedInDayHeading(piece) ||
        namedInObservedDayHeading ||
        pieceHasSourceSupportedPeerPlanShape(piece, pieces),
      hasSourceStructure:
        structuralLabels.length > 0 ||
        localObservations.some(
          (observation) =>
            observation.sourceStructure.sectionType !== "unknown"
        ),
      id: piece.id,
      itemType: stringValue(piece.payload, "itemType"),
      observationIds: [...piece.observationIds],
      sourceKey: intentSourceKey(primary),
      sourceOrder: primary.ordinal,
      title,
      verifiedLatitude: verifiedObservation
        ? finitePayloadNumber(verifiedObservation.payload, "verifiedLatitude")
        : null,
      verifiedLongitude: verifiedObservation
        ? finitePayloadNumber(verifiedObservation.payload, "verifiedLongitude")
        : null,
    });
    pieceById.set(piece.id, piece);
  }

  // A boundary is evidence only when the source bytes between two candidate
  // entries contain context/note material. Ordinal gaps alone can be parser
  // omissions and are never enough.
  const entryGroups = new Map<string, IntentBlockEntry[]>();
  for (const entry of entries) {
    const key = `${entry.date}|${entry.sourceKey}`;
    const group = entryGroups.get(key);
    if (group) group.push(entry);
    else entryGroups.set(key, [entry]);
  }
  for (const group of entryGroups.values()) {
    group.sort((left, right) => left.sourceOrder - right.sourceOrder);
    for (let index = 1; index < group.length; index += 1) {
      const previous = group[index - 1];
      const current = group[index];
      current.boundaryBefore = observations.some(
        (observation) =>
          observation.ordinal > previous.sourceOrder &&
          observation.ordinal < current.sourceOrder &&
          stringValue(observation.payload, "date") === current.date &&
          intentSourceKey(observation) === current.sourceKey &&
          (observation.kind === "context" ||
            observation.kind === "note" ||
            observation.role === "context" ||
            observation.role === "city_note_candidate")
      );
    }
  }

  const result = classifyIntentBlocks(entries, { geocodeVerificationRan });
  const blockByMember = new Map<string, IntentBlockDecision>();
  for (const block of result.blocks) {
    for (const memberId of block.memberIds) blockByMember.set(memberId, block);
  }
  const stamped: StampedIntentDecision[] = [];
  for (const [pieceId, type] of result.entryTypes) {
    const piece = pieceById.get(pieceId);
    const block = blockByMember.get(pieceId);
    if (!piece || !block) continue;
    piece.payload._intentBlockId = block.blockId;
    piece.payload._intentBlockType = type;
    const sourceIntent = sourceIntentByPieceId.get(pieceId);
    const commitmentSignals = [
      sourceIntent?.hasExplicitPlanMention ? "explicit_source_plan" : null,
      timeFrom(piece.payload) ? "time" : null,
      confirmationFrom(piece.payload) ? "confirmation" : null,
      canonicalSourceDecisions(piece.payload).length > 0
        ? "source_ticket_choice"
        : null,
      pieceNamedInDayHeading(piece) ? "day_heading" : null,
      matchesCommittedDetailSubject(
        stringValue(piece.payload, "title")
      )
        ? "material_detail_question"
        : null,
      /\b(?:breakfast|brunch|lunch|dinner|supper)\b/i.test(
        stringValue(piece.payload, "title") ?? ""
      )
        ? "meal_slot"
        : null,
      Array.isArray(piece.payload._canonicalGroupingDecisionIds) &&
      piece.payload._canonicalGroupingDecisionIds.length > 0
        ? "approved_grouping"
        : null,
      sourceSupportedVenueAddressPieceIds.has(piece.id)
        ? "source_supported_venue_address"
        : null,
    ].filter((value): value is string => Boolean(value));
    const hasAuditedCommitment = commitmentSignals.length > 0;
    const inputDecision = asRecord(piece.payload._canonicalIntakeCandidacyDecision);
    const decision = activityCandidacyDecisionForPayload(piece.payload, {
      evidenceRole:
        (stringValue(inputDecision, "inputEvidenceRole") as EvidenceRole | null) ??
        piece.role,
      hasAuditedCommitment,
      intentBlockType: type,
    });
    const canonicalCandidacyDecision = {
      ...decision,
      blockDecisionId: block.blockId,
      classifiedDate: stringValue(piece.payload, "date"),
      commitmentObservationIds:
        sourceIntent?.explicitPlanObservationIds ?? [],
      commitmentSignals,
      hedgedObservationIds: sourceIntent?.hedgedObservationIds ?? [],
      ideaContextBefore:
        entries.find((entry) => entry.id === pieceId)?.ideaContextBefore ===
        true,
      ideaContextObservationId:
        entries.find((entry) => entry.id === pieceId)
          ?.ideaContextObservationId ?? null,
      referenceNoteObservationId:
        referenceNoteObservationForPiece(piece, observations, pieces)?.id ??
        null,
      decisionId: `candidacy_${stableHash({
        blockId: block.blockId,
        inputEvidenceRole: stringValue(inputDecision, "inputEvidenceRole"),
        inputItemType: stringValue(inputDecision, "inputItemType"),
        pieceId,
        type,
        version: 1,
      })}`,
      hasAuditedCommitment,
      inputEvidenceRole: stringValue(inputDecision, "inputEvidenceRole"),
      inputItemType: stringValue(inputDecision, "inputItemType"),
      version: 1,
    };
    piece.payload._canonicalCandidacyDecision = canonicalCandidacyDecision;
    const classifiedDate = stringValue(piece.payload, "date");
    for (const observationId of piece.observationIds) {
      const observation = observations.find(
        (candidate) => candidate.id === observationId
      );
      // Intent is occurrence-local. A piece can already carry same-identity
      // observations from another date; stamping this occurrence's block
      // decision onto those observations makes the earliest date look
      // planned and inverts identity (production Library/St. Stephen shape).
      if (
        observation &&
        (!classifiedDate ||
          !stringValue(observation.payload, "date") ||
          stringValue(observation.payload, "date") === classifiedDate)
      ) {
        observation.payload._canonicalCandidacyDecision = {
          ...canonicalCandidacyDecision,
        };
      }
    }
    piece.role = decision.evidenceRole;
    stamped.push({
      blockId: block.blockId,
      blockType: type,
      classifiedTitle: stringValue(piece.payload, "title"),
      piece,
    });
    if (decision.destination === "activity") {
      continue;
    }
    if (decision.destination === "city_note" && piece.kind === "activity") {
      demoteCanonicalPieceToCityNote(
        piece,
        `intent block ${block.blockId}: ${block.reason}`,
        pieces
      );
      continue;
    }
    if (decision.destination !== "city_note") {
      // The resolver/intake lanes may have temporarily represented an
      // accessory or context row as an Activity. Classification is the one
      // authority: a refused destination becomes non-output context here so
      // containment can still attach useful evidence to its durable owner,
      // but grouping/identity can never resurrect a traveler card.
      piece.kind = "context";
      piece.outputEligible = false;
      addCanonicalAction(piece, {
        absorbedTitles: [],
        observationIds: [...piece.observationIds],
        reason:
          `intent block ${block.blockId}: Activity candidacy resolved to ${decision.destination}`,
        type: "rejected",
      });
    }
  }

  return {
    blocks: result.blocks,
    stamped,
    version: 1 as const,
  };
}

function demoteHedgedSingleUncommittedMentions(
  pieces: CanonicalEvidencePiece[],
  missingDetails: unknown[]
) {
  const timedCounts = timedActivityCountsByDate(pieces);
  const questionSubjects = reviewSubjectTitles(missingDetails);

  for (const piece of pieces) {
    if (!committedMentionPieceCandidate(piece)) continue;
    // The block classifier already consumed occurrence-local hedge evidence.
    // This legacy pass may only serve unstamped direct callers/fixtures; it
    // cannot invert a production block decision.
    if (stringValue(piece.payload, "_intentBlockId")) continue;
    const title = normalizedComparable(stringValue(piece.payload, "title"));
    if (!title || questionSubjects.has(title)) continue;
    if (mentionCommitment(piece, timedCounts) !== "none") continue;
    if (authoritativeActivityCommitment(piece) !== "none") continue;
    if (!pieceHasHedgeMarker(piece)) continue;

    demoteCanonicalPieceToCityNote(
      piece,
      "source doubt marker (maybe / if time / far away): demoted to city note without a question",
      pieces
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

function pieceIsSourceNarratedRouteStop(piece: CanonicalEvidencePiece) {
  return /\b(?:walk (?:by|past|to|across|over|along)|stop by|on the (?:hour|way)|head (?:to|over|down)|then (?:walk|go|head))\b/i.test(
    [
      stringValue(piece.payload, "title") ?? "",
      stringValue(piece.payload, "description") ?? "",
    ].join(" ")
  );
}

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

// --- Arc G.3a: site membership evidence, in ONE place -----------------------
//
// Membership used to be judged twice with two subtly different rule sets:
// the lane matched container tokens on WHOLE WORDS and downgraded
// unverified coordinates once the geocode lane had run, while the executor
// re-verified with a SUBSTRING match and no downgrade. Two copies of a rule
// are two rules. Everything below is the single source of truth, and both
// callers keep only their own surrounding vetoes.
//
// Three kinds of proof, in strength order:
//   1. COMPONENT LIST — the container's own description lists the child.
//   2. TITLE TOKEN — "Palm House at Schönbrunn" carries the site's name.
//   3. FORMATTED ADDRESS (new) — the geocoder's own answer for the child
//      names the site ("Schönbrunner Schloßstraße 47, 1130 Wien"). This is
//      the evidence that finally reaches Schönbrunn's Gloriette: it is
//      ~800 m from the palace and the locked ~300 m radius refuses it BY
//      DESIGN, but its address is inside the estate.
//   4. RADIUS — proximity alone, the weakest claim and the only contestable
//      one.
//
// FOOTPRINT EXTENSION: a site whose own confirmed members demonstrably
// spread out is allowed to admit untimed neighbours across that measured
// extent instead of a fixed 300 m. Deliberately hard to trigger — it needs
// at least two source/address-confirmed members carrying VERIFIED
// coordinates, admits only untimed pieces on verified coordinates, and is
// capped. Live-run 7.21.0 is the cautionary case: the parser fabricated
// precise-looking coordinates for a whole day and a "peek inside the
// Gresham Palace" card nearly swallowed Budapest.
const SITE_FOOTPRINT_MAX_KM = 1.2;
const SITE_FOOTPRINT_MIN_CONFIRMED_MEMBERS = 2;

function pieceVerifiedAddress(piece: CanonicalEvidencePiece) {
  return piece.payload._geoVerified === true
    ? stringValue(piece.payload, "verifiedFormattedAddress")
    : null;
}

// Tokens that can identify a SITE, used by both the title path and the
// address path. Generic site nouns and trip city names are excluded: an
// address containing "palace" says nothing, "Prague" says only that we are
// in Prague, and neither is containment.
//
// This filter used to apply to the address path only, and the asymmetry was
// a live false-grouping generator: `SOURCE_SUPPORT_STOPWORDS` happens to
// contain "castle" and "museum" but NOT "palace", "complex", "grounds",
// "citadel", "fortress", "abbey" or "monastery" — every one of them a
// SAME_SITE_CONTAINER_PATTERN noun of five or more characters. "Belvedere
// Palace" therefore read as a source-confirmed member of the Schönbrunn
// Palace visit five kilometres away, and G.3b would have recorded that as
// HIERARCHY strength — permanently uncontestable.
function siteIdentifyingTokens(
  containerTitle: string,
  excludedTokens: Set<string>
) {
  return distinctiveTitleTokens(containerTitle).filter(
    (token) =>
      token.length >= 5 &&
      !SAME_SITE_CONTAINER_PATTERN.test(token) &&
      !excludedTokens.has(token)
  );
}

function addressNamesSite(address: string | null, tokens: string[]) {
  if (!address || tokens.length === 0) return false;
  const folded = foldForSourceSupport(address);
  // Substring, not whole word: German and Czech addresses inflect the site
  // name ("Schönbrunner Schloßstraße" for Schönbrunn), and a >=5-character
  // distinctive token is specific enough to carry it.
  return tokens.some((token) => folded.includes(token));
}

export type SiteMembershipEvidence = "geo" | "hierarchy";

// Live-run 7.21.0: when the geocode lane ran on this build, radius rules
// trust ONLY verified coordinates (the parser fabricates precise-looking
// ones). Without the lane (no key), the precise-parser fallback stands —
// the env-keyed contract promises no behavior change when disabled.
function groupingGeocodeLaneRan(pieces: CanonicalEvidencePiece[]) {
  return pieces.some((piece) => piece.payload._geoVerified === true);
}

function tripCityAddressTokens(pieces: CanonicalEvidencePiece[]) {
  return new Set(
    pieces
      .filter((piece) => piece.kind === "place")
      .flatMap((piece) =>
        foldForSourceSupport(stringValue(piece.payload, "city") ?? "").split(
          /\s+/
        )
      )
      .filter(Boolean)
  );
}

function createSiteMembershipContext({
  candidates,
  container,
  geocodeLaneRan,
  excludedContainerTokens = new Set<string>(),
}: {
  candidates: CanonicalEvidencePiece[];
  container: CanonicalEvidencePiece;
  geocodeLaneRan: boolean;
  excludedContainerTokens?: Set<string>;
}) {
  const containerTitle = stringValue(container.payload, "title") ?? "";
  const containerTokens = siteIdentifyingTokens(
    containerTitle,
    excludedContainerTokens
  );
  const addressTokens = containerTokens;
  const containerCategory = stringValue(container.payload, "category");
  const containerDescription = stringValue(container.payload, "description");

  const radiusCoordinates = (piece: CanonicalEvidencePiece) => {
    const coords = precisePieceCoordinates(piece);
    if (!coords) return null;
    // Live-run 7.21.0: when the geocode lane ran, radius rules trust ONLY
    // verified coordinates — the parser fabricates precise-looking ones.
    return geocodeLaneRan && !coords.verified ? null : coords;
  };
  const originCoords = radiusCoordinates(container);

  // Filtering generic nouns and city names out of the token list is what
  // stops "Belvedere Palace" reading as part of "Schönbrunn Palace" — but
  // it would also strip EVERY token from containers like "Prague Castle"
  // (city + generic noun), which would lose the source-hierarchy path they
  // legitimately use. A child naming the container's FULL title is
  // unambiguous containment whatever its tokens are, so that path is kept
  // alongside.
  const containerFullTitle = normalizedComparable(containerTitle);
  const containerFullTitleUsable =
    containerFullTitle.length >= 6 && containerFullTitle.includes(" ");

  const sourceHierarchyMember = (piece: CanonicalEvidencePiece) => {
    const childRawTitle = stringValue(piece.payload, "title");
    const childTitle = normalizedComparable(childRawTitle);
    if (!childTitle) return false;
    if (
      childRawTitle &&
      containerListsComponent(containerDescription, childRawTitle)
    ) {
      return true;
    }
    if (
      containerFullTitleUsable &&
      childTitle !== containerFullTitle &&
      childTitle.includes(containerFullTitle)
    ) {
      return true;
    }
    if (
      containerTokens.some((token) => ` ${childTitle} `.includes(` ${token} `))
    ) {
      return true;
    }
    return false;
  };

  const addressMember = (piece: CanonicalEvidencePiece) =>
    addressNamesSite(pieceVerifiedAddress(piece), addressTokens);
  const hierarchyMember = (piece: CanonicalEvidencePiece) =>
    sourceHierarchyMember(piece) || addressMember(piece);

  const confirmedMembers = candidates.filter(
    (piece) => piece !== container && hierarchyMember(piece)
  );
  const confirmedCoords = confirmedMembers
    .map((piece) => radiusCoordinates(piece))
    .filter(
      (value): value is { lat: number; lng: number; verified: boolean } =>
        Boolean(value?.verified)
    );

  let footprintKm = SAME_SITE_RADIUS_KM;
  if (
    originCoords?.verified &&
    confirmedCoords.length >= SITE_FOOTPRINT_MIN_CONFIRMED_MEMBERS
  ) {
    for (const coords of confirmedCoords) {
      footprintKm = Math.max(footprintKm, haversineKm(originCoords, coords));
    }
    footprintKm = Math.min(footprintKm, SITE_FOOTPRINT_MAX_KM);
  }

  const timedCategoryOk = (piece: CanonicalEvidencePiece) =>
    !timeFrom(piece.payload) ||
    (Boolean(stringValue(piece.payload, "category")) &&
      stringValue(piece.payload, "category") === containerCategory);

  const evidenceFor = (
    piece: CanonicalEvidencePiece
  ): SiteMembershipEvidence | null => {
    if (piece === container) return null;
    if (hierarchyMember(piece)) return "hierarchy";
    if (!timedCategoryOk(piece)) return null;
    const coords = radiusCoordinates(piece);
    if (!originCoords || !coords) return null;
    const distanceKm = haversineKm(originCoords, coords);
    if (distanceKm <= SAME_SITE_RADIUS_KM) return "geo";
    // Extension zone: verified coordinates and untimed only.
    if (
      distanceKm <= footprintKm &&
      coords.verified &&
      !timeFrom(piece.payload)
    ) {
      return "geo";
    }
    return null;
  };

  return {
    addressTokens,
    addressMember,
    evidenceFor,
    footprintKm,
    hierarchyMember,
    originCoords,
    radiusCoordinates,
    sourceHierarchyMember,
  };
}

type ContainmentSourcePosition = {
  line: number;
  observationId: string;
  ordinal: number;
  relationshipSignal: boolean;
  sourceIdentityHash: string;
  stageIndex: number;
};

type CanonicalContainmentAuthority = {
  doNotMerge: (
    left: CanonicalEvidencePiece,
    right: CanonicalEvidencePiece
  ) => boolean;
  telemetry: ContainmentLedgerTelemetry;
};

function containmentObservationPositions(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  return piece.observationIds
    .map((id) => observationById.get(id))
    .filter(
      (observation): observation is EvidenceObservation =>
        Boolean(observation) &&
        observation?.kind === "activity" &&
        observation.sourceLabel !== "source recovery"
    )
    .flatMap((observation) => {
      const position = asRecord(observation.payload._canonicalSourcePosition);
      const line = Number(position.line);
      const stageIndex = Number(position.stageIndex);
      const sourceIdentityHash = stringValue(position, "sourceIdentityHash");
      if (
        !Number.isFinite(line) ||
        !Number.isFinite(stageIndex) ||
        !sourceIdentityHash
      ) {
        return [];
      }
      return [{
        line,
        observationId: observation.id,
        ordinal: observation.ordinal,
        relationshipSignal: position.relationshipSignal === true,
        sourceIdentityHash,
        stageIndex,
      } satisfies ContainmentSourcePosition];
    })
    .sort(
      (left, right) =>
        right.stageIndex - left.stageIndex ||
        left.line - right.line ||
        left.ordinal - right.ordinal
    );
}

function containmentSourcePosition(
  piece: CanonicalEvidencePiece,
  observationById: Map<string, EvidenceObservation>
) {
  return containmentObservationPositions(piece, observationById)[0] ?? null;
}

function containmentParticipant(piece: CanonicalEvidencePiece) {
  return {
    observationIds: [...piece.observationIds],
    pieceId: piece.id,
    title: stringValue(piece.payload, "title") ?? "Untitled activity",
  };
}

function containmentMemberIdentityTitle(title: string) {
  return normalizedComparable(title)
    .replace(/\s+(?:at|inside|within)\s+.+$/, "")
    .replace(/\s+(?:pass|ticket|visit)$/, "")
    .trim();
}

function containmentSemanticKind(piece: CanonicalEvidencePiece) {
  const category = normalizedComparable(stringValue(piece.payload, "category"));
  if (/^(?:art culture|nature outdoors|sightseeing)$/.test(category)) {
    return "sight";
  }
  return category || "unknown";
}

function containmentMemberDecision({
  evidence,
  observationById,
  piece,
}: {
  evidence: ContainmentEvidenceKind[];
  observationById: Map<string, EvidenceObservation>;
  piece: CanonicalEvidencePiece;
}): ContainmentMemberDecision {
  const position = containmentSourcePosition(piece, observationById);
  return {
    evidence: Array.from(new Set(evidence)),
    observationIds: [...piece.observationIds],
    pieceId: piece.id,
    sourceOrder: position
      ? position.stageIndex * 100_000 + position.line
      : Math.min(
          ...piece.observationIds.map(
            (id) => observationById.get(id)?.ordinal ?? Number.MAX_SAFE_INTEGER
          )
        ),
    title: stringValue(piece.payload, "title") ?? "Untitled activity",
  };
}

function createCanonicalContainmentAuthority({
  existingDecisions,
  missingDetails,
  observations,
  pieces,
}: {
  existingDecisions: CanonicalGroupingDecision[];
  missingDetails: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}): CanonicalContainmentAuthority {
  const ledger = createContainmentLedger();
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  const claimedPieceIds = new Set<string>();
  const activityPieces = pieces.filter(
    (piece) =>
      piece.kind === "activity" &&
      piece.outputEligible &&
      Boolean(stringValue(piece.payload, "date"))
  );

  // Title drift after a merge must not let a component collapse into its
  // container. Register every observed activity title, not only the current
  // payload winner.
  for (let leftIndex = 0; leftIndex < activityPieces.length; leftIndex += 1) {
    const left = activityPieces[leftIndex];
    const leftTitles = [
      stringValue(left.payload, "title"),
      ...left.observationIds.map((id) =>
        stringValue(observationById.get(id)?.payload ?? {}, "title")
      ),
    ].filter((value): value is string => Boolean(value));
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < activityPieces.length;
      rightIndex += 1
    ) {
      const right = activityPieces[rightIndex];
      const rightTitles = [
        stringValue(right.payload, "title"),
        ...right.observationIds.map((id) =>
          stringValue(observationById.get(id)?.payload ?? {}, "title")
        ),
      ].filter((value): value is string => Boolean(value));
      for (const leftTitle of leftTitles) {
        for (const rightTitle of rightTitles) {
          ledger.registerTitleConflict(
            { ...containmentParticipant(left), title: leftTitle },
            { ...containmentParticipant(right), title: rightTitle }
          );
        }
      }
    }
  }

  const addDecision = (decision: ContainmentDecision) => {
    const added = ledger.addDecision(decision);
    if (added) {
      if (decision.containerPieceId) {
        claimedPieceIds.add(decision.containerPieceId);
      }
      for (const member of decision.members) claimedPieceIds.add(member.pieceId);
    }
    return added;
  };

  const candidatePiece = (candidateId: string) =>
    activityPieces.find((piece) =>
      piece.observationIds.some((observationId) => {
        const observation = observationById.get(observationId);
        return (
          observation &&
          (stringValue(observation.payload, "_resolverCandidateId") ??
            observation.id) === candidateId
        );
      })
    ) ?? null;
  const candidateObservation = (candidateId: string) =>
    observations.find(
      (observation) =>
        (stringValue(observation.payload, "_resolverCandidateId") ??
          observation.id) === candidateId
    ) ?? null;

  // Resolver decisions are admitted only as source-authored routes here.
  // Site and proximity decisions are rebuilt below under the typed rules so
  // an older grouping proposal cannot silently become containment authority.
  for (const decision of existingDecisions) {
    const resolved = Array.from(
      new Set(
        decision.candidateIds
          .map(candidatePiece)
          .filter((piece): piece is CanonicalEvidencePiece => Boolean(piece))
      )
    );
    const routeSignal = [
      decision.claim,
      decision.parentTitle,
      ...resolved.flatMap((piece) => [
        stringValue(piece.payload, "title") ?? "",
        ...piece.observationIds.flatMap((id) => {
          const observation = observationById.get(id);
          return observation
            ? [
                observation.sourceStructure.sectionLabel ?? "",
                ...observation.sourceStructure.headingPath,
              ]
            : [];
        }),
      ]),
    ].join(" ");
    const routeLike = /\b(?:tour|route|walk(?:ing)?)\b/i.test(routeSignal);
    const requestedParent = candidatePiece(decision.parentCandidateId);
    const requestedContainer = decision.containerCandidateId
      ? candidatePiece(decision.containerCandidateId)
      : null;
    const requestedContainerObservation = decision.containerCandidateId
      ? candidateObservation(decision.containerCandidateId)
      : null;
    const declaredContainerDidNotSurvive = Boolean(
      decision.containerCandidateId && !requestedContainer
    );
    if (routeLike && declaredContainerDidNotSurvive) {
      const containerPosition = asRecord(
        requestedContainerObservation?.payload._canonicalSourcePosition
      );
      const containerSourceIdentityHash = stringValue(
        containerPosition,
        "sourceIdentityHash"
      );
      const containerIntakeDecision = asRecord(
        requestedContainerObservation?.payload._canonicalIntakeCandidacyDecision
      );
      const sourceAuthoredContainer = Boolean(
        requestedContainerObservation &&
          (stringValue(containerIntakeDecision, "inputEvidenceRole") ??
            originalActivityCandidacyInputs(
              requestedContainerObservation.payload
            ).evidenceRole) === "grouping_proposal" &&
          stringValue(
            requestedContainerObservation.payload,
            "sourceSectionType"
          ) === "dated_itinerary" &&
          Number.isFinite(Number(containerPosition.line)) &&
          containerSourceIdentityHash
      );
      const positionedMembers = resolved
        .map((piece) => ({
          piece,
          position: containmentSourcePosition(piece, observationById),
        }))
        .filter(
          (entry): entry is {
            piece: CanonicalEvidencePiece;
            position: ContainmentSourcePosition;
          } => Boolean(entry.position)
        );
      if (
        sourceAuthoredContainer &&
        positionedMembers.length === resolved.length &&
        positionedMembers.length >= 2 &&
        positionedMembers.every(
          ({ position }) =>
            position.sourceIdentityHash === containerSourceIdentityHash
        )
      ) {
        const members = positionedMembers
          .map(({ piece }) =>
            containmentMemberDecision({
              evidence: [
                "resolver_source_relationship",
                "source_hierarchy",
                "source_order",
              ],
              observationById,
              piece,
            })
          )
          .sort((left, right) => left.sourceOrder - right.sourceOrder);
        addDecision({
          callPolicy:
            decision.callRequired === false ? "silent" : "required",
          containerObservationIds: requestedContainerObservation
            ? [requestedContainerObservation.id]
            : [],
          containerPieceId: null,
          containerTitle: decision.parentTitle,
          date: stringValue(resolved[0].payload, "date") ?? "",
          decisionId: decision.decisionId,
          members,
          relationType: "authored_route",
          rejections: [],
          source: "resolver_containment",
        });
      }
      continue;
    }
    if (
      !routeLike &&
      (!requestedParent || declaredContainerDidNotSurvive)
    ) {
      const positions = resolved
        .map((piece) => containmentSourcePosition(piece, observationById))
        .filter(
          (position): position is ContainmentSourcePosition => Boolean(position)
        );
      const firstPosition = positions[0] ?? null;
      const sharedPositionedRelationship = Boolean(
        firstPosition &&
          positions.length === resolved.length &&
          positions.some((position) => position.relationshipSignal) &&
          positions.every(
            (position) =>
              position.sourceIdentityHash === firstPosition.sourceIdentityHash &&
              position.stageIndex === firstPosition.stageIndex
          )
      );
      const syntheticTitle = decision.parentTitle;
      const syntheticSameSite =
        /\bsame[ -]?site\b|\b(?:component|complex|grounds|inside|within)\b/i.test(
          `${decision.claim} ${syntheticTitle}`
        ) && SAME_SITE_CONTAINER_PATTERN.test(syntheticTitle);
      const multiSiteSynthetic =
        /^(.{3,}?)\s+(?:and|&|to)\s+(.{3,}?)(?:\s+visit)?$/i.test(
          syntheticTitle
        ) && SAME_SITE_CONTAINER_PATTERN.test(syntheticTitle);
      if (
        sharedPositionedRelationship &&
        syntheticSameSite &&
        !multiSiteSynthetic &&
        resolved.length >= 2
      ) {
        const members = resolved.map((piece) =>
          containmentMemberDecision({
            evidence: ["resolver_source_relationship", "source_hierarchy"],
            observationById,
            piece,
          })
        );
        addDecision({
          callPolicy:
            decision.callRequired === false ? "silent" : "required",
          containerObservationIds: [],
          containerPieceId: null,
          containerTitle: syntheticTitle,
          date: stringValue(resolved[0].payload, "date") ?? "",
          decisionId: decision.decisionId,
          members,
          relationType: "same_site",
          rejections: [],
          source: "resolver_containment",
        });
      }
      continue;
    }
    const parent = requestedParent ?? resolved[0];
    if (!parent) continue;
    if (!routeLike) {
      // A resolver same-site proposal needs either a shared executable
      // source relationship or source-free licensed membership evidence.
      // Both paths freeze into this ledger; grouping itself never discovers
      // or re-judges membership.
      const sourceFree = resolved.every(
        (piece) => containmentSourcePosition(piece, observationById) === null
      );
      const parentTitle = stringValue(parent.payload, "title") ?? "";
      const parentPosition = containmentSourcePosition(parent, observationById);
      const positionedResolverRelationship = Boolean(
        parentPosition?.relationshipSignal &&
          resolved
            .filter((piece) => piece !== parent)
            .every((piece) => {
              const position = containmentSourcePosition(piece, observationById);
              return (
                position?.sourceIdentityHash ===
                  parentPosition.sourceIdentityHash &&
                position.stageIndex === parentPosition.stageIndex
              );
            })
      );
      const sameSiteClaim =
        /\bsame[ -]?site\b|\b(?:component|complex|grounds|inside|within)\b/i.test(
          `${decision.claim} ${decision.parentTitle}`
        ) && SAME_SITE_CONTAINER_PATTERN.test(parentTitle);
      if (
        !sameSiteClaim ||
        (!sourceFree && !positionedResolverRelationship)
      ) {
        continue;
      }
      const multiSiteTitle =
        /^(.{3,}?)\s+(?:and|&|to)\s+(.{3,}?)(?:\s+visit)?$/i.test(
          parentTitle
        ) && SAME_SITE_CONTAINER_PATTERN.test(parentTitle);
      if (
        multiSiteTitle ||
        PASSING_MENTION_TITLE_PATTERN.test(
          `${parentTitle} ${stringValue(parent.payload, "description") ?? ""}`
        )
      ) {
        continue;
      }
      const allResolverCandidates = resolved.filter((piece) => piece !== parent);
      const resolverOwnsFixedStops = /\bsame[ -]?site visit\b/i.test(
        decision.claim
      );
      const independentSitePieces = resolverOwnsFixedStops
        ? []
        : allResolverCandidates.filter((piece) =>
            Boolean(
              timeFrom(piece.payload) ||
                confirmationFrom(piece.payload) ||
                /\b(?:booked|paid|reservation|reserved|ticketed|timed|voucher)\b/i.test(
                  activityText(piece.payload)
                )
            )
          );
      const resolverCandidates = allResolverCandidates.filter(
        (piece) => !independentSitePieces.includes(piece)
      );
      const resolverMembership = sourceFree
        ? createSiteMembershipContext({
            candidates: resolverCandidates,
            container: parent,
            excludedContainerTokens: tripCityAddressTokens(pieces),
            geocodeLaneRan:
              decision.verificationPolicy === "strict_verified_coordinates"
                ? groupingGeocodeLaneRan(pieces)
                : false,
          })
        : null;
      const members = resolverCandidates.flatMap((piece) => {
        const relationship =
          positionedResolverRelationship
            ? "hierarchy"
            : resolverMembership?.evidenceFor(piece) ?? null;
        if (!relationship) return [];
        const evidence: ContainmentEvidenceKind[] = [
          "resolver_source_relationship",
        ];
        if (
          positionedResolverRelationship ||
          resolverMembership?.sourceHierarchyMember(piece)
        ) {
          evidence.push("source_hierarchy");
        }
        if (resolverMembership?.addressMember(piece)) {
          evidence.push("verified_address");
        } else if (relationship === "geo") {
          evidence.push("verified_geo");
        }
        return [containmentMemberDecision({
          evidence,
          observationById,
          piece,
        })];
      });
      if (members.length < 2) continue;
      addDecision({
        callPolicy: decision.callRequired === false ? "silent" : "required",
        containerObservationIds: [...parent.observationIds],
        containerPieceId: parent.id,
        containerTitle:
          parentTitle || decision.parentTitle,
        date: stringValue(parent.payload, "date") ?? "",
        decisionId: decision.decisionId,
        members,
        relationType: "same_site",
        rejections: independentSitePieces.map((piece) => ({
          pieceId: piece.id,
          reasonCode: timeFrom(piece.payload)
            ? ("independent_time" as const)
            : ("independent_booking" as const),
          title: stringValue(piece.payload, "title") ?? "Untitled activity",
        })),
        source: "resolver_containment",
      });
      continue;
    }
    const routeCandidates = resolved.filter((piece) => piece !== parent);
    const independentRoutePieces = routeCandidates.filter(
      (piece) => confirmationFrom(piece.payload) || timeFrom(piece.payload)
    );
    const members = routeCandidates
      .filter((piece) => !independentRoutePieces.includes(piece))
      .map((piece) =>
        containmentMemberDecision({
          evidence: ["resolver_source_relationship", "source_hierarchy"],
          observationById,
          piece,
        })
      )
      .sort((left, right) => left.sourceOrder - right.sourceOrder);
    if (members.length < 2) continue;
    addDecision({
      callPolicy: decision.callRequired === false ? "silent" : "required",
      containerObservationIds: [...parent.observationIds],
      containerPieceId: parent.id,
      containerTitle: stringValue(parent.payload, "title") ?? decision.parentTitle,
      date: stringValue(parent.payload, "date") ?? "",
      decisionId: decision.decisionId,
      members,
      relationType: "authored_route",
      rejections: independentRoutePieces.map((piece) => ({
        pieceId: piece.id,
        reasonCode: timeFrom(piece.payload)
          ? ("independent_time" as const)
          : ("independent_booking" as const),
        title: stringValue(piece.payload, "title") ?? "Untitled activity",
      })),
      source: "resolver_containment",
    });
  }

  // Deterministic fallback for an authored route whose resolver grouping was
  // lost after candidate ids merged. A route-like source section starts at
  // its first fixed plan and stops before the next independent fixed plan.
  const routeSections = new Map<
    string,
    Array<{ observation: EvidenceObservation; piece: CanonicalEvidencePiece }>
  >();
  for (const piece of activityPieces) {
    for (const observationId of piece.observationIds) {
      const observation = observationById.get(observationId);
      if (!observation || observation.kind !== "activity") continue;
      const section = observation.sourceStructure.sectionLabel;
      const position = asRecord(observation.payload._canonicalSourcePosition);
      const stageIndex = Number(position.stageIndex);
      if (
        !section ||
        !/\b(?:tour|route|walk(?:ing)?)\b/i.test(section) ||
        !Number.isFinite(stageIndex)
      ) {
        continue;
      }
      const key = [
        stringValue(observation.payload, "date") ?? "",
        stringValue(position, "sourceIdentityHash") ?? "",
        stageIndex,
        normalizedComparable(section),
      ].join("|");
      const entries = routeSections.get(key) ?? [];
      if (!entries.some((entry) => entry.piece === piece)) {
        entries.push({ observation, piece });
        routeSections.set(key, entries);
      }
    }
  }
  for (const entries of routeSections.values()) {
    const ordered = entries.sort((left, right) => {
      const leftLine = Number(
        asRecord(left.observation.payload._canonicalSourcePosition).line
      );
      const rightLine = Number(
        asRecord(right.observation.payload._canonicalSourcePosition).line
      );
      return leftLine - rightLine || left.observation.ordinal - right.observation.ordinal;
    });
    const parentIndex = ordered.findIndex(
      ({ piece }) =>
        Boolean(timeFrom(piece.payload) || confirmationFrom(piece.payload))
    );
    if (parentIndex < 0) continue;
    const parent = ordered[parentIndex].piece;
    if (claimedPieceIds.has(parent.id)) continue;
    const members: ContainmentMemberDecision[] = [];
    const rejections: ContainmentRejection[] = [];
    for (const entry of ordered.slice(parentIndex + 1)) {
      if (timeFrom(entry.piece.payload) || confirmationFrom(entry.piece.payload)) {
        rejections.push({
          pieceId: entry.piece.id,
          reasonCode: timeFrom(entry.piece.payload)
            ? "independent_time"
            : "independent_booking",
          title: stringValue(entry.piece.payload, "title") ?? "Untitled activity",
        });
        break;
      }
      members.push(
        containmentMemberDecision({
          evidence: ["source_hierarchy", "source_order"],
          observationById,
          piece: entry.piece,
        })
      );
    }
    if (members.length < 2) continue;
    addDecision({
      callPolicy: "silent",
      containerObservationIds: [...parent.observationIds],
      containerPieceId: parent.id,
      containerTitle: stringValue(parent.payload, "title") ?? "Authored route",
      date: stringValue(parent.payload, "date") ?? "",
      decisionId: `containment-route-${stableHash({
        date: stringValue(parent.payload, "date"),
        members: members.map((member) => member.pieceId),
        parent: parent.id,
      })}`,
      members,
      relationType: "authored_route",
      rejections,
      source: "deterministic_containment",
    });
  }

  const geocodeLaneRan = groupingGeocodeLaneRan(pieces);
  const excludedContainerTokens = tripCityAddressTokens(pieces);
  const byDate = new Map<string, CanonicalEvidencePiece[]>();
  for (const piece of activityPieces) {
    const date = stringValue(piece.payload, "date");
    if (!date) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), piece]);
  }

  for (const [date, dayPieces] of byDate) {
    for (const container of dayPieces) {
      if (claimedPieceIds.has(container.id)) continue;
      const containerTitle = stringValue(container.payload, "title") ?? "";
      if (
        !SAME_SITE_CONTAINER_PATTERN.test(containerTitle) ||
        PASSING_MENTION_TITLE_PATTERN.test(
          `${containerTitle} ${stringValue(container.payload, "description") ?? ""}`
        )
      ) {
        continue;
      }
      const candidates = dayPieces.filter(
        (piece) => piece !== container && !claimedPieceIds.has(piece.id)
      );
      const membership = createSiteMembershipContext({
        candidates,
        container,
        excludedContainerTokens,
        geocodeLaneRan,
      });
      const containerPosition = containmentSourcePosition(
        container,
        observationById
      );
      const positioned = candidates
        .map((piece) => ({
          piece,
          position: containmentSourcePosition(piece, observationById),
        }))
        .filter(
          (entry): entry is {
            piece: CanonicalEvidencePiece;
            position: ContainmentSourcePosition;
          } =>
            Boolean(entry.position) &&
            Boolean(containerPosition) &&
            entry.position.sourceIdentityHash ===
              containerPosition?.sourceIdentityHash &&
            entry.position.stageIndex === containerPosition?.stageIndex
        )
        .sort((left, right) => left.position.line - right.position.line);
      const explicitMembers = positioned.filter(({ piece }) =>
        membership.sourceHierarchyMember(piece)
      );
      const hasSourceNesting =
        explicitMembers.length > 0 ||
        containerPosition?.relationshipSignal === true;
      if (!hasSourceNesting) continue;

      // A source-bounded site run may extend beyond explicitly named
      // "X at Site" rows only after two such rows anchor the structure.
      // The first source gap larger than one normal row ends the run.
      const rejections: ContainmentRejection[] = [];
      const extension = new Set<CanonicalEvidencePiece>();
      if (containerPosition && explicitMembers.length >= 2) {
        let previousLine = containerPosition.line;
        for (const entry of positioned) {
          if (entry.position.line <= containerPosition.line) continue;
          if (entry.position.line - previousLine > 3) {
            rejections.push({
              pieceId: entry.piece.id,
              reasonCode: "source_boundary",
              title:
                stringValue(entry.piece.payload, "title") ??
                "Untitled activity",
            });
            break;
          }
          const coords = membership.radiusCoordinates(entry.piece);
          if (
            membership.originCoords?.verified &&
            coords?.verified &&
            haversineKm(membership.originCoords, coords) >
              SITE_FOOTPRINT_MAX_KM
          ) {
            rejections.push({
              pieceId: entry.piece.id,
              reasonCode: "source_boundary",
              title:
                stringValue(entry.piece.payload, "title") ??
                "Untitled activity",
            });
            break;
          }
          extension.add(entry.piece);
          previousLine = entry.position.line;
        }
      }
      const selected = new Map<string, CanonicalEvidencePiece>();
      for (const { piece, position } of positioned) {
        if (position.line <= (containerPosition?.line ?? -1)) continue;
        const hierarchy = membership.sourceHierarchyMember(piece);
        const corroboration = membership.evidenceFor(piece);
        const relationshipMember = Boolean(
          containerPosition?.relationshipSignal && corroboration
        );
        if (!hierarchy && !extension.has(piece) && !relationshipMember) continue;
        const title = stringValue(piece.payload, "title") ?? "Untitled activity";
        if (confirmationFrom(piece.payload) && !hierarchy && !relationshipMember) {
          rejections.push({ pieceId: piece.id, reasonCode: "independent_booking", title });
          continue;
        }
        if (timeFrom(piece.payload) && !hierarchy && !relationshipMember) {
          rejections.push({ pieceId: piece.id, reasonCode: "independent_time", title });
          continue;
        }
        if (
          SAME_SITE_CONTAINER_PATTERN.test(title) &&
          !hierarchy &&
          !relationshipMember
        ) {
          rejections.push({ pieceId: piece.id, reasonCode: "named_peer_site", title });
          continue;
        }
        if (PASSING_MENTION_TITLE_PATTERN.test(
          `${title} ${stringValue(piece.payload, "description") ?? ""}`
        )) {
          rejections.push({ pieceId: piece.id, reasonCode: "type_mismatch", title });
          continue;
        }
        // Query-context coordinates within 50 m of the container are an
        // echo, not membership proof. Explicit source hierarchy still wins.
        const pieceCoords = membership.radiusCoordinates(piece);
        const query = stringValue(asRecord(piece.payload._geoVerification), "query");
        const isEcho = Boolean(
          !hierarchy &&
          !relationshipMember &&
          query &&
          normalizedComparable(query).includes(normalizedComparable(containerTitle)) &&
          membership.originCoords &&
          pieceCoords &&
          haversineKm(membership.originCoords, pieceCoords) <= 0.05
        );
        if (isEcho) {
          rejections.push({ pieceId: piece.id, reasonCode: "no_licensed_evidence", title });
          continue;
        }
        const identity = containmentMemberIdentityTitle(title);
        const existing = selected.get(identity);
        if (!existing) {
          selected.set(identity, piece);
        } else {
          const existingPosition = containmentSourcePosition(existing, observationById);
          if ((existingPosition?.stageIndex ?? -1) < position.stageIndex) {
            selected.set(identity, piece);
          }
        }
      }
      const members = [...selected.values()]
        .map((piece) => {
          const evidence: ContainmentEvidenceKind[] = ["source_order"];
          if (
            membership.sourceHierarchyMember(piece) ||
            (containerPosition?.relationshipSignal &&
              membership.evidenceFor(piece))
          ) {
            evidence.push("source_hierarchy");
          }
          if (extension.has(piece)) {
            evidence.push("source_bounded_extension");
          }
          if (membership.addressMember(piece)) evidence.push("verified_address");
          else if (membership.evidenceFor(piece) === "geo") evidence.push("verified_geo");
          return containmentMemberDecision({ evidence, observationById, piece });
        })
        .sort((left, right) => left.sourceOrder - right.sourceOrder);
      if (members.length < 2) continue;
      addDecision({
        callPolicy: "required",
        containerObservationIds: [...container.observationIds],
        containerPieceId: container.id,
        containerTitle,
        date,
        decisionId: `containment-site-${stableHash({
          date,
          members: members.map((member) => member.pieceId),
          parent: container.id,
        })}`,
        members,
        relationType: "same_site",
        rejections,
        source: "deterministic_containment",
      });
    }

    // Discovered walks are source-selected sight chains, not radius blobs:
    // site members are removed first; every remaining consecutive hop must
    // pass the licensed proximity gate; errands and meals are another kind.
    const sourceAreaSupportedForContainment = (
      piece: CanonicalEvidencePiece
    ) => {
      if (pieceAreaSourceSupported(piece)) return true;
      const area = normalizedComparable(stringValue(piece.payload, "area"));
      const position = containmentSourcePosition(piece, observationById);
      if (!area || !position) return false;
      // The extractor's area label is not spent alone. Three same-source,
      // same-day peers must independently carry the same label; source order
      // and licensed coordinates are still required below.
      return (
        dayPieces.filter((candidate) => {
          const candidatePosition = containmentSourcePosition(
            candidate,
            observationById
          );
          return (
            normalizedComparable(stringValue(candidate.payload, "area")) === area &&
            candidatePosition?.sourceIdentityHash === position.sourceIdentityHash &&
            candidatePosition?.stageIndex === position.stageIndex
          );
        }).length >= 3
      );
    };
    const walkCandidates = dayPieces
      .filter((piece) => !claimedPieceIds.has(piece.id))
      .filter(
        (piece) =>
          !timeFrom(piece.payload) &&
          !confirmationFrom(piece.payload) &&
          !pieceHasHedgeMarker(piece) &&
          containmentSemanticKind(piece) === "sight" &&
          sourceAreaSupportedForContainment(piece) &&
          !pieceIsSourceNarratedRouteStop(piece) &&
          !SAME_SITE_CONTAINER_PATTERN.test(
            stringValue(piece.payload, "title") ?? ""
          ) &&
          !/\btour\b/i.test(stringValue(piece.payload, "title") ?? "")
      )
      .map((piece) => ({
        coords: precisePieceCoordinates(piece),
        piece,
        position: containmentSourcePosition(piece, observationById),
      }))
      .filter(
        (entry): entry is {
          coords: { lat: number; lng: number; verified: boolean };
          piece: CanonicalEvidencePiece;
          position: ContainmentSourcePosition;
        } =>
          Boolean(entry.coords) &&
          Boolean(entry.position) &&
          (!geocodeLaneRan || entry.coords?.verified === true)
      );
    const byArea = new Map<string, typeof walkCandidates>();
    for (const entry of walkCandidates) {
      const area = normalizedComparable(stringValue(entry.piece.payload, "area"));
      if (!area) continue;
      byArea.set(area, [...(byArea.get(area) ?? []), entry]);
    }
    const coherentSegments: Array<typeof walkCandidates> = [];
    for (const entries of byArea.values()) {
      const ordered = entries.sort(
        (left, right) =>
          left.position.stageIndex - right.position.stageIndex ||
          left.position.line - right.position.line
      );
      let segment: typeof walkCandidates = [];
      for (const entry of ordered) {
        const previous = segment[segment.length - 1];
        const sameSource =
          !previous ||
          (previous.position.sourceIdentityHash === entry.position.sourceIdentityHash &&
            previous.position.stageIndex === entry.position.stageIndex);
        const closeEnough =
          !previous || haversineKm(previous.coords, entry.coords) <= WALK_RADIUS_KM;
        if (!sameSource || !closeEnough) {
          if (segment.length >= 3) coherentSegments.push(segment);
          segment = [];
        }
        segment.push(entry);
      }
      if (segment.length >= 3) coherentSegments.push(segment);
    }
    const best = coherentSegments.sort(
      (left, right) =>
        right.length - left.length ||
        left[0].position.line - right[0].position.line
    )[0];
    if (best) {
      const areaLabel = stringValue(best[0].piece.payload, "area") ?? "Walking";
      const members = best.map(({ piece }) =>
        containmentMemberDecision({
          evidence: ["source_area", "source_order", "verified_geo"],
          observationById,
          piece,
        })
      );
      addDecision({
        callPolicy: "required",
        containerObservationIds: [],
        containerPieceId: null,
        containerTitle: `${areaLabel} walk`,
        date,
        decisionId: `containment-walk-${stableHash({
          area: normalizedComparable(areaLabel),
          date,
          members: members.map((member) => member.pieceId),
        })}`,
        members,
        relationType: "source_area_walk",
        rejections: [],
        source: "deterministic_containment",
      });
    }
  }

  // Source-free fallback: the old late grouping pass used to discover
  // verified same-site visits and area walks after identity. Keeping that
  // pass would leave two decision writers. Instead, run its evidence
  // calculation here, admit only participants that genuinely lack the
  // route-equivalent source-position trace, and freeze the result into this
  // non-mutating containment ledger. Grouping later only maps and executes.
  const sourceFreeProposals = createSourceFreeContainmentFallbackProposals({
    existingDecisions,
    missingDetails,
    observations,
    pieces,
  }).decisions;
  for (const proposal of sourceFreeProposals) {
    const proposalPieces = Array.from(
      new Set(
        proposal.candidateIds
          .map(candidatePiece)
          .filter((piece): piece is CanonicalEvidencePiece => Boolean(piece))
      )
    );
    if (
      proposalPieces.length < 2 ||
      proposalPieces.some(
        (piece) =>
          containmentSourcePosition(piece, observationById) !== null ||
          claimedPieceIds.has(piece.id)
      )
    ) {
      continue;
    }
    const sameSite = /^same-site visit:/i.test(proposal.claim);
    const walk = /^discovered walk:/i.test(proposal.claim);
    if (!sameSite && !walk) continue;
    const parent = sameSite
      ? candidatePiece(
          proposal.containerCandidateId ?? proposal.parentCandidateId
        )
      : null;
    if (sameSite && !parent) continue;
    const memberPieces = proposalPieces.filter(
      (piece) => !parent || piece !== parent
    );
    if (memberPieces.length < 2) continue;
    const membership = parent
      ? createSiteMembershipContext({
          candidates: memberPieces,
          container: parent,
          excludedContainerTokens,
          geocodeLaneRan,
        })
      : null;
    const members = memberPieces.map((piece) => {
      const evidence: ContainmentEvidenceKind[] = walk
        ? ["source_area", "source_order", "verified_geo"]
        : ["source_order"];
      if (membership) {
        if (membership.sourceHierarchyMember(piece)) {
          evidence.push("source_hierarchy");
        }
        if (membership.addressMember(piece)) {
          evidence.push("verified_address");
        } else if (membership.evidenceFor(piece) === "geo") {
          evidence.push("verified_geo");
        }
      }
      return containmentMemberDecision({ evidence, observationById, piece });
    });
    addDecision({
      callPolicy: proposal.callRequired === false ? "silent" : "required",
      containerObservationIds: parent ? [...parent.observationIds] : [],
      containerPieceId: parent?.id ?? null,
      containerTitle:
        stringValue(parent?.payload ?? {}, "title") ?? proposal.parentTitle,
      date:
        stringValue((parent ?? memberPieces[0]).payload, "date") ?? "",
      decisionId: `containment-${sameSite ? "site" : "walk"}-${stableHash({
        members: members.map((member) => member.pieceId),
        parent: parent?.id ?? null,
        proposal: proposal.decisionId,
      })}`,
      members,
      relationType: sameSite ? "same_site" : "source_area_walk",
      rejections: [],
      source: "deterministic_containment",
    });
  }

  return {
    doNotMerge: (left, right) =>
      ledger.doNotMerge(
        containmentParticipant(left),
        containmentParticipant(right)
      ),
    telemetry: ledger.telemetry(),
  };
}

function createSourceFreeContainmentFallbackProposals({
  existingDecisions = [],
  missingDetails,
  observations,
  pieces,
}: {
  existingDecisions?: CanonicalGroupingDecision[];
  missingDetails: unknown[];
  observations: EvidenceObservation[];
  pieces: CanonicalEvidencePiece[];
}): {
  decisions: CanonicalGroupingDecision[];
  telemetry: GroupingClaimLedgerTelemetry;
} {
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
  // Arc G.3b: lane contention is a LEDGER, not statement order. See
  // `grouping-claim-ledger.ts` for why the bare Set had to go.
  const ledger = createGroupingClaimLedger();
  const grouped = {
    has: (piece: CanonicalEvidencePiece) => ledger.isClaimed(piece.id),
  };
  const decisionById = new Map<string, CanonicalGroupingDecision>();
  // Everything needed to keep a same-site decision HONEST after it loses a
  // member: the maker-facing claim states counts, so a decision that
  // quietly drops a stop while still saying "3 stops" is a lie in the
  // product, not just a stale variable.
  type SiteDecisionState = {
    childCount: number;
    containerTitle: string;
    geoChildCount: number;
    // The radius that actually admitted the geo members. With the footprint
    // extension this is not always 300 m, and a call claiming "within 300 m"
    // about a stop 800 m out is a false statement to the maker.
    radiusMeters: number;
  };
  const siteDecisionState = new Map<string, SiteDecisionState>();
  // Address tokens that identify nothing: a Vienna address containing
  // "Vienna" is not evidence of containment.
  const tripCityTokens = tripCityAddressTokens(pieces);

  const sameSiteClaimText = (state: SiteDecisionState) => {
    const membershipClaim =
      state.geoChildCount === state.childCount
        ? `${state.childCount} stops sit inside ${state.containerTitle}'s grounds (within ${state.radiusMeters} m)`
        : state.geoChildCount === 0
          ? `the source lists ${state.childCount} stops inside ${state.containerTitle}'s own visit`
          : `${state.geoChildCount} stops sit inside ${state.containerTitle}'s grounds (within ${state.radiusMeters} m) and the source places ${state.childCount - state.geoChildCount} more inside the same visit`;
    return `same-site visit: ${membershipClaim}, so one visit card owns them`;
  };

  // A same-site visit can spare a proximity-only member as long as the
  // visit still owns two stops — the minimum that makes it a group at all.
  const contestable = (piece: CanonicalEvidencePiece) => {
    const held = ledger.claimFor(piece.id);
    if (!held) return true;
    return (
      held.strength === "geo" &&
      held.lane === "same_site" &&
      (siteDecisionState.get(held.decisionId)?.childCount ?? 0) - 1 >= 2
    );
  };

  // Contesting is genuinely two-phase. The walk lane may LOOK at a
  // proximity-only claim while choosing members (`contestable`), but
  // NOTHING is released until a walk is known to form. The earlier version
  // released inside the member filter, so a walk that then failed its
  // >=3-member test still ejected stops from a perfectly good site visit —
  // the exact silent consumption the ledger exists to prevent, with the
  // added insult of being caused by the fix.
  const planReleases = (walkers: CanonicalEvidencePiece[]) => {
    const pending = new Map<string, number>();
    const releasable: CanonicalEvidencePiece[] = [];
    for (const piece of walkers) {
      const held = ledger.claimFor(piece.id);
      if (!held) {
        releasable.push(piece);
        continue;
      }
      if (held.strength !== "geo" || held.lane !== "same_site") continue;
      const state = siteDecisionState.get(held.decisionId);
      if (!state) continue;
      const projected =
        state.childCount - (pending.get(held.decisionId) ?? 0) - 1;
      if (projected < 2) continue;
      pending.set(held.decisionId, (pending.get(held.decisionId) ?? 0) + 1);
      releasable.push(piece);
    }
    return releasable;
  };

  const commitRelease = (piece: CanonicalEvidencePiece) => {
    const held = ledger.claimFor(piece.id);
    if (!held) return true;
    const granted = ledger.contest({
      pieceId: piece.id,
      survivesWithout: (claim) =>
        claim.lane === "same_site" &&
        (siteDecisionState.get(claim.decisionId)?.childCount ?? 0) - 1 >= 2,
    });
    if (!granted) return false;
    const decision = decisionById.get(held.decisionId);
    const candidateId = candidateIdFor(piece);
    if (decision && candidateId) {
      decision.candidateIds = decision.candidateIds.filter(
        (value) => value !== candidateId
      );
    }
    const state = siteDecisionState.get(held.decisionId);
    if (state) {
      state.childCount = Math.max(0, state.childCount - 1);
      // Only a proximity-only member can be contested, so the geo count is
      // the one that drops — and the claim is rewritten to match.
      state.geoChildCount = Math.max(0, state.geoChildCount - 1);
      if (decision) decision.claim = sameSiteClaimText(state);
    }
    return true;
  };
  const geocodeLaneRan = groupingGeocodeLaneRan(pieces);
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
      // Arc G.3a: membership evidence comes from the shared context, so
      // this lane and the executor's re-verification can never drift apart
      // again. A booking-carrying stop is its own plan and is excluded
      // from the candidate pool before the site ever sees it.
      const candidatePool = dayPieces.filter(
        (piece) =>
          piece !== container &&
          !grouped.has(piece) &&
          !confirmationFrom(piece.payload)
      );
      const membership = createSiteMembershipContext({
        candidates: candidatePool,
        container,
        excludedContainerTokens: tripCityTokens,
        geocodeLaneRan,
      });
      const memberEvidence = new Map<
        CanonicalEvidencePiece,
        SiteMembershipEvidence
      >();
      for (const piece of candidatePool) {
        const childRawTitle = stringValue(piece.payload, "title");
        if (!childRawTitle) continue;
        const evidence = membership.evidenceFor(piece);
        if (!evidence) continue;
        // Live-run 7.21.0 (Gresham, 3rd appearance): a piece that is itself
        // a named site container (Buda Castle) is grouping structure in its
        // own right — it never joins ANOTHER site's visit by coordinates.
        // Source hierarchy still may place it inside one.
        if (
          evidence === "geo" &&
          SAME_SITE_CONTAINER_PATTERN.test(childRawTitle)
        ) {
          continue;
        }
        memberEvidence.set(piece, evidence);
      }
      const children = dayPieces.filter((piece) => memberEvidence.has(piece));
      if (children.length < 2) continue;

      const containerId = candidateIdFor(container);
      // Only children that actually made it into the decision count. The
      // ledger, the decision and the claim text must agree on ONE number —
      // counting `children` here while the decision carries `childIds` let
      // a visit "spare" a member it never had, and survive with one stop.
      const childEntries = children
        .map((child) => ({ child, candidateId: candidateIdFor(child) }))
        .filter(
          (entry): entry is {
            child: CanonicalEvidencePiece;
            candidateId: string;
          } => Boolean(entry.candidateId)
        );
      if (!containerId || childEntries.length < 2) continue;

      // Call claims state the actual rule that fired (doctrine v3). A geo
      // child is one admitted by the radius path (verified-only when the
      // lane ran).
      const state: SiteDecisionState = {
        childCount: childEntries.length,
        containerTitle,
        geoChildCount: childEntries.filter(
          (entry) => memberEvidence.get(entry.child) === "geo"
        ).length,
        radiusMeters: Math.round(membership.footprintKm * 1000),
      };

      // The container's own candidate id is part of the key: two same-named
      // containers on one date used to collide on `decisionId`, leaving the
      // second one's state to overwrite the first's while both decisions
      // shipped.
      const decisionId = `deterministic-site-${stableHash({ containerId, date, title: containerTitle })}`;
      const decision: CanonicalGroupingDecision = {
        callRequired: true,
        candidateIds: [containerId, ...childEntries.map((entry) => entry.candidateId)],
        claim: sameSiteClaimText(state),
        containerCandidateId: containerId,
        decisionId,
        parentCandidateId: containerId,
        parentTitle: `${containerTitle} visit`,
        source: "canonical_resolver",
        verificationPolicy: "strict_verified_coordinates",
      };
      decisions.push(decision);
      decisionById.set(decisionId, decision);
      siteDecisionState.set(decisionId, state);
      // The claim is recorded WITH ITS STRENGTH. A stop the source or the
      // geocoder places inside this site is not contestable; a stop that
      // merely fell inside the radius can be released to the walk lane if
      // this visit can spare it.
      ledger.claim({
        decisionId,
        entries: [
          { pieceId: container.id, strength: "hierarchy" },
          ...childEntries.map((entry) => ({
            pieceId: entry.child.id,
            strength: memberEvidence.get(entry.child) ?? "geo",
          })),
        ],
        lane: "same_site",
      });
    }

    // DISCOVERED WALK: at most one per day, crowded unsequenced days only.
    const visibleCount = dayPieces.length;
    if (visibleCount <= CROWDED_DAY_VISIBLE_CARDS) continue;
    if ((timedCounts.get(date) ?? 0) >= 3) continue;

    const walkers = located.filter((piece) => {
      // Arc G.3b: a piece another lane holds is not automatically out of
      // reach — a proximity-only claim the holder can spare is contestable.
      // Nothing is released here; this only decides who may be considered.
      if (grouped.has(piece) && !contestable(piece)) return false;
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
      if (pieceIsSourceNarratedRouteStop(piece)) {
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

    // The walk has been chosen. Plan the releases WITHOUT mutating
    // anything, and only commit them if a walk still forms — otherwise a
    // walk that fails its own three-member test would have ejected stops
    // from a perfectly good site visit on the way out.
    // Every guard that can still kill the walk runs BEFORE any release is
    // committed — including the candidate-id filter. A walk that dies at
    // its last check must not have taken stops out of a healthy site visit
    // on the way, which is the whole point of the plan/commit split.
    const plannedMembers = planReleases(bestWalk).filter((piece) =>
      Boolean(candidateIdFor(piece))
    );
    if (plannedMembers.length < 3) continue;
    const walkMembers = plannedMembers.filter((piece) => commitRelease(piece));
    if (walkMembers.length < 3) continue;

    const walkIds = walkMembers
      .map(candidateIdFor)
      .filter((value): value is string => Boolean(value));
    const areaLabel = stringValue(walkMembers[0].payload, "area") ?? "Walking";

    const walkDecisionId = `deterministic-walk-${stableHash({ areaLabel, date })}`;
    const walkDecision: CanonicalGroupingDecision = {
      callRequired: true,
      candidateIds: walkIds,
      claim: `discovered walk: this day has ${visibleCount} cards, and ${walkIds.length} untimed sights sit within a 15-minute walk in ${areaLabel}, so they read cleaner as one route`,
      containerCandidateId: null,
      decisionId: walkDecisionId,
      parentCandidateId: walkIds[0],
      parentTitle: `${areaLabel} walk`,
      source: "canonical_resolver",
      verificationPolicy: "strict_verified_coordinates",
    };
    decisions.push(walkDecision);
    decisionById.set(walkDecisionId, walkDecision);
    ledger.claim({
      decisionId: walkDecisionId,
      entries: walkMembers.map((piece) => ({
        pieceId: piece.id,
        strength: "geo" as const,
      })),
      lane: "walk",
    });
  }

  // A same-site decision that lost members to a contest can fall below the
  // two-stop minimum. Drop it and release what it still holds, so the
  // ledger never reports a claim behind a group that will not exist.
  const survivingDecisions = decisions.filter((decision) => {
    const decisionId = decision.decisionId;
    if (!decisionId) return true;
    const state = siteDecisionState.get(decisionId);
    if (!state) return true;
    if (state.childCount >= 2) return true;
    ledger.releaseDecision(decisionId);
    return false;
  });

  return {
    decisions: survivingDecisions,
    telemetry: ledger.telemetry(),
  };
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
    if (!date || !title) continue;
    if (titleMatchesQuestionSubject(questionSubjects, title)) continue;
    // Run7 PC-1: the day's own heading commits the entity ("Lesser Town &
    // Prague Castle" names the castle) — never a researched idea.
    if (pieceNamedInDayHeading(piece)) continue;
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
    // Review consumes the authoritative role; it may not turn an audited or
    // source-plan block into ideas merely because the parser also captured
    // prices/hours. Albertina is the production-shaped guard for this
    // boundary.
    if (authoritativeActivityCommitment(piece) !== "none") continue;
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
      // City preservation before the date-null used to be patched in
      // locally here (normalizedComparable'd, so it also mis-cased the
      // stamped city — e.g. "vienna" instead of "Vienna" on the final note
      // title). demoteCanonicalPieceToCityNote now does this itself, with
      // proper display casing, for every call site (B7 fix, 2026-08-04).
      demoteCanonicalPieceToCityNote(
        piece,
        "held as a city idea pending the maker's planned-or-ideas answer",
        pieces
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

type AmbiguousIntentHomeDecision = {
  blockDecisionId: string;
  decisionId: string;
  finalHome: "city_note";
  originalDate: string | null;
  pieceId: string;
  reasonCode: "unresolved_ambiguous_to_city_note";
  title: string | null;
};

// Review is the terminal owner of an unresolved intent block. Classification
// keeps an ambiguous candidate structurally available long enough for frozen
// containment and identity ledgers to map it; grouping may consume only that
// licensed structure. Once those ledgers have run, an ungrouped, uncommitted
// candidate cannot ship as a speculative Activity. Its reversible home is the
// City Note. Researched candidates already handled above retain their one
// consolidated question; this pass closes every remaining ambiguous home.
function finalizeAmbiguousIntentHomes(
  pieces: CanonicalEvidencePiece[]
): AmbiguousIntentHomeDecision[] {
  const decisions: AmbiguousIntentHomeDecision[] = [];
  for (const piece of pieces) {
    if (
      !piece.outputEligible ||
      piece.kind !== "activity" ||
      piece.payload._canonicalGroupRole === "parent" ||
      piece.payload._canonicalGroupRole === "child"
    ) {
      continue;
    }
    const candidacy = canonicalCandidacyDecision(piece);
    if (stringValue(candidacy, "reasonCode") !== "BLOCK_AMBIGUOUS") {
      continue;
    }
    if (candidacy.hasAuditedCommitment === true) continue;
    const blockDecisionId = stringValue(candidacy, "blockDecisionId");
    if (!blockDecisionId) continue;
    const originalDate = stringValue(piece.payload, "date");
    const title = stringValue(piece.payload, "title");
    demoteCanonicalPieceToCityNote(
      piece,
      `review finalized unresolved intent block ${blockDecisionId} to its reversible City Note home after grouping consumed the frozen ledgers`,
      pieces
    );
    decisions.push({
      blockDecisionId,
      decisionId: `ambiguous-home-${stableHash({
        blockDecisionId,
        pieceId: piece.id,
        version: 1,
      })}`,
      finalHome: "city_note",
      originalDate,
      pieceId: piece.id,
      reasonCode: "unresolved_ambiguous_to_city_note",
      title,
    });
  }
  return decisions;
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
  const tripCities = observations
    .filter((observation) => observation.kind === "place")
    .map((observation) => stringValue(observation.payload, "city"));

  const stampObservationDecision = (
    observation: EvidenceObservation,
    decision: ActivityCandidacyDecision
  ) => {
    observation.payload._canonicalIntakeCandidacyDecision = {
      ...decision,
      decisionId: `candidacy_${stableHash({
        inputEvidenceRole: stringValue(observation.payload, "evidenceRole"),
        inputItemType: stringValue(observation.payload, "itemType"),
        observationId: observation.id,
        version: 1,
      })}`,
      inputEvidenceRole: stringValue(observation.payload, "evidenceRole"),
      inputItemType: stringValue(observation.payload, "itemType"),
      version: 1,
    };
    observation.payload.evidenceRole = decision.evidenceRole;
    observation.role = decision.evidenceRole;
    observation.kind =
      decision.destination === "activity"
        ? "activity"
        : decision.destination === "city_note"
          ? "note"
          : "context";
  };

  for (const observation of observations) {
    // Explicit entries split from a source-authored City Note collection are
    // already atomic note facts. They are not fresh resolver candidates: the
    // copied parent metadata can still say `keep_activity`, but allowing that
    // stale parent decision to promote each comma-separated entry creates
    // standalone note records with guessed dates/cities. Source
    // normalization owns this boundary once and preserves the entry lane.
    if (observation.payload._canonicalNoteEntry === true) {
      stampObservationDecision(
        observation,
        activityCandidacyDecisionForPayload(observation.payload, {
          evidenceRole: "city_note_candidate",
        })
      );
      continue;
    }
    const intakeDecision = asRecord(
      observation.payload._canonicalIntakeCandidacyDecision
    );
    const inputEvidenceRole = stringValue(
      intakeDecision,
      "inputEvidenceRole"
    );
    const inputItemType = stringValue(intakeDecision, "inputItemType");
    const resolverKeepRefusedByInput = Boolean(
      inputEvidenceRole === "accessory_detail" ||
        inputEvidenceRole === "city_note_candidate" ||
        inputEvidenceRole === "context" ||
        inputEvidenceRole === "rejected" ||
        inputItemType === "note" ||
        /^(?:admin|administrative|accessory|evidence|logistics|receipt|ticket_detail)$/i.test(
          inputItemType ?? ""
        )
    );
    const approvedGrouping = Array.isArray(
      observation.payload._canonicalGroupingDecisionIds
    ) && observation.payload._canonicalGroupingDecisionIds.length > 0;
    const approvedKeepActivity =
      observation.payload._canonicalRoleDecision === "keep_activity" &&
      !resolverKeepRefusedByInput;
    const approvedCityNote =
      observation.payload._canonicalRoleDecision === "city_note";

    if (approvedKeepActivity || approvedCityNote) {
      stampObservationDecision(
        observation,
        activityCandidacyDecisionForPayload(observation.payload, {
          evidenceRole: approvedKeepActivity
            ? (stringValue(
                asRecord(
                  observation.payload._canonicalIntakeCandidacyDecision
                ),
                "inputEvidenceRole"
              ) as EvidenceRole | null)
            : "city_note_candidate",
          hasAuditedCommitment: approvedKeepActivity,
        })
      );
      continue;
    }

    if (
      (observation.role === "grouping_proposal" ||
        inputEvidenceRole === "grouping_proposal") &&
      !approvedGrouping
    ) {
      // A grouping proposal whose group never formed is normally redundant
      // structure, and demoting it is what keeps "Explore Vienna" and bare
      // day/route headings out of the traveler's day. A NAMED SITE container
      // is not a heading: it is a real dated place, and demoting it deletes
      // both the card AND the anchor any open decision on it hangs from.
      //
      // Run 2, VERIFIED from the pinned parse (2026-07-31): the model emitted
      // "Prague Castle visit" and "Prague castle" as `grouping_proposal`, both
      // `date: 2019-01-16`, both `sourceSectionType: dated_itinerary`, section
      // label "Wednesday, January 16th". The model was RIGHT — the parser
      // prompt's own grouping-proposal rule asks for exactly that shape. No
      // group formed (the geocode lane could not place the children), so this
      // branch converted BOTH to context, the Jan-16 castle card vanished, and
      // `recoverMissingNamedEvidence` then synthesized an UNDATED placeholder
      // for the orphaned ticket question — which in turn left Jan 16 with zero
      // containers, which is the entirety of `retryCount: 0`. One line, four
      // downstream symptoms. The earlier hypothesis that the model mis-filed
      // the castle as notes is FALSIFIED by the parse.
      //
      // Eli, 2026-07-28: a named site container carrying an unresolved
      // decision survives as a DATED CARD *and* raises the question — not one
      // or the other (RW-GRP-001, "grouping cannot swallow unresolved source
      // decisions"; RW-PLC-001, no dateless stranding).
      //
      // The rescue is deliberately narrow, because this branch is load-bearing
      // against day-heading cards. It requires (a) the SHARED site-container
      // noun — the same `SAME_SITE_CONTAINER_PATTERN` grouping itself uses, so
      // the two can never diverge, and the same guard the generic-container
      // demotion below already honors — and (b) a real date, since an undated
      // survivor is the defect being fixed, not the fix. Heading fragments are
      // already demoted upstream by parser-artifact normalization
      // (`heading_fragment_card`), so this does not need to re-judge them.
      const containerTitle = stringValue(observation.payload, "title");
      if (
        observation.kind === "activity" &&
        containerTitle &&
        stringValue(observation.payload, "date") &&
        SAME_SITE_CONTAINER_PATTERN.test(containerTitle)
      ) {
        stampObservationDecision(
          observation,
          activityCandidacyDecisionForPayload(observation.payload, {
            evidenceRole: "atomic_candidate",
            hasAuditedCommitment: true,
          })
        );
        continue;
      }
      observation.payload._canonicalSourceContainer = true;
      stampObservationDecision(
        observation,
        activityCandidacyDecisionForPayload(observation.payload, {
          evidenceRole: "grouping_proposal",
          isGenericOverview: true,
        })
      );
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
    const genericDayArc = isDayArcTitle(
      input.title,
      tripCityTokenSet(tripCities)
    );

    if (
      mentionedChildren.length >= 2 ||
      ((containerTitle || genericDayArc) && mentionedChildren.length >= 1)
    ) {
      observation.payload._canonicalSourceContainer = true;
      stampObservationDecision(
        observation,
        activityCandidacyDecisionForPayload(observation.payload, {
          isGenericOverview: true,
        })
      );
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
  sensitiveDetails = [],
  sourceTransportAnchors = [],
  tripYear = null,
}: {
  pieces: CanonicalEvidencePiece[];
  sensitiveDetails?: unknown[];
  // Arc G.2: the retry lane re-runs the transport repair so a row the
  // accessory router touches on the way through cannot re-acquire an
  // impossible endpoint. Absent anchors the pass is still safe — an
  // already-repaired row presents no defect and it is a no-op.
  sourceTransportAnchors?: SourceTransportAnchor[];
  tripYear?: number | null;
}) {
  const pieces = structuredClone(inputPieces);
  const before = JSON.stringify(pieces);

  enforceCanonicalOutputActivityRoles(
    stampedIntentDecisionsFromPieces(pieces)
  );
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
  // The retry lane cannot mint Questions — dispositions and the identity
  // manifest are already stamped — so a value it CLEARS would otherwise
  // disappear with nobody told. It is reported instead, and the route
  // records it as a recovery action.
  const retryTransportRepairs = applyCanonicalTransportFieldRepair({
    anchors: sourceTransportAnchors,
    pieces,
  }).repairs;
  // Arc F.2 C4 (run 7.24.1 chains D/E, step-0 trace): this retry is the
  // ONE post-sweep payload mutation point in the live route — the
  // accessory router re-runs here (attaching/removing prose) AFTER
  // scrubProtectedValuesFromPublicProse already ran at cluster time, and
  // any change makes the assembly corridor detect a draft/pieces payload
  // mismatch and REBUILD every public output from these payloads
  // (`rebuilt_canonical_outputs_from_evidence` — the 7.24.1 "repaired"
  // trigger, initialViolations naming exactly the router-touched note
  // pieces). Re-running the sweep here restores T1's invariant — the
  // sweep is the last text mutation before outputs are composed — for
  // the retry lane too: the rebuild then regenerates from RE-SWEPT
  // payloads and swept lanes can never un-sweep themselves at
  // finalization (the e0f1db42 mine class, route level). Idempotent on
  // an unchanged clone: `changed` stays false when the router did
  // nothing.
  scrubProtectedValuesFromPublicProse(pieces, sensitiveDetails);

  return {
    changed: JSON.stringify(pieces) !== before,
    pieces,
    transportFieldRepairs: retryTransportRepairs,
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
    // Arc E (live-run 7.23.0): a merge refreshed the subject's id after the
    // question bound to it. The prior-id trail forwards the subject to the
    // same entity's current piece — identity forwarding, never title
    // similarity (RW-QUE-001).
    const forwarded = pieces.find(
      (piece) =>
        piece.outputEligible &&
        Array.isArray(piece.payload._canonicalPriorPieceIds) &&
        (piece.payload._canonicalPriorPieceIds as unknown[]).includes(
          relatedCanonicalPieceId
        )
    );
    if (forwarded) return forwarded;
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

  const relatedTitleValue = stringValue(detail, "relatedTitle");
  const relatedTitle = identityTokens(relatedTitleValue);
  const subjectType = normalizedComparable(detail.subjectType);
  const expectedKind =
    subjectType === "item" ? "activity" :
      subjectType === "stay" ? "stay" :
        subjectType === "transport" ? "transport" :
          subjectType === "leg" ? "place" : null;

  if (relatedTitle.length === 0) {
    return null;
  }

  // Exact canonical identity wins before token-overlap ranking. In the
  // pinned 8.1.0 parse, "Prague Castle visit" tied with several castle
  // sub-stops once descriptions were included, even though one surviving
  // card carried the review detail's exact title. Treating that as an
  // orphan manufactured a placeholder instead of binding the real card.
  const exactTitleMatches = pieces.filter(
    (piece) =>
      piece.outputEligible &&
      (!expectedKind || piece.kind === expectedKind) &&
      normalizedComparable(piece.payload.title) ===
        normalizedComparable(relatedTitleValue)
  );
  if (exactTitleMatches.length === 1) return exactTitleMatches[0];

  // A source review detail may omit a harmless suffix (the live pair is
  // "Prague Castle" → "Prague Castle visit"). Resolve that only when one
  // eligible title contains every subject token. Description mentions do
  // not participate: a castle sub-stop may mention its parent without
  // becoming the ticket Question's subject.
  const titleContainmentMatches = pieces.filter((piece) => {
    if (
      !piece.outputEligible ||
      (expectedKind && piece.kind !== expectedKind)
    ) {
      return false;
    }
    const titleTokens = identityTokens(
      [piece.payload.title, piece.payload.name].filter(Boolean).join(" ")
    );
    return overlapCount(relatedTitle, titleTokens) === relatedTitle.length;
  });
  if (titleContainmentMatches.length === 1) {
    return titleContainmentMatches[0];
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

function isUnboundNamedSourceCoverageFinding(
  detail: Record<string, unknown>,
  piece: CanonicalEvidencePiece | null,
  isOriginalRecoveryCandidate: boolean
) {
  if (
    !isOriginalRecoveryCandidate ||
    piece ||
    stringValue(detail, "relatedCanonicalPieceId") ||
    normalizedComparable(detail.subjectType) !== "item"
  ) {
    return false;
  }

  const relatedTitle = stringValue(detail, "relatedTitle");
  if (!relatedTitle) return false;

  const relatedDate = normalizeTripDate(relatedTitle, null);
  const nonEntityTitle =
    Boolean(relatedDate) &&
      /^(?:\d{1,2}[.]\d{1,2}[.]\d{4}|(?:19|20)\d{2}-\d{1,2}-\d{1,2})(?:\s+(?:details?|information|note|notes))?$/i.test(
        relatedTitle.trim()
      ) ||
    /^(?:booking|details?|information|note|notes|reservation)$/i.test(
      relatedTitle.trim()
    );
  if (nonEntityTitle) return false;

  const evidence = stringValue(detail, "evidence");
  const reason = stringValue(detail, "reason");
  return /\b(source|document|itinerary|pdf|lists?|says?|states?|shows?)\b/.test(
    normalizeText([evidence, reason].filter(Boolean).join(" "))
  );
}

export function canonicalizeCanonicalReviewDetails(
  details: unknown[],
  pieces: CanonicalEvidencePiece[],
  tripOverview: unknown = {},
  sourceCoverageCandidates: unknown[] = []
) {
  // Review policy must run on FINAL canonical identity. Parser details cannot
  // carry the internal disposition field, and merge-rekeying must happen
  // before subject resolution, so both initial assembly and rebuilds enter the
  // same deterministic path here.
  rekeyReviewSubjectsThroughPriorIds(details, pieces);
  const sourceCoverageCandidateSet = new Set(sourceCoverageCandidates);
  const subjectResolved: Record<string, unknown>[] = details.map((value) => {
    const detail = asRecord(value);
    const piece = pieceForMissingDetail(detail, pieces);
    // RW-PLC-001: a named source item that is still absent after final
    // subject resolution is a source-coverage finding, never a synthesized
    // traveler card. This check deliberately runs here, after every
    // canonical piece has had a chance to survive and bind the review item.
    const sourceCoverageFinding = isUnboundNamedSourceCoverageFinding(
      detail,
      piece,
      sourceCoverageCandidateSet.has(value)
    );
    const reviewText = normalizeText(reviewDetailText(detail));
    const internalTrace =
      /\b(source anchor|source anchors|source-anchor|source backed repair|repaired from source|repaired using source|audit diagnostic|lineage|ocr|qa bundle|duplicate suppression|routine assembly)\b/.test(
        reviewText
      );
    const disposition =
      internalTrace
        ? "dismissed"
        : sourceCoverageFinding
        ? "dismissed"
        : // An explicit dismissal (question gate v2, run7) survives
          // canonicalization — the resolverDecisionId fallback below used
          // to reclassify gated dismissals as calls.
          stringValue(detail, "_canonicalReviewDisposition") === "dismissed"
        ? "dismissed"
        : stringValue(detail, "_canonicalReviewDisposition") === "question"
        ? "question"
        : stringValue(detail, "_canonicalReviewDisposition") === "call" ||
      stringValue(detail, "resolverDecisionId")
        ? "call"
        : "question";

    // Arc E (live-run 7.23.0, dark-factory totality): a subject id that
    // matches NO live piece — after prior-id forwarding — is a dead
    // target. It is dismissed here, at the same boundary that resolves
    // subjects, so the finalization invariant ("targets missing canonical
    // identity") is unreachable by construction: every rebuild passes
    // through this function. A question cannot outlive its subject; it
    // also cannot kill a usable draft (AGENTS.md binding rule).
    const relatedId = piece?.id ?? stringValue(detail, "relatedCanonicalPieceId");
    // Run 7.23.1 (assembly-recovery-required, trip cc2cd30f): the original
    // dead-target test required the subject id to match NO piece at all —
    // a subject piece that still EXISTS but lost output eligibility (a
    // fold suppressed its card after the question was minted) kept its id
    // in the draft while the projection, which only knows output records,
    // resolved the same question to the trip ("missingDetails[3] changed
    // canonical subject piece_2a10274a… to <tripId>") — a draft/projection
    // disagreement the compile invariant rightly refuses. The rebuild path
    // runs only this function (not the question gate's eligibility sweep),
    // so the rule lives here: if the subject cannot be resolved to an
    // OUTPUT-ELIGIBLE piece — directly or through the prior-id trail — the
    // item is dismissed and unbound, in the draft, so draft and projection
    // agree by construction. A question cannot outlive its subject
    // (RW-QUE-001); it also cannot kill a usable draft (dark-factory
    // clause: identity defects after a usable parse are internal recovery
    // work, never a technical recovery state).
    const unresolvedRelated =
      !piece && typeof relatedId === "string" && relatedId.length > 0;
    // Three coherent outcomes for an unresolvable subject, none of which
    // may stop the run (dark-factory clause):
    //  - QUESTIONS die with their subject: dismissed + unbound.
    //  - SOURCE-UPDATE calls (cancellation/replacement) legitimately
    //    narrate a removal ("We left out X — cancelled"): kept as calls,
    //    unbound to trip level so draft and projection agree (7.23.1).
    //  - other calls (presentation/grouping) keep their original id so the
    //    run7 stale-call filter downstream can see the dead subject and
    //    drop them before projection, exactly as before.
    const sourceUpdateCall =
      disposition === "call" &&
      stringValue(detail, "targetField") === "source_update";
    const unresolvedSubject =
      unresolvedRelated && (disposition !== "call" || sourceUpdateCall);
    const deadTarget = unresolvedSubject && disposition !== "call";

    // Arc F.3 (run 7.25.0 chain C): the review-surface identity gate. It runs
    // HERE, inside subject resolution, for three reasons:
    //  - this function is the boundary EVERY build and every rebuild passes
    //    through (the Arc E dead-target rule lives here for the same reason),
    //    so the gate cannot be bypassed by the retry/rebuild lane;
    //  - it runs AFTER `pieceForMissingDetail` above, so scrubbing
    //    `relatedTitle` can never disturb subject binding;
    //  - identity scrubbing must happen before the general Question gate below
    //    so subject binding never depends on scrubbed prose and the dedicated
    //    identity dismissal reason remains authoritative.
    // Dismissal is in place: the record and its reason stay auditable and the
    // projection still emits a matching review record, so the compile
    // invariant at draft-to-structured-trip.ts:846 holds. Nothing here can
    // fail a run (Eli's standing do-not-block directive).
    // The legacy evidence scrub runs FIRST and keeps its behavior: it turns
    // an email or a long digit run into an informative
    // "[private contact removed]" marker. The shared identity pass then runs
    // over what remains, so this change is strictly ADDITIVE — it catches the
    // shapes the private copy misses (the colon-less "Customer Eli kamerow"
    // block that identity-prose.ts documents as the 7.18.3 leak, and postal
    // home addresses) without deleting sentences the marker already made safe.
    const markerScrubbedEvidence = scrubReviewEvidence(detail.evidence);
    const identityGate = applyReviewIdentityGate({
      evidence:
        typeof markerScrubbedEvidence === "string" ? markerScrubbedEvidence : null,
      guessedValue: stringValue(detail, "guessedValue"),
      prompt: stringValue(detail, "prompt"),
      reason: stringValue(detail, "reason"),
      relatedTitle: stringValue(detail, "relatedTitle"),
      targetField: stringValue(detail, "targetField"),
    });
    // Only a QUESTION is dismissed for soliciting identity data. A Call is a
    // statement, not an ask (RW-REV-001), so it keeps its disposition and
    // only loses the identity value from its wording.
    const identityDismissed =
      !deadTarget &&
      disposition === "question" &&
      identityGate.dismissalReason !== null;

    return {
      ...detail,
      ...identityGate.scrubbed,
      _canonicalReviewDisposition:
        deadTarget || identityDismissed ? "dismissed" : disposition,
      ...(deadTarget
        ? {
            _canonicalQuestionGate:
              "subject entity no longer exists after assembly; a review item cannot outlive its subject",
          }
        : sourceCoverageFinding
        ? {
            _canonicalQuestionGate:
              "source coverage: named item was never extracted into a canonical subject; no placeholder was synthesized",
            _canonicalSourceCoverageFinding: "named_item_not_extracted",
          }
        : identityDismissed
        ? { _canonicalQuestionGate: identityGate.dismissalReason }
        : {}),
      ...(identityGate.removedSignals.length > 0
        ? {
            // Signal SHAPES only, never values — safe in redacted QA bundles
            // (RW-AUD-001 posture, matching the card-lane suppression reason).
            _canonicalReviewIdentitySignals: identityGate.removedSignals,
          }
        : {}),
      ...(unresolvedSubject
        ? {
            // The dead id is unbound (draft and projection must agree the
            // subject is now the trip) but stays auditable in place.
            _canonicalDeadSubjectId: relatedId,
          }
        : {}),
      evidence:
        identityGate.scrubbed.evidence !== undefined
          ? identityGate.scrubbed.evidence
          : markerScrubbedEvidence,
      relatedCanonicalPieceId:
        unresolvedSubject || sourceCoverageFinding ? null : relatedId,
      subjectType: unresolvedSubject || sourceCoverageFinding
        ? "trip"
        : piece
        ? canonicalReviewSubjectType(piece)
        : detail.subjectType ?? "trip",
    };
  });
  // Question gate v2 runs only after every parser-shaped detail has a
  // canonical subject and disposition. Dismissals remain in `subjectResolved`
  // with `_canonicalQuestionGate`, so later reconciliation cannot turn a
  // correct maker-facing verdict into an unauditable disappearance.
  gateOffContractQuestions(subjectResolved, pieces);
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
  const stageWriterTrace: AssemblyStageWriterTraceEntry[] = [];
  const runStageWriter = <T>({
    after,
    before,
    changedPieceCount = () => null,
    decisionDomain,
    writer,
    writes,
  }: {
    after: () => string;
    before: () => string;
    changedPieceCount?: () => number | null;
    decisionDomain: AssemblyStageWriterTraceEntry["decisionDomain"];
    writer: string;
    writes: string[];
  }, execute: () => T): T => {
    const beforeHash = before();
    const result = execute();
    const afterHash = after();
    stageWriterTrace.push({
      afterHash,
      beforeHash,
      changed: beforeHash !== afterHash,
      changedPieceCount: changedPieceCount(),
      decisionDomain,
      ordinal: stageWriterTrace.length + 1,
      writer,
      writes,
    });
    return result;
  };
  // Wave-2 parser pass: deterministic repair of known parser artifact
  // families (degenerate times, provider text-bleed, day-title cards,
  // cost-line cards, split disjunctions, ticket-page re-emissions) BEFORE
  // observations are created, with every repair recorded for telemetry.
  let normalizedStageHash = stableHash(stages);
  const parserNormalization = runStageWriter(
    {
      after: () => normalizedStageHash,
      before: () => stableHash(stages),
      decisionDomain: "source_normalization",
      writer: "normalizeParserStageArtifacts",
      writes: ["normalizedStages", "parserArtifactRepairs"],
    },
    () => {
      const normalized = normalizeParserStageArtifacts(stages);
      normalizedStageHash = stableHash(normalized.stages);
      return normalized;
    }
  );
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
        // Arc E: deterministic verbatim-evidence injection runs at intake,
        // BEFORE observations exist, so own-text hedge/commitment stamping
        // judges the source's own words even when the model nulls the
        // schema-required evidence field (run 7.22.4: 0/140 rows carried
        // evidence and Prague Castle doubt-demoted on an absorbed R2D2
        // fragment).
        if (collection === "activities") {
          injectVerbatimActivityEvidence(
            payload,
            stageInput.sourceText ?? null
          );
        }
        ordinal += 1;
        const intakeDecision =
          collection === "activities"
            ? activityCandidacyDecisionForPayload(
                payload,
                hasSourceBackedIntakeCommitment(payload)
                  ? { hasAuditedCommitment: true }
                  : {}
              )
            : null;
        if (intakeDecision) {
          const originalInputs = originalActivityCandidacyInputs(payload);
          const inputEvidenceRole = originalInputs.evidenceRole;
          const inputItemType = originalInputs.itemType;
          payload._canonicalIntakeCandidacyDecision = {
            ...intakeDecision,
            decisionId: `candidacy_${stableHash({
              inputEvidenceRole,
              inputItemType,
              resolverCandidateId: stringValue(
                payload,
                "_resolverCandidateId"
              ),
              sourceLabel: stageInput.label,
              version: 1,
            })}`,
            inputEvidenceRole,
            inputItemType,
            version: 1,
          };
          payload.evidenceRole = intakeDecision.evidenceRole;
        }
        const kind = intakeDecision
          ? intakeDecision.destination === "activity"
            ? "activity"
            : intakeDecision.destination === "city_note"
              ? "note"
              : "context"
          : defaultKind;
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
        } else {
          const role =
            intakeDecision?.evidenceRole ??
            evidenceRoleFromPayload(payload, kind);
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
        if (collection === "activities") {
          for (const clausePayload of splitExplicitPlanFromHedgedReference(
            payload
          )) {
            ordinal += 1;
            const hasAuditedCommitment =
              clausePayload._canonicalClauseRole === "explicit_plan";
            const clauseDecision = activityCandidacyDecisionForPayload(
              clausePayload,
              { hasAuditedCommitment }
            );
            const inputEvidenceRole = stringValue(
              clausePayload,
              "evidenceRole"
            );
            const inputItemType = stringValue(clausePayload, "itemType");
            clausePayload._canonicalIntakeCandidacyDecision = {
              ...clauseDecision,
              decisionId: `candidacy_${stableHash({
                clauseRole: clausePayload._canonicalClauseRole,
                inputEvidenceRole,
                inputItemType,
                sourceLabel: stageInput.label,
                version: 1,
              })}`,
              inputEvidenceRole,
              inputItemType,
              version: 1,
            };
            pushUniqueObservation(
              observations,
              createObservation({
                kind:
                  clauseDecision.destination === "activity"
                    ? "activity"
                    : clauseDecision.destination === "city_note"
                      ? "note"
                      : "context",
                ordinal,
                payload: clausePayload,
                role: clauseDecision.evidenceRole,
                source: stageInput.source,
                sourceFilename:
                  stringValue(payload, "sourceFilename") ??
                  stageInput.sourceFilename ??
                  null,
                sourceLabel: stageInput.label,
                sourceProvenance: stageInput.sourceProvenance ?? null,
                sourceStructure: sourceStructureFromPayload(clausePayload),
                sourceUploadId: stageInput.sourceUploadId ?? null,
              })
            );
          }
        }
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

  let observationHashBefore = stableHash(observations);
  runStageWriter(
    {
      after: () => stableHash(observations),
      before: () => observationHashBefore,
      decisionDomain: "source_normalization",
      writer: "reclassifySourceContainers",
      writes: ["observations[].kind", "observations[].role"],
    },
    () => reclassifySourceContainers(observations)
  );

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

  let pieceHashesBefore = new Map<string, string>();
  const pieceStateHash = () => stableHash({ missingDetails, observations, pieces });
  const runPieceWriter = <T>(
    decisionDomain: AssemblyStageWriterTraceEntry["decisionDomain"],
    writer: string,
    writes: string[],
    execute: () => T
  ) =>
    runStageWriter(
      {
        after: pieceStateHash,
        before: () => {
          pieceHashesBefore = new Map(
            pieces.map((piece) => [piece.id, stableHash(piece)])
          );
          return pieceStateHash();
        },
        changedPieceCount: () => {
          const currentIds = new Set(pieces.map((piece) => piece.id));
          const changedExisting = pieces.filter(
            (piece) => pieceHashesBefore.get(piece.id) !== stableHash(piece)
          ).length;
          const removed = [...pieceHashesBefore.keys()].filter(
            (id) => !currentIds.has(id)
          ).length;
          return changedExisting + removed;
        },
        decisionDomain,
        writer,
        writes,
      },
      execute
    );

  // Arc F (run 7.23.2 chain 4, tripwire T4): the Costs exclusion is a
  // CANDIDACY rule, not a producer patch. ddb1699 excluded Costs lines
  // from recovery batching and that path held — but the same Costs line
  // re-emitted as a model_chunk admin activity shipped as the "Vienna
  // lodging cost" card. Any activity/note candidate whose source section
  // is a Costs heading, or whose own line matches the shared
  // planning-cost shapes, fails candidacy at piece creation — BEFORE all
  // reconciliation, so reconcileCardsAgainstCityNotes still sees original
  // note lists. Negative controls stay with the shared predicate: stay
  // costs due on arrival, HUF prose, and priced venue/idea lines are
  // deliberately not planning-cost shapes.
  runPieceWriter(
    "pre_classification_mutation",
    "applyPlanningCostCandidacyGate",
    ["pieces[].outputEligible", "pieces[].disposition"],
    () => {
      for (const piece of pieces) {
        // Intake stamps this only on parser Activity candidates. The shared
        // candidacy decision may already have routed an admin-shaped row to
        // context; Costs exclusion must still be path-independent and must
        // not accidentally widen to real stay/transport/place records.
        if (
          !stringValue(
            asRecord(piece.payload._canonicalIntakeCandidacyDecision),
            "decisionId"
          )
        ) {
          continue;
        }
        if (
          isPlanningCostMaterial({
            label: stringValue(piece.payload, "sourceSectionLabel"),
            lines: [
              stringValue(piece.payload, "evidence"),
              stringValue(piece.payload, "title"),
              stringValue(piece.payload, "description"),
            ],
          })
        ) {
          // Terminal (planning-cost material family, its exact namesake): a
          // Costs-section line was never a candidate for card content, so
          // there is no absorbing record — the exclusion is path-independent,
          // per the comment above.
          suppressCanonicalPiece(
            piece,
            "Costs-section planning line fails canonical candidacy (approved ground truth: Costs is excluded trip content; run 7.23.2 chain 4 — exclusion is path-independent)",
            { kind: "terminal", code: "PLANNING_COST_SECTION_LINE" }
          );
        }
      }
    }
  );
  runPieceWriter("pre_classification_mutation", "stampOwnTextClassification", ["pieces[].payload._ownTextClassification"], () =>
    stampOwnTextClassification(pieces, observations)
  );
  runPieceWriter("pre_classification_mutation", "attachCanonicalSourceDecisions", ["pieces[].payload", "pieces[].actions"], () =>
    attachCanonicalSourceDecisions(pieces)
  );
  runPieceWriter("pre_classification_mutation", "suppressUnsupportedModelInventions", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressUnsupportedModelInventions(pieces, observations)
  );
  runPieceWriter("pre_classification_mutation", "attachArrivalOnlyTransportPieces", ["pieces[].payload", "pieces[].actions"], () =>
    attachArrivalOnlyTransportPieces(pieces)
  );
  runPieceWriter("pre_classification_mutation", "routeCanonicalTravelBoundaries", ["pieces[].kind", "pieces[].payload", "pieces[].actions"], () =>
    routeCanonicalTravelBoundaries(pieces)
  );
  runPieceWriter("pre_classification_mutation", "mergeReclassifiedCanonicalPieces:travel", ["pieces[].outputEligible", "pieces[].observationIds", "pieces[].actions"], () =>
    mergeReclassifiedCanonicalPieces(pieces)
  );
  runPieceWriter("pre_classification_mutation", "attachCanonicalAccessoryDetails", ["pieces[].payload", "pieces[].actions"], () =>
    attachCanonicalAccessoryDetails(pieces)
  );
  runPieceWriter("pre_classification_mutation", "suppressRedundantTransportParents", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressRedundantTransportParents(pieces)
  );
  runPieceWriter("pre_classification_mutation", "suppressRouteLessTransportFragments", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressRouteLessTransportFragments(pieces, sourceTransportAnchors)
  );
  runPieceWriter("pre_classification_mutation", "foldUnanchoredConfirmationTwinTransport", ["pieces[].outputEligible", "pieces[].observationIds", "pieces[].actions"], () =>
    foldUnanchoredConfirmationTwinTransport(pieces, sourceTransportAnchors)
  );
  runPieceWriter("pre_classification_mutation", "pruneNonOvernightPlaces", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    pruneNonOvernightPlaces(pieces, observations)
  );
  runPieceWriter("pre_classification_mutation", "routeUnbookedDayTripTransport", ["pieces[].kind", "pieces[].payload", "pieces[].actions"], () =>
    routeUnbookedDayTripTransport(pieces)
  );
  runPieceWriter("pre_classification_mutation", "mergeReclassifiedCanonicalPieces:day_trip", ["pieces[].outputEligible", "pieces[].observationIds", "pieces[].actions"], () =>
    mergeReclassifiedCanonicalPieces(pieces)
  );
  runPieceWriter("pre_classification_mutation", "finalizeCanonicalPlaceFields", ["pieces[].payload"], () =>
    finalizeCanonicalPlaceFields(pieces)
  );
  runPieceWriter("pre_classification_mutation", "attachGenericStayFragments", ["pieces[].payload", "pieces[].actions"], () =>
    attachGenericStayFragments(pieces)
  );
  runPieceWriter("pre_classification_mutation", "applyCanonicalGuessedStayNames", ["pieces[].payload.name", "missingDetails[]"], () =>
    applyCanonicalGuessedStayNames(missingDetails, pieces)
  );
  runPieceWriter("pre_classification_mutation", "applyCanonicalGuessedStayDates", ["pieces[].payload.checkIn", "pieces[].payload.checkOut", "missingDetails[]"], () =>
    applyCanonicalGuessedStayDates(missingDetails, pieces, tripYear)
  );
  runPieceWriter("pre_classification_mutation", "finalizeCanonicalStayFields:initial", ["pieces[].payload"], () =>
    finalizeCanonicalStayFields(pieces)
  );
  runPieceWriter("pre_classification_mutation", "applyStayCandidacyGate", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    applyStayCandidacyGate(pieces)
  );
  runPieceWriter("pre_classification_mutation", "reconcileCanonicalStayIdentity", ["pieces[].payload", "pieces[].outputEligible", "pieces[].actions"], () =>
    reconcileCanonicalStayIdentity(pieces, observations)
  );
  runPieceWriter("pre_classification_mutation", "finalizeCanonicalStayFields:reconciled", ["pieces[].payload"], () =>
    finalizeCanonicalStayFields(pieces)
  );
  runPieceWriter("pre_classification_mutation", "attachGenericActivityAccessories", ["pieces[].payload", "pieces[].actions"], () =>
    attachGenericActivityAccessories(pieces)
  );
  runPieceWriter("pre_classification_mutation", "attachGenericActivityPlaceholders", ["pieces[].payload", "pieces[].actions"], () =>
    attachGenericActivityPlaceholders(pieces)
  );
  runPieceWriter("pre_classification_mutation", "attachRentalCarReturns", ["pieces[].payload", "pieces[].actions"], () =>
    attachRentalCarReturns(pieces)
  );
  runPieceWriter("pre_classification_mutation", "suppressRepresentedTravelAndStayActivities:initial", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressRepresentedTravelAndStayActivities(pieces)
  );
  runPieceWriter("pre_classification_mutation", "applyAccessTaskPolicy", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    applyAccessTaskPolicy(pieces)
  );
  runPieceWriter("pre_classification_mutation", "recoverOutOfRangePieces", ["pieces[].payload.date", "pieces[].actions"], () =>
    recoverOutOfRangePieces(pieces)
  );
  runPieceWriter("pre_classification_mutation", "applyExplicitSourceUpdates", ["pieces[].payload", "pieces[].outputEligible", "pieces[].actions"], () =>
    applyExplicitSourceUpdates(pieces)
  );
  runPieceWriter("pre_classification_mutation", "routeCanonicalAccessoryEvidence", ["pieces[].payload", "pieces[].outputEligible", "pieces[].actions"], () =>
    routeCanonicalAccessoryEvidence({
      actions: {
        addAction: addCanonicalAction,
        mergePiece: mergeCanonicalPieceInto,
        suppressPiece: suppressCanonicalPiece,
      },
      pieces,
      tripYear,
    })
  );
  runPieceWriter("pre_classification_mutation", "resolveStructuralActivityDates", ["pieces[].payload.date", "pieces[].actions"], () =>
    resolveStructuralActivityDates({
      addAction: addCanonicalAction,
      observations,
      pieces,
      tripBounds: tripDateBounds(pieces),
      tripYear,
    })
  );
  runPieceWriter("pre_classification_mutation", "assignProvisionalActivityDates", ["pieces[].payload.date", "pieces[].actions"], () =>
    assignProvisionalActivityDates({ observations, pieces })
  );
  // Second shadow-suppression pass now that structural + provisional dates
  // are final (audit A11: the first pass runs before dates resolve, so a
  // transport shadow whose date was assigned late — the 7.18.3 FR8331
  // Jan 14 duplicate — was invisible to same-date matching). The pass only
  // suppresses represented duplicates, so re-running it is safe.
  runPieceWriter("pre_classification_mutation", "suppressRepresentedTravelAndStayActivities:dated", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressRepresentedTravelAndStayActivities(pieces)
  );
  const intentClassification = runPieceWriter(
    "classification",
    "applyIntentBlockClassification",
    ["pieces[].role", "pieces[].kind", "pieces[].payload", "pieces[].actions", "observations[].payload._canonicalCandidacyDecision", "missingDetails[]"],
    () => applyIntentBlockClassification({ missingDetails, observations, pieces })
  );
  const containmentAuthority = runPieceWriter(
    "containment",
    "createCanonicalContainmentAuthority",
    ["containmentLedger[]"],
    () => createCanonicalContainmentAuthority({
      existingDecisions: groupingDecisions,
      missingDetails,
      observations,
      pieces,
    })
  );
  const identityAuthority = runPieceWriter(
    "identity",
    "resolveCanonicalIdentity",
    [
      "pieces[].kind",
      "pieces[].payload",
      "pieces[].outputEligible",
      "pieces[].observationIds",
      "pieces[].disposition",
      "pieces[].actions",
      "identityLedger[]",
    ],
    () => resolveCanonicalIdentity({
      doNotMerge: containmentAuthority.doNotMerge,
      missingDetails,
      observations,
      pieces,
    })
  );
  const groupingAuthority = runPieceWriter(
    "grouping",
    "compileCanonicalGroupingAuthority",
    ["groupingExecution[]"],
    () => compileCanonicalGroupingAuthority({
      containment: containmentAuthority.telemetry,
      pieces,
    })
  );
  runPieceWriter("grouping", "executeCanonicalGroupingAuthority", ["pieces[].payload", "pieces[].actions"], () =>
    executeCanonicalGroupingAuthority({
      authority: groupingAuthority,
      pieces,
    })
  );
  // Question creation runs AFTER grouping so committed group structure is
  // visible: a grouped parent or child can never be mistaken for a
  // researched idea (live-run 7.18.0 castle/KGB question misfire).
  const researchedListQuestions = runPieceWriter(
    "review",
    "createResearchedListQuestions",
    ["reviewDetails[]"],
    () => createResearchedListQuestions(pieces, missingDetails)
  );
  const ambiguousIntentHomes = runPieceWriter(
    "review",
    "finalizeAmbiguousIntentHomes",
    ["pieces[].kind", "pieces[].payload", "pieces[].actions", "ambiguousIntentHomes[]"],
    () => finalizeAmbiguousIntentHomes(pieces)
  );
  const dayLabelSlotQuestions = runPieceWriter(
    "review",
    "createDayLabelSlotQuestions",
    ["reviewDetails[]"],
    () => createDayLabelSlotQuestions(
      pieces,
      observations,
      [...missingDetails, ...researchedListQuestions]
    )
  );
  runPieceWriter("final_projection", "suppressIsolatedUntimedGenericMeals", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressIsolatedUntimedGenericMeals(pieces)
  );
  runPieceWriter("final_projection", "suppressUnresolvedIsolatedTerms", ["pieces[].outputEligible", "pieces[].disposition"], () =>
    suppressUnresolvedIsolatedTerms({ observations, pieces })
  );
  runPieceWriter("final_projection", "mergeCanonicalCityNotes", ["pieces[].payload", "pieces[].outputEligible", "pieces[].actions"], () =>
    mergeCanonicalCityNotes(pieces)
  );
  runPieceWriter("final_projection", "finalizeCanonicalOutputFields", ["pieces[].payload"], () =>
    finalizeCanonicalOutputFields(pieces)
  );
  runPieceWriter("final_projection", "reconcileCanonicalConflicts", ["pieces[].payload", "pieces[].conflicts", "pieces[].actions"], () =>
    reconcileCanonicalConflicts(pieces, observations)
  );
  // Arc G.2 runs AFTER conflict reconciliation on purpose: that pass
  // rebuilds conflicts from the observations and would recompute
  // `requiresReview` over the repair's head. It runs BEFORE the protected-
  // value sweep so the sweep stays the last text mutation before outputs
  // are composed (the 7.23.0r ordering rule below).
  const transportFieldRepair = runPieceWriter(
    "final_projection",
    "applyCanonicalTransportFieldRepair",
    ["pieces[].payload", "pieces[].conflicts", "transportFieldRepairs[]", "reviewDetails[]"],
    () => applyCanonicalTransportFieldRepair({
      anchors: sourceTransportAnchors,
      pieces,
    })
  );
  // Run 7.23.0r ordering fix: the sweep is the LAST text mutation before
  // outputFor — conflict reconciliation selects field values and could
  // otherwise resurrect unscrubbed prose after an earlier sweep.
  const finalProjectionSafety = runPieceWriter("final_projection", "scrubProtectedValuesFromPublicProse", ["pieces[].payload", "finalProjectionSafety[]"], () =>
    scrubProtectedValuesFromPublicProse(pieces, sensitiveDetails)
  );
  // Validation-only final guard. Every later semantic writer has run; an
  // output-eligible piece may not invert the block decision's role or kind.
  runPieceWriter("final_projection", "enforceCanonicalOutputActivityRoles", [], () =>
    enforceCanonicalOutputActivityRoles(intentClassification.stamped)
  );
  const canonicalGroupingCalls = runPieceWriter(
    "review",
    "createCanonicalGroupingCalls",
    ["reviewDetails[]"],
    () => createCanonicalGroupingCalls(groupingAuthority.decisions, pieces)
  );
  const canonicalDuplicateFoldCalls = runPieceWriter(
    "review",
    "createCanonicalDuplicateFoldCalls",
    ["reviewDetails[]"],
    () => createCanonicalDuplicateFoldCalls(pieces)
  );
  const canonicalSourceUpdateCalls = runPieceWriter(
    "review",
    "createCanonicalSourceUpdateCalls",
    ["reviewDetails[]"],
    () => createCanonicalSourceUpdateCalls(pieces)
  );
  const canonicalConflictQuestions = runPieceWriter(
    "review",
    "createCanonicalConflictQuestions",
    ["reviewDetails[]"],
    () => createCanonicalConflictQuestions(pieces)
  );
  const canonicalOwnedQuestions = runPieceWriter(
    "review",
    "createCanonicalOwnedQuestions",
    ["reviewDetails[]"],
    () => createCanonicalOwnedQuestions(pieces)
  );

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
  const canonicalSpineQuestions = runPieceWriter(
    "review",
    "createCanonicalTripSpineReviewDetails",
    ["reviewDetails[]"],
    () => createCanonicalTripSpineReviewDetails({
      activities,
      places,
      stays,
      transport,
      tripOverview,
    })
  );
  const gatedDetails = [
    ...canonicalGroupingCalls,
    ...canonicalDuplicateFoldCalls,
    ...canonicalSourceUpdateCalls,
    ...canonicalConflictQuestions,
    ...canonicalOwnedQuestions,
    ...transportFieldRepair.questions,
    ...researchedListQuestions,
    ...dayLabelSlotQuestions,
    ...canonicalSpineQuestions,
    ...missingDetails,
  ];
  const finalMissingDetails = runPieceWriter(
    "review",
    "canonicalizeCanonicalReviewDetails",
    ["reviewDetails[]"],
    () => canonicalizeCanonicalReviewDetails(
      gatedDetails,
      pieces,
      tripOverview,
      missingDetails
    )
  );
  runPieceWriter("final_projection", "assignCanonicalEvidenceDispositions", ["observations[].disposition"], () =>
    assignCanonicalEvidenceDispositions({ observations, pieces })
  );
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

  // Task B ("Tell it fired"): counted from FINAL piece state, not
  // accumulated as `disposeCanonicalPiece` runs — a piece is only ever
  // meant to be disposed once (later passes gate on `!piece.outputEligible
  // continue`), so reading the terminal state avoids double-counting if
  // that ever stops being true, and it means this count can never drift
  // from what `piece.disposition` actually says on the returned `pieces`.
  // Seeded with every code at zero (see CANONICAL_TERMINAL_DISPOSAL_CODES)
  // so a code that fired zero times is still visible as zero, not absent.
  const terminalDisposalCountsByCode = Object.fromEntries(
    CANONICAL_TERMINAL_DISPOSAL_CODES.map((code) => [code, 0])
  ) as Record<CanonicalTerminalDisposalCode, number>;
  let survivorDisposalCount = 0;
  for (const piece of pieces) {
    if (!piece.disposition) continue;
    if (piece.disposition.kind === "terminal") {
      terminalDisposalCountsByCode[piece.disposition.code] += 1;
    } else {
      survivorDisposalCount += 1;
    }
  }

  return {
    draft,
    observations,
    parserArtifactRepairs,
    pieces,
    // Arc G.2: successful internal repair is support telemetry, never
    // maker-facing extraction mechanics (AGENTS.md dark-factory).
    transportFieldRepairs: transportFieldRepair.repairs,
    summary: {
      activityCandidacyDecisions: observations.flatMap((observation) => {
        const owners = pieces.filter((piece) =>
          piece.observationIds.includes(observation.id)
        );
        const finalDecision = owners
          .map((piece) => asRecord(piece.payload._canonicalCandidacyDecision))
          .find((decision) => stringValue(decision, "decisionId"));
        const intakeDecision = asRecord(
          observation.payload._canonicalIntakeCandidacyDecision
        );
        const decision = finalDecision ?? intakeDecision;
        const decisionId = stringValue(decision, "decisionId");
        if (!decisionId) return [];
        return [
          {
            activityCandidate: decision.activityCandidate === true,
            blockDecisionId: stringValue(decision, "blockDecisionId"),
            canonicalPieceIds: owners.map((piece) => piece.id),
            commitmentObservationIds: Array.isArray(
              decision.commitmentObservationIds
            )
              ? decision.commitmentObservationIds.filter(
                  (value): value is string => typeof value === "string"
                )
              : [],
            commitmentSignals: Array.isArray(decision.commitmentSignals)
              ? decision.commitmentSignals.filter(
                  (value): value is string => typeof value === "string"
                )
              : [],
            contradiction: decision.contradiction === true,
            decisionId,
            destination: stringValue(decision, "destination") ?? "context",
            ideaContextBefore: decision.ideaContextBefore === true,
            ideaContextObservationId: stringValue(
              decision,
              "ideaContextObservationId"
            ),
            referenceNoteObservationId: stringValue(
              decision,
              "referenceNoteObservationId"
            ),
            inputEvidenceRole: stringValue(
              intakeDecision,
              "inputEvidenceRole"
            ),
            inputItemType: stringValue(intakeDecision, "inputItemType"),
            observationId: observation.id,
            observationDate: stringValue(observation.payload, "date"),
            observationOrdinal: observation.ordinal,
            observationTitle: stringValue(observation.payload, "title"),
            reasonCode:
              stringValue(decision, "reasonCode") ?? "EXPLICIT_CONTEXT",
            title:
              owners
                .map((piece) => stringValue(piece.payload, "title"))
                .find(Boolean) ??
              stringValue(observation.payload, "title"),
            winningSignal:
              stringValue(decision, "winningSignal") ?? "source_structure",
          },
        ];
      }),
      ambiguousIntentHomes,
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
      sourceBoundedDisjunctionRepairs: parserArtifactRepairs.flatMap(
        (repair) => {
          const trace = repair.sourceBoundedTrace;
          if (!trace) return [];
          const candidateIds = new Set(
            trace.candidateIds.filter((value): value is string => Boolean(value))
          );
          const observationIds = observations
            .filter((observation) => {
              const candidateId = stringValue(
                observation.payload,
                "_resolverCandidateId"
              );
              return Boolean(candidateId && candidateIds.has(candidateId));
            })
            .map((observation) => observation.id);
          const observationIdSet = new Set(observationIds);
          return [
            {
              afterRoles: trace.afterRoles,
              beforeRoles: trace.beforeRoles,
              canonicalPieceIds: pieces
                .filter((piece) =>
                  piece.observationIds.some((id) => observationIdSet.has(id))
                )
                .map((piece) => piece.id),
              observationIds,
              rule: trace.rule,
              spanEnd: trace.spanEnd,
              spanHash: trace.spanHash,
              spanStart: trace.spanStart,
            },
          ];
        }
      ),
      rejectedObservationCount: new Set(
        pieces
          .filter((piece) => !piece.outputEligible)
          .flatMap((piece) => piece.observationIds)
      ).size,
      containmentLedger: containmentAuthority.telemetry,
      groupingClaims: groupingClaimTelemetryFromAuthority(groupingAuthority),
      groupingExecution: groupingAuthority,
      identityLedger: identityAuthority,
      finalProjectionSafety,
      intentBlocks: {
        blocks: intentClassification.blocks,
        version: intentClassification.version,
      },
      stageWriterTrace,
      sourceAnchorObservationCount: sourceTransportAnchors.length,
      suppressedWeakAnchorCount,
      terminalDisposalCountsByCode,
      survivorDisposalCount,
      transportFieldRepairCount: transportFieldRepair.repairs.length,
      transportFieldRepairQuestionCount: transportFieldRepair.questions.length,
    },
  };
}
