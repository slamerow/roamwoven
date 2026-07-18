import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import type { GeneratedTripSummaryWarningCode } from "@/lib/generated-trip-summary";
import type {
  CanonicalEvidenceAction,
  EvidenceKind,
  EvidenceRole,
  EvidenceSource,
} from "@/lib/extraction/evidence-clustering";
import type { TripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";

export type DraftObject = Record<string, unknown>;

export type DraftRecordSummary = {
  address: string | null;
  // Parser geo/area hints surface in audit views so grouping-doctrine
  // failures are observable (the 7.17.2 audit was blind to whether the
  // parser emitted coordinates at all).
  approxLatitude: number | null;
  approxLongitude: number | null;
  area: string | null;
  category: string | null;
  date: string | null;
  description: string | null;
  endTime: string | null;
  evidence: string | null;
  itemType: string | null;
  locationName: string | null;
  sourceFilename: string | null;
  // Source-structure context (Phase 1, audit B4): lets audit detectors run
  // the pipeline's own heading-fragment predicate instead of a private one.
  sourceHeadingPath: string[] | null;
  sourceSectionLabel: string | null;
  startTime: string | null;
  title: string;
};

export type DraftTransportSummary = {
  date: string | null;
  departure: string | null;
  departureTime: string | null;
  arrival: string | null;
  arrivalTime: string | null;
  confirmation: string | null;
  description: string | null;
  provider: string | null;
  title: string;
  type: string | null;
};

export type DraftStaySummary = {
  address: string | null;
  checkIn: string | null;
  checkInTime: string | null;
  checkOut: string | null;
  checkOutTime: string | null;
  name: string;
};

export type DraftStayLineageSummary = DraftStaySummary & {
  date: string | null;
  title: string;
};

export type DraftLineageCandidate =
  | DraftRecordSummary
  | DraftTransportSummary
  | DraftStayLineageSummary;

export type AuditFinalRecordSummary = {
  address: string | null;
  arrivalLocation: string | null;
  canonicalId: string;
  confirmationLabel: string | null;
  category: string | null;
  date: string | null;
  departureLocation: string | null;
  description: string | null;
  endTime: string | null;
  id: string;
  provider: string | null;
  recordType: "item" | "stay" | "transport";
  startTime: string | null;
  status: string;
  title: string;
  type: string | null;
};

export type TripExtractionAuditLineageRow = {
  actions: CanonicalEvidenceAction[];
  canonical: DraftLineageCandidate | null;
  canonicalPieceId: string | null;
  date: string | null;
  diagnostics: string[];
  finalRecords: AuditFinalRecordSummary[];
  identityKey: string;
  mergeReasons: string[];
  matchMethod: "canonical_id" | "none" | "semantic_fallback";
  observations: Array<{
    // Geo/area hints ride on lineage observations so grouping-radius claims
    // are verifiable from the QA bundle (run5 PB-4 audit-visibility gap).
    approxLatitude: number | null;
    approxLongitude: number | null;
    area: string | null;
    date: string | null;
    id: string;
    kind: EvidenceKind;
    role: EvidenceRole;
    source: EvidenceSource;
    sourceLabel: string;
    title: string;
  }>;
  outputEligible: boolean | null;
  status: "compiled" | "final_only" | "missing_from_structured" | "suppressed";
  title: string;
};

export type TripExtractionAuditDetectorIncident = {
  canonicalPieceId: string;
  code: "canonical_identity_semantic_fallback";
  detail: string;
  finalRecordId: string;
};

export type TripExtractionAuditDiagnostic = {
  canonicalPieceIds?: string[];
  code:
    | "canonical_evidence_disposition_gap"
    | "critical_transport_missing_details"
    | "critical_transport_missing_soft_details"
    | "critical_transport_not_travel_row"
    | "critical_transport_source_anchor_missing"
    | "critical_transport_source_anchor_missing_details"
    | "critical_transport_source_anchor_missing_soft_details"
    | "day_section_source_line_unextracted"
    | "transport_times_disagree_with_source_anchor"
    | "day_overview_activity_survived"
    | "duplicate_same_venue_activity"
    | "loose_tip_promoted_to_activity"
    | "ocr_backfill_failed"
    | "planned_activity_buried_in_city_notes"
    | "transport_description_contaminated"
    | "transport_row_without_source_anchor"
    | "weak_transport_source_anchor_unmatched";
  detail: string;
  evidence: string[];
  severity: "p0" | "p1" | "p2";
  title: string;
};

export type DraftAuditSnapshot = {
  activities: DraftRecordSummary[];
  counts: {
    activities: number;
    missingDetails: number;
    places: number;
    sensitiveDetails: number;
    stays: number;
    transport: number;
  };
  missingDetails: Array<{
    prompt: string;
    relatedTitle: string | null;
    subjectType: string | null;
    targetField: string | null;
  }>;
  stays: DraftStaySummary[];
  transport: DraftTransportSummary[];
};

export type TripExtractionAuditReport = {
  canonicalization: {
    canonicalPieceCount: number;
    clusteredObservationCount: number;
    contextObservationCount: number;
    dispositionCount: number;
    identityRepairCount: number;
    identityRecoveryStatus: "not_needed" | "repaired";
    observationCount: number;
    parserArtifactRepairCount: number;
    rejectedObservationCount: number;
    sourceAnchorObservationCount: number;
    suppressedStandaloneAnchorCount: number;
    undisposedObservationCount: number;
  };
  diagnostics: TripExtractionAuditDiagnostic[];
  detectorIncidents: TripExtractionAuditDetectorIncident[];
  draft: DraftAuditSnapshot;
  extraction: {
    activityChunks: {
      count: number;
      failed: number;
      rescued: number;
      succeeded: number;
    } | null;
    sourceCoverage: {
      crossStageCoveredLineCount: number;
      daySectionCount: number;
      meaningfulLineCount: number;
      uncoveredLineCount: number;
      uncoveredLines: Array<{ excerpt: string; label: string }>;
    } | null;
    sourceRecovery: {
      batchedLineCount: number;
      droppedLineCount: number;
      model: string | null;
      outcome: string;
      recoveredLineCount: number;
      residualUncoveredLineCount: number;
    } | null;
    staged: boolean;
  };
  fingerprints: TripExtractionFingerprints;
  lineage: TripExtractionAuditLineageRow[];
  sourceAnchors: {
    transport: SourceTransportAnchor[];
  };
  structured: {
    activeActivities: number;
    activeNotes: number;
    groupedStops: number;
    hardWarnings: number;
    openQuestions: number;
    quietWarnings: number;
    stays: number;
    transport: number;
  };
  warnings: Array<{
    code: GeneratedTripSummaryWarningCode;
    severity: "hard" | "quiet";
    subjectId: string;
    subjectType: string;
    title: string;
  }>;
};
