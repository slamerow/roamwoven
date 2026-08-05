import type {
  DraftAuditSnapshot,
  DraftRecordSummary,
  DraftStaySummary,
  DraftTransportSummary,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  asArray,
  asRecord,
  findOpenAIUsage,
  getString,
  getStringFromKeys,
  titleFrom,
  truncate,
} from "@/lib/extraction/trip-extraction-audit-utils";

function summarizeActivity(value: unknown, index: number): DraftRecordSummary {
  const record = asRecord(value);

  const numberField = (key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return {
    address: getString(record, "address"),
    approxLatitude: numberField("approxLatitude"),
    approxLongitude: numberField("approxLongitude"),
    verifiedLatitude: numberField("verifiedLatitude"),
    verifiedLongitude: numberField("verifiedLongitude"),
    geoVerified: record._geoVerified === true ? true : null,
    area: getString(record, "area"),
    category: getString(record, "category"),
    date: getString(record, "date"),
    description: truncate(getString(record, "description")),
    endTime: getString(record, "endTime"),
    evidence: truncate(getString(record, "evidence")),
    evidenceProvenance: getString(record, "_evidenceProvenance"),
    itemType: getString(record, "itemType"),
    locationName: getString(record, "locationName"),
    sourceFilename: getString(record, "sourceFilename"),
    sourceHeadingPath: Array.isArray(record.sourceHeadingPath)
      ? record.sourceHeadingPath.filter(
          (value): value is string => typeof value === "string"
        )
      : null,
    sourceSectionLabel: getString(record, "sourceSectionLabel"),
    startTime: getStringFromKeys(record, ["startTime", "time", "departureTime"]),
    title: titleFrom(record, ["title"], `Activity ${index + 1}`),
  };
}

function summarizeTransport(value: unknown, index: number): DraftTransportSummary {
  const record = asRecord(value);

  return {
    arrival: getString(record, "arrival"),
    arrivalTime: getString(record, "arrivalTime"),
    confirmation: getStringFromKeys(record, [
      "confirmation",
      "bookingNumber",
      "reservation",
      "ticketNumber",
    ]),
    date: getString(record, "date"),
    departureTime: getString(record, "departureTime"),
    description: truncate(getString(record, "description")),
    departure: getString(record, "departure"),
    provider: getStringFromKeys(record, ["provider", "operator"]),
    title: titleFrom(record, ["title", "routeLabel"], `Transport ${index + 1}`),
    type: getString(record, "type"),
  };
}

function summarizeStay(value: unknown, index: number): DraftStaySummary {
  const record = asRecord(value);

  return {
    address: getString(record, "address"),
    checkIn: getString(record, "checkIn"),
    checkInTime: getString(record, "checkInTime"),
    checkOut: getString(record, "checkOut"),
    checkOutTime: getString(record, "checkOutTime"),
    name: titleFrom(record, ["name", "title"], `Stay ${index + 1}`),
  };
}

function summarizeMissingDetail(value: unknown, index: number) {
  const record = asRecord(value);

  return {
    prompt: titleFrom(record, ["prompt"], `Missing detail ${index + 1}`),
    relatedTitle: getString(record, "relatedTitle"),
    subjectType: getString(record, "subjectType"),
    targetField: getString(record, "targetField"),
  };
}

export function createDraftAuditSnapshot(draft: unknown): DraftAuditSnapshot {
  const record = asRecord(draft);
  const activities = asArray(record.activities);
  const missingDetails = asArray(record.missingDetails);
  const places = asArray(record.places);
  const sensitiveDetails = asArray(record.sensitiveDetails);
  const stays = asArray(record.stays);
  const transport = asArray(record.transport);

  return {
    activities: activities.map(summarizeActivity),
    counts: {
      activities: activities.length,
      missingDetails: missingDetails.length,
      places: places.length,
      sensitiveDetails: sensitiveDetails.length,
      stays: stays.length,
      transport: transport.length,
    },
    missingDetails: missingDetails.map(summarizeMissingDetail),
    stays: stays.map(summarizeStay),
    transport: transport.map(summarizeTransport),
  };
}

export function createCanonicalizationSummary(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const evidence = asRecord(openai.evidence);
  const identityRecovery = asRecord(openai.identityRecovery);
  const identityRecoveryStatus =
    identityRecovery.status === "repaired"
      ? ("repaired" as const)
      : ("not_needed" as const);
  const observationCount = Number(evidence.observationCount) || 0;
  const dispositionCount = Number(evidence.dispositionCount) || 0;

  return {
    canonicalPieceCount: Number(evidence.canonicalPieceCount) || 0,
    clusteredObservationCount: Number(evidence.clusteredObservationCount) || 0,
    contextObservationCount: Number(evidence.contextObservationCount) || 0,
    dispositionCount,
    // G4.4 (docket §C, field 2): the claim ledger's telemetry has been
    // produced by evidence-clustering since Arc G.3b with ZERO consumers
    // repo-wide — lane contention was designed to be visible in run
    // telemetry and never reached a served surface. A probe of run 7.28.0's
    // response bodies found `claimsByLane` 0 times.
    groupingClaims: (() => {
      const claims = asRecord(evidence.groupingClaims);

      if (Object.keys(claims).length === 0) return null;

      const byLane = asRecord(claims.claimsByLane);

      return {
        claimedPieceCount: Number(claims.claimedPieceCount) || 0,
        claimsByLane: Object.fromEntries(
          Object.entries(byLane).map(([lane, count]) => [
            lane,
            Number(count) || 0,
          ])
        ),
        contestedPieceCount: Number(claims.contestedPieceCount) || 0,
        releasedDecisionCount: Number(claims.releasedDecisionCount) || 0,
      };
    })(),
    intentBlocks: (() => {
      const ledger = asRecord(evidence.intentBlocks);
      const blocks = Array.isArray(ledger.blocks) ? ledger.blocks : [];
      return {
        blocks: blocks.flatMap((value) => {
          const block = asRecord(value);
          const type = block.type;
          if (
            type !== "plan" &&
            type !== "ideas" &&
            type !== "logistics" &&
            type !== "evidence" &&
            type !== "ambiguous"
          ) {
            return [];
          }
          return [
            {
              blockId:
                typeof block.blockId === "string" ? block.blockId : "",
              date: typeof block.date === "string" ? block.date : "",
              memberIds: Array.isArray(block.memberIds)
                ? block.memberIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              memberTitles: Array.isArray(block.memberTitles)
                ? block.memberTitles.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              observationIds: Array.isArray(block.observationIds)
                ? block.observationIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              reason: typeof block.reason === "string" ? block.reason : "",
              type: type as
                | "plan"
                | "ideas"
                | "logistics"
                | "evidence"
                | "ambiguous",
            },
          ];
        }),
        version: 1 as const,
      };
    })(),
    identityRepairCount: Array.isArray(identityRecovery.actions)
      ? identityRecovery.actions.length
      : 0,
    // Run 7.23.2 chain 8.1: "repaired" with no violation text made the
    // repair trigger unknowable from the QA bundle (must-pass item 7). The
    // corridor's initial violation strings now ship in the audit summary.
    identityRecoveryInitialViolations: Array.isArray(
      identityRecovery.initialViolations
    )
      ? identityRecovery.initialViolations.filter(
          (value): value is string => typeof value === "string"
        )
      : [],
    identityRecoveryStatus,
    observationCount,
    parserArtifactRepairCount: Number(evidence.parserArtifactRepairCount) || 0,
    rejectedObservationCount: Number(evidence.rejectedObservationCount) || 0,
    sourceAnchorObservationCount:
      Number(evidence.sourceAnchorObservationCount) || 0,
    suppressedStandaloneAnchorCount:
      Number(evidence.suppressedWeakAnchorCount) || 0,
    transportFieldRepairCount:
      Number(evidence.transportFieldRepairCount) || 0,
    // G4.4 (docket §C, field 3): written to `usage` at Arc G.2 and served
    // by no audit endpoint. The COUNT alone cannot distinguish a repair
    // that recovered the field from a source anchor
    // (`repaired_from_source_anchor`) from one that gave up and cleared it
    // (`cleared_pending_review`) — Chain E's flagging branch was never
    // exercised and this is the surface that would have shown it. Support
    // telemetry only (AGENTS.md dark-factory), never maker-facing.
    transportFieldRepairs: Array.isArray(openai.transportFieldRepairs)
      ? openai.transportFieldRepairs.flatMap((repair) => {
          const record = asRecord(repair);

          return typeof record.outcome === "string"
            ? [
                {
                  defect:
                    typeof record.defect === "string" ? record.defect : "unknown",
                  field:
                    typeof record.field === "string" ? record.field : "unknown",
                  outcome: record.outcome,
                  pieceId:
                    typeof record.pieceId === "string" ? record.pieceId : "",
                  routeLabel:
                    typeof record.routeLabel === "string"
                      ? record.routeLabel
                      : "",
                },
              ]
            : [];
        })
      : [],
    undisposedObservationCount: Math.max(0, observationCount - dispositionCount),
  };
}

export function createExtractionSummary(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const activityChunks = asRecord(openai.activityChunks);
  const sourceCoverage = asRecord(openai.sourceCoverage);

  return {
    activityChunks:
      Object.keys(activityChunks).length > 0
        ? {
            count: Number(activityChunks.count) || 0,
            failed: Number(activityChunks.failed) || 0,
            rescued: Number(activityChunks.rescued) || 0,
            succeeded: Number(activityChunks.succeeded) || 0,
          }
        : null,
    // Deterministic day-section coverage (wave 2 + Arc A calibration,
    // RW-EVD-001). The FULL residual uncovered list ships in the audit so
    // drops are verifiable from the QA bundle (run5 calibration item —
    // previously only counts plus 10 capped evidence lines were visible).
    sourceCoverage:
      Object.keys(sourceCoverage).length > 0
        ? {
            crossStageCoveredLineCount:
              Number(sourceCoverage.crossStageCoveredLineCount) || 0,
            daySectionCount: Number(sourceCoverage.daySectionCount) || 0,
            meaningfulLineCount:
              Number(sourceCoverage.meaningfulLineCount) || 0,
            uncoveredLineCount:
              Number(sourceCoverage.uncoveredLineCount) || 0,
            uncoveredLines: Array.isArray(sourceCoverage.stages)
              ? sourceCoverage.stages.flatMap((stage) => {
                  const record = asRecord(stage);
                  const lines = Array.isArray(record.uncoveredLines)
                    ? record.uncoveredLines
                    : [];

                  return lines.flatMap((line) => {
                    const lineRecord = asRecord(line);

                    return typeof lineRecord.excerpt === "string"
                      ? [
                          {
                            excerpt: lineRecord.excerpt,
                            label:
                              typeof record.label === "string"
                                ? record.label
                                : "",
                          },
                        ]
                      : [];
                  });
                })
              : [],
          }
        : null,
    // What the extraction requests ACTUALLY SENT for sampling (run-2 handoff
    // §6; AGENTS.md rule 8(b)). This is the third field in a row to be
    // computed, threaded partway, and then dropped here — `formattedAddress
    // Count` and `excludedPlanningCostLineCount` were the first two. It is
    // whitelisted in the SAME change that starts sending the params, because
    // a change nobody can observe is not finished.
    extractionSampling: (() => {
      const sampling = asRecord(openai.extractionSampling);

      if (Object.keys(sampling).length === 0) return null;

      const numericParams = (value: unknown) =>
        Object.fromEntries(
          Object.entries(asRecord(value)).flatMap(([key, entry]) =>
            typeof entry === "number" && Number.isFinite(entry)
              ? [[key, entry] as const]
              : []
          )
        );

      return {
        liveCallCount: Number(sampling.liveCallCount) || 0,
        replayedCallCount: Number(sampling.replayedCallCount) || 0,
        resolved: numericParams(sampling.resolved),
        sent: numericParams(sampling.sent),
        strippedCallCount: Number(sampling.strippedCallCount) || 0,
      };
    })(),
    // RW-EVD-001 bounded recovery call telemetry (separate usage lane).
    sourceRecovery: (() => {
      const sourceRecovery = asRecord(openai.sourceRecovery);

      return Object.keys(sourceRecovery).length > 0
        ? {
            batchedLineCount: Number(sourceRecovery.batchedLineCount) || 0,
            droppedLineCount: Number(sourceRecovery.droppedLineCount) || 0,
            // Run 7.23.2 chain 8.2: computed by source-recovery since
            // ddb1699 but dropped by this whitelist — must-pass item 6
            // (excludedPlanningCostLineCount > 0) was unverifiable by
            // construction.
            excludedPlanningCostLineCount:
              Number(sourceRecovery.excludedPlanningCostLineCount) || 0,
            model:
              typeof sourceRecovery.model === "string"
                ? sourceRecovery.model
                : null,
            outcome:
              typeof sourceRecovery.outcome === "string"
                ? sourceRecovery.outcome
                : "unknown",
            recoveredLineCount:
              Number(sourceRecovery.recoveredLineCount) || 0,
            residualUncoveredLineCount:
              Number(sourceRecovery.residualUncoveredLineCount) || 0,
          }
        : null;
    })(),
    // Geocoding verification lane telemetry (Arc B): env-keyed, budgeted,
    // fail-soft, proximity-only. Verifiable from the QA bundle.
    geocodeVerification: (() => {
      const geocode = asRecord(openai.geocodeVerification);

      return Object.keys(geocode).length > 0
        ? {
            budget: Number(geocode.budget) || 0,
            // G4.4: the per-candidate ledger, carried whole and
            // unaggregated — the question it exists to answer ("why did
            // THIS stop not resolve?") is per-row by construction. This is
            // what makes a run-2 failure attributable across G4.1/G4.2/G4.3
            // instead of chargeable to "the geocoder pass".
            candidates: Array.isArray(geocode.candidates)
              ? geocode.candidates.flatMap((candidate) => {
                  const record = asRecord(candidate);

                  return typeof record.query === "string"
                    ? [
                        {
                          candidateId:
                            typeof record.candidateId === "string"
                              ? record.candidateId
                              : null,
                          containerSourceSupported:
                            typeof record.containerSourceSupported === "boolean"
                              ? record.containerSourceSupported
                              : null,
                          containerTitle:
                            typeof record.containerTitle === "string"
                              ? record.containerTitle
                              : null,
                          granularity:
                            typeof record.granularity === "string"
                              ? record.granularity
                              : null,
                          outcome:
                            typeof record.outcome === "string"
                              ? record.outcome
                              : "unknown",
                          query: record.query,
                          rank: Number(record.rank) || 0,
                          retried: record.retried === true,
                          retryQuery:
                            typeof record.retryQuery === "string"
                              ? record.retryQuery
                              : null,
                        },
                      ]
                    : [];
                })
              : [],
            candidateCount: Number(geocode.candidateCount) || 0,
            failedCount: Number(geocode.failedCount) || 0,
            // G4.4 (docket §C): declared and incremented by the lane since
            // Arc G.3a and dropped HERE, which is why "the address path
            // never fired" and "nobody plumbed the counter" were
            // indistinguishable — and per docket §A.4 that is precisely the
            // question Schönbrunn turned on. Absent is not zero.
            formattedAddressCount: Number(geocode.formattedAddressCount) || 0,
            localityRejectedCount: Number(geocode.localityRejectedCount) || 0,
            lookupCount: Number(geocode.lookupCount) || 0,
            outcome:
              typeof geocode.outcome === "string"
                ? geocode.outcome
                : "unknown",
            resolvedCount: Number(geocode.resolvedCount) || 0,
            retryAcceptedCount: Number(geocode.retryAcceptedCount) || 0,
            retryCount: Number(geocode.retryCount) || 0,
            retryOutOfCityCount: Number(geocode.retryOutOfCityCount) || 0,
            retryUnlistedContainerCount:
              Number(geocode.retryUnlistedContainerCount) || 0,
            retrySkippedOverBudgetCount:
              Number(geocode.retrySkippedOverBudgetCount) || 0,
            skippedOverBudgetCount:
              Number(geocode.skippedOverBudgetCount) || 0,
          }
        : null;
    })(),
    staged: openai.staged === true,
  };
}

export function getAuditSnapshotFromUsage(usage: unknown, key: string) {
  const openai = findOpenAIUsage(usage);
  const audit = asRecord(openai.audit);
  const snapshot = audit[key];

  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as DraftAuditSnapshot)
    : null;
}
