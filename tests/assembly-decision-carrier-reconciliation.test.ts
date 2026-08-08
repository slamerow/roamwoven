import assert from "node:assert/strict";

import { buildAssemblyDecisionCarrierLedgerV1 } from "@/lib/extraction/assembly-decision-carrier-builder";
import type { CanonicalEvidenceResolverMetadata } from "@/lib/extraction/canonical-evidence-resolver";
import {
  clusterExtractedEvidence,
  type CanonicalEvidencePiece,
  type EvidenceObservation,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import {
  buildSourceDocumentIndexV1,
  hashStableValue,
} from "@/lib/extraction/source-document-index";
import type { StructuredTripRecords, TripItemRecord } from "@/lib/generated-trip-model";
import { sourceFactFixture } from "@/tests/fixtures/source-fact-ledger-v1";

function resolverMetadata(): CanonicalEvidenceResolverMetadata {
  return {
    cacheHit: false,
    candidateCount: 2,
    claimEvaluations: [],
    claims: [],
    lookupKey: null,
    resolvedAt: null,
    roleDecisions: [
      {
        candidateId: "candidate-museum",
        classification: "keep_activity",
        reason: "The source gives this visit a fixed time.",
      },
    ],
    roleEvaluations: [
      {
        candidateId: "candidate-museum",
        classification: "keep_activity",
        confidence: "high",
        duplicateOrdinal: 0,
        reason: "The source gives this visit a fixed time.",
        reconciliationOutcome: "applied",
        rejectionCodes: [],
        windowCandidateIds: ["candidate-market", "candidate-museum"],
      },
      {
        candidateId: "candidate-market",
        classification: "city_note",
        confidence: "medium",
        duplicateOrdinal: 0,
        reason: "The source hedge is not conclusive enough for application.",
        reconciliationOutcome: "rejected",
        rejectionCodes: ["low_confidence"],
        windowCandidateIds: ["candidate-market", "candidate-museum"],
      },
    ],
    sources: [],
    version: 7,
    windowCount: 1,
  };
}

function assembledFixture() {
  const sourceText = [
    "Friday, April 5th",
    "Sample City",
    "Harbor Hotel",
    "Central Station to Sample City",
    "Museum Visit at 10:00",
    "maybe Riverside Market",
    "What time should Museum Visit start?",
    "Door access code SAMPLE42",
    "Budget: $500",
  ].join("\n");
  const index = buildSourceDocumentIndexV1([
    {
      filename: "sanitized-ledger.txt",
      sourceProvenance: "manual_note",
      sourceUploadId: "upload-sanitized-ledger",
      text: sourceText,
      type: "note",
    },
  ]);
  const stage: EvidenceStageInput = {
    label: "Friday, April 5th",
    source: "model_chunk",
    sourceFilename: "sanitized-ledger.txt",
    sourceProvenance: "manual_note",
    sourceSpanIds: index.spans.map((span) => span.spanId),
    sourceText,
    sourceUploadId: "upload-sanitized-ledger",
    stage: {
      activities: [
        {
          _resolverCandidateId: "candidate-museum",
          category: "art_culture",
          city: "Sample City",
          date: "2034-04-05",
          evidence: "Museum Visit at 10:00",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          startTime: "10:00",
          title: "Museum Visit",
        },
        {
          _resolverCandidateId: "candidate-market",
          category: "food_and_drink",
          city: "Sample City",
          date: "2034-04-05",
          evidence: "maybe Riverside Market",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          title: "Riverside Market",
        },
      ],
      missingDetails: [
        {
          answerType: "time",
          confidence: "medium",
          evidence: "What time should Museum Visit start?",
          guessedValue: null,
          prompt: "What time should Museum Visit start?",
          reason: "The source asks for a time decision.",
          relatedTitle: "Museum Visit",
          subjectType: "item",
          targetField: "startTime",
        },
      ],
      places: [
        {
          arriveDate: "2034-04-05",
          city: "Sample City",
          country: "Exampleland",
          evidence: "Sample City",
          leaveDate: "2034-04-07",
          title: "Sample City",
        },
      ],
      sensitiveDetails: [
        {
          detailType: "access_code",
          evidence: "Door access code SAMPLE42",
          reason: "Private lodging access material.",
          title: "Door access code SAMPLE42",
        },
      ],
      stays: [
        {
          checkIn: "2034-04-05",
          checkOut: "2034-04-07",
          city: "Sample City",
          evidence: "Harbor Hotel",
          name: "Harbor Hotel",
        },
      ],
      transport: [
        {
          arrival: "Sample City",
          date: "2034-04-05",
          departure: "Central Station",
          evidence: "Central Station to Sample City",
          routeLabel: "Central Station to Sample City",
          title: "Central Station to Sample City",
          type: "train",
        },
      ],
      tripOverview: {
        dateRange: "April 5-7, 2034",
        destinationSummary: "Sample City",
        title: "Sanitized ledger trip",
      },
    },
  };
  const metadata = resolverMetadata();
  const sourceLedger = buildSourceFactLedgerV1({
    index,
    resolverMetadata: metadata,
    stages: [stage],
  });
  const clustered = clusterExtractedEvidence({
    resolverMetadata: {
      ...metadata,
      roleEvaluations: [],
    },
    sourceTransportAnchors: [],
    stages: [stage],
    tripOverview: (stage.stage as Record<string, unknown>).tripOverview,
  });
  const records = createStructuredTripRecordsFromDraft({
    draft: clustered.draft,
    fallbackTripName: "Sanitized ledger trip",
    tripId: "ledger-reconciliation-fixture",
  });
  return { clustered, index, metadata, records, sourceLedger, stage };
}

function emptyRecords(items: TripItemRecord[]): StructuredTripRecords {
  return {
    categories: [],
    days: [],
    items,
    legs: [],
    photos: [],
    phrases: [],
    privateDetails: [],
    reviewQuestions: [],
    stays: [],
    transport: [],
    trip: {
      destinationSummary: null,
      endDate: null,
      id: "group-fixture",
      name: "Group fixture",
      startDate: null,
      travelerAppTitle: "Group fixture",
    },
    weatherHooks: [],
  };
}

function item(canonicalId: string, title: string, date: string, parentItemId: string): TripItemRecord {
  return {
    address: null,
    canonicalId,
    categoryId: "sightseeing",
    cityNoteKey: null,
    date,
    description: null,
    endTime: null,
    id: `group-fixture-item-${canonicalId}`,
    itemType: "activity",
    latitude: null,
    legId: null,
    locationName: null,
    longitude: null,
    parentItemId,
    reviewRequired: false,
    sortOrder: 0,
    sourceConfidence: "medium",
    startTime: null,
    status: "draft",
    summary: null,
    title,
    tripId: "group-fixture",
    url: null,
  };
}

function groupCarrierFixture() {
  const fixture = sourceFactFixture();
  const sourceLedger = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  });
  const observations: EvidenceObservation[] = [];
  const pieces: CanonicalEvidencePiece[] = [];
  const items: TripItemRecord[] = [];
  fixture.activities
    .filter((activity) => activity.evidenceRole !== "grouping_proposal")
    .forEach((activity, index) => {
      const observationId = `observation-group-${index}`;
      const pieceId = `piece-group-${index}`;
      observations.push({
        id: observationId,
        kind: activity.evidenceRole === "context" ? "context" : "activity",
        ordinal: index + 1,
        payload: { ...activity },
        role: activity.evidenceRole === "context" ? "context" : "atomic_candidate",
        source: fixture.stage.source,
        sourceFilename: fixture.stage.sourceFilename ?? null,
        sourceLabel: fixture.stage.label,
        sourceProvenance: fixture.stage.sourceProvenance ?? null,
        sourceStructure: {
          headingPath: [],
          sectionLabel: activity.sourceSectionLabel ?? null,
          sectionType: "unknown",
        },
        sourceUploadId: fixture.stage.sourceUploadId ?? null,
      });
      pieces.push({
        actions: [],
        confidence: "high",
        conflicts: [],
        fieldSources: {},
        fieldWinnerRanks: {},
        id: pieceId,
        kind: "activity",
        mergeReasons: [],
        observationIds: [observationId],
        outputEligible: true,
        payload: { ...activity },
        role: "atomic_candidate",
      });
      items.push(
        item(
          pieceId,
          activity.title,
          activity.date,
          activity.date === "2019-01-16" ? "parent-prague" : "parent-vienna"
        )
      );
    });
  return {
    fixture,
    observations,
    pieces,
    records: emptyRecords(items),
    sourceLedger,
  };
}

export default function run() {
  const fixture = assembledFixture();
  const recordsBefore = hashStableValue(fixture.records);
  const built = buildAssemblyDecisionCarrierLedgerV1({
    index: fixture.index,
    observations: fixture.clustered.observations,
    pieces: fixture.clustered.pieces,
    records: fixture.records,
    resolverMetadata: fixture.metadata,
    sourceLedger: fixture.sourceLedger,
    stages: [fixture.stage],
  });

  assert.equal(hashStableValue(fixture.records), recordsBefore, "shadow build cannot mutate output");
  assert.equal(
    built.decisionSet.factDispositions.length,
    fixture.sourceLedger.factSet.facts.length,
    "every V1 fact has one terminal disposition"
  );
  assert.deepEqual(
    [...new Set(built.decisionSet.decisions.map((decision) => decision.domain))].sort(),
    [
      "classification",
      "containment",
      "grouping",
      "identity",
      "publish_projection",
      "review",
    ]
  );
  assert.equal(built.decisionSet.resolverRoleEvaluations.length, 2);
  assert.deepEqual(
    built.decisionSet.resolverRoleEvaluations.map((evaluation) => evaluation.reconciliationOutcome).sort(),
    ["applied", "rejected"]
  );
  assert.ok(
    built.decisionSet.factDispositions
      .filter((disposition) => disposition.factKind === "entity" && disposition.outcome === "carried")
      .every((disposition) => disposition.carrierAnchorHashes.length === 1),
    "each carried entity owns one verified terminal anchor"
  );

  const rebuilt = buildAssemblyDecisionCarrierLedgerV1({
    index: fixture.index,
    observations: [...fixture.clustered.observations].reverse(),
    pieces: [...fixture.clustered.pieces].reverse(),
    records: {
      ...fixture.records,
      items: [...fixture.records.items].reverse(),
      privateDetails: [...fixture.records.privateDetails].reverse(),
      reviewQuestions: [...fixture.records.reviewQuestions].reverse(),
      stays: [...fixture.records.stays].reverse(),
      transport: [...fixture.records.transport].reverse(),
    },
    resolverMetadata: fixture.metadata,
    sourceLedger: fixture.sourceLedger,
    stages: [fixture.stage],
  });
  assert.deepEqual(rebuilt.decisionSet, built.decisionSet, "durable identity is input-order independent");
  assert.equal(rebuilt.metrics.decisionSetHash, built.metrics.decisionSetHash);

  const serialized = JSON.stringify(built.decisionSet);
  for (const forbidden of [
    "SAMPLE42",
    "Museum Visit",
    "Riverside Market",
    "candidate-museum",
    "candidate-market",
    "fixed time",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }

  const groupFixture = groupCarrierFixture();
  const groupBuilt = buildAssemblyDecisionCarrierLedgerV1({
    index: groupFixture.fixture.index,
    observations: groupFixture.observations,
    pieces: groupFixture.pieces,
    records: groupFixture.records,
    resolverMetadata: groupFixture.fixture.resolverMetadata,
    sourceLedger: groupFixture.sourceLedger,
    stages: [groupFixture.fixture.stage],
  });
  const appliedGroups = groupBuilt.decisionSet.factDispositions.filter(
    (disposition) =>
      disposition.factKind === "relationship" && disposition.outcome === "applied" &&
      disposition.carrierAnchorHashes.length >= 2
  );
  assert.ok(appliedGroups.length >= 1, "a projected source group reaches grouping reconciliation");
  assert.ok(
    appliedGroups.every(
      (disposition) =>
        new Set(disposition.carrierAnchorHashes).size === disposition.carrierAnchorHashes.length
    ),
    "each group child keeps its own carrier anchor"
  );

  const brokenPiece = groupFixture.pieces.find((piece) => piece.outputEligible)!;
  assert.throws(
    () =>
      buildAssemblyDecisionCarrierLedgerV1({
        index: groupFixture.fixture.index,
        observations: groupFixture.observations,
        pieces: groupFixture.pieces,
        records: {
          ...groupFixture.records,
          items: groupFixture.records.items.filter(
            (candidate) => candidate.canonicalId !== brokenPiece.id
          ),
        },
        resolverMetadata: groupFixture.fixture.resolverMetadata,
        sourceLedger: groupFixture.sourceLedger,
        stages: [groupFixture.fixture.stage],
      }),
    /later-stage carrier deletion/,
    "an output-eligible piece cannot disappear silently in final projection"
  );
}
