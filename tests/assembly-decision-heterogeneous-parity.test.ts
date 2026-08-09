import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createAssemblyCarrierConservationReportV1 } from "@/lib/extraction/assembly-carrier-conservation";
import { buildAssemblyDecisionCarrierLedgerV1 } from "@/lib/extraction/assembly-decision-carrier-builder";
import { compactAssemblyDecisionByteSizeV1 } from "@/lib/extraction/assembly-decision-carrier-ledger-store";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { computeDaySectionSourceCoverage } from "@/lib/extraction/source-coverage";
import {
  buildSourceDocumentIndexV1,
  hashStableValue,
} from "@/lib/extraction/source-document-index";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
import { normalizeText } from "@/lib/extraction/traveler-text";
import {
  HETEROGENEOUS_ASSEMBLY_FIXTURES,
  evidenceStageForFixture,
  type HeterogeneousAssemblyFixture,
} from "@/tests/fixtures/assembly-decision-heterogeneous";
import { RESOLVER_ROLE_ABLATION_BASELINES_V1 } from "@/tests/fixtures/resolver-role-ablation-baselines";

function buildFixture(fixture: HeterogeneousAssemblyFixture) {
  const index = buildSourceDocumentIndexV1([
    {
      filename: fixture.filename,
      sourceProvenance: "sanitized_test",
      sourceUploadId: fixture.sourceUploadId,
      text: fixture.text,
      type: "text",
    },
  ]);
  const stage = evidenceStageForFixture(
    fixture,
    index.spans.map((span) => span.spanId)
  );
  const sourceLedger = buildSourceFactLedgerV1({ index, stages: [stage] });
  const clustered = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [stage],
    tripOverview: fixture.tripOverview,
  });
  const records = createStructuredTripRecordsFromDraft({
    draft: clustered.draft,
    fallbackTripName: `${fixture.name} fixture`,
    tripId: `heterogeneous-${fixture.name}`,
  });
  const decisionLedger = buildAssemblyDecisionCarrierLedgerV1({
    index,
    observations: clustered.observations,
    pieces: clustered.pieces,
    records,
    sourceLedger,
    stages: [stage],
  });
  const legacyCoverage = computeDaySectionSourceCoverage([stage]);
  const conservation = createAssemblyCarrierConservationReportV1({
    decisionSet: decisionLedger.decisionSet,
    legacyCoverage,
    observations: clustered.observations,
    records,
    sourceFactSet: sourceLedger.factSet,
  });
  return {
    clustered,
    conservation,
    decisionLedger,
    index,
    records,
    sourceLedger,
    stage,
  };
}

function classificationOutcome(
  built: ReturnType<typeof buildFixture>,
  factId: string
) {
  const decisions = built.decisionLedger.decisionSet.decisions.filter(
    (decision) =>
      decision.domain === "classification" &&
      decision.subjectFactIds.length === 1 &&
      decision.subjectFactIds[0] === factId &&
      decision.outcomeCode.startsWith("classified_")
  );
  return decisions.length === 1 ? decisions[0].outcomeCode : null;
}

function entityFactForEvidence(
  built: ReturnType<typeof buildFixture>,
  evidence: string
) {
  const spanIds = new Set(
    built.index.lookups.spanIdsByNormalizedClause.get(normalizeText(evidence)) ?? []
  );
  const facts = built.sourceLedger.factSet.facts.filter(
    (fact) =>
      fact.kind === "entity" &&
      fact.sourceSpanIds.some((spanId) => spanIds.has(spanId))
  );
  assert.equal(facts.length, 1, `expected one entity fact for ${evidence}`);
  return facts[0];
}

function sourceFactByRecordClass(
  built: ReturnType<typeof buildFixture>,
  recordClass: string
) {
  const facts = built.sourceLedger.factSet.facts.filter(
    (fact) =>
      fact.kind === "entity" && fact.payload.recordClass === recordClass
  );
  assert.equal(facts.length, 1, `expected one ${recordClass} fact`);
  return facts[0];
}

export default function run() {
  assert.deepEqual(RESOLVER_ROLE_ABLATION_BASELINES_V1, {
    candidate86: {
      acceptedRoleDecisionCount: 161,
      behaviorBearingDecisionCount: 18,
      geocodeCandidateCount: 130,
      modelCallCacheHitCount: 62,
      rawRoleProposalCount: 223,
      semanticHash:
        "d4be928274955c83cc1253264be4a296c94748fd62f79387b00e4c21cee33bde",
    },
    fresh87: {
      acceptedRoleDecisionCount: 113,
      behaviorBearingDecisionCount: 5,
      geocodeCandidateCount: 89,
      modelCallCacheHitCount: 60,
      rawRoleProposalCount: 150,
      semanticHash:
        "92e0a9dc7a7b5789bdd52a811f8977b76a358679212c11ec62b329cf89dee8a6",
    },
  });
  const ablationHarness = fs.readFileSync(
    path.join(process.cwd(), "scripts/audit-resolver-role-ablation.mjs"),
    "utf8"
  );
  assert.match(ablationHarness, /globalThis\.fetch = async/);
  assert.match(ablationHarness, /resolverInvocationCount, 1/);
  assert.doesNotMatch(
    ablationHarness,
    /app\/maker\/trips|ASSEMBLY_DECISION_LEDGER_SHADOW/,
    "offline ablation cannot be imported into or enabled on a customer route"
  );

  const built = Object.fromEntries(
    HETEROGENEOUS_ASSEMBLY_FIXTURES.map((fixture) => [
      fixture.name,
      buildFixture(fixture),
    ])
  ) as Record<
    HeterogeneousAssemblyFixture["name"],
    ReturnType<typeof buildFixture>
  >;

  const booking = built.booking_heavy;
  for (const recordClass of ["stay", "transport", "protected_detail"]) {
    const fact = sourceFactByRecordClass(booking, recordClass);
    assert.equal(
      classificationOutcome(booking, fact.factId),
      `classified_${recordClass}`,
      `${recordClass} must reach its own final carrier class`
    );
  }
  const bookingPublicProse = JSON.stringify({
    items: booking.records.items.map((item) => ({
      description: item.description,
      summary: item.summary,
      title: item.title,
    })),
    stays: booking.records.stays.map((stay) => ({ name: stay.name })),
    transport: booking.records.transport.map((transport) => ({
      description: transport.description,
      routeLabel: transport.routeLabel,
    })),
  });
  for (const protectedValue of ["ZX91-QP77", "4412", "Door code"]) {
    assert.doesNotMatch(bookingPublicProse, new RegExp(protectedValue, "i"));
    assert.doesNotMatch(
      JSON.stringify(booking.decisionLedger.decisionSet),
      new RegExp(protectedValue, "i")
    );
  }

  const recommendations = built.recommendation_heavy;
  const hedged = entityFactForEvidence(
    recommendations,
    "Maybe visit the design museum"
  );
  const committed = entityFactForEvidence(
    recommendations,
    "Booked design tour at 14:00"
  );
  assert.equal(classificationOutcome(recommendations, hedged.factId), "classified_city_note");
  assert.equal(classificationOutcome(recommendations, committed.factId), "classified_activity");
  assert.ok(
    recommendations.records.items.some(
      (item) =>
        item.itemType === "note" &&
        normalizeText([item.title, item.description].filter(Boolean).join(" ")).includes(
          "design museum"
        )
    )
  );
  assert.equal(
    recommendations.records.items.find((item) => item.title === "Design Tour")?.itemType,
    "activity"
  );

  const spreadsheet = built.spreadsheet_like;
  const galleryFacts = spreadsheet.sourceLedger.factSet.facts.filter(
    (fact) =>
      fact.kind === "entity" && fact.payload.recordClass === "activity"
  );
  assert.equal(galleryFacts.length, 2);
  assert.equal(new Set(galleryFacts.map((fact) => fact.factId)).size, 2);
  assert.equal(
    spreadsheet.records.items.filter((item) => item.title === "Gallery Row").length,
    2,
    "same-title spreadsheet rows on separate source dates remain distinct"
  );
  assert.deepEqual(
    spreadsheet.records.items
      .filter((item) => item.title === "Gallery Row")
      .map((item) => item.date)
      .sort(),
    ["2036-04-09", "2036-04-10"]
  );
  assert.equal(
    spreadsheet.records.items.some((item) => item.parentItemId),
    false,
    "shared spreadsheet context cannot invent containment"
  );
  const spreadsheetFixture = HETEROGENEOUS_ASSEMBLY_FIXTURES.find(
    (fixture) => fixture.name === "spreadsheet_like"
  )!;
  const reorderedFixture = structuredClone(spreadsheetFixture);
  const reorderedStage = reorderedFixture.stage as {
    activities: unknown[];
  };
  reorderedStage.activities.reverse();
  const reordered = buildFixture(reorderedFixture);
  assert.equal(
    reordered.sourceLedger.metrics.ledgerHash,
    spreadsheet.sourceLedger.metrics.ledgerHash,
    "spreadsheet row order cannot change source-fact identity"
  );
  assert.equal(
    reordered.decisionLedger.metrics.decisionSetHash,
    spreadsheet.decisionLedger.metrics.decisionSetHash,
    "spreadsheet row order cannot change decision identity"
  );

  const freeform = built.freeform;
  const routeFact = freeform.sourceLedger.factSet.facts.find(
    (fact) =>
      fact.kind === "relationship" &&
      fact.payload.relationshipType === "ordered_route"
  );
  assert.ok(routeFact, "a source-authored route remains a relationship fact");
  const routeMemberFactIds = Array.isArray(routeFact.payload.memberFactIds)
    ? routeFact.payload.memberFactIds.filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  assert.equal(routeMemberFactIds.length, 2);
  assert.ok(
    freeform.decisionLedger.decisionSet.factDispositions.some(
      (disposition) => disposition.factId === routeFact.factId
    ),
    "the relationship has its own terminal decision instead of masquerading as an entity"
  );
  const routeMemberCarriers = freeform.decisionLedger.decisionSet.factDispositions
    .filter((disposition) => routeMemberFactIds.includes(disposition.factId))
    .flatMap((disposition) => disposition.carrierAnchorHashes);
  assert.equal(routeMemberCarriers.length, 2);
  assert.equal(
    new Set(routeMemberCarriers).size,
    2,
    "route entities keep individual final carriers"
  );
  const looseHedge = entityFactForEvidence(
    freeform,
    "Maybe visit Old Observatory if weather is clear"
  );
  assert.equal(classificationOutcome(freeform, looseHedge.factId), "classified_city_note");
  assert.ok(
    freeform.decisionLedger.decisionSet.factDispositions.some(
      (disposition) =>
        disposition.factKind === "exclusion" && disposition.outcome === "excluded"
    ),
    "shared exclusions remain explicit"
  );

  for (const result of Object.values(built)) {
    assert.equal(result.conservation.comparisonPolicy, "independent_conservation_only");
    assert.deepEqual(
      Object.values(result.conservation.universes).map((universe) => universe.unit).sort(),
      [
        "evidence_observation",
        "meaningful_source_line",
        "source_fact",
        "structured_record",
      ],
      "V3 lines, V1 facts, RW-ORD observations, and final records keep separate units"
    );
    assert.equal(
      result.conservation.universes.sourceFacts.total,
      result.sourceLedger.factSet.facts.length
    );
    assert.equal(
      result.conservation.universes.assemblyObservations.dispositioned,
      result.clustered.observations.length
    );
  }

  const durations: number[] = [];
  const decisionBytes: number[] = [];
  const combinedBytes: number[] = [];
  for (let iteration = 0; iteration < 20; iteration += 1) {
    for (const fixture of HETEROGENEOUS_ASSEMBLY_FIXTURES) {
      const result = buildFixture(fixture);
      durations.push(result.decisionLedger.metrics.ledgerBuildMilliseconds);
      const compactDecisionBytes = compactAssemblyDecisionByteSizeV1(
        result.decisionLedger
      );
      decisionBytes.push(compactDecisionBytes);
      combinedBytes.push(
        compactDecisionBytes + result.sourceLedger.metrics.serializedByteSize
      );
    }
  }
  durations.sort((left, right) => left - right);
  decisionBytes.sort((left, right) => left - right);
  combinedBytes.sort((left, right) => left - right);
  const p95 = Math.ceil(durations.length * 0.95) - 1;
  assert.ok(durations[p95] < 100, "decision-ledger p95 must remain below 100ms");
  assert.ok(decisionBytes[p95] < 256 * 1024, "decision-ledger p95 must remain below 256KiB");
  assert.ok(combinedBytes[p95] < 512 * 1024, "combined ledger p95 must remain below 512KiB");
  assert.ok(decisionBytes.at(-1)! < 1024 * 1024, "decision ledger hard maximum is 1MiB");

  const aggregate = JSON.stringify({
    combinedBytes,
    decisionBytes,
    durations,
    hashes: Object.fromEntries(
      Object.entries(built).map(([name, result]) => [
        name,
        hashStableValue(result.conservation),
      ])
    ),
  });
  // Hashes and fractional timings may coincidentally contain the four digits
  // 4412. The aggregate has no prose payloads, so test the contextual secret
  // and the full booking locator instead of treating random telemetry digits
  // as leaked traveler data.
  for (const protectedValue of ["ZX91-QP77", "Door code 4412"]) {
    assert.doesNotMatch(aggregate, new RegExp(protectedValue, "i"));
  }
}
