import assert from "node:assert/strict";
import {
  CanonicalIdentityInvariantError,
} from "@/lib/extraction/canonical-identity";
import { finalizeCanonicalTripDraft } from "@/lib/extraction/canonical-trip-finalization";
import {
  clusterExtractedEvidence,
  EVIDENCE_CLUSTER_VERSION,
} from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { createAuditLineageRows } from "@/lib/extraction/trip-extraction-audit-lineage";

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

function identityFixture(reverseActivities = false) {
  const tripOverview = { title: "Identity test" };
  const activities = [
    {
      category: "art_culture",
      date: "2032-06-16",
      itemType: "activity",
      title: "Alpha Museum",
    },
    {
      category: "art_culture",
      date: "2032-06-17",
      itemType: "activity",
      title: "Beta Museum",
    },
  ];
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "identity source",
        source: "model_chunk",
        sourceFilename: "identity.txt",
        sourceUploadId: "upload-identity",
        stage: {
          activities: reverseActivities ? [...activities].reverse() : activities,
          missingDetails: [
            {
              answerType: "time",
              confidence: "medium",
              evidence: "Beta Museum time is still undecided.",
              guessedValue: null,
              prompt: "What time should Beta Museum start?",
              reason: "The source leaves this time undecided.",
              relatedTitle: "Beta Museum",
              subjectType: "item",
              targetField: "startTime",
            },
          ],
          places: [],
          sensitiveDetails: [],
          stays: [],
          transport: [],
          tripOverview,
        },
      },
    ],
    tripOverview,
  });
}

export default async function run() {
  await test("canonical identity does not depend on model output order", () => {
    const forward = createStructuredTripRecordsFromDraft({
      draft: identityFixture().draft,
      fallbackTripName: "Identity test",
      tripId: "identity-order",
    });
    const reversed = createStructuredTripRecordsFromDraft({
      draft: identityFixture(true).draft,
      fallbackTripName: "Identity test",
      tripId: "identity-order",
    });
    const entityIds = (items: typeof forward.items) =>
      Object.fromEntries(items.map((item) => [item.title, item.canonicalId]));
    const questionIds = (questions: typeof forward.reviewQuestions) =>
      questions.map((question) => ({
        canonicalId: question.canonicalId,
        subjectCanonicalId: question.subjectCanonicalId,
      }));

    assert.deepEqual(entityIds(reversed.items), entityIds(forward.items));
    assert.deepEqual(questionIds(reversed.reviewQuestions), questionIds(forward.reviewQuestions));
  });

  await test("canonical review targeting survives entity array reordering", () => {
    const evidence = identityFixture();
    const original = createStructuredTripRecordsFromDraft({
      draft: clone(evidence.draft),
      fallbackTripName: "Identity test",
      tripId: "identity-original",
    });
    const reorderedDraft = clone(evidence.draft) as Record<string, unknown>;
    reorderedDraft.activities = [
      ...(reorderedDraft.activities as unknown[]),
    ].reverse();
    const reordered = createStructuredTripRecordsFromDraft({
      draft: reorderedDraft,
      fallbackTripName: "Identity test",
      tripId: "identity-reordered",
    });
    const originalMuseum = original.items.find((item) => item.title === "Beta Museum");
    const reorderedMuseum = reordered.items.find((item) => item.title === "Beta Museum");
    const question = reordered.reviewQuestions.find(
      (item) => item.status === "open"
    );

    assert.ok(originalMuseum);
    assert.ok(reorderedMuseum);
    assert.ok(question);
    assert.equal(reorderedMuseum.canonicalId, originalMuseum.canonicalId);
    assert.equal(question.subjectCanonicalId, reorderedMuseum.canonicalId);
    assert.equal(question.subjectId, reorderedMuseum.id);
  });

  await test("date correction moves one canonical activity instead of replacing it", () => {
    const evidence = identityFixture();
    const before = createStructuredTripRecordsFromDraft({
      draft: clone(evidence.draft),
      fallbackTripName: "Identity test",
      tripId: "identity-date-change",
    });
    const correctedDraft = clone(evidence.draft) as Record<string, unknown>;
    const activities = correctedDraft.activities as Array<Record<string, unknown>>;
    const correctedMuseum = activities.find((item) => item.title === "Beta Museum");
    assert.ok(correctedMuseum);
    correctedMuseum.date = "2032-06-18";
    const after = createStructuredTripRecordsFromDraft({
      draft: correctedDraft,
      fallbackTripName: "Identity test",
      tripId: "identity-date-change",
    });
    const beforeMuseum = before.items.find((item) => item.title === "Beta Museum");
    const afterMuseum = after.items.find((item) => item.title === "Beta Museum");

    assert.ok(beforeMuseum);
    assert.ok(afterMuseum);
    assert.equal(afterMuseum.canonicalId, beforeMuseum.canonicalId);
    assert.equal(afterMuseum.id, beforeMuseum.id);
    assert.equal(afterMuseum.date, "2032-06-18");
  });

  await test("same-name evidence collapses unless separate occurrences are supported", () => {
    const tripOverview = { title: "Repeat visits" };
    const evidence = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        {
          label: "repeat source",
          source: "model_chunk",
          sourceUploadId: "upload-repeat",
          stage: {
            activities: [
              {
                category: "art_culture",
                date: "2032-06-16",
                itemType: "activity",
                title: "Museum A",
              },
              {
                category: "art_culture",
                date: "2032-06-16",
                itemType: "activity",
                title: "Museum A",
              },
              {
                category: "art_culture",
                date: "2032-06-17",
                itemType: "activity",
                title: "Museum B",
              },
              {
                category: "art_culture",
                date: "2032-06-18",
                itemType: "activity",
                title: "Museum B",
              },
            ],
            missingDetails: [],
            places: [],
            sensitiveDetails: [],
            stays: [],
            transport: [],
            tripOverview,
          },
        },
      ],
      tripOverview,
    });
    const records = createStructuredTripRecordsFromDraft({
      draft: evidence.draft,
      fallbackTripName: "Repeat visits",
      tripId: "repeat-visits",
    });
    const museumA = records.items.filter((item) => item.title === "Museum A");
    const museumB = records.items.filter((item) => item.title === "Museum B");

    assert.equal(museumA.length, 1);
    assert.equal(museumB.length, 2);
    assert.equal(new Set(museumB.map((item) => item.canonicalId)).size, 2);
  });

  await test("finalization rejects duplicate canonical identities", () => {
    assert.throws(
      () => finalizeCanonicalTripDraft({
        _evidence: {
          canonicalEntityIds: ["duplicate"],
          canonicalPieceIds: ["duplicate"],
          observationIds: [],
          version: EVIDENCE_CLUSTER_VERSION,
        },
        activities: [
          {
            _canonicalId: "duplicate",
            _canonicalPieceId: "duplicate",
            category: "art_culture",
            date: "2032-06-16",
            itemType: "activity",
            title: "Museum A",
          },
          {
            _canonicalId: "duplicate",
            _canonicalPieceId: "duplicate",
            category: "art_culture",
            date: "2032-06-17",
            itemType: "activity",
            title: "Museum B",
          },
        ],
        missingDetails: [],
        places: [],
        sensitiveDetails: [],
        stays: [],
        transport: [],
        tripOverview: { title: "Invalid identity" },
      }),
      CanonicalIdentityInvariantError
    );
  });

  await test("finalization rejects an evidence entity without an output entity", () => {
    const evidence = identityFixture();
    const draft = clone(evidence.draft) as Record<string, unknown>;
    const manifest = draft._evidence as Record<string, unknown>;
    manifest.canonicalEntityIds = [
      ...(manifest.canonicalEntityIds as string[]),
      "piece-without-output",
    ];

    assert.throws(
      () => finalizeCanonicalTripDraft(draft),
      CanonicalIdentityInvariantError
    );
  });

  await test("audit lineage joins canonical identity instead of title and date", () => {
    const evidence = identityFixture();
    const records = createStructuredTripRecordsFromDraft({
      draft: evidence.draft,
      fallbackTripName: "Identity test",
      tripId: "identity-audit",
    });
    const museum = records.items.find((item) => item.title === "Beta Museum");
    assert.ok(museum);
    museum.title = "Maker-renamed visit";
    museum.date = "2032-06-19";
    const rows = createAuditLineageRows({
      artifacts: {
        observations: evidence.observations,
        pieces: evidence.pieces,
      },
      records,
    });
    const row = rows.find(
      (candidate) => candidate.canonicalPieceId === museum.canonicalId
    );

    assert.ok(row);
    assert.equal(row.status, "compiled");
    assert.equal(row.finalRecords[0]?.id, museum.id);
  });
}
