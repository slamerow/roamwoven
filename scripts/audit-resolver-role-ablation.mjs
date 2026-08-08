// Offline release gate for RW-ADL-001.
//
// It performs exactly one pinned parse from a local cache, captures the
// resolver's already-saved stage graph, and then removes each accepted role
// decision one at a time before deterministic reassembly. The loop never calls
// the model, geocoder, database, or network. It is intentionally a release
// gate, never a route helper.
//
// Usage:
//   node scripts/audit-resolver-role-ablation.mjs \
//     --baseline fresh87 --cache /path/to/offline-cache [--out report.json]

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const valueFor = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
};
const baselineName = valueFor("--baseline");
const cacheDir = valueFor("--cache");
const outPath = valueFor("--out");
if (!baselineName || !cacheDir) {
  throw new Error(
    "usage: node scripts/audit-resolver-role-ablation.mjs --baseline <candidate86|fresh87> --cache <dir> [--out <json>]"
  );
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(rootDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
      strict: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => rootDir,
        getNewLine: () => "\n",
      })
    );
  }
  module._compile(output.outputText, filename);
};

process.env.EXTRACTION_FACT_LEDGER_SHADOW = "1";
process.env.OPENAI_API_KEY = "offline-role-ablation-must-not-call-network";
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
delete process.env.GEOCODE_VERIFICATION_API_KEY;
globalThis.fetch = async () => {
  throw new Error("offline role ablation attempted network access");
};

const requireFromRepo = Module.createRequire(path.join(rootDir, "package.json"));
const { RESOLVER_ROLE_ABLATION_BASELINES_V1 } = requireFromRepo(
  "@/tests/fixtures/resolver-role-ablation-baselines"
);
const expected = RESOLVER_ROLE_ABLATION_BASELINES_V1[baselineName];
if (!expected) throw new Error(`unknown ablation baseline: ${baselineName}`);

const pinning = requireFromRepo("@/lib/extraction/extraction-pinning");
const geocode = requireFromRepo("@/lib/extraction/geocode-verification");
const resolverModule = requireFromRepo(
  "@/lib/extraction/canonical-evidence-resolver"
);
const evidenceModule = requireFromRepo("@/lib/extraction/evidence-clustering");
const assemblyModule = requireFromRepo(
  "@/lib/extraction/canonical-trip-assembly"
);
const corridorModule = requireFromRepo(
  "@/lib/extraction/canonical-assembly-quality-corridor"
);
const semanticModule = requireFromRepo(
  "@/lib/extraction/assembly-semantic-fingerprint"
);
const sourceIndexModule = requireFromRepo(
  "@/lib/extraction/source-document-index"
);
const sourceLedgerModule = requireFromRepo("@/lib/extraction/source-fact-ledger");
const travelerTextModule = requireFromRepo("@/lib/extraction/traveler-text");
const decisionBuilderModule = requireFromRepo(
  "@/lib/extraction/assembly-decision-carrier-builder"
);
const decisionLedgerModule = requireFromRepo(
  "@/lib/extraction/assembly-decision-carrier-ledger"
);
const decisionStoreModule = requireFromRepo(
  "@/lib/extraction/assembly-decision-carrier-ledger-store"
);

let capturedResolution = null;
let resolverInvocationCount = 0;
const originalResolve = resolverModule.resolveCanonicalEvidenceStages;
resolverModule.resolveCanonicalEvidenceStages = async (stages) => {
  resolverInvocationCount += 1;
  const result = await originalResolve(stages);
  capturedResolution = result;
  return result;
};
const parser = requireFromRepo("@/lib/extraction/openai-trip-parser");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(path.resolve(cacheDir), name), "utf8"));
}

function countsBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

function stageLane(stage) {
  const record = stage?.stage && typeof stage.stage === "object" ? stage.stage : {};
  if (record._sourceRecovery === true) return "recovery";
  return stage?.source === "model_spine" ? "spine" : "chunk";
}

function decisionRecord(stages, candidateId) {
  for (const stage of stages) {
    const stageRecord = stage?.stage && typeof stage.stage === "object"
      ? stage.stage
      : {};
    for (const key of [
      "activities",
      "missingDetails",
      "places",
      "sensitiveDetails",
      "stays",
      "transport",
    ]) {
      for (const record of Array.isArray(stageRecord[key]) ? stageRecord[key] : []) {
        if (record?._resolverCandidateId === candidateId) return { record, stage };
      }
    }
  }
  return null;
}

function subjectFactId(sourceFactSet, index, subject) {
  const alignment = sourceLedgerModule.alignSourceCandidateV1({
    index,
    record: subject.record,
    stage: subject.stage,
  });
  const title = [
    subject.record.title,
    subject.record.name,
    subject.record.routeLabel,
    subject.record.relatedTitle,
    subject.record.prompt,
  ].find((value) => typeof value === "string" && value.trim().length > 0) ?? "";
  const digest = sourceIndexModule.hashStableValue({
    sourceSpanIds: alignment.sourceSpanIds,
    title: travelerTextModule.normalizeText(title),
  }).slice(0, 20);
  const groupingProposal =
    subject.record.evidenceRole === "grouping_proposal";
  const relationshipSpanIds = [
    ...new Set([
      ...alignment.sourceSpanIds,
      ...alignment.plausibleSpanIds,
    ]),
  ];
  const matches = sourceFactSet.facts.filter((fact) =>
    groupingProposal
      ? relationshipSpanIds.length > 0 &&
        fact.kind === "relationship" &&
        relationshipSpanIds.every((spanId) =>
          fact.sourceSpanIds.includes(spanId)
        )
      : fact.kind === "entity" &&
        fact.payload?.recordClass === "activity" &&
        fact.payload?.semanticIdentityDigest === digest
  );
  return {
    alignment:
      alignment.status === "aligned" ? alignment.method : alignment.reason,
    digest,
    factId: matches.length === 1 ? matches[0].factId : null,
    matchCount: matches.length,
    sourceSpanIds: alignment.sourceSpanIds,
  };
}

function assemble({ evidence, trip, usage }) {
  const preparedEvidence = assemblyModule.prepareCanonicalEvidencePieces(
    evidence.pieces
  );
  const corridor = corridorModule.runCanonicalAssemblyQualityCorridor({
    baseUsage: usage,
    draft: evidence.draft,
    fallbackTripName: trip.name,
    preparedEvidence,
    sourceEvidenceArtifacts: {
      observations: evidence.observations,
      pieces: evidence.pieces,
    },
    tripId: trip.id,
  });
  const fingerprint = semanticModule.createAssemblySemanticFingerprint({
    legacyFingerprints: corridor.assessment.report.fingerprints ?? {},
    records: corridor.assembly.records,
  });
  return { corridor, fingerprint };
}

const cachedParse = readJson("parse.json");
const calls = readJson("calls.json");
const geocodeSeed = readJson("geocode.json");
const materials = readJson("materials.json");
const trip = readJson("trip.json");
process.env.OPENAI_EXTRACTION_MODEL = cachedParse.extraction_model;

const parseCache = pinning.createExtractionParseCache(calls);
const geocodeCache = geocode.createGeocodeVerificationReplayCache(geocodeSeed);
const parserResult = await pinning.runWithExtractionParseCache(parseCache, () =>
  geocode.runWithGeocodeVerificationReplay(geocodeCache, () =>
    parser.extractTripDraftWithOpenAI({ materials, tripName: trip.name })
  )
);
assert.equal(parseCache.misses, 0, "ablation may not miss the pinned model cache");
assert.equal(
  geocodeCache.unmatchedCandidateIds.length,
  0,
  "ablation may not diverge from the pinned geocode candidates"
);
assert.equal(
  geocodeCache.actualCandidateCount,
  geocodeCache.expectedCandidateCount,
  "ablation must replay the exact geocode pool"
);
assert.equal(resolverInvocationCount, 1, "the parser capture runs exactly once");
assert.ok(capturedResolution, "the resolver stage graph was not captured");
assert.equal(
  parserResult.sourceFactLedger?.status,
  "built",
  "the source-fact dependency must build in the offline capture"
);

const baseline = assemble({
  evidence: {
    draft: parserResult.draft,
    observations: parserResult.evidenceArtifacts.observations,
    pieces: parserResult.evidenceArtifacts.pieces,
  },
  trip,
  usage: parserResult.usage,
});
const shadow = parserResult.sourceFactLedger;
const context = shadow.companionContext;
const decisionLedger = decisionBuilderModule.buildAssemblyDecisionCarrierLedgerV1({
  index: context.sourceDocumentIndex,
  observations: baseline.corridor.observations,
  pieces: baseline.corridor.pieces,
  records: baseline.corridor.assembly.records,
  recoverySourceBindings: context.recoverySourceBindings,
  resolverMetadata: context.resolverMetadata,
  sourceLedger: shadow.ledger,
  stages: context.stages,
});
const decisions = capturedResolution.metadata?.roleDecisions ?? [];
const appliedEvaluations = decisionLedger.decisionSet.resolverRoleEvaluations.filter(
  (evaluation) => evaluation.reconciliationOutcome === "applied"
);
const appliedEvaluationKey = ({
  factId,
  proposedRole,
  reasonDigest,
  sourceLane,
}) => JSON.stringify({ factId, proposedRole, reasonDigest, sourceLane });
const appliedEvaluationPools = new Map();
for (const evaluation of appliedEvaluations) {
  const key = appliedEvaluationKey({
    factId:
      evaluation.subjectFactIds.length === 1
        ? evaluation.subjectFactIds[0]
        : null,
    proposedRole: evaluation.proposedRole,
    reasonDigest: evaluation.reasonDigest,
    sourceLane: evaluation.sourceLane,
  });
  appliedEvaluationPools.set(key, [
    ...(appliedEvaluationPools.get(key) ?? []),
    evaluation,
  ]);
}
for (const evaluations of appliedEvaluationPools.values()) {
  evaluations.sort((left, right) =>
    left.evaluationId.localeCompare(right.evaluationId)
  );
}
const index = sourceIndexModule.buildSourceDocumentIndexV1(materials);
const matchedDecisions = decisions.map((decision) => {
  const originalSubject = decisionRecord(
    capturedResolution.stages,
    decision.candidateId
  );
  const ledgerSubject = decisionRecord(context.stages, decision.candidateId);
  const rawAppliedEvaluations = (
    capturedResolution.metadata?.roleEvaluations ?? []
  ).filter(
    (evaluation) =>
      evaluation.candidateId === decision.candidateId &&
      evaluation.classification === decision.classification &&
      evaluation.reconciliationOutcome === "applied"
  );
  assert.equal(
    rawAppliedEvaluations.length,
    1,
    "each accepted resolver decision must have one raw applied evaluation"
  );
  const binding = originalSubject
    ? subjectFactId(shadow.ledger.factSet, index, originalSubject)
    : {
        alignment: "unbound",
        digest: null,
        factId: null,
        matchCount: 0,
        sourceSpanIds: [],
      };
  const ledgerBinding = ledgerSubject
    ? subjectFactId(
        shadow.ledger.factSet,
        context.sourceDocumentIndex,
        ledgerSubject
      )
    : null;
  const sourceLane = originalSubject ? stageLane(originalSubject.stage) : "chunk";
  const evaluationKey = appliedEvaluationKey({
    factId: binding.factId,
    proposedRole: decision.classification,
    reasonDigest: decisionLedgerModule.digestResolverReasonV1(
      rawAppliedEvaluations[0].reason
    ),
    sourceLane,
  });
  const evaluationPool = appliedEvaluationPools.get(evaluationKey) ?? [];
  return {
    binding,
    decision,
    evaluationKey,
    ledgerEvaluation: evaluationPool.shift() ?? null,
    ledgerBinding,
    originalSubject,
    sourceLane,
  };
});
const unmatchedDecisions = matchedDecisions
  .filter((match) => !match.ledgerEvaluation)
  .map((match) => ({
    ...JSON.parse(match.evaluationKey),
    binding: match.binding,
    candidateId: match.decision.candidateId,
    ledgerBinding: match.ledgerBinding,
  }));
const sourceFactById = new Map(
  shadow.ledger.factSet.facts.map((fact) => [fact.factId, fact])
);
const remainingEvaluations = [...appliedEvaluationPools.entries()].flatMap(
  ([key, evaluations]) =>
    evaluations.map((evaluation) => ({
      ...JSON.parse(key),
      evaluationId: evaluation.evaluationId,
      sourceFact: evaluation.subjectFactIds.length === 1
        ? sourceFactById.get(evaluation.subjectFactIds[0]) ?? null
        : null,
    }))
);
assert.equal(
  unmatchedDecisions.length + remainingEvaluations.length,
  0,
  `resolver decision/evaluation mismatch: ${JSON.stringify({
    remainingEvaluations,
    unmatchedDecisions,
  })}`
);

const audits = [];
const startedAt = performance.now();

for (const {
  binding,
  decision,
  ledgerEvaluation,
  originalSubject,
  sourceLane,
} of matchedDecisions) {
  if (!originalSubject) {
    audits.push({
      alignment: "unbound",
      behaviorBearing: false,
      classification: decision.classification,
      bindingStatus: ledgerEvaluation
        ? decisionLedgerModule.resolverRoleEvaluationBindingStatusV1(
            ledgerEvaluation
          )
        : "missing",
      lane: "unbound",
      ledgerLinked: Boolean(ledgerEvaluation),
    });
    continue;
  }
  const stages = structuredClone(capturedResolution.stages);
  const subject = decisionRecord(stages, decision.candidateId);
  assert.ok(subject, "a cloned resolver subject disappeared");
  delete subject.record._canonicalRoleDecision;
  const spineStage = stages.find((stage) => stage.source === "model_spine");
  const tripOverview =
    spineStage?.stage && typeof spineStage.stage === "object"
      ? spineStage.stage.tripOverview
      : null;
  const evidence = evidenceModule.clusterExtractedEvidence({
    groupingDecisions: capturedResolution.groupingDecisions,
    resolverMetadata: capturedResolution.metadata,
    sourceTransportAnchors: parserResult.usage?.sourceAnchors?.transport ?? [],
    stages,
    tripOverview: tripOverview ?? {
      confidence: "low",
      dateRange: null,
      destinationSummary: null,
      title: null,
    },
  });
  const candidate = assemble({ evidence, trip, usage: parserResult.usage });
  const bindingStatus = ledgerEvaluation
    ? decisionLedgerModule.resolverRoleEvaluationBindingStatusV1(
        ledgerEvaluation
      )
    : "missing";
  audits.push({
    alignment: binding.alignment,
    behaviorBearing: candidate.fingerprint.hash !== baseline.fingerprint.hash,
    bindingStatus,
    classification: decision.classification,
    lane: sourceLane,
    ledgerLinked: Boolean(ledgerEvaluation),
  });
}

const behaviorBearing = audits.filter((audit) => audit.behaviorBearing);
const summary = {
  baseline: baselineName,
  networkAllowed: false,
  baselineHash: baseline.fingerprint.hash,
  acceptedRoleDecisionCount: decisions.length,
  appliedEvaluationCount: appliedEvaluations.length,
  rawRoleProposalCount: decisionLedger.decisionSet.resolverRoleEvaluations.length,
  behaviorBearingDecisionCount: behaviorBearing.length,
  behaviorBearingLedgerLinkedCount: behaviorBearing.filter(
    (audit) => audit.ledgerLinked
  ).length,
  behaviorBearingByClassification: countsBy(
    behaviorBearing,
    (audit) => audit.classification
  ),
  behaviorBearingByBindingStatus: countsBy(
    behaviorBearing,
    (audit) => audit.bindingStatus
  ),
  behaviorBearingByLaneAndAlignment: countsBy(
    behaviorBearing,
    (audit) => `${audit.lane}:${audit.alignment}`
  ),
  modelCallCacheHitCount: parseCache.hits,
  modelCallMissCount: parseCache.misses,
  geocodeCandidateCount: geocodeCache.actualCandidateCount,
  decisionBuildMilliseconds:
    decisionLedger.metrics.ledgerBuildMilliseconds,
  decisionPayloadByteSize:
    decisionStoreModule.compactAssemblyDecisionByteSizeV1(decisionLedger),
  sourceFactPayloadByteSize: shadow.ledger.metrics.serializedByteSize,
  combinedLedgerPayloadByteSize:
    decisionStoreModule.compactAssemblyDecisionByteSizeV1(decisionLedger) +
    shadow.ledger.metrics.serializedByteSize,
  ablationMilliseconds: performance.now() - startedAt,
};

assert.equal(summary.baselineHash, expected.semanticHash);
assert.equal(
  summary.acceptedRoleDecisionCount,
  expected.acceptedRoleDecisionCount
);
assert.equal(summary.appliedEvaluationCount, expected.acceptedRoleDecisionCount);
assert.equal(summary.rawRoleProposalCount, expected.rawRoleProposalCount);
assert.equal(
  summary.behaviorBearingDecisionCount,
  expected.behaviorBearingDecisionCount
);
assert.equal(
  summary.behaviorBearingLedgerLinkedCount,
  expected.behaviorBearingDecisionCount,
  "every behavior-bearing decision must reach one applied evaluation with a fact, span, or explicit unresolved binding"
);
assert.equal(summary.modelCallCacheHitCount, expected.modelCallCacheHitCount);
assert.equal(summary.modelCallMissCount, 0);
assert.equal(summary.geocodeCandidateCount, expected.geocodeCandidateCount);
assert.ok(summary.decisionBuildMilliseconds < 100);
assert.ok(summary.decisionPayloadByteSize < 256 * 1024);
assert.ok(summary.decisionPayloadByteSize < 1024 * 1024);
assert.ok(summary.combinedLedgerPayloadByteSize < 512 * 1024);

const serialized = `${JSON.stringify(summary, null, 2)}\n`;
if (outPath) fs.writeFileSync(path.resolve(outPath), serialized);
process.stdout.write(serialized);
