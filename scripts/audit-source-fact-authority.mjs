// Offline Loop 10 authority comparison.
//
// Replays one exact saved parse/geocode cache, captures the pre-resolver stage
// graph once, and assembles it under both the current model-resolver authority
// and Source Fact Assembly Authority V1. No database or network access occurs.
//
// Usage:
//   node scripts/audit-source-fact-authority.mjs \
//     --baseline <candidate86|fresh87> --cache <dir>

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
const inspectTitle = valueFor("--inspect");
const inspectRoleReasons = args.includes("--inspect-role-reasons");
const inspectParserDiff = args.includes("--inspect-parser-diff");
const inspectReviewQuestions = args.includes("--inspect-review-questions");
const inspectUnresolvedBehavior = args.includes(
  "--inspect-unresolved-behavior"
);
const donorGeocodePath = valueFor("--donor-geocode");
const sourceGeocodePath = valueFor("--source-geocode");
const writeSourceGeocodePath = valueFor("--write-source-geocode");
const inspectNeedles = (inspectTitle ?? "")
  .split("|")
  .map((value) => value.trim())
  .filter(Boolean);
if (!baselineName || !cacheDir) {
  throw new Error(
    "usage: node scripts/audit-source-fact-authority.mjs --baseline <candidate86|fresh87> --cache <dir>"
  );
}
if (Boolean(donorGeocodePath) !== Boolean(writeSourceGeocodePath)) {
  throw new Error(
    "--donor-geocode and --write-source-geocode must be supplied together"
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
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
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
process.env.OPENAI_API_KEY = "offline-source-fact-authority-must-not-call";
process.env.ROAMWOVEN_ENABLE_AI_EXTRACTION = "true";
delete process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY;
delete process.env.GEOCODE_VERIFICATION_API_KEY;
globalThis.fetch = async () => {
  throw new Error("offline source-fact authority audit attempted network access");
};

const requireFromRepo = Module.createRequire(path.join(rootDir, "package.json"));
const { RESOLVER_ROLE_ABLATION_BASELINES_V1 } = requireFromRepo(
  "@/tests/fixtures/resolver-role-ablation-baselines"
);
const expected = RESOLVER_ROLE_ABLATION_BASELINES_V1[baselineName];
if (!expected) throw new Error(`unknown baseline: ${baselineName}`);

const pinning = requireFromRepo("@/lib/extraction/extraction-pinning");
const geocode = requireFromRepo("@/lib/extraction/geocode-verification");
const resolverModule = requireFromRepo(
  "@/lib/extraction/canonical-evidence-resolver"
);
const evidenceModule = requireFromRepo("@/lib/extraction/evidence-clustering");
const assemblyModule = requireFromRepo("@/lib/extraction/canonical-trip-assembly");
const corridorModule = requireFromRepo(
  "@/lib/extraction/canonical-assembly-quality-corridor"
);
const semanticModule = requireFromRepo(
  "@/lib/extraction/assembly-semantic-fingerprint"
);
const sourceIndexModule = requireFromRepo(
  "@/lib/extraction/source-document-index"
);
const sourceAuthorityModule = requireFromRepo(
  "@/lib/extraction/source-fact-assembly-authority"
);
const sourceLedgerModule = requireFromRepo(
  "@/lib/extraction/source-fact-ledger"
);
const travelerTextModule = requireFromRepo("@/lib/extraction/traveler-text");
const taxonomyModule = requireFromRepo("@/lib/trip-card-taxonomy");

let preResolverStages = null;
let preGeocodeStages = null;
const postGeocodeStageSnapshots = [];
const clusterInvocationFingerprints = [];
const assembleInvocationFingerprints = [];
let resolverInvocationCount = 0;
const originalRunGeocodeVerification = geocode.runGeocodeVerification;
geocode.runGeocodeVerification = async (input) => {
  if (!preGeocodeStages) {
    preGeocodeStages = structuredClone(input.stages);
  }
  const result = await originalRunGeocodeVerification(input);
  postGeocodeStageSnapshots.push(structuredClone(input.stages));
  return result;
};
const originalResolve = resolverModule.resolveCanonicalEvidenceStages;
resolverModule.resolveCanonicalEvidenceStages = async (stages) => {
  resolverInvocationCount += 1;
  preResolverStages = structuredClone(stages);
  return originalResolve(stages);
};
const originalClusterExtractedEvidence =
  evidenceModule.clusterExtractedEvidence;
evidenceModule.clusterExtractedEvidence = (input) => {
  const stageSections = input.stages.map((stage) => {
    const stageValue = stage?.stage ?? null;
    const sectionHashes = {};
    if (stageValue && typeof stageValue === "object") {
      for (const key of Object.keys(stageValue).sort()) {
        sectionHashes[key] = sourceIndexModule.hashStableValue(stageValue[key]);
      }
    }
    return {
      label: stage?.label ?? null,
      sectionHashes,
      source: stage?.source ?? null,
      stage: sourceIndexModule.hashStableValue(stage),
    };
  });
  const inputFingerprint = {
    groupingDecisions: sourceIndexModule.hashStableValue(
      input.groupingDecisions ?? []
    ),
    resolverMetadata: sourceIndexModule.hashStableValue(
      input.resolverMetadata ?? null
    ),
    sourceTransportAnchors: sourceIndexModule.hashStableValue(
      input.sourceTransportAnchors ?? []
    ),
    stages: sourceIndexModule.hashStableValue(input.stages),
    stageSections,
    tripOverview: sourceIndexModule.hashStableValue(input.tripOverview),
  };
  const stagesSnapshot = inspectParserDiff
    ? structuredClone(input.stages)
    : undefined;
  const result = originalClusterExtractedEvidence(input);
  clusterInvocationFingerprints.push({
    input: inputFingerprint,
    output: sourceIndexModule.hashStableValue({
      draft: result.draft,
      observations: result.observations,
      pieces: result.pieces,
      summary: result.summary,
    }),
    stagesSnapshot,
  });
  return result;
};
const parser = requireFromRepo("@/lib/extraction/openai-trip-parser");

function readJson(name) {
  return JSON.parse(
    fs.readFileSync(path.join(path.resolve(cacheDir), name), "utf8")
  );
}

function assemble({ evidence, trip, usage }) {
  const inputFingerprint = {
    draft: sourceIndexModule.hashStableValue(evidence.draft),
    observations: sourceIndexModule.hashStableValue(evidence.observations),
    pieces: sourceIndexModule.hashStableValue(evidence.pieces),
    trip: sourceIndexModule.hashStableValue(trip),
    usage: sourceIndexModule.hashStableValue(usage),
  };
  const preparedEvidence = assemblyModule.prepareCanonicalEvidencePieces(
    evidence.pieces
  );
  const corridor = corridorModule.runCanonicalAssemblyQualityCorridor({
    baseUsage: usage,
    draft: evidence.draft,
    fallbackTripName: trip.name,
    preparedEvidence,
    sourceEvidenceArtifacts: evidence,
    tripId: trip.id,
  });
  const fingerprint = semanticModule.createAssemblySemanticFingerprint({
    legacyFingerprints: corridor.assessment.report.fingerprints ?? {},
    records: corridor.assembly.records,
  });
  assembleInvocationFingerprints.push({
    input: inputFingerprint,
    output: {
      fingerprint: fingerprint.hash,
      preparedEvidence: sourceIndexModule.hashStableValue(preparedEvidence),
      records: sourceIndexModule.hashStableValue(corridor.assembly.records),
    },
  });
  return { corridor, fingerprint };
}

function recordCounts(records) {
  const items = Array.isArray(records.items) ? records.items : [];
  return {
    activities: items.filter((item) => item?.itemType !== "note").length,
    calls: Array.isArray(records.calls) ? records.calls.length : 0,
    cityNotes: items.filter((item) => item?.itemType === "note").length,
    legs: Array.isArray(records.legs) ? records.legs.length : 0,
    questions: Array.isArray(records.questions) ? records.questions.length : 0,
    stays: Array.isArray(records.stays) ? records.stays.length : 0,
    transport: Array.isArray(records.transport) ? records.transport.length : 0,
  };
}

function cityNoteRows(candidate) {
  const items = candidate?.corridor?.assembly?.records?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item?.itemType === "note")
    .map((item) => ({
      cityNoteKey: item.cityNoteKey ?? null,
      description: item.description ?? null,
      title: item.title ?? null,
    }));
}

function geocodeStageFingerprint(stages) {
  return sourceIndexModule.hashStableValue(
    stages.map((stage) => {
      const activities = Array.isArray(stage?.stage?.activities)
        ? stage.stage.activities
        : [];
      return {
        activities: activities.map((record) => ({
          date: record?.date ?? null,
          outcome: record?._sourceFactGeocodeOutcome ?? null,
          title: record?.title ?? null,
          verified: record?._geoVerified === true,
          verifiedLatitude: record?.verifiedLatitude ?? null,
          verifiedLongitude: record?.verifiedLongitude ?? null,
        })),
        label: stage.label,
      };
    })
  );
}

function changedSections(left, right) {
  const keys = new Set([
    ...Object.keys(left.sections ?? {}),
    ...Object.keys(right.sections ?? {}),
  ]);
  return [...keys]
    .filter(
      (key) =>
        sourceIndexModule.stableJsonStringify(left.sections?.[key] ?? null) !==
        sourceIndexModule.stableJsonStringify(right.sections?.[key] ?? null)
    )
    .sort();
}

const cachedParse = readJson("parse.json");
const calls = readJson("calls.json");
const geocodeSeed = readJson("geocode.json");
const materials = readJson("materials.json");
const trip = readJson("trip.json");
process.env.OPENAI_EXTRACTION_MODEL = cachedParse.extraction_model;

const parseCache = pinning.createExtractionParseCache(structuredClone(calls));
const geocodeCache = geocode.createGeocodeVerificationReplayCache(geocodeSeed);
const parserResult = await pinning.runWithExtractionParseCache(parseCache, () =>
  geocode.runWithGeocodeVerificationReplay(geocodeCache, () =>
    parser.extractTripDraftWithOpenAI({ materials, tripName: trip.name })
  )
);
assert.equal(parseCache.misses, 0, "pinned model cache must have zero misses");
assert.equal(
  geocodeCache.unmatchedCandidateIds.length,
  0,
  "pinned geocode cache must have zero unmatched candidates"
);
assert.equal(
  geocodeCache.actualCandidateCount,
  geocodeCache.expectedCandidateCount,
  "pinned geocode candidate pool must stay exact"
);
assert.equal(resolverInvocationCount, 1, "current resolver runs exactly once");
assert.ok(preResolverStages, "pre-resolver stage capture is required");
assert.ok(preGeocodeStages, "pre-geocode stage capture is required");

const baseline = assemble({
  evidence: {
    draft: parserResult.draft,
    observations: parserResult.evidenceArtifacts.observations,
    pieces: parserResult.evidenceArtifacts.pieces,
  },
  trip,
  usage: parserResult.usage,
});
assert.equal(
  baseline.fingerprint.hash,
  expected.semanticHash,
  "saved resolver baseline must remain exact"
);

// The manual audit path must run under the same feature-flag boundary as the
// real parser path. The flag changes source-position resolution during
// authority application, so enabling it only for clustering is not route
// equivalent even when every authority decision hash agrees.
const priorSourceAuthorityFlag = process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY;
process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY = "1";
const sourceDocumentIndex = sourceIndexModule.buildSourceDocumentIndexV1(materials);
const relationshipRecovery =
  sourceAuthorityModule.recoverMissingSourceFactRelationshipMembersV1({
    index: sourceDocumentIndex,
    stages: preGeocodeStages,
  });
const cityNoteRecovery =
  sourceAuthorityModule.recoverMissingSourceFactCityNoteMembersV1({
    index: sourceDocumentIndex,
    materials,
    stages: relationshipRecovery.stages,
  });

if (donorGeocodePath && writeSourceGeocodePath) {
  const donorSeed = JSON.parse(fs.readFileSync(donorGeocodePath, "utf8"));
  const candidates = geocode.selectGeocodeCandidates(
    cityNoteRecovery.stages
  );
  const originalRowsByCandidateId = new Map(
    (geocodeSeed.usage?.candidates ?? []).map((row) => [row.candidateId, row])
  );
  const donorRowsByQuery = new Map(
    (donorSeed.usage?.candidates ?? []).map((row) => [row.query, row])
  );
  const originalAttachmentsByCandidateId = new Map(
    (geocodeSeed.attachments ?? []).map((row) => [row.candidateId, row])
  );
  const donorAttachmentsByQuery = new Map(
    (donorSeed.attachments ?? []).map((row) => [row.query, row])
  );
  const rows = candidates.map((candidate) => {
    const original = originalRowsByCandidateId.get(candidate.candidateId);
    const template =
      original?.query === candidate.query && original?.rank === candidate.rank
        ? original
        : donorRowsByQuery.get(candidate.query);
    assert.ok(
      template,
      `no pinned geocode telemetry for ${candidate.query}`
    );
    return {
      ...structuredClone(template),
      candidateId: candidate.candidateId,
      containerSourceSupported: candidate.containerSourceSupported,
      containerTitle: candidate.containerTitle,
      query: candidate.query,
      rank: candidate.rank,
    };
  });
  const attachments = candidates.flatMap((candidate) => {
    const original = originalAttachmentsByCandidateId.get(
      candidate.candidateId
    );
    const template =
      original?.query === candidate.query
        ? original
        : donorAttachmentsByQuery.get(candidate.query);
    return template
      ? [{ ...structuredClone(template), candidateId: candidate.candidateId }]
      : [];
  });
  const outcomeCount = (outcome) =>
    rows.filter((row) => row.outcome === outcome).length;
  const sourceSeed = {
    attachments,
    usage: {
      ...structuredClone(geocodeSeed.usage),
      candidateCount: candidates.length,
      candidates: rows,
      failedCount: outcomeCount("failed"),
      formattedAddressCount: attachments.filter(
        (attachment) => attachment.formattedAddress
      ).length,
      localityRejectedCount: outcomeCount("rejected_locality"),
      lookupCount:
        rows.filter(
          (row) =>
            row.outcome !== "skipped_budget" &&
            row.outcome !== "skipped_policy"
        ).length + rows.filter((row) => row.retried === true).length,
      resolvedCount: outcomeCount("resolved"),
      retryAcceptedCount: rows.filter(
        (row) => row.retried === true && row.outcome === "resolved"
      ).length,
      retryCount: rows.filter((row) => row.retried === true).length,
      retryOutOfCityCount: outcomeCount("rejected_out_of_city"),
      skippedOverBudgetCount: outcomeCount("skipped_budget"),
    },
    version: 1,
  };
  fs.writeFileSync(
    writeSourceGeocodePath,
    `${JSON.stringify(sourceSeed, null, 2)}\n`,
    "utf8"
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        candidateCount: candidates.length,
        donorPath: donorGeocodePath,
        originalCandidateCount: geocodeSeed.usage.candidateCount,
        recoveredCandidateCount:
          relationshipRecovery.recoveredCandidateCount,
        writePath: writeSourceGeocodePath,
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}
let sourceGeocodeReplay = null;
if (sourceGeocodePath) {
  sourceGeocodeReplay = geocode.createGeocodeVerificationReplayCache(
    JSON.parse(fs.readFileSync(sourceGeocodePath, "utf8"))
  );
  await geocode.runWithGeocodeVerificationReplay(sourceGeocodeReplay, () =>
    geocode.runGeocodeVerification({
      config: {
        apiKey: null,
        endpoint: "https://offline.invalid/geocode",
        maxLookups: 150,
        timeoutMs: 1,
      },
      stages: cityNoteRecovery.stages,
    })
  );
  assert.equal(
    sourceGeocodeReplay.actualCandidateCount,
    sourceGeocodeReplay.expectedCandidateCount,
    "source-authority geocode candidate pool must stay exact"
  );
  assert.deepEqual(
    sourceGeocodeReplay.unmatchedCandidateIds,
    [],
    "source-authority geocode replay must have no unmatched candidates"
  );
}
const compositePlanRecovery =
  sourceAuthorityModule.recoverMissingSourceFactCompositePlanMembersV1({
    index: sourceDocumentIndex,
    stages: cityNoteRecovery.stages,
  });
let capturedSourceResolution = null;
const originalApplyCanonicalEvidenceResolution =
  resolverModule.applyCanonicalEvidenceResolution;
resolverModule.applyCanonicalEvidenceResolution = (stages, resolution) => {
  capturedSourceResolution = structuredClone(resolution);
  return originalApplyCanonicalEvidenceResolution(stages, resolution);
};
const sourceAuthority = sourceAuthorityModule.applySourceFactAssemblyAuthorityV1({
  index: sourceDocumentIndex,
  stages: compositePlanRecovery.stages,
});
resolverModule.applyCanonicalEvidenceResolution =
  originalApplyCanonicalEvidenceResolution;
const preResolverCandidates = resolverModule.buildCanonicalEvidenceCandidates(
  compositePlanRecovery.stages
);
const candidateById = new Map(
  preResolverCandidates.map((candidate) => [candidate.candidateId, candidate])
);
const spineStage = sourceAuthority.stages.find(
  (stage) => stage.source === "model_spine"
);
const tripOverview =
  spineStage?.stage && typeof spineStage.stage === "object"
    ? spineStage.stage.tripOverview
    : null;
let sourceEvidence;
try {
  sourceEvidence = evidenceModule.clusterExtractedEvidence({
    groupingDecisions: sourceAuthority.groupingDecisions,
    resolverMetadata: null,
    sourceTransportAnchors: parserResult.usage?.sourceAnchors?.transport ?? [],
    stages: sourceAuthority.stages,
    tripOverview: tripOverview ?? {
      confidence: "low",
      dateRange: null,
      destinationSummary: null,
      title: null,
    },
  });
} finally {
  if (priorSourceAuthorityFlag === undefined) {
    delete process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY;
  } else {
    process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY = priorSourceAuthorityFlag;
  }
}
let parserAuthorityCandidate = null;
let parserAuthorityResult = null;
if (sourceGeocodePath) {
  process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY = "1";
  const authorityParseCache = pinning.createExtractionParseCache(
    structuredClone(calls)
  );
  const authorityGeocodeCache = geocode.createGeocodeVerificationReplayCache(
    JSON.parse(fs.readFileSync(sourceGeocodePath, "utf8"))
  );
  try {
    parserAuthorityResult = await pinning.runWithExtractionParseCache(
      authorityParseCache,
      () =>
        geocode.runWithGeocodeVerificationReplay(authorityGeocodeCache, () =>
          parser.extractTripDraftWithOpenAI({
            materials,
            tripName: trip.name,
          })
        )
    );
  } finally {
    delete process.env.SOURCE_FACT_ASSEMBLY_AUTHORITY;
  }
  assert.equal(authorityParseCache.misses, 0);
  assert.deepEqual(authorityGeocodeCache.unmatchedCandidateIds, []);
  assert.equal(
    authorityGeocodeCache.actualCandidateCount,
    authorityGeocodeCache.expectedCandidateCount
  );
  parserAuthorityCandidate = assemble({
    evidence: {
      draft: parserAuthorityResult.draft,
      observations: parserAuthorityResult.evidenceArtifacts.observations,
      pieces: parserAuthorityResult.evidenceArtifacts.pieces,
    },
    trip,
    usage: parserAuthorityResult.usage,
  });
}
const sourceCandidate = assemble({
  evidence: sourceEvidence,
  trip,
  // Final assembly intentionally consumes parser usage as companion input
  // (including its canonical draft snapshot and evidence summary). The manual
  // path independently proves the authority stage graph and clustered evidence;
  // it must reuse route-equivalent companion metadata rather than the legacy
  // flags-off run's metadata.
  usage: parserAuthorityResult?.usage ?? parserResult.usage,
});
if (parserAuthorityResult && parserAuthorityCandidate) {
  const parserEvidence = {
    draft: parserAuthorityResult.draft,
    observations: parserAuthorityResult.evidenceArtifacts.observations,
    pieces: parserAuthorityResult.evidenceArtifacts.pieces,
  };
  assert.equal(
    sourceIndexModule.hashStableValue({
      draft: sourceEvidence.draft,
      observations: sourceEvidence.observations,
      pieces: sourceEvidence.pieces,
    }),
    sourceIndexModule.hashStableValue(parserEvidence),
    "manual authority evidence must equal the real parser authority evidence"
  );
  assert.deepEqual(
    parserAuthorityResult.usage?.sourceFactAssemblyAuthority,
    { ...sourceAuthority.metrics, status: "applied" },
    "manual authority metrics must equal the real parser authority metrics"
  );
  assert.equal(
    sourceCandidate.fingerprint.hash,
    parserAuthorityCandidate.fingerprint.hash,
    "manual authority output must equal the real parser authority output"
  );
}
assert.equal(
  sourceAuthority.metrics.unresolvedBehaviorCandidateCount,
  0,
  "source authority must resolve every behavior-bearing candidate"
);

function inspectedCandidates() {
  if (!inspectTitle) return undefined;
  const needles = inspectNeedles.map((value) =>
    travelerTextModule.normalizeText(value)
  );
  return compositePlanRecovery.stages.flatMap((stage, stageIndex) => {
    const stageRecord =
      stage?.stage && typeof stage.stage === "object" ? stage.stage : {};
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    return activities.flatMap((record, itemIndex) => {
      const searchable = travelerTextModule.normalizeText(
        [
          record?.title,
          record?.description,
          record?.evidence,
          record?.sourceSectionLabel,
        ]
          .filter(Boolean)
          .join(" ")
      );
      if (!needles.some((needle) => searchable.includes(needle))) {
        return [];
      }
      const alignment = sourceLedgerModule.alignSourceCandidateV1({
        index: sourceDocumentIndex,
        record,
        stage,
      });
      const digest = sourceIndexModule.hashStableValue({
        sourceSpanIds: alignment.sourceSpanIds,
        title: travelerTextModule.normalizeText(record?.title),
      }).slice(0, 20);
      const entityFacts = sourceAuthority.sourceLedger.factSet.facts.filter(
        (fact) =>
          fact.kind === "entity" &&
          fact.payload?.recordClass === "activity" &&
          fact.payload?.semanticIdentityDigest === digest
      );
      const intents = sourceAuthority.sourceLedger.factSet.facts.filter(
        (fact) =>
          fact.kind === "intent" &&
          entityFacts.some(
            (entity) => entity.factId === fact.payload?.subjectFactId
          )
      );
      const authorityStage = sourceAuthority.stages[stageIndex];
      const authorityActivities =
        authorityStage?.stage &&
        typeof authorityStage.stage === "object" &&
        Array.isArray(authorityStage.stage.activities)
          ? authorityStage.stage.activities
          : [];
      const authorityRecord = authorityActivities[itemIndex] ?? {};
      const descriptionText = travelerTextModule.normalizeText(
        record.description ?? ""
      );
      const evidenceText = travelerTextModule.normalizeText(
        record.evidence ?? ""
      );
      const normalizedOwnText = travelerTextModule.normalizeText(
        record.evidence ?? record.description ?? ""
      );
      const eligibleOwnTextSpans = sourceDocumentIndex.spans.filter(
        (span) =>
          span.normalizedClause.length >= 20 &&
          travelerTextModule
            .normalizeText(stage.sourceText)
            .includes(span.normalizedClause) &&
          (normalizedOwnText.includes(span.normalizedClause) ||
            span.normalizedClause.includes(normalizedOwnText))
      );
      const selectedClauseLength = eligibleOwnTextSpans.length
        ? Math.min(
            ...eligibleOwnTextSpans.map((span) => span.normalizedClause.length)
          )
        : null;
      const selectedOwnTextSpans = eligibleOwnTextSpans.filter(
        (span) => span.normalizedClause.length === selectedClauseLength
      );
      const resolverCandidate = preResolverCandidates.find(
        (candidate) =>
          candidate.stageIndex === stageIndex &&
          candidate.itemIndex === itemIndex
      );
      const alignedSpans = alignment.sourceSpanIds
        .map((spanId) => sourceDocumentIndex.lookups.spanById.get(spanId))
        .filter(Boolean);
      return [{
        alignment,
        authorityRole: authorityRecord._canonicalRoleDecision ?? null,
        authorityRoleReason:
          authorityRecord._sourceFactAuthorityDecision?.reason ?? null,
        candidateId: resolverCandidate?.candidateId ?? null,
        date: record.date ?? null,
        endTime: record.endTime ?? null,
        entityFacts: entityFacts.map((fact) => ({
          factId: fact.factId,
          payload: fact.payload,
          sourceSpanCount: fact.sourceSpanIds.length,
        })),
        evidenceRole: record.evidenceRole ?? null,
        hasBookingSignal: resolverCandidate?.hasBookingSignal ?? false,
        hasPlanSignal: resolverCandidate?.hasPlanSignal ?? false,
        hasRecommendationSignal:
          resolverCandidate?.hasRecommendationSignal ?? false,
        hasTime: resolverCandidate?.hasTime ?? false,
        descriptionMatchedNeedles: inspectNeedles.filter((value) =>
          descriptionText.includes(travelerTextModule.normalizeText(value))
        ),
        evidenceMatchedNeedles: inspectNeedles.filter((value) =>
          evidenceText.includes(travelerTextModule.normalizeText(value))
        ),
        intents: intents.map((fact) => fact.payload),
        itemType: record.itemType ?? null,
        sourceHeadingPath: record.sourceHeadingPath ?? [],
        stageSource: stage.source ?? null,
        stageSourceFilenamePresent: Boolean(stage.sourceFilename),
        stageSourceProvenancePresent: Boolean(stage.sourceProvenance),
        stageSourceSpanCount: stage.sourceSpanIds?.length ?? 0,
        stageSourceUploadIdPresent: Boolean(stage.sourceUploadId),
        indexedSpanCountForStageUpload: stage.sourceUploadId
          ? sourceDocumentIndex.lookups.spanIdsBySourceUploadId.get(
              stage.sourceUploadId
            )?.length ?? 0
          : 0,
        stageSourceTextContainsOwnText: travelerTextModule
          .normalizeText(stage.sourceText)
          .includes(normalizedOwnText),
        indexedSpanCountForOwnText: sourceDocumentIndex.spans.filter(
          (span) =>
            normalizedOwnText.includes(span.normalizedClause) ||
            span.normalizedClause.includes(normalizedOwnText)
        ).length,
        indexedSourceIdentityCountForOwnText: new Set(
          sourceDocumentIndex.spans
            .filter(
              (span) =>
                normalizedOwnText.includes(span.normalizedClause) ||
                span.normalizedClause.includes(normalizedOwnText)
            )
            .map((span) => span.sourceIdentityHash)
        ).size,
        eligibleOwnTextSpanCount: eligibleOwnTextSpans.length,
        selectedOwnTextSpanCount: selectedOwnTextSpans.length,
        selectedOwnTextHasCityTipContext: selectedOwnTextSpans.some((bound) =>
          sourceDocumentIndex.spans.some(
            (span) =>
              span.sourceIdentityHash === bound.sourceIdentityHash &&
              (span.lineOccurrence === bound.lineOccurrence ||
                span.lineOccurrence === bound.lineOccurrence - 1) &&
              taxonomyModule.hasCityTipSignal(span.normalizedClause)
          )
        ),
        sourceSectionLabel: record.sourceSectionLabel ?? null,
        sourceSectionType: record.sourceSectionType ?? null,
        sourceLine: resolverCandidate?.sourceLine ?? null,
        sourceIdentity: resolverCandidate?.sourceIdentity ?? null,
        sourceRelationshipSignal:
          resolverCandidate?.sourceRelationshipSignal ?? false,
        sourceFactGeocodeOutcome:
          authorityRecord._sourceFactGeocodeOutcome ?? null,
        sourceFactRelationshipRecovery:
          authorityRecord._sourceFactRelationshipRecovery === true,
        verifiedLatitude: authorityRecord.verifiedLatitude ?? null,
        verifiedLongitude: authorityRecord.verifiedLongitude ?? null,
        sourceBlockCount: resolverCandidate?.sourceBlockIds.length ?? 0,
        sourceBlockIds: resolverCandidate?.sourceBlockIds ?? [],
        alignedSpanSignals: {
          cityTip: alignedSpans.some((span) =>
            taxonomyModule.hasCityTipSignal(span.normalizedClause)
          ),
          commitment: alignedSpans.some((span) =>
            taxonomyModule.hasCommitmentLanguage(span.normalizedClause)
          ),
          recommendation: alignedSpans.some((span) =>
            taxonomyModule.hasWeakRecommendationLanguage(span.normalizedClause)
          ),
        },
        startTime: record.startTime ?? null,
        title: record.title ?? null,
      }];
    });
  });
}

function inspectedSourceFacts() {
  if (!inspectTitle) return undefined;
  const needles = inspectNeedles.map((value) =>
    travelerTextModule.normalizeText(value)
  );
  const spanIds = new Set(
    sourceDocumentIndex.spans
      .filter((span) =>
        needles.some((needle) => span.normalizedClause.includes(needle))
      )
      .map((span) => span.spanId)
  );
  return sourceAuthority.sourceLedger.factSet.facts
    .filter((fact) => fact.sourceSpanIds.some((spanId) => spanIds.has(spanId)))
    .map((fact) => ({
      factId: fact.factId,
      kind: fact.kind,
      payload: fact.payload,
      sourceSpanCount: fact.sourceSpanIds.length,
    }));
}

function inspectedSourceSpans() {
  if (!inspectTitle) return undefined;
  const needles = inspectNeedles.map((value) =>
    travelerTextModule.normalizeText(value)
  );
  return sourceDocumentIndex.spans
    .filter((span) =>
      needles.some((needle) => span.normalizedClause.includes(needle))
    )
    .map((span) => ({
      clause: span.normalizedClause,
      isDayHeading: span.isDayHeading,
      lineOccurrence: span.lineOccurrence,
      normalizedSectionLabel: span.normalizedSectionLabel,
      sourceIdentityHash: span.sourceIdentityHash,
      spanId: span.spanId,
    }));
}

function inspectedFinalRecords() {
  if (!inspectTitle) return undefined;
  const needles = inspectNeedles.map((value) => ({
    label: value,
    normalized: travelerTextModule.normalizeText(value),
  }));
  const records = sourceCandidate.corridor.assembly.records;
  const items = Array.isArray(records.items) ? records.items : [];
  const itemById = new Map(items.map((item) => [item.canonicalId, item]));
  return items.flatMap((item) => {
    const searchable = travelerTextModule.normalizeText(
      [item.title, item.description].filter(Boolean).join(" ")
    );
    const matchedNeedles = needles
      .filter((needle) => searchable.includes(needle.normalized))
      .map((needle) => needle.label);
    if (matchedNeedles.length === 0) return [];
    return [{
      cityNoteKey: item.cityNoteKey ?? null,
      date: item.date ?? null,
      itemType: item.itemType ?? null,
      matchedNeedles,
      parentTitle: item.parentItemId
        ? itemById.get(item.parentItemId)?.title ?? "(unresolved parent)"
        : null,
      status: item.status ?? null,
      title: item.title ?? null,
    }];
  });
}

function inspectedQuestions() {
  if (!inspectReviewQuestions) return undefined;
  const questions = sourceCandidate?.corridor?.assembly?.records?.reviewQuestions;
  if (!Array.isArray(questions)) return [];
  return questions.map((question) => ({
    prompt: question.prompt ?? null,
    reason: question.reason ?? null,
    relatedTitle: question.relatedTitle ?? null,
    status: question.status ?? null,
    subjectCanonicalId: question.subjectCanonicalId ?? null,
    targetField: question.targetField ?? null,
  }));
}

function inspectedAuthorityRoleReasons() {
  if (!inspectRoleReasons) return undefined;
  return (capturedSourceResolution?.roleDecisions ?? []).map((decision) => {
    const candidate = candidateById.get(decision.candidateId);
    return {
      candidateId: decision.candidateId,
      classification: decision.classification ?? null,
      date: candidate?.date ?? null,
      evidenceRole: candidate?.evidenceRole ?? null,
      reason: decision.reason ?? null,
      title: candidate?.title ?? null,
    };
  });
}

function inspectedUnresolvedBehaviorCandidates() {
  if (!inspectUnresolvedBehavior) return undefined;
  const decidedIds = new Set(
    (capturedSourceResolution?.roleDecisions ?? []).map(
      (decision) => decision.candidateId
    )
  );
  return preResolverCandidates.flatMap((candidate) => {
    if (
      decidedIds.has(candidate.candidateId) ||
      candidate.evidenceRole === "grouping_proposal"
    ) {
      return [];
    }
    const stage = compositePlanRecovery.stages[candidate.stageIndex];
    const stageRecord =
      stage?.stage && typeof stage.stage === "object" ? stage.stage : {};
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    const record = activities[candidate.itemIndex] ?? {};
    const signals = [
      candidate.hasBookingSignal ? "booking" : null,
      candidate.hasTime ? "time" : null,
      candidate.hasPlanSignal ? "plan" : null,
      candidate.hasRecommendationSignal ? "recommendation" : null,
      candidate.evidenceRole === "city_note_candidate" ? "city_note_role" : null,
      record.sourceSectionType === "city_reference" ? "city_reference" : null,
      record.itemType === "note" ? "note_item_type" : null,
    ].filter(Boolean);
    if (signals.length === 0) return [];
    const alignment = sourceLedgerModule.alignSourceCandidateV1({
      index: sourceDocumentIndex,
      record,
      stage,
    });
    const semanticIdentityDigest = sourceIndexModule.hashStableValue({
      sourceSpanIds: alignment.sourceSpanIds,
      title: travelerTextModule.normalizeText(record.title ?? ""),
    }).slice(0, 20);
    const matchingEntityFacts = sourceAuthority.sourceLedger.factSet.facts
      .filter(
        (fact) =>
          fact.kind === "entity" &&
          fact.payload.recordClass === "activity" &&
          (fact.payload.date ?? null) === (record.date ?? null) &&
          fact.payload.semanticIdentityDigest === semanticIdentityDigest
      )
      .map((fact) => ({
        factId: fact.factId,
        producer: fact.producer,
        sourceRole: fact.payload.sourceRole ?? null,
        sourceSpanCount: fact.sourceSpanIds.length,
      }));
    return [{
      alignmentMethod: alignment.method ?? null,
      alignmentReason: alignment.reason ?? null,
      alignmentStatus: alignment.status,
      candidateId: candidate.candidateId,
      date: candidate.date,
      evidenceRole: candidate.evidenceRole,
      matchingEntityFacts,
      plausibleSpanCount: alignment.plausibleSpanIds.length,
      plausibleSpans: alignment.plausibleSpanIds.map((spanId) => {
        const span = sourceDocumentIndex.lookups.spanById.get(spanId);
        return {
          clause: span?.normalizedClause ?? null,
          lineOccurrence: span?.lineOccurrence ?? null,
          section: span?.normalizedSectionLabel ?? null,
          spanId,
        };
      }),
      positionalSpans: candidate.sourceLine === null
        ? []
        : sourceDocumentIndex.spans
            .filter((span) => span.lineOccurrence === candidate.sourceLine)
            .map((span) => ({
              clause: span.normalizedClause,
              section: span.normalizedSectionLabel,
              spanId: span.spanId,
            })),
      signals,
      sourceLine: candidate.sourceLine,
      sourceSectionType: record.sourceSectionType ?? null,
      sourceSpanCount: alignment.sourceSpanIds.length,
      stageLabel: stage?.label ?? null,
      title: candidate.title,
    }];
  });
}

function inspectedParserPieces() {
  if (!inspectTitle || !parserAuthorityResult?.evidenceArtifacts) {
    return undefined;
  }
  const needles = inspectNeedles.map((value) =>
    travelerTextModule.normalizeText(value)
  );
  const observations = parserAuthorityResult.evidenceArtifacts.observations ?? [];
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation])
  );
  return (parserAuthorityResult.evidenceArtifacts.pieces ?? []).flatMap((piece) => {
    const title = piece?.payload?.title ?? "";
    const description = piece?.payload?.description ?? "";
    const evidence = piece?.payload?.evidence ?? "";
    const normalizedTitle = travelerTextModule.normalizeText(title);
    const normalizedDescription = travelerTextModule.normalizeText(description);
    const normalizedEvidence = travelerTextModule.normalizeText(evidence);
    if (
      !needles.some(
        (needle) =>
          normalizedTitle.includes(needle) ||
          normalizedDescription.includes(needle) ||
          normalizedEvidence.includes(needle)
      )
    ) {
      return [];
    }
    return [{
      actions: (piece.actions ?? []).map((action) => ({
        absorbedTitles: action.absorbedTitles ?? [],
        reason: action.reason ?? null,
        type: action.type ?? null,
      })),
      category: piece.payload?.category ?? null,
      candidacyDecision:
        piece.payload?._canonicalCandidacyDecision ?? null,
      date: piece.payload?.date ?? null,
      descriptionMatchedNeedles: inspectNeedles.filter((value) =>
        normalizedDescription.includes(travelerTextModule.normalizeText(value))
      ),
      evidenceMatchedNeedles: inspectNeedles.filter((value) =>
        normalizedEvidence.includes(travelerTextModule.normalizeText(value))
      ),
      intentBlockType: piece.payload?._intentBlockType ?? null,
      kind: piece.kind ?? null,
      observationIds: piece.observationIds ?? [],
      outputEligible: piece.outputEligible === true,
      observations: (piece.observationIds ?? []).map((observationId) => {
        const observation = observationById.get(observationId);
        return {
          candidateId:
            observation?.payload?._resolverCandidateId ?? observationId,
          evidenceRole: observation?.payload?.evidenceRole ?? observation?.role ?? null,
          intakeCandidacyDecision:
            observation?.payload?._canonicalIntakeCandidacyDecision ?? null,
          candidacyDecision:
            observation?.payload?._canonicalCandidacyDecision ?? null,
          sourceOccurrences:
            observation?.payload?._canonicalSourceOccurrences ?? null,
          sourceLabel: observation?.sourceLabel ?? null,
          sourceHeadingPath:
            observation?.sourceStructure?.headingPath ?? [],
          sourceSectionLabel:
            observation?.sourceStructure?.sectionLabel ?? null,
          sourceSectionType:
            observation?.sourceStructure?.sectionType ?? null,
          sourcePosition:
            observation?.payload?._canonicalSourcePosition ?? null,
          title: observation?.payload?.title ?? null,
        };
      }),
      pieceId: piece.id,
      role: piece.role ?? null,
      title,
      verified: piece.payload?._geoVerified === true,
      verifiedLatitude: piece.payload?.verifiedLatitude ?? null,
      verifiedLongitude: piece.payload?.verifiedLongitude ?? null,
    }];
  });
}

const summary = {
  baseline: baselineName,
  assembleInvocationFingerprints,
  baselineHash: baseline.fingerprint.hash,
  baselineRecordCounts: recordCounts(baseline.corridor.assembly.records),
  changedSections: changedSections(
    baseline.fingerprint,
    sourceCandidate.fingerprint
  ),
  clusterInvocationFingerprints,
  geocodeCandidateCount: geocodeCache.actualCandidateCount,
  geocodeStageHashes: postGeocodeStageSnapshots.map(geocodeStageFingerprint),
  modelCallCacheHitCount: parseCache.hits,
  modelCallMissCount: parseCache.misses,
  networkAllowed: false,
  manualEqualsParserAuthority: parserAuthorityCandidate
    ? parserAuthorityCandidate.fingerprint.hash ===
      sourceCandidate.fingerprint.hash
    : undefined,
  manualParserChangedSections: parserAuthorityCandidate
    ? changedSections(
        sourceCandidate.fingerprint,
        parserAuthorityCandidate.fingerprint
      )
    : undefined,
  manualParserCityNotes: inspectParserDiff
    ? {
        manual: cityNoteRows(sourceCandidate),
        parser: cityNoteRows(parserAuthorityCandidate),
      }
    : undefined,
  parserAuthorityContainmentDecisions:
    parserAuthorityCandidate?.corridor.assessment.report.canonicalization
      ?.groupingExecution?.decisions?.map((decision) => ({
        members: decision.members?.map((member) => ({
          evidence: member.evidence,
          title: member.title,
        })),
        parentTitle: decision.parent?.title ?? null,
        relationType: decision.provenance?.relationType ?? null,
      })) ?? [],
  parserAuthorityRecordCounts: parserAuthorityCandidate
    ? recordCounts(parserAuthorityCandidate.corridor.assembly.records)
    : undefined,
  parserAuthorityHash: parserAuthorityCandidate?.fingerprint.hash,
  parserAuthorityUsage:
    parserAuthorityResult?.usage?.sourceFactAssemblyAuthority,
  sourceAuthorityHash: sourceAuthority.metrics.authorityHash,
  sourceAuthorityMetrics: sourceAuthority.metrics,
  sourceCandidateHash: sourceCandidate.fingerprint.hash,
  sourceCandidateRecordCounts: recordCounts(
    sourceCandidate.corridor.assembly.records
  ),
  sourceContainmentDecisions:
    sourceCandidate.corridor.assessment.report.canonicalization
      ?.groupingExecution?.decisions?.map((decision) => ({
        members: decision.members?.map((member) => ({
          evidence: member.evidence,
          title: member.title,
        })),
        parentTitle: decision.parent?.title ?? null,
        relationType: decision.provenance?.relationType ?? null,
      })) ?? [],
  sourceFactLedgerHash: sourceAuthority.sourceLedger.metrics.ledgerHash,
  sourceGeocodeCandidateCount: sourceGeocodeReplay?.actualCandidateCount,
  sourceRelationshipFacts: sourceAuthority.sourceLedger.factSet.facts
    .filter((fact) => fact.kind === "relationship")
    .map((fact) => ({
      factId: fact.factId,
      memberFactCount: Array.isArray(fact.payload.memberFactIds)
        ? fact.payload.memberFactIds.length
        : 0,
      parentFactPresent: Boolean(fact.payload.parentFactId),
      relationshipType: fact.payload.relationshipType ?? null,
      sourceSpanCount: fact.sourceSpanIds.length,
      status: fact.payload.status ?? null,
      unresolvedMemberSpanCount: Array.isArray(
        fact.payload.unresolvedMemberSpanIds
      )
        ? fact.payload.unresolvedMemberSpanIds.length
        : 0,
    })),
  sourceIntentSignalCounts: Object.entries(
    sourceAuthority.sourceLedger.factSet.facts
      .filter((fact) => fact.kind === "intent")
      .reduce((counts, fact) => {
        const key = JSON.stringify({
          intent: fact.payload.intent ?? null,
          signals: Array.isArray(fact.payload.signals)
            ? [...fact.payload.signals].sort()
            : [],
        });
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {})
  ).map(([key, count]) => ({ ...JSON.parse(key), count })),
  sourceGroupingDecisions: (capturedSourceResolution?.groupings ?? []).map(
    (grouping) => ({
      candidateCount: grouping.candidateIds?.length ?? 0,
      candidateTitles: (grouping.candidateIds ?? []).map(
        (candidateId) => candidateById.get(candidateId)?.title ?? null
      ),
      parentTitle: candidateById.get(grouping.parentCandidateId)?.title ?? null,
      relationshipType: grouping.relationshipType ?? null,
      sourceFactId: grouping.sourceFactId ?? null,
    })
  ),
  inspectedCandidates: inspectedCandidates(),
  inspectedAuthorityRoleReasons: inspectedAuthorityRoleReasons(),
  inspectedFinalRecords: inspectedFinalRecords(),
  inspectedParserPieces: inspectedParserPieces(),
  inspectedReviewQuestions: inspectedQuestions(),
  inspectedUnresolvedBehaviorCandidates:
    inspectedUnresolvedBehaviorCandidates(),
  unresolvedBehaviorBindingDiagnostics: inspectUnresolvedBehavior
    ? sourceAuthority.diagnostics.unresolvedBehaviorCandidates
    : undefined,
  inspectedSourceFacts: inspectedSourceFacts(),
  inspectedSourceSpans: inspectedSourceSpans(),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
