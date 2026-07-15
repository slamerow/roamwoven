import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  clusterExtractedEvidence,
  type CanonicalEvidencePiece,
  type EvidenceObservation,
} from "@/lib/extraction/evidence-clustering";
import { readStructuredTripSnapshot } from "@/lib/extraction/structured-trip-snapshot";
import type { TripExtractionResult } from "@/lib/extraction/openai-trip-parser";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createParserResult(): TripExtractionResult {
  const tripOverview = {
    dateRange: "June 16-17, 2032",
    destinationSummary: "Paris",
    title: "Route recovery test",
  };
  const evidence = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "route recovery source",
        source: "model_chunk",
        sourceFilename: "route-recovery.txt",
        sourceUploadId: "upload-route-recovery",
        stage: {
          activities: [
            {
              category: "art_culture",
              city: "Paris",
              date: "2032-06-16",
              itemType: "activity",
              title: "Route Recovery Museum",
            },
          ],
          missingDetails: [],
          places: [
            {
              arriveDate: "2032-06-16",
              city: "Paris",
              country: "France",
              leaveDate: "2032-06-17",
            },
          ],
          sensitiveDetails: [],
          stays: [],
          transport: [],
          tripOverview,
        },
      },
    ],
    tripOverview,
  });

  return {
    draft: evidence.draft,
    evidenceArtifacts: {
      observations: evidence.observations,
      pieces: evidence.pieces,
    },
    model: "route-recovery-model",
    usage: {
      activityChunks: {
        count: 1,
        failed: 0,
        rescued: 0,
        succeeded: 1,
      },
      evidence: evidence.summary,
      sourceAnchors: { transport: [] },
      staged: true,
    },
  };
}

function patchModule(
  modulePath: string,
  replacements: Record<string, unknown>
) {
  const target = require(modulePath) as Record<string, unknown>;
  const originals = new Map<string, unknown>();

  Object.entries(replacements).forEach(([key, value]) => {
    originals.set(key, target[key]);
    target[key] = value;
  });

  return () => {
    originals.forEach((value, key) => {
      target[key] = value;
    });
  };
}

export default async function run() {
  const cachedModulesBeforeRouteTest = new Set(Object.keys(require.cache));
  let parserResult = createParserResult();
  let runCount = 0;
  const completedCalls: Array<Record<string, unknown>> = [];
  const failedCalls: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const persistedDispositionCounts: number[] = [];
  const persistedPieceIds: string[][] = [];
  const restore = [
    patchModule("@/lib/env", {
      getOpenAIConfig: () => ({ maxInputChars: 100_000 }),
      hasOpenAIExtractionConfig: () => true,
      isTripAllowedForOpenAIExtraction: () => true,
    }),
    patchModule("@/lib/trips", {
      getMakerTrip: async () => ({
        isDemo: false,
        name: "Route recovery test",
        paymentStatus: "paid",
        processingStatus: "setup",
      }),
    }),
    patchModule("@/lib/uploads", {
      listTripUploads: async () => [{ id: "upload-route-recovery" }],
    }),
    patchModule("@/lib/extraction/trip-materials", {
      createTripExtractionMaterialsIdempotencyKey: () =>
        "route-recovery-key",
      getTripExtractionMaterialSourceUploadIds: () => [
        "upload-route-recovery",
      ],
      getTripExtractionMaterialsWithSummary: async () => ({
        dedupeSummary: { duplicateCount: 0 },
        materials: [
          {
            filename: "route-recovery.txt",
            sourceUploadId: "upload-route-recovery",
            text: "Visit Route Recovery Museum in Paris.",
            type: "file_text",
          },
        ],
      }),
    }),
    patchModule("@/lib/extraction/material-extractions", {
      getMaterialExtractionReadinessIssue: () => null,
      listMaterialExtractionCheckpoints: async () => [],
    }),
    patchModule("@/lib/extraction/material-budget", {
      optimizeTripExtractionMaterials: ({ materials }: { materials: unknown[] }) => ({
        materials,
        summary: {
          estimatedInputTokens: 12,
          materialCount: 1,
          rawCharCount: 48,
          submittedCharCount: 48,
          truncatedMaterialCount: 0,
        },
      }),
    }),
    patchModule("@/lib/extraction/openai-trip-parser", {
      extractTripDraftWithOpenAI: async () => parserResult,
    }),
    patchModule("@/lib/extraction/evidence-artifacts", {
      persistEvidenceArtifacts: async ({
        observations,
        pieces,
      }: {
        observations: EvidenceObservation[];
        pieces: CanonicalEvidencePiece[];
      }) => {
        const pieceIds = pieces.map((piece) => piece.id);
        if (new Set(pieceIds).size !== pieceIds.length) {
          throw new Error("duplicate canonical piece identity");
        }
        persistedDispositionCounts.push(
          observations.filter((observation) => observation.disposition).length
        );
        persistedPieceIds.push(pieceIds);
        return {
          observationCount: parserResult.evidenceArtifacts.observations.length,
          pieceCount: pieces.length,
        };
      },
    }),
    patchModule("@/lib/extraction/processing-events", {
      recordTripProcessingEvent: async (event: Record<string, unknown>) => {
        events.push(clone(event));
      },
    }),
    patchModule("@/lib/extraction/processing-runs", {
      completeTripProcessingRun: async (input: Record<string, unknown>) => {
        completedCalls.push(clone(input));
        return {};
      },
      createTripProcessingRun: async () => ({ id: `run-${++runCount}` }),
      failTripProcessingRun: async (input: Record<string, unknown>) => {
        failedCalls.push(clone(input));
      },
      getLatestTripDraftSnapshot: async () => null,
      getLatestTripProcessingRun: async () => null,
    }),
  ];

  try {
    const { POST } = require(
      "@/app/maker/trips/[tripId]/data/extract/route"
    ) as {
      POST: (
        request: NextRequest,
        context: { params: Promise<{ tripId: string }> }
      ) => Promise<Response>;
    };

    await test("extraction route repairs identity before completing assembly", async () => {
      const broken = clone(createParserResult());
      const draft = broken.draft as Record<string, unknown>;
      const activities = draft.activities as Array<Record<string, unknown>>;
      activities.push(clone(activities[0]));
      const evidence = draft._evidence as Record<string, unknown>;
      evidence.canonicalEntityIds = [
        ...(evidence.canonicalEntityIds as string[]),
        activities[0]._canonicalId as string,
      ];
      parserResult = broken;
      completedCalls.length = 0;
      failedCalls.length = 0;
      events.length = 0;
      persistedPieceIds.length = 0;
      persistedDispositionCounts.length = 0;

      const response = await POST(
        new NextRequest(
          "http://localhost/maker/trips/route-recovery-success/data/extract"
        ),
        { params: Promise.resolve({ tripId: "route-recovery-success" }) }
      );
      const location = response.headers.get("location") ?? "";
      const assemblyEvents = events.filter(
        (event) => event.stage === "assembly"
      );
      const completed = completedCalls[0];
      const records = readStructuredTripSnapshot(completed?.draftJson);
      const usage = completed?.usage as Record<string, unknown>;
      const openai = usage.openai as Record<string, unknown>;
      const recovery = openai.identityRecovery as Record<string, unknown>;

      assert.match(location, /extraction=completed/);
      assert.equal(completedCalls.length, 1);
      assert.equal(failedCalls.length, 0);
      assert.deepEqual(
        assemblyEvents.map((event) => event.status),
        ["started", "completed"]
      );
      assert.equal(
        (assemblyEvents[1]?.details as Record<string, unknown>)
          .identityRecoveryStatus,
        "repaired"
      );
      assert.equal(recovery.status, "repaired");
      assert.ok(records);
      assert.equal(records.items.length, 1);
    });

    await test("extraction route repairs evidence and draft identity independently", async () => {
      const duplicated = createParserResult();
      const piece = duplicated.evidenceArtifacts.pieces.find(
        (candidate) => candidate.outputEligible && candidate.kind === "activity"
      );
      assert.ok(piece);
      duplicated.evidenceArtifacts.pieces.push(clone(piece));
      const draft = duplicated.draft as Record<string, unknown>;
      const activities = draft.activities as Array<Record<string, unknown>>;
      activities.push(clone(activities[0]));
      const evidence = draft._evidence as Record<string, unknown>;
      evidence.canonicalEntityIds = [
        ...(evidence.canonicalEntityIds as string[]),
        activities[0]._canonicalId as string,
      ];
      parserResult = duplicated;
      completedCalls.length = 0;
      failedCalls.length = 0;
      events.length = 0;
      persistedPieceIds.length = 0;
      persistedDispositionCounts.length = 0;

      const response = await POST(
        new NextRequest(
          "http://localhost/maker/trips/route-evidence-recovery/data/extract"
        ),
        { params: Promise.resolve({ tripId: "route-evidence-recovery" }) }
      );
      const location = response.headers.get("location") ?? "";
      const canonicalEvents = events.filter(
        (event) => event.stage === "canonical_validation"
      );
      const completed = completedCalls[0];
      const records = readStructuredTripSnapshot(completed?.draftJson);
      const usage = completed?.usage as Record<string, unknown>;
      const openai = usage.openai as Record<string, unknown>;
      const recovery = openai.identityRecovery as Record<string, unknown>;

      assert.match(location, /extraction=completed/);
      assert.equal(completedCalls.length, 1);
      assert.equal(failedCalls.length, 0);
      assert.deepEqual(
        canonicalEvents.map((event) => event.status),
        ["started", "completed"]
      );
      assert.equal(
        (canonicalEvents[1]?.details as Record<string, unknown>).status,
        "repaired"
      );
      assert.equal(recovery.status, "repaired");
      assert.ok(
        (recovery.actions as string[]).includes(
          "deduplicated_identical_piece:" + piece.id
        )
      );
      assert.ok(
        (recovery.actions as string[]).includes(
          "rebuilt_canonical_outputs_from_evidence"
        )
      );
      assert.ok(records);
      assert.equal(records.items.length, 1);
      assert.equal(persistedPieceIds.length, 1);
      assert.equal(
        new Set(persistedPieceIds[0]).size,
        persistedPieceIds[0].length
      );
    });

    await test("extraction route rebuilds a missing disposition manifest backstage", async () => {
      const broken = createParserResult();
      const draft = broken.draft as Record<string, unknown>;
      const evidence = draft._evidence as Record<string, unknown>;
      delete evidence.dispositions;
      broken.evidenceArtifacts.observations.forEach((observation) => {
        delete observation.disposition;
      });
      parserResult = broken;
      completedCalls.length = 0;
      failedCalls.length = 0;
      events.length = 0;
      persistedPieceIds.length = 0;
      persistedDispositionCounts.length = 0;

      const response = await POST(
        new NextRequest(
          "http://localhost/maker/trips/route-disposition-recovery/data/extract"
        ),
        { params: Promise.resolve({ tripId: "route-disposition-recovery" }) }
      );
      const location = response.headers.get("location") ?? "";
      const completed = completedCalls[0];
      const usage = completed?.usage as Record<string, unknown>;
      const openai = usage.openai as Record<string, unknown>;
      const recovery = openai.identityRecovery as Record<string, unknown>;

      assert.match(location, /extraction=completed/);
      assert.equal(completedCalls.length, 1);
      assert.equal(failedCalls.length, 0);
      assert.equal(recovery.status, "repaired");
      assert.ok(
        (recovery.actions as string[]).includes(
          "rebuilt_evidence_identity_manifest"
        )
      );
      assert.deepEqual(persistedDispositionCounts, [
        broken.evidenceArtifacts.observations.length,
      ]);
    });

    await test("extraction route quarantines an artifact observation mismatch", async () => {
      const conflicted = createParserResult();
      conflicted.evidenceArtifacts.observations = [];
      parserResult = conflicted;
      completedCalls.length = 0;
      failedCalls.length = 0;
      events.length = 0;
      persistedPieceIds.length = 0;
      persistedDispositionCounts.length = 0;

      const response = await POST(
        new NextRequest(
          "http://localhost/maker/trips/route-observation-conflict/data/extract"
        ),
        { params: Promise.resolve({ tripId: "route-observation-conflict" }) }
      );
      const location = response.headers.get("location") ?? "";
      const evidenceEvents = events.filter(
        (event) => event.stage === "evidence_cluster"
      );
      const failureDetails = failedCalls[0]
        ?.failureDetails as Record<string, unknown>;

      assert.match(location, /error=assembly-recovery-required/);
      assert.equal(completedCalls.length, 0);
      assert.equal(failedCalls.length, 1);
      assert.equal(persistedPieceIds.length, 0);
      assert.deepEqual(
        evidenceEvents.map((event) => event.status),
        ["started", "failed"]
      );
      assert.equal(failureDetails.stage, "evidence_cluster");
      assert.equal(failureDetails.errorName, "CanonicalAssemblyRecoveryError");
    });

    await test("extraction route marks only unrecoverable conflicts as assembly recovery", async () => {
      const conflicted = createParserResult();
      const piece = conflicted.evidenceArtifacts.pieces.find(
        (candidate) => candidate.outputEligible && candidate.kind === "activity"
      );
      assert.ok(piece);
      const conflictingPiece: CanonicalEvidencePiece = {
        ...clone(piece),
        payload: {
          ...clone(piece.payload),
          title: "Conflicting route activity",
        },
      };
      conflicted.evidenceArtifacts.pieces.push(conflictingPiece);
      parserResult = conflicted;
      completedCalls.length = 0;
      failedCalls.length = 0;
      events.length = 0;
      persistedPieceIds.length = 0;
      persistedDispositionCounts.length = 0;

      const response = await POST(
        new NextRequest(
          "http://localhost/maker/trips/route-recovery-failure/data/extract"
        ),
        { params: Promise.resolve({ tripId: "route-recovery-failure" }) }
      );
      const location = response.headers.get("location") ?? "";
      const canonicalEvents = events.filter(
        (event) => event.stage === "canonical_validation"
      );
      const failureDetails = failedCalls[0]
        ?.failureDetails as Record<string, unknown>;
      const assemblyRecovery = failureDetails
        .assemblyRecovery as Record<string, unknown>;

      assert.match(location, /error=assembly-recovery-required/);
      assert.equal(completedCalls.length, 0);
      assert.equal(failedCalls.length, 1);
      assert.deepEqual(
        canonicalEvents.map((event) => event.status),
        ["started", "failed"]
      );
      assert.equal(persistedPieceIds.length, 0);
      assert.equal(failureDetails.stage, "canonical_validation");
      assert.equal(failureDetails.errorName, "CanonicalAssemblyRecoveryError");
      assert.equal(assemblyRecovery.stage, "repair");
    });
  } finally {
    restore.reverse().forEach((restoreModule) => restoreModule());
    Object.keys(require.cache).forEach((modulePath) => {
      if (!cachedModulesBeforeRouteTest.has(modulePath)) {
        delete require.cache[modulePath];
      }
    });
  }
}
