import type {
  DraftAuditSnapshot,
  DraftRecordSummary,
  DraftStaySummary,
  DraftTransportSummary,
  TripExtractionAuditReport,
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

export function createCanonicalizationSummary(
  usage: unknown
): TripExtractionAuditReport["canonicalization"] {
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
    activityCandidacyDecisions: Array.isArray(
      evidence.activityCandidacyDecisions
    )
      ? evidence.activityCandidacyDecisions.flatMap((value) => {
          const decision = asRecord(value);
          const decisionId =
            typeof decision.decisionId === "string"
              ? decision.decisionId
              : null;
          const observationId =
            typeof decision.observationId === "string"
              ? decision.observationId
              : null;
          if (!decisionId || !observationId) return [];
          return [
            {
              activityCandidate: decision.activityCandidate === true,
              blockDecisionId:
                typeof decision.blockDecisionId === "string"
                  ? decision.blockDecisionId
                  : null,
              canonicalPieceIds: Array.isArray(decision.canonicalPieceIds)
                ? decision.canonicalPieceIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              commitmentObservationIds: Array.isArray(
                decision.commitmentObservationIds
              )
                ? decision.commitmentObservationIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              commitmentSignals: Array.isArray(decision.commitmentSignals)
                ? decision.commitmentSignals.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              contradiction: decision.contradiction === true,
              decisionId,
              destination:
                typeof decision.destination === "string"
                  ? decision.destination
                  : "context",
              ideaContextBefore: decision.ideaContextBefore === true,
              ideaContextObservationId:
                typeof decision.ideaContextObservationId === "string"
                  ? decision.ideaContextObservationId
                  : null,
              referenceNoteObservationId:
                typeof decision.referenceNoteObservationId === "string"
                  ? decision.referenceNoteObservationId
                  : null,
              inputEvidenceRole:
                typeof decision.inputEvidenceRole === "string"
                  ? decision.inputEvidenceRole
                  : null,
              inputItemType:
                typeof decision.inputItemType === "string"
                  ? decision.inputItemType
                  : null,
              observationId,
              observationDate:
                typeof decision.observationDate === "string"
                  ? decision.observationDate
                  : null,
              observationOrdinal:
                typeof decision.observationOrdinal === "number"
                  ? decision.observationOrdinal
                  : 0,
              observationTitle:
                typeof decision.observationTitle === "string"
                  ? decision.observationTitle
                  : null,
              reasonCode:
                typeof decision.reasonCode === "string"
                  ? decision.reasonCode
                  : "EXPLICIT_CONTEXT",
              title:
                typeof decision.title === "string" ? decision.title : null,
              winningSignal:
                typeof decision.winningSignal === "string"
                  ? decision.winningSignal
                  : "source_structure",
            },
          ];
        })
      : [],
    canonicalPieceCount: Number(evidence.canonicalPieceCount) || 0,
    clusteredObservationCount: Number(evidence.clusteredObservationCount) || 0,
    contextObservationCount: Number(evidence.contextObservationCount) || 0,
    dispositionCount,
    containmentLedger: (() => {
      const ledger = asRecord(evidence.containmentLedger);
      if (Object.keys(ledger).length === 0) return null;
      const decisions = Array.isArray(ledger.decisions)
        ? ledger.decisions.flatMap((value) => {
            const decision = asRecord(value);
            const relationType = decision.relationType;
            const source = decision.source;
            const callPolicy = decision.callPolicy;
            if (
              (relationType !== "authored_route" &&
                relationType !== "same_site" &&
                relationType !== "source_area_walk") ||
              (source !== "deterministic_containment" &&
                source !== "resolver_containment") ||
              (callPolicy !== "required" && callPolicy !== "silent") ||
              typeof decision.decisionId !== "string" ||
              typeof decision.containerTitle !== "string" ||
              typeof decision.date !== "string"
            ) {
              return [];
            }
            const typedCallPolicy = callPolicy as "required" | "silent";
            const typedRelationType = relationType as
              | "authored_route"
              | "same_site"
              | "source_area_walk";
            const typedSource = source as
              | "deterministic_containment"
              | "resolver_containment";
            const members = Array.isArray(decision.members)
              ? decision.members.flatMap((value) => {
                  const member = asRecord(value);
                  if (
                    typeof member.pieceId !== "string" ||
                    typeof member.title !== "string"
                  ) {
                    return [];
                  }
                  return [{
                    evidence: Array.isArray(member.evidence)
                      ? member.evidence.filter(
                          (item): item is string => typeof item === "string"
                        )
                      : [],
                    observationIds: Array.isArray(member.observationIds)
                      ? member.observationIds.filter(
                          (item): item is string => typeof item === "string"
                        )
                      : [],
                    pieceId: member.pieceId,
                    sourceOrder: Number(member.sourceOrder) || 0,
                    title: member.title,
                  }];
                })
              : [];
            const rejections = Array.isArray(decision.rejections)
              ? decision.rejections.flatMap((value) => {
                  const rejection = asRecord(value);
                  if (
                    typeof rejection.pieceId !== "string" ||
                    typeof rejection.reasonCode !== "string" ||
                    typeof rejection.title !== "string"
                  ) {
                    return [];
                  }
                  return [{
                    pieceId: rejection.pieceId,
                    reasonCode: rejection.reasonCode,
                    title: rejection.title,
                  }];
                })
              : [];
            return [{
              callPolicy: typedCallPolicy,
              containerObservationIds: Array.isArray(
                decision.containerObservationIds
              )
                ? decision.containerObservationIds.filter(
                    (item): item is string => typeof item === "string"
                  )
                : [],
              containerPieceId:
                typeof decision.containerPieceId === "string"
                  ? decision.containerPieceId
                  : null,
              containerTitle: decision.containerTitle,
              date: decision.date,
              decisionId: decision.decisionId,
              members,
              relationType: typedRelationType,
              rejections,
              source: typedSource,
            }];
          })
        : [];
      return {
        decisions,
        doNotMergePairCount: Number(ledger.doNotMergePairCount) || 0,
        rejectedCandidateCount: Number(ledger.rejectedCandidateCount) || 0,
        version: 1 as const,
      };
    })(),
    groupingExecution: (() => {
      const ledger = asRecord(evidence.groupingExecution);
      if (Object.keys(ledger).length === 0) return null;
      const stringList = (value: unknown) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [];
      const decisions = Array.isArray(ledger.decisions)
        ? ledger.decisions.flatMap((value) => {
            const decision = asRecord(value);
            const parent = asRecord(decision.parent);
            const provenance = asRecord(decision.provenance);
            const relationType = provenance.relationType;
            const source = provenance.source;
            const callPolicy = decision.callPolicy;
            if (
              typeof decision.claim !== "string" ||
              typeof decision.date !== "string" ||
              typeof decision.decisionId !== "string" ||
              (callPolicy !== "required" && callPolicy !== "silent") ||
              typeof parent.pieceId !== "string" ||
              typeof parent.title !== "string" ||
              typeof provenance.containmentDecisionId !== "string" ||
              (relationType !== "authored_route" &&
                relationType !== "same_site" &&
                relationType !== "source_area_walk") ||
              (source !== "deterministic_containment" &&
                source !== "resolver_containment")
            ) {
              return [];
            }
            const members = Array.isArray(decision.members)
              ? decision.members.flatMap((value) => {
                  const member = asRecord(value);
                  if (
                    typeof member.pieceId !== "string" ||
                    typeof member.title !== "string"
                  ) {
                    return [];
                  }
                  return [{
                    evidence: stringList(member.evidence),
                    observationIds: stringList(member.observationIds),
                    pieceId: member.pieceId,
                    sourceOrder: Number(member.sourceOrder) || 0,
                    title: member.title,
                  }];
                })
              : [];
            const rejections = Array.isArray(decision.rejections)
              ? decision.rejections.flatMap((value) => {
                  const rejection = asRecord(value);
                  if (
                    typeof rejection.pieceId !== "string" ||
                    typeof rejection.reasonCode !== "string" ||
                    typeof rejection.title !== "string"
                  ) {
                    return [];
                  }
                  return [{
                    pieceId: rejection.pieceId,
                    reasonCode: rejection.reasonCode,
                    title: rejection.title,
                  }];
                })
              : [];
            return [{
              callPolicy: callPolicy as "required" | "silent",
              claim: decision.claim,
              date: decision.date,
              decisionId: decision.decisionId,
              members,
              parent: {
                observationIds: stringList(parent.observationIds),
                pieceId: parent.pieceId,
                synthetic: parent.synthetic === true,
                title: parent.title,
              },
              provenance: {
                containmentDecisionId: provenance.containmentDecisionId,
                relationType: relationType as
                  | "authored_route"
                  | "same_site"
                  | "source_area_walk",
                source: source as
                  | "deterministic_containment"
                  | "resolver_containment",
              },
              rejections,
            }];
          })
        : [];
      const unresolvedMappings = Array.isArray(ledger.unresolvedMappings)
        ? ledger.unresolvedMappings.flatMap((value) => {
            const mapping = asRecord(value);
            if (
              typeof mapping.containmentDecisionId !== "string" ||
              (mapping.role !== "member" && mapping.role !== "parent")
            ) {
              return [];
            }
            return [{
              containmentDecisionId: mapping.containmentDecisionId,
              observationIds: stringList(mapping.observationIds),
              pieceId:
                typeof mapping.pieceId === "string" ? mapping.pieceId : null,
              role: mapping.role as "member" | "parent",
            }];
          })
        : [];
      return { decisions, unresolvedMappings, version: 1 as const };
    })(),
    identityLedger: (() => {
      const ledger = asRecord(evidence.identityLedger);
      if (Object.keys(ledger).length === 0) return null;
      const validReasons = new Set([
        "city_note_evidence_wins",
        "committed_activity_wins",
        "cross_referenced_same_day_venue",
        "identity_lane_merge",
        "repeated_uncommitted_to_city_note",
        "source_sequenced_occurrence_wins",
      ]);
      const stringList = (value: unknown) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [];
      const decisions = Array.isArray(ledger.decisions)
        ? ledger.decisions.flatMap((value) => {
            const decision = asRecord(value);
            if (
              typeof decision.decisionId !== "string" ||
              typeof decision.survivorPieceId !== "string" ||
              (decision.finalHome !== "activity" &&
                decision.finalHome !== "city_note") ||
              typeof decision.reasonCode !== "string" ||
              !validReasons.has(decision.reasonCode)
            ) {
              return [];
            }
            const finalHome = decision.finalHome as
              | "activity"
              | "city_note";
            const reasonCode = decision.reasonCode as
              | "city_note_evidence_wins"
              | "committed_activity_wins"
              | "cross_referenced_same_day_venue"
              | "identity_lane_merge"
              | "repeated_uncommitted_to_city_note"
              | "source_sequenced_occurrence_wins";
            return [{
              acceptedFactDigests: stringList(
                decision.acceptedFactDigests
              ),
              decisionId: decision.decisionId,
              finalDate:
                typeof decision.finalDate === "string"
                  ? decision.finalDate
                  : null,
              finalHome,
              loserPieceIds: stringList(decision.loserPieceIds),
              observationIds: stringList(decision.observationIds),
              priorDates: stringList(decision.priorDates),
              reasonCode,
              survivorPieceId: decision.survivorPieceId,
              usefulFactDigests: stringList(decision.usefulFactDigests),
            }];
          })
        : [];
      return {
        decisions,
        unresolvedCarrierCount:
          Number(ledger.unresolvedCarrierCount) || 0,
        version: 1 as const,
      };
    })(),
    ambiguousIntentHomes: Array.isArray(evidence.ambiguousIntentHomes)
      ? evidence.ambiguousIntentHomes.flatMap((value) => {
          const decision = asRecord(value);
          if (
            typeof decision.blockDecisionId !== "string" ||
            typeof decision.decisionId !== "string" ||
            typeof decision.pieceId !== "string" ||
            decision.finalHome !== "city_note" ||
            decision.reasonCode !== "unresolved_ambiguous_to_city_note"
          ) {
            return [];
          }
          return [{
            blockDecisionId: decision.blockDecisionId,
            decisionId: decision.decisionId,
            finalHome: "city_note" as const,
            originalDate:
              typeof decision.originalDate === "string"
                ? decision.originalDate
                : null,
            pieceId: decision.pieceId,
            reasonCode: "unresolved_ambiguous_to_city_note" as const,
            title:
              typeof decision.title === "string" ? decision.title : null,
          }];
        })
      : [],
    finalProjectionSafety: (() => {
      const ledger = asRecord(evidence.finalProjectionSafety);
      if (Object.keys(ledger).length === 0) return null;
      const validCarrierOutcomes = new Set([
        "already_present",
        "explicitly_excluded",
        "restored",
        "unresolved",
      ]);
      const validSafetyOutcomes = new Set(["excluded", "redacted"]);
      const contentCarrierDecisions = Array.isArray(
        ledger.contentCarrierDecisions
      )
        ? ledger.contentCarrierDecisions.flatMap((value) => {
            const decision = asRecord(value);
            if (
              typeof decision.factDigest !== "string" ||
              typeof decision.sourcePieceId !== "string" ||
              decision.carrierField !== "description" ||
              typeof decision.outcome !== "string" ||
              !validCarrierOutcomes.has(decision.outcome)
            ) {
              return [];
            }
            return [{
              carrierField: "description" as const,
              carrierPieceId:
                typeof decision.carrierPieceId === "string"
                  ? decision.carrierPieceId
                  : null,
              factDigest: decision.factDigest,
              outcome: decision.outcome as
                | "already_present"
                | "explicitly_excluded"
                | "restored"
                | "unresolved",
              sourcePieceId: decision.sourcePieceId,
            }];
          })
        : [];
      const decisions = Array.isArray(ledger.decisions)
        ? ledger.decisions.flatMap((value) => {
            const decision = asRecord(value);
            if (
              typeof decision.canonicalPieceId !== "string" ||
              typeof decision.segmentDigest !== "string" ||
              typeof decision.outcome !== "string" ||
              !validSafetyOutcomes.has(decision.outcome)
            ) {
              return [];
            }
            return [{
              canonicalPieceId: decision.canonicalPieceId,
              outcome: decision.outcome as "excluded" | "redacted",
              rawSafety:
                typeof decision.rawSafety === "string"
                  ? decision.rawSafety
                  : "unknown",
              sanitizedSafety:
                typeof decision.sanitizedSafety === "string"
                  ? decision.sanitizedSafety
                  : "unknown",
              segmentDigest: decision.segmentDigest,
            }];
          })
        : [];
      return {
        contentCarrierDecisions,
        decisions,
        finalPublicProtectedSegmentCount:
          Number(ledger.finalPublicProtectedSegmentCount) || 0,
        unresolvedFactCount: Number(ledger.unresolvedFactCount) || 0,
        version: 1 as const,
      };
    })(),
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
    stageWriterTrace: Array.isArray(evidence.stageWriterTrace)
      ? evidence.stageWriterTrace.flatMap((entry) => {
          const trace = asRecord(entry);
          const decisionDomain = trace.decisionDomain;
          if (
            decisionDomain !== "source_normalization" &&
            decisionDomain !== "pre_classification_mutation" &&
            decisionDomain !== "classification" &&
            decisionDomain !== "containment" &&
            decisionDomain !== "identity" &&
            decisionDomain !== "grouping" &&
            decisionDomain !== "review" &&
            decisionDomain !== "final_projection"
          ) {
            return [];
          }
          if (
            typeof trace.beforeHash !== "string" ||
            typeof trace.afterHash !== "string" ||
            typeof trace.writer !== "string"
          ) {
            return [];
          }
          return [
            {
              afterHash: trace.afterHash,
              beforeHash: trace.beforeHash,
              changed: trace.changed === true,
              changedPieceCount:
                typeof trace.changedPieceCount === "number"
                  ? trace.changedPieceCount
                  : null,
              decisionDomain: decisionDomain as
                | "source_normalization"
                | "pre_classification_mutation"
                | "classification"
                | "containment"
                | "identity"
                | "grouping"
                | "review"
                | "final_projection",
              ordinal: Number(trace.ordinal) || 0,
              writer: trace.writer,
              writes: Array.isArray(trace.writes)
                ? trace.writes.filter(
                    (value): value is string => typeof value === "string"
                  )
                : [],
            },
          ];
        })
      : [],
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
    sourceBoundedDisjunctionRepairs: Array.isArray(
      evidence.sourceBoundedDisjunctionRepairs
    )
      ? evidence.sourceBoundedDisjunctionRepairs.flatMap((value) => {
          const repair = asRecord(value);
          const beforeRoles = Array.isArray(repair.beforeRoles)
            ? repair.beforeRoles
            : [];
          const afterRoles = Array.isArray(repair.afterRoles)
            ? repair.afterRoles
            : [];
          if (
            repair.rule !== "explicit_local_or_v1" ||
            typeof repair.spanHash !== "string" ||
            beforeRoles.length !== 2 ||
            afterRoles.length !== 2
          ) {
            return [];
          }
          const role = (entry: unknown) =>
            typeof entry === "string" ? entry : null;
          return [
            {
              afterRoles: [role(afterRoles[0]), role(afterRoles[1])] as [
                string | null,
                string | null,
              ],
              beforeRoles: [role(beforeRoles[0]), role(beforeRoles[1])] as [
                string | null,
                string | null,
              ],
              canonicalPieceIds: Array.isArray(repair.canonicalPieceIds)
                ? repair.canonicalPieceIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              observationIds: Array.isArray(repair.observationIds)
                ? repair.observationIds.filter(
                    (entry): entry is string => typeof entry === "string"
                  )
                : [],
              rule: "explicit_local_or_v1" as const,
              spanEnd: Number(repair.spanEnd) || 0,
              spanHash: repair.spanHash,
              spanStart: Number(repair.spanStart) || 0,
            },
          ];
        })
      : [],
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
  const assemblyDecisionLedger = asRecord(openai.assemblyDecisionLedger);
  const sourceCoverage = asRecord(openai.sourceCoverage);
  const sourceFactAssemblyAuthority = asRecord(
    openai.sourceFactAssemblyAuthority
  );
  const sourceFactLedger = asRecord(openai.sourceFactLedger);

  const aggregateCounts = (value: unknown, allowedKeys: readonly string[]) => {
    const record = asRecord(value);
    return Object.fromEntries(
      allowedKeys.map((key) => [key, Number(record[key]) || 0])
    );
  };

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
    // Loop 9 support telemetry is deliberately aggregate-only. The fixed key
    // sets below prevent an injected title, excerpt, candidate id, or model
    // reason from entering the served audit snapshot even as an object key.
    assemblyDecisionLedger:
      Object.keys(assemblyDecisionLedger).length > 0
        ? {
            additionalGeocodingLookupCount:
              Number(
                assemblyDecisionLedger.additionalGeocodingLookupCount
              ) || 0,
            additionalModelCallCount:
              Number(assemblyDecisionLedger.additionalModelCallCount) || 0,
            additionalRetryCount:
              Number(assemblyDecisionLedger.additionalRetryCount) || 0,
            ambiguousCount:
              Number(assemblyDecisionLedger.ambiguousCount) || 0,
            buildMilliseconds:
              Number(assemblyDecisionLedger.buildMilliseconds) || 0,
            byteSize: Number(assemblyDecisionLedger.byteSize) || 0,
            countsByDecisionDomain: aggregateCounts(
              assemblyDecisionLedger.countsByDecisionDomain,
              [
                "classification",
                "containment",
                "identity",
                "grouping",
                "review",
                "publish_projection",
              ]
            ),
            countsByDisposition: aggregateCounts(
              assemblyDecisionLedger.countsByDisposition,
              [
                "decision:dismissed",
                "decision:resolved_silently",
                "decision:review",
                "decision:unresolved",
                "entity:carried",
                "entity:evidence_only",
                "entity:unresolved",
                "exclusion:excluded",
                "intent:applied",
                "intent:superseded",
                "intent:unresolved",
                "relationship:applied",
                "relationship:rejected",
                "relationship:unresolved",
              ]
            ),
            countsByProducer: aggregateCounts(
              assemblyDecisionLedger.countsByProducer,
              ["deterministic_assembly", "resolver"]
            ),
            countsByReconciliationOutcome: aggregateCounts(
              assemblyDecisionLedger.countsByReconciliationOutcome,
              ["applied", "rejected", "supporting"]
            ),
            countsByRejectionCode: aggregateCounts(
              assemblyDecisionLedger.countsByRejectionCode,
              [
                "conflicting_classification",
                "duplicate_proposal",
                "low_confidence",
                "unknown_candidate",
              ]
            ),
            countsBySourceLane: aggregateCounts(
              assemblyDecisionLedger.countsBySourceLane,
              ["chunk", "recovery", "spine"]
            ),
            decisionSetHash:
              typeof assemblyDecisionLedger.decisionSetHash === "string"
                ? assemblyDecisionLedger.decisionSetHash
                : null,
            failureClass:
              typeof assemblyDecisionLedger.failureClass === "string"
                ? assemblyDecisionLedger.failureClass
                : null,
            outputFingerprintAfter:
              typeof assemblyDecisionLedger.outputFingerprintAfter === "string"
                ? assemblyDecisionLedger.outputFingerprintAfter
                : null,
            outputFingerprintBefore:
              typeof assemblyDecisionLedger.outputFingerprintBefore === "string"
                ? assemblyDecisionLedger.outputFingerprintBefore
                : null,
            persistenceStatus:
              typeof assemblyDecisionLedger.persistenceStatus === "string"
                ? assemblyDecisionLedger.persistenceStatus
                : null,
            schemaVersion:
              Number(assemblyDecisionLedger.schemaVersion) || 0,
            sourceFactLedgerHash:
              typeof assemblyDecisionLedger.sourceFactLedgerHash === "string"
                ? assemblyDecisionLedger.sourceFactLedgerHash
                : null,
            status:
              typeof assemblyDecisionLedger.status === "string"
                ? assemblyDecisionLedger.status
                : "unknown",
            unresolvedCount:
              Number(assemblyDecisionLedger.unresolvedCount) || 0,
            writerVersion:
              Number(assemblyDecisionLedger.writerVersion) || 0,
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
    // Loop 10 authority is a production release gate, not traveler content.
    // Keep its outcome visible in the private QA snapshot so a fail-soft run
    // cannot be mistaken for evidence that the new authority path executed.
    // The fixed allowlist excludes candidate diagnostics and source content.
    sourceFactAssemblyAuthority:
      Object.keys(sourceFactAssemblyAuthority).length > 0
        ? {
            authorityHash:
              typeof sourceFactAssemblyAuthority.authorityHash === "string"
                ? sourceFactAssemblyAuthority.authorityHash
                : null,
            behaviorSignalCandidateCount:
              Number(
                sourceFactAssemblyAuthority.behaviorSignalCandidateCount
              ) || 0,
            candidateCount:
              Number(sourceFactAssemblyAuthority.candidateCount) || 0,
            compositePlanRecoveredCandidateCount:
              Number(
                sourceFactAssemblyAuthority.compositePlanRecoveredCandidateCount
              ) || 0,
            failureClass:
              typeof sourceFactAssemblyAuthority.failureClass === "string"
                ? sourceFactAssemblyAuthority.failureClass
                : null,
            mappedCandidateCount:
              Number(sourceFactAssemblyAuthority.mappedCandidateCount) || 0,
            relationshipDecisionCount:
              Number(
                sourceFactAssemblyAuthority.relationshipDecisionCount
              ) || 0,
            relationshipRecoveredCandidateCount:
              Number(
                sourceFactAssemblyAuthority.relationshipRecoveredCandidateCount
              ) || 0,
            relationshipRecoveryStageCount:
              Number(
                sourceFactAssemblyAuthority.relationshipRecoveryStageCount
              ) || 0,
            relationshipUnresolvedCount:
              Number(
                sourceFactAssemblyAuthority.relationshipUnresolvedCount
              ) || 0,
            roleDecisionCount:
              Number(sourceFactAssemblyAuthority.roleDecisionCount) || 0,
            schemaVersion:
              Number(sourceFactAssemblyAuthority.schemaVersion) || 0,
            status:
              typeof sourceFactAssemblyAuthority.status === "string"
                ? sourceFactAssemblyAuthority.status
                : "unknown",
            tailReferenceRecoveredCandidateCount:
              Number(
                sourceFactAssemblyAuthority.tailReferenceRecoveredCandidateCount
              ) || 0,
            unresolvedBehaviorCandidateCount:
              Number(
                sourceFactAssemblyAuthority.unresolvedBehaviorCandidateCount
              ) || 0,
            unresolvedSourceBindingCount:
              Number(
                sourceFactAssemblyAuthority.unresolvedSourceBindingCount
              ) || 0,
          }
        : null,
    // Source Fact Ledger V1 is shadow-only support telemetry. Only the
    // explicit counts, versions, hashes, byte size, and duration allowlist
    // reaches audit/QA surfaces; facts and source excerpts never do.
    sourceFactLedger:
      Object.keys(sourceFactLedger).length > 0
        ? {
            additionalGeocodingLookupCount:
              Number(sourceFactLedger.additionalGeocodingLookupCount) || 0,
            additionalModelCallCount:
              Number(sourceFactLedger.additionalModelCallCount) || 0,
            additionalRetryCount:
              Number(sourceFactLedger.additionalRetryCount) || 0,
            candidateToSpanAmbiguityCount:
              Number(sourceFactLedger.candidateToSpanAmbiguityCount) || 0,
            coverageCounts: {
              ambiguous:
                Number(asRecord(sourceFactLedger.coverageCounts).ambiguous) ||
                0,
              carried:
                Number(asRecord(sourceFactLedger.coverageCounts).carried) || 0,
              context_only:
                Number(
                  asRecord(sourceFactLedger.coverageCounts).context_only
                ) || 0,
              excluded:
                Number(asRecord(sourceFactLedger.coverageCounts).excluded) || 0,
              structural_only:
                Number(
                  asRecord(sourceFactLedger.coverageCounts).structural_only
                ) || 0,
              uncovered:
                Number(asRecord(sourceFactLedger.coverageCounts).uncovered) || 0,
            },
            coverageHash:
              typeof sourceFactLedger.coverageHash === "string"
                ? sourceFactLedger.coverageHash
                : null,
            factCounts: {
              decision:
                Number(asRecord(sourceFactLedger.factCounts).decision) || 0,
              entity: Number(asRecord(sourceFactLedger.factCounts).entity) || 0,
              exclusion:
                Number(asRecord(sourceFactLedger.factCounts).exclusion) || 0,
              intent: Number(asRecord(sourceFactLedger.factCounts).intent) || 0,
              relationship:
                Number(asRecord(sourceFactLedger.factCounts).relationship) || 0,
            },
            failureClass:
              typeof sourceFactLedger.failureClass === "string"
                ? sourceFactLedger.failureClass
                : null,
            ledgerBuildMilliseconds:
              Number(sourceFactLedger.ledgerBuildMilliseconds) || 0,
            ledgerHash:
              typeof sourceFactLedger.ledgerHash === "string"
                ? sourceFactLedger.ledgerHash
                : null,
            outputFingerprintAfter:
              typeof sourceFactLedger.outputFingerprintAfter === "string"
                ? sourceFactLedger.outputFingerprintAfter
                : null,
            outputFingerprintBefore:
              typeof sourceFactLedger.outputFingerprintBefore === "string"
                ? sourceFactLedger.outputFingerprintBefore
                : null,
            recoveryBatchCount:
              Number(sourceFactLedger.recoveryBatchCount) || 0,
            recoveryPlanHash:
              typeof sourceFactLedger.recoveryPlanHash === "string"
                ? sourceFactLedger.recoveryPlanHash
                : null,
            recoveryUncoveredClauseCount:
              Number(sourceFactLedger.recoveryUncoveredClauseCount) || 0,
            schemaVersion: Number(sourceFactLedger.schemaVersion) || 0,
            serializedByteSize:
              Number(sourceFactLedger.serializedByteSize) || 0,
            sourceClauseCount:
              Number(sourceFactLedger.sourceClauseCount) || 0,
            sourceFingerprint:
              typeof sourceFactLedger.sourceFingerprint === "string"
                ? sourceFactLedger.sourceFingerprint
                : null,
            status:
              typeof sourceFactLedger.status === "string"
                ? sourceFactLedger.status
                : "unknown",
            unresolvedRelationshipMemberCount:
              Number(sourceFactLedger.unresolvedRelationshipMemberCount) || 0,
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
            deterministicResidualLineCount:
              Number(sourceRecovery.deterministicResidualLineCount) || 0,
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
