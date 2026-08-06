import type { SourceTransportAnchor } from "@/lib/extraction/source-transport-anchors";
import type { GeneratedTripSummaryWarningCode } from "@/lib/generated-trip-summary";
import type {
  CanonicalEvidenceAction,
  EvidenceKind,
  EvidenceRole,
  EvidenceSource,
} from "@/lib/extraction/evidence-clustering";
import type { IntentBlockDecision } from "@/lib/extraction/activity-classifier";
import type { TripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";

export type DraftObject = Record<string, unknown>;

export type DraftRecordSummary = {
  address: string | null;
  // Parser geo/area hints surface in audit views so grouping-doctrine
  // failures are observable (the 7.17.2 audit was blind to whether the
  // parser emitted coordinates at all).
  approxLatitude: number | null;
  approxLongitude: number | null;
  // Geocode-lane verified coordinates (live-run 7.21.0: radius claims were
  // unfalsifiable from the bundle — zero verified fields rode along).
  verifiedLatitude: number | null;
  verifiedLongitude: number | null;
  geoVerified: true | null;
  area: string | null;
  category: string | null;
  date: string | null;
  description: string | null;
  endTime: string | null;
  evidence: string | null;
  // Arc E: "model_verbatim" | "line_match_injected" | "model_unverified" |
  // "absent" — verbatim-compliance split, countable from the QA bundle.
  evidenceProvenance: string | null;
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
  cityNoteKey: string | null;
  confirmationLabel: string | null;
  category: string | null;
  date: string | null;
  departureLocation: string | null;
  description: string | null;
  endTime: string | null;
  id: string;
  legId: string | null;
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
    verifiedLatitude: number | null;
    verifiedLongitude: number | null;
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
    | "day_section_line_covered_only_by_note_output"
    | "day_section_source_line_unextracted"
    | "identity_value_in_public_prose"
    | "transport_confirmation_value_not_captured"
    | "transport_times_disagree_with_source_anchor"
    | "day_overview_activity_survived"
    | "duplicate_same_venue_activity"
    | "loose_tip_promoted_to_activity"
    | "ocr_backfill_failed"
    | "planned_activity_buried_in_city_notes"
    | "planning_cost_line_shipped_as_card"
    | "protected_code_shape_in_public_prose"
    | "same_leg_stay_night_overlap"
    | "transport_description_contaminated"
    | "transport_provider_field_corrupted"
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
      inputEvidenceRole: string | null;
      inputItemType: string | null;
      observationId: string;
      observationDate: string | null;
      observationOrdinal: number;
      observationTitle: string | null;
      reasonCode: string;
      referenceNoteObservationId: string | null;
      title: string | null;
      winningSignal: string;
    }>;
    canonicalPieceCount: number;
    clusteredObservationCount: number;
    contextObservationCount: number;
    dispositionCount: number;
    containmentLedger: {
      decisions: Array<{
        callPolicy: "required" | "silent";
        containerObservationIds: string[];
        containerPieceId: string | null;
        containerTitle: string;
        date: string;
        decisionId: string;
        members: Array<{
          evidence: string[];
          observationIds: string[];
          pieceId: string;
          sourceOrder: number;
          title: string;
        }>;
        relationType: "authored_route" | "same_site" | "source_area_walk";
        rejections: Array<{
          pieceId: string;
          reasonCode: string;
          title: string;
        }>;
        source: "deterministic_containment" | "resolver_containment";
      }>;
      doNotMergePairCount: number;
      rejectedCandidateCount: number;
      version: 1;
    } | null;
    groupingExecution: {
      decisions: Array<{
        callPolicy: "required" | "silent";
        claim: string;
        date: string;
        decisionId: string;
        members: Array<{
          evidence: string[];
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
          relationType: "authored_route" | "same_site" | "source_area_walk";
          source: "deterministic_containment" | "resolver_containment";
        };
        rejections: Array<{
          pieceId: string;
          reasonCode: string;
          title: string;
        }>;
      }>;
      unresolvedMappings: Array<{
        containmentDecisionId: string;
        observationIds: string[];
        pieceId: string | null;
        role: "member" | "parent";
      }>;
      version: 1;
    } | null;
    identityLedger: {
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
    } | null;
    ambiguousIntentHomes: Array<{
      blockDecisionId: string;
      decisionId: string;
      finalHome: "city_note";
      originalDate: string | null;
      pieceId: string;
      reasonCode: "unresolved_ambiguous_to_city_note";
      title: string | null;
    }>;
    finalProjectionSafety: {
      contentCarrierDecisions: Array<{
        carrierField: "description";
        carrierPieceId: string | null;
        factDigest: string;
        outcome:
          | "already_present"
          | "explicitly_excluded"
          | "restored"
          | "unresolved";
        sourcePieceId: string;
      }>;
      decisions: Array<{
        canonicalPieceId: string;
        outcome: "excluded" | "redacted";
        rawSafety: string;
        sanitizedSafety: string;
        segmentDigest: string;
      }>;
      finalPublicProtectedSegmentCount: number;
      unresolvedFactCount: number;
      version: 1;
    } | null;
    // G4.4 (docket §C, field 2): produced by the claim ledger at
    // evidence-clustering.ts and, before this, consumed by NOBODY
    // repo-wide — never persisted, never served. Lane contention was
    // designed to be visible in run telemetry and was not.
    groupingClaims: {
      claimedPieceCount: number;
      claimsByLane: Record<string, number>;
      contestedPieceCount: number;
      releasedDecisionCount: number;
    } | null;
    stageWriterTrace: Array<{
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
    }>;
    intentBlocks: {
      blocks: IntentBlockDecision[];
      version: 1;
    };
    identityRepairCount: number;
    identityRecoveryInitialViolations: string[];
    identityRecoveryStatus: "not_needed" | "repaired";
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
    sourceAnchorObservationCount: number;
    suppressedStandaloneAnchorCount: number;
    // Arc G.2: deterministic transport repairs applied this run.
    transportFieldRepairCount: number;
    // G4.4 (docket §C, field 3): written to usage since Arc G.2, and no
    // audit endpoint serves `usage`. The OUTCOME is the load-bearing part —
    // `cleared_pending_review` versus `repaired_from_source_anchor` is the
    // difference between a repair that worked and one that gave up.
    transportFieldRepairs: Array<{
      defect: string;
      field: string;
      outcome: string;
      pieceId: string;
      routeLabel: string;
    }>;
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
    // Run-2 handoff §6: `sent` is what the request carried, `resolved` is what
    // the env vars asked for. They differ when the model rejects the params
    // and the fail-soft strip-retry fires — and they differed silently for
    // every run before this field existed, because no call site passed them.
    extractionSampling: {
      liveCallCount: number;
      replayedCallCount: number;
      resolved: Record<string, number>;
      sent: Record<string, number>;
      strippedCallCount: number;
    } | null;
    sourceRecovery: {
      batchedLineCount: number;
      deterministicResidualLineCount: number;
      droppedLineCount: number;
      excludedPlanningCostLineCount: number;
      model: string | null;
      outcome: string;
      recoveredLineCount: number;
      residualUncoveredLineCount: number;
    } | null;
    sourceFactLedger: {
      additionalGeocodingLookupCount: number;
      additionalModelCallCount: number;
      additionalRetryCount: number;
      candidateToSpanAmbiguityCount: number;
      coverageCounts: {
        ambiguous: number;
        carried: number;
        context_only: number;
        excluded: number;
        structural_only: number;
        uncovered: number;
      };
      coverageHash: string | null;
      factCounts: {
        decision: number;
        entity: number;
        exclusion: number;
        intent: number;
        relationship: number;
      };
      failureClass: string | null;
      ledgerBuildMilliseconds: number;
      ledgerHash: string | null;
      outputFingerprintAfter: string | null;
      outputFingerprintBefore: string | null;
      recoveryBatchCount: number;
      recoveryPlanHash: string | null;
      recoveryUncoveredClauseCount: number;
      schemaVersion: number;
      serializedByteSize: number;
      sourceClauseCount: number;
      sourceFingerprint: string | null;
      status: string;
      unresolvedRelationshipMemberCount: number;
    } | null;
    geocodeVerification: {
      budget: number;
      // G4.4 (docket §C, field 4): per-candidate rank + outcome. Without
      // it, "St. Vitus lost its lookup and there is no telemetry that says
      // why" is a permanent condition, and shipping G4.1/G4.2/G4.3 in one
      // run is unattributable under AGENTS.md rule 1.
      candidates: Array<{
        candidateId: string | null;
        containerSourceSupported: boolean | null;
        containerTitle: string | null;
        granularity: string | null;
        outcome: string;
        query: string;
        rank: number;
        retried: boolean;
        retryQuery: string | null;
      }>;
      candidateCount: number;
      failedCount: number;
      // G4.4 (docket §C, field 1): computed by the lane since Arc G.3a and
      // dropped by this whitelist, which made every G.3a address-path
      // conclusion unfalsifiable — ABSENT was read as ZERO.
      formattedAddressCount: number;
      // G4.2 / G4.3 outcome counters.
      localityRejectedCount: number;
      lookupCount: number;
      outcome: string;
      resolvedCount: number;
      retryAcceptedCount: number;
      retryCount: number;
      retryOutOfCityCount: number;
      retryUnlistedContainerCount: number;
      retrySkippedOverBudgetCount: number;
      skippedOverBudgetCount: number;
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
