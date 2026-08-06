import assert from "node:assert/strict";

import {
  buildShadowRecoveryPlanV1,
  buildSourceCoverageV4,
} from "@/lib/extraction/source-coverage-v4";
import { buildSourceDocumentIndexV1 } from "@/lib/extraction/source-document-index";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";
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

export default function run() {
  const fixture = sourceFactFixture();
  const built = buildSourceFactLedgerV1({
    index: fixture.index,
    resolverMetadata: fixture.resolverMetadata,
    stages: [fixture.stage],
  });
  const coverage = buildSourceCoverageV4({
    factSet: built.factSet,
    index: fixture.index,
  });
  assert.equal(coverage.entries.length, fixture.index.spans.length);
  assert.equal(
    new Set(coverage.entries.map((entry) => entry.spanId)).size,
    coverage.entries.length,
    "every meaningful source clause receives exactly one coverage state"
  );

  const statusFor = (clause: string) =>
    coverage.entries.find((entry) => entry.spanId === spanIdFor(fixture, clause));
  assert.equal(statusFor("gloriette")?.status, "carried");
  for (const clause of [
    "orangeriegarten",
    "palm house",
    "apple strudel show",
    "panorama train",
  ]) {
    assert.equal(
      statusFor(clause)?.status,
      "structural_only",
      `${clause} must not be credited as an atomic carrier`
    );
  }
  assert.equal(statusFor("maybe museum of communism")?.status, "carried");
  assert.equal(statusFor("old tram colors")?.status, "context_only");
  assert.equal(
    statusFor("wednesday january 16th")?.status,
    "context_only"
  );
  const cost = statusFor("budget 900");
  assert.equal(cost?.status, "excluded");
  assert.equal(cost?.exclusionCode, "planning_cost");
  assert.ok(
    cost?.owningFactIds.every(
      (factId) =>
        built.factSet.facts.find((fact) => fact.factId === factId)?.kind ===
        "exclusion"
    )
  );
  assert.equal(statusFor("write postcards before leaving")?.status, "uncovered");

  const plan = buildShadowRecoveryPlanV1({ coverage, index: fixture.index });
  assert.equal(plan.uncoveredClauseCount, 1);
  assert.equal(plan.batchCount, 1);
  assert.deepEqual(
    plan.batches.flatMap((batch) => batch.clauses.map((clause) => clause.spanId)),
    [spanIdFor(fixture, "write postcards before leaving")]
  );
  const serializedPlan = JSON.stringify(plan);
  for (const sourceText of [
    "Write postcards before leaving",
    "Saturday, January 19th",
    "Budget: $900",
  ]) {
    assert.doesNotMatch(serializedPlan, new RegExp(sourceText, "i"));
  }

  const duplicateMaterial = {
    ...sourceFactFixtureMaterial,
    filename: "ambiguous-source.txt",
    text: "Monday, April 7th\nCafe Example\nCafe Example",
  };
  const duplicateIndex = buildSourceDocumentIndexV1([duplicateMaterial]);
  const duplicateStage = {
    label: "duplicate source",
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
  const duplicateLedger = buildSourceFactLedgerV1({
    index: duplicateIndex,
    stages: [duplicateStage],
  });
  const duplicateCoverage = buildSourceCoverageV4({
    factSet: duplicateLedger.factSet,
    index: duplicateIndex,
  });
  assert.equal(duplicateCoverage.counts.ambiguous, 2);
  assert.equal(
    duplicateCoverage.entries.filter((entry) => entry.ambiguous).every(
      (entry) => entry.status === "uncovered"
    ),
    true,
    "ambiguous word presence cannot become a carrier"
  );
}
