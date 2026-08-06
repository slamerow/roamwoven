import assert from "node:assert/strict";

import { buildSourceDocumentIndexV1 } from "@/lib/extraction/source-document-index";
import {
  buildSourceFactLedgerV1,
  type SourceFactV1,
} from "@/lib/extraction/source-fact-ledger";
import {
  sourceFactFixture,
  sourceFactFixtureMaterial,
} from "@/tests/fixtures/source-fact-ledger-v1";

function spanIdFor(
  fixture: ReturnType<typeof sourceFactFixture>,
  normalizedClause: string
) {
  const spans = fixture.index.spans.filter(
    (span) => span.normalizedClause === normalizedClause
  );
  assert.equal(spans.length, 1, `expected one source span for ${normalizedClause}`);
  return spans[0].spanId;
}

function factForSpan(
  facts: SourceFactV1[],
  spanId: string,
  kind: SourceFactV1["kind"]
) {
  return facts.filter(
    (fact) => fact.kind === kind && fact.sourceSpanIds.includes(spanId)
  );
}

export default function run() {
  const fixture = sourceFactFixture();
  const built = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  });
  const { facts, carrierEdges, sourceSpans } = built.factSet;

  const castleStructureSpan = spanIdFor(
    fixture,
    "lesser town and prague castle"
  );
  const castleVenueSpan = spanIdFor(fixture, "prague castle");
  const castleStructure = factForSpan(
    facts,
    castleStructureSpan,
    "relationship"
  ).find((fact) => fact.producer === "parser");
  const castleVenue = factForSpan(facts, castleVenueSpan, "entity")[0];
  assert.ok(castleStructure && castleVenue);
  assert.notEqual(
    castleStructure.factId,
    castleVenue.factId,
    "a structural proposal and atomic venue are separate facts"
  );

  for (const clause of ["changing of the guard 12 00 pm", "st vitus cathedral"]) {
    assert.equal(
      factForSpan(facts, spanIdFor(fixture, clause), "entity").length,
      1,
      `${clause} remains an atomic entity fact`
    );
  }

  const vinarnaSpan = spanIdFor(fixture, "vinarna certovka");
  const vinarnaFact = factForSpan(facts, vinarnaSpan, "entity")[0];
  assert.ok(vinarnaFact, "mixed parser category does not remove the route member");
  const lesserRouteSpan = spanIdFor(
    fixture,
    "lesser town route kafka statue"
  );
  const lesserRoute = factForSpan(facts, lesserRouteSpan, "relationship").find(
    (fact) => fact.producer === "parser"
  );
  assert.ok(
    Array.isArray(lesserRoute?.payload.memberFactIds) &&
      lesserRoute.payload.memberFactIds.includes(vinarnaFact.factId),
    "route membership never depends on the parser category"
  );

  const childClauses = [
    "gloriette",
    "orangeriegarten",
    "palm house",
    "apple strudel show",
    "panorama train",
  ];
  const childSpanIds = childClauses.map((clause) => spanIdFor(fixture, clause));
  const schonProposalSpan = spanIdFor(
    fixture,
    "explore vienna schonbrunn palace area"
  );
  const schonRelation = factForSpan(
    facts,
    schonProposalSpan,
    "relationship"
  ).find((fact) => fact.producer === "parser");
  assert.ok(schonRelation);
  const unresolved = new Set(
    (schonRelation.payload.unresolvedMemberSpanIds as string[]) ?? []
  );
  assert.equal(
    factForSpan(facts, childSpanIds[0], "entity").length,
    1,
    "Gloriette has an atomic carrier"
  );
  for (const spanId of childSpanIds.slice(1)) {
    assert.ok(
      unresolved.has(spanId),
      "a proposal-only child is structural/uncovered, never falsely atomic"
    );
  }

  const museumSpan = spanIdFor(fixture, "maybe museum of communism");
  const museumEntity = factForSpan(facts, museumSpan, "entity")[0];
  const museumIntent = factForSpan(facts, museumSpan, "intent").find(
    (fact) => fact.payload.subjectFactId === museumEntity.factId
  );
  assert.equal(museumIntent?.payload.intent, "uncertain");

  const rejectedResolver = facts.find(
    (fact) =>
      fact.kind === "relationship" &&
      fact.producer === "resolver" &&
      fact.payload.status === "rejected"
  );
  assert.ok(rejectedResolver, "rejected resolver claims stay in the ledger");
  assert.deepEqual(rejectedResolver.payload.rejectionCodes, [
    "resolver_policy_rejected",
  ]);
  const rejectedWithOverlappingAppliedGroup = buildSourceFactLedgerV1({
    groupingDecisions: [
      {
        candidateIds: ["candidate-castle", "candidate-st-vitus"],
        claim: "A separate accepted group with overlapping members.",
        decisionId: "group-overlap-negative-control",
        parentCandidateId: "candidate-castle",
        parentTitle: "Prague Castle",
        source: "canonical_resolver",
      },
    ],
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  }).factSet.facts.find(
    (fact) =>
      fact.kind === "relationship" &&
      fact.producer === "resolver" &&
      fact.payload.claimDigest === "resolver-claim-digest-sanitized"
  );
  assert.equal(
    rejectedWithOverlappingAppliedGroup?.payload.status,
    "rejected",
    "a rejected resolver claim cannot be reclassified by an overlapping group"
  );

  const knownSpanIds = new Set(sourceSpans.map(([spanId]) => spanId));
  const knownFactIds = new Set(facts.map((fact) => fact.factId));
  for (const fact of facts) {
    assert.ok(
      fact.sourceSpanIds.every((spanId) => knownSpanIds.has(spanId)),
      "every referenced span exists"
    );
    if (fact.sourceSpanIds.length === 0) {
      assert.equal(
        (fact.payload.sourceAlignment as { status?: string } | undefined)?.status,
        "unresolved_source"
      );
    }
    if (fact.kind === "relationship") {
      for (const memberFactId of (fact.payload.memberFactIds as string[]) ?? []) {
        assert.ok(knownFactIds.has(memberFactId));
      }
      for (const spanId of
        (fact.payload.unresolvedMemberSpanIds as string[]) ?? []) {
        assert.ok(knownSpanIds.has(spanId));
      }
    }
  }
  assert.ok(
    carrierEdges.every(
      (edge) => knownSpanIds.has(edge.spanId) && knownFactIds.has(edge.factId)
    )
  );

  const splitStages = [
    {
      ...fixture.stage,
      label: "sanitized source part 1",
      stage: { activities: fixture.activities.slice(0, 6) },
    },
    {
      ...fixture.stage,
      label: "sanitized source part 2",
      stage: { activities: fixture.activities.slice(6) },
    },
  ];
  const split = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: splitStages,
  });
  const reordered = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [...splitStages].reverse(),
  });
  assert.equal(split.metrics.ledgerHash, built.metrics.ledgerHash);
  assert.equal(reordered.metrics.ledgerHash, built.metrics.ledgerHash);

  const overlapped = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage, fixture.stage],
  });
  assert.deepEqual(
    overlapped.factSet,
    built.factSet,
    "overlapping chunks must produce the same fact set"
  );
  assert.equal(
    overlapped.metrics.ledgerHash,
    built.metrics.ledgerHash,
    "overlapping chunks cannot duplicate or renumber source facts"
  );

  const serialized = JSON.stringify(built.factSet);
  for (const sourceText of [
    "Prague Castle",
    "Vinárna Čertovka",
    "Museum of Communism",
  ]) {
    assert.doesNotMatch(
      serialized,
      new RegExp(sourceText, "i"),
      "the persisted fact set stores digests and locations, not source prose"
    );
  }

  const duplicateMaterial = {
    ...sourceFactFixtureMaterial,
    filename: "duplicate-lines.txt",
    text: "Monday, April 7th\nCafe Example\nCafe Example",
  };
  const duplicateIndex = buildSourceDocumentIndexV1([duplicateMaterial]);
  const duplicateStage = {
    label: "duplicates",
    source: "model_chunk" as const,
    sourceSpanIds: duplicateIndex.spans.map((span) => span.spanId),
    sourceUploadId: duplicateMaterial.sourceUploadId,
    stage: {
      activities: [
        {
          evidence: "Cafe Example",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          sourceSectionLabel: "Monday, April 7th",
          title: "Cafe Example",
        },
      ],
    },
  };
  const duplicate = buildSourceFactLedgerV1({
    index: duplicateIndex,
    stages: [duplicateStage],
  });
  assert.equal(duplicate.metrics.candidateToSpanAmbiguityCount, 1);
}
