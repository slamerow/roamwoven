import assert from "node:assert/strict";
import {
  createCanonicalizationSummary,
  createExtractionSummary,
} from "@/lib/extraction/trip-extraction-audit-snapshot";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { createReviewQuestions } from "@/lib/extraction/review-question-policy";
import type {
  StructuredTripRecords,
  TripTransportRecord,
} from "@/lib/generated-trip-model";

// Arc F telemetry (run 7.23.2 chain 8; docket fixture assertion 8).
// Three audit-blocking telemetry gaps, each proven closed here:
// 8.1 the repair corridor's initialViolations were computed but dropped at
//     the event/summary boundary — must-pass item 7 ("which invariant
//     tripped the repair?") was unknowable from the bundle;
// 8.2 excludedPlanningCostLineCount was computed by source-recovery but
//     dropped by the audit-snapshot whitelist — must-pass item 6 was
//     unverifiable by construction;
// 8.3 dismissed questions kept only a count — chain 7's baths-question
//     dismissal had to be inferred instead of quoted.
// Plus the chain-3 capture-miss advisory: a transport row with no
// confirmation-shaped value is the detectable symptom of a disarmed
// deny-list sweep.

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const LIVE_VIOLATION =
  'missingDetails[3] changed canonical subject piece_2a10274a to tripId';

function transportRow(
  overrides: Partial<TripTransportRecord> & { id: string; routeLabel: string }
): TripTransportRecord {
  return {
    arrivalLocation: "Wien Hbf",
    arrivalTime: "13:23",
    bookingUrl: null,
    bookingUrlVisibility: "public",
    canonicalId: `canonical-${overrides.id}`,
    confirmationLabel: null,
    confirmationVisibility: "traveler_password",
    date: "2019-01-18",
    departureLocation: "Praha hl.n.",
    departureTime: "09:20",
    description: null,
    fromLegId: null,
    legId: null,
    privateDetailIds: [],
    provider: "RegioJet",
    reviewRequired: false,
    sourceConfidence: "high",
    status: "confirmed",
    toLegId: null,
    transportType: "train",
    tripId: "trip-arc-f",
    ...overrides,
  };
}

function recordsWith(transport: TripTransportRecord[]): StructuredTripRecords {
  return {
    categories: [],
    days: [],
    items: [],
    legs: [],
    photos: [],
    phrases: [],
    privateDetails: [],
    reviewQuestions: [],
    stays: [],
    transport,
    trip: {
      destinationSummary: null,
      endDate: null,
      id: "trip-arc-f",
      name: "Arc F telemetry",
      startDate: null,
      travelerAppTitle: "Arc F telemetry",
    },
    weatherHooks: [],
  };
}

export default function run() {
  test("8.1 canonicalization summary names the repair corridor's initial violations", () => {
    const summary = createCanonicalizationSummary({
      identityRecovery: {
        actions: ["rebuilt_draft_from_canonical_pieces"],
        attempted: true,
        initialViolations: [LIVE_VIOLATION],
        status: "repaired",
      },
    });
    assert.equal(summary.identityRecoveryStatus, "repaired");
    assert.deepEqual(summary.identityRecoveryInitialViolations, [
      LIVE_VIOLATION,
    ]);
  });

  test("8.1 a not_needed run reports no violations", () => {
    const summary = createCanonicalizationSummary({});
    assert.equal(summary.identityRecoveryStatus, "not_needed");
    assert.deepEqual(summary.identityRecoveryInitialViolations, []);
  });

  test("RW-CLS-001 intent-block decisions survive the audit-snapshot whitelist", () => {
    const summary = createCanonicalizationSummary({
      evidence: {
        intentBlocks: {
          blocks: [
            {
              blockId: "intent-2019-01-20-1-plan",
              date: "2019-01-20",
              memberIds: ["piece-cafe", "piece-library"],
              memberTitles: ["Cafe Central breakfast", "Library"],
              observationIds: ["obs-cafe", "obs-library"],
              reason: "fixed meal slot anchors its source-contiguous peers",
              type: "plan",
            },
          ],
          version: 1,
        },
      },
    });
    assert.equal(summary.intentBlocks.version, 1);
    assert.equal(summary.intentBlocks.blocks.length, 1);
    assert.deepEqual(summary.intentBlocks.blocks[0].observationIds, [
      "obs-cafe",
      "obs-library",
    ]);
  });

  test("RW-GRP-001 containment decisions survive the served audit whitelist", () => {
    const summary = createCanonicalizationSummary({
      evidence: {
        containmentLedger: {
          decisions: [{
            callPolicy: "silent",
            containerObservationIds: ["obs-tour"],
            containerPieceId: "piece-tour",
            containerTitle: "Old Quarter tour",
            date: "2019-01-15",
            decisionId: "containment-route-1",
            members: [
              {
                evidence: ["source_hierarchy", "source_order"],
                observationIds: ["obs-square"],
                pieceId: "piece-square",
                sourceOrder: 10,
                title: "Old Square",
              },
              {
                evidence: ["source_hierarchy", "source_order"],
                observationIds: ["obs-quarter"],
                pieceId: "piece-quarter",
                sourceOrder: 20,
                title: "Old Quarter",
              },
            ],
            relationType: "authored_route",
            rejections: [],
            source: "deterministic_containment",
          }],
          doNotMergePairCount: 3,
          rejectedCandidateCount: 0,
          version: 1,
        },
      },
    });

    assert.equal(summary.containmentLedger?.decisions.length, 1);
    assert.deepEqual(
      summary.containmentLedger?.decisions[0]?.members.map(
        (member) => member.title
      ),
      ["Old Square", "Old Quarter"]
    );
    assert.equal(summary.containmentLedger?.doNotMergePairCount, 3);
  });

  test("RW-GRP-001 frozen grouping execution and unresolved mappings are served", () => {
    const summary = createCanonicalizationSummary({
      evidence: {
        groupingExecution: {
          decisions: [{
            callPolicy: "required",
            claim: "Same-site visit: two supported stops share one visit.",
            date: "2019-01-19",
            decisionId: "containment-site-1",
            members: [
              {
                evidence: ["source_hierarchy"],
                observationIds: ["obs-one"],
                pieceId: "piece-one",
                sourceOrder: 0,
                title: "First stop",
              },
              {
                evidence: ["verified_address"],
                observationIds: ["obs-two"],
                pieceId: "piece-two",
                sourceOrder: 1,
                title: "Second stop",
              },
            ],
            parent: {
              observationIds: ["obs-parent"],
              pieceId: "piece-parent",
              synthetic: false,
              title: "Site visit",
            },
            provenance: {
              containmentDecisionId: "containment-site-1",
              relationType: "same_site",
              source: "deterministic_containment",
            },
            rejections: [],
          }],
          unresolvedMappings: [{
            containmentDecisionId: "containment-site-dropped",
            observationIds: ["obs-missing"],
            pieceId: "piece-missing",
            role: "member",
          }],
          version: 1,
        },
      },
    });

    assert.deepEqual(
      summary.groupingExecution?.decisions[0]?.members.map(
        (member) => member.title
      ),
      ["First stop", "Second stop"]
    );
    assert.deepEqual(summary.groupingExecution?.decisions[0]?.provenance, {
      containmentDecisionId: "containment-site-1",
      relationType: "same_site",
      source: "deterministic_containment",
    });
    assert.deepEqual(summary.groupingExecution?.unresolvedMappings, [{
      containmentDecisionId: "containment-site-dropped",
      observationIds: ["obs-missing"],
      pieceId: "piece-missing",
      role: "member",
    }]);
  });

  test("RW-CAN-001 identity carriers and fact acceptance survive the served audit whitelist", () => {
    const summary = createCanonicalizationSummary({
      evidence: {
        identityLedger: {
          decisions: [{
            acceptedFactDigests: ["fact-a", "fact-b"],
            decisionId: "identity-decision-1",
            finalDate: "2019-01-22",
            finalHome: "activity",
            loserPieceIds: ["piece-loser"],
            observationIds: ["obs-a", "obs-b"],
            priorDates: ["2019-01-22", "2019-01-23"],
            reasonCode: "source_sequenced_occurrence_wins",
            survivorPieceId: "piece-survivor",
            usefulFactDigests: ["fact-a", "fact-b"],
          }],
          unresolvedCarrierCount: 0,
          version: 1,
        },
      },
    });

    assert.equal(summary.identityLedger?.decisions.length, 1);
    assert.equal(summary.identityLedger?.unresolvedCarrierCount, 0);
    assert.deepEqual(
      summary.identityLedger?.decisions[0]?.acceptedFactDigests,
      ["fact-a", "fact-b"]
    );
    assert.equal(
      summary.identityLedger?.decisions[0]?.reasonCode,
      "source_sequenced_occurrence_wins"
    );
  });

  test("8.2 excludedPlanningCostLineCount survives the audit-snapshot whitelist", () => {
    const summary = createExtractionSummary({
      sourceRecovery: {
        batchedLineCount: 55,
        deterministicResidualLineCount: 4,
        droppedLineCount: 0,
        excludedPlanningCostLineCount: 11,
        model: "gpt-5.4-mini",
        outcome: "recovered",
        recoveredLineCount: 41,
        residualUncoveredLineCount: 54,
      },
    });
    assert.equal(summary.sourceRecovery?.excludedPlanningCostLineCount, 11);
    assert.equal(summary.sourceRecovery?.deterministicResidualLineCount, 4);
  });

  test("Loop 6 final-projection carrier and safety decisions survive the served audit whitelist", () => {
    const summary = createCanonicalizationSummary({
      evidence: {
        ambiguousIntentHomes: [
          {
            blockDecisionId: "intent-one",
            decisionId: "home-one",
            finalHome: "city_note",
            originalDate: "2019-01-22",
            pieceId: "piece-one",
            reasonCode: "unresolved_ambiguous_to_city_note",
            title: "Example idea",
          },
        ],
        finalProjectionSafety: {
          contentCarrierDecisions: [
            {
              carrierField: "description",
              carrierPieceId: "note-one",
              factDigest: "fact-one",
              outcome: "restored",
              sourcePieceId: "piece-one",
            },
          ],
          decisions: [
            {
              canonicalPieceId: "note-one",
              outcome: "excluded",
              rawSafety: "access",
              sanitizedSafety: "access",
              segmentDigest: "segment-one",
            },
          ],
          finalPublicProtectedSegmentCount: 0,
          unresolvedFactCount: 0,
          version: 1,
        },
      },
    });
    assert.equal(summary.ambiguousIntentHomes.length, 1);
    assert.equal(
      summary.finalProjectionSafety?.contentCarrierDecisions[0]?.outcome,
      "restored"
    );
    assert.equal(
      summary.finalProjectionSafety?.finalPublicProtectedSegmentCount,
      0
    );
    assert.equal(summary.finalProjectionSafety?.unresolvedFactCount, 0);
  });

  test("G5.1 container-retry source support survives the audit-snapshot whitelist", () => {
    const summary = createExtractionSummary({
      geocodeVerification: {
        budget: 150,
        candidateCount: 1,
        candidates: [
          {
            candidateId: "stage-4-item-2",
            containerSourceSupported: false,
            containerTitle: "River Palace",
            granularity: "locality",
            outcome: "rejected_locality",
            query: "Gallery West, Sample City",
            rank: 1,
            retried: false,
            retryQuery: null,
          },
        ],
        failedCount: 0,
        formattedAddressCount: 0,
        localityRejectedCount: 1,
        lookupCount: 1,
        outcome: "completed",
        resolvedCount: 0,
        retryAcceptedCount: 0,
        retryCount: 0,
        retryOutOfCityCount: 0,
        retrySkippedOverBudgetCount: 0,
        retryUnlistedContainerCount: 1,
        skippedOverBudgetCount: 0,
      },
    });

    assert.equal(summary.geocodeVerification?.retryUnlistedContainerCount, 1);
    assert.deepEqual(summary.geocodeVerification?.candidates[0], {
      candidateId: "stage-4-item-2",
      containerSourceSupported: false,
      containerTitle: "River Palace",
      granularity: "locality",
      outcome: "rejected_locality",
      query: "Gallery West, Sample City",
      rank: 1,
      retried: false,
      retryQuery: null,
    });
  });

  // Run-2 handoff §6 — the same whitelist-drop defect class, third instance.
  // `formattedAddressCount` and `excludedPlanningCostLineCount` were both
  // computed for weeks and dropped here; `extractionSampling` is whitelisted
  // in the same change that starts producing it, so the sent-vs-resolved
  // distinction is verifiable from the QA bundle on the FIRST run that
  // carries it rather than the run after someone notices.
  test("8.4 extractionSampling survives the audit-snapshot whitelist, sent and resolved both", () => {
    const summary = createExtractionSummary({
      extractionSampling: {
        liveCallCount: 9,
        replayedCallCount: 0,
        resolved: { seed: 7, temperature: 0 },
        sent: { seed: 7, temperature: 0 },
        strippedCallCount: 0,
      },
    });
    assert.deepEqual(summary.extractionSampling?.sent, {
      seed: 7,
      temperature: 0,
    });
    assert.equal(summary.extractionSampling?.liveCallCount, 9);
  });

  test("8.5 a run whose params were stripped reports resolved WITHOUT sent", () => {
    // The failure mode this pins: a reasoning model rejects seed/temperature,
    // the fail-soft strip-retry succeeds, and the run completes normally. If
    // the summary echoed the resolved config it would read "seed 7" on a run
    // that sent nothing — worse than no telemetry (§6).
    const summary = createExtractionSummary({
      extractionSampling: {
        liveCallCount: 9,
        replayedCallCount: 0,
        resolved: { seed: 7, temperature: 0 },
        sent: {},
        strippedCallCount: 9,
      },
    });
    assert.deepEqual(summary.extractionSampling?.resolved, {
      seed: 7,
      temperature: 0,
    });
    assert.deepEqual(summary.extractionSampling?.sent, {});
    assert.equal(summary.extractionSampling?.strippedCallCount, 9);
  });

  test("Loop 8 source fact ledger telemetry survives the audit allowlist without facts", () => {
    const summary = createExtractionSummary({
      sourceFactLedger: {
        additionalGeocodingLookupCount: 0,
        additionalModelCallCount: 0,
        additionalRetryCount: 0,
        candidateToSpanAmbiguityCount: 2,
        coverageCounts: {
          ambiguous: 2,
          carried: 10,
          context_only: 3,
          excluded: 1,
          structural_only: 4,
          uncovered: 2,
        },
        coverageHash: "coverage-hash",
        factCounts: {
          decision: 1,
          entity: 10,
          exclusion: 1,
          intent: 8,
          relationship: 4,
        },
        facts: [{ title: "must not survive" }],
        ledgerBuildMilliseconds: 17,
        ledgerHash: "ledger-hash",
        outputFingerprintAfter: "output-hash",
        outputFingerprintBefore: "output-hash",
        recoveryBatchCount: 1,
        recoveryPlanHash: "recovery-hash",
        recoveryUncoveredClauseCount: 2,
        schemaVersion: 1,
        serializedByteSize: 4096,
        sourceClauseCount: 22,
        sourceExcerpt: "must not survive",
        sourceFingerprint: "source-hash",
        status: "built",
        unresolvedRelationshipMemberCount: 4,
      },
    });
    assert.equal(summary.sourceFactLedger?.coverageCounts.structural_only, 4);
    assert.equal(summary.sourceFactLedger?.outputFingerprintBefore, "output-hash");
    assert.doesNotMatch(JSON.stringify(summary), /must not survive/i);
    assert.equal(
      "facts" in (summary.sourceFactLedger as Record<string, unknown>),
      false
    );
  });

  test("Loop 9 assembly decision telemetry survives the audit allowlist without private or candidate data", () => {
    const summary = createExtractionSummary({
      assemblyDecisionLedger: {
        additionalGeocodingLookupCount: 0,
        additionalModelCallCount: 0,
        additionalRetryCount: 0,
        ambiguousCount: 2,
        buildMilliseconds: 19,
        byteSize: 8192,
        candidateId: "candidate-must-not-survive",
        countsByDecisionDomain: {
          classification: 10,
          "Private Museum Title": 999,
        },
        countsByDisposition: { "entity:carried": 8 },
        countsByProducer: { deterministic_assembly: 12, resolver: 3 },
        countsByReconciliationOutcome: {
          applied: 2,
          rejected: 1,
          supporting: 0,
        },
        countsByRejectionCode: { low_confidence: 1 },
        countsBySourceLane: { chunk: 2, recovery: 1, spine: 0 },
        decisionSetHash: "decision-hash",
        failureClass: null,
        modelReason: "reason-must-not-survive",
        outputFingerprintAfter: "same-output-hash",
        outputFingerprintBefore: "same-output-hash",
        persistenceStatus: "inserted",
        schemaVersion: 1,
        sourceExcerpt: "excerpt-must-not-survive",
        sourceFactLedgerHash: "source-ledger-hash",
        status: "built",
        unresolvedCount: 1,
        writerVersion: 1,
      },
    });
    assert.equal(
      summary.assemblyDecisionLedger?.countsByDecisionDomain.classification,
      10
    );
    assert.equal(summary.assemblyDecisionLedger?.byteSize, 8192);
    assert.equal(
      summary.assemblyDecisionLedger?.outputFingerprintBefore,
      "same-output-hash"
    );
    assert.doesNotMatch(
      JSON.stringify(summary),
      /candidate-must-not-survive|reason-must-not-survive|excerpt-must-not-survive|Private Museum Title/i
    );
  });

  test("8.3 a dismissed detail becomes a dismissed question record carrying its reason", () => {
    const questions = createReviewQuestions({
      draft: {
        missingDetails: [
          {
            _canonicalQuestionGate:
              "subject entity no longer exists after assembly; a review item cannot outlive its subject",
            _canonicalReviewDisposition: "dismissed",
            _canonicalReviewId: "review-baths",
            canonicalReviewId: "review-baths",
            evidence: "Day title: Budapest Bathing",
            prompt: "Which bath house is planned?",
            targetField: "subject",
          },
        ],
      },
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip-arc-f",
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].status, "dismissed");
    assert.match(
      questions[0].dismissalReason ?? "",
      /cannot outlive its subject/
    );
    assert.equal(questions[0].prompt, "Which bath house is planned?");
  });

  test("8.3 an open question carries no dismissal reason", () => {
    const questions = createReviewQuestions({
      draft: {
        missingDetails: [
          {
            _canonicalReviewDisposition: "question",
            _canonicalReviewId: "review-open",
            canonicalReviewId: "review-open",
            prompt: "Which day is the castle visit?",
            targetField: "date",
          },
        ],
      },
      items: [],
      legs: [],
      stays: [],
      transport: [],
      tripId: "trip-arc-f",
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0].status, "open");
    assert.equal(questions[0].dismissalReason, null);
  });

  test("chain 3 capture-miss: a garbled confirmation label raises the quiet advisory", () => {
    // The live 7.23.2 shape: the OBB row shipped confirmationLabel
    // "Operator" (layout garbage) while the real locator VXFHXKCQEPHPUSNT
    // was never captured anywhere.
    const diagnostics = createAuditDiagnostics({
      lineage: [],
      records: recordsWith([
        transportRow({
          confirmationLabel: "Operator",
          id: "transport-obb",
          routeLabel: "Vienna to Budapest",
        }),
      ]),
    });
    const advisory = diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "transport_confirmation_value_not_captured"
    );
    assert.ok(advisory, "expected the capture-miss advisory to fire");
    assert.equal(advisory?.severity, "p2");
    assert.match(advisory?.evidence[0] ?? "", /Operator/);
  });

  test("chain 3 capture-miss: locator-shaped confirmations stay quiet", () => {
    const diagnostics = createAuditDiagnostics({
      lineage: [],
      records: recordsWith([
        transportRow({
          confirmationLabel: "#GHFHPG",
          id: "transport-delta",
          routeLabel: "FCO to JFK",
        }),
        transportRow({
          confirmationLabel: "0468406277",
          id: "transport-regiojet",
          routeLabel: "Prague to Vienna",
        }),
        transportRow({
          confirmationLabel: "VXFHXKCQEPHPUSNT",
          id: "transport-obb-good",
          routeLabel: "Vienna to Budapest",
        }),
      ]),
    });
    assert.equal(
      diagnostics.find(
        (diagnostic) =>
          diagnostic.code === "transport_confirmation_value_not_captured"
      ),
      undefined
    );
  });
}
