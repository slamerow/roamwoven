import assert from "node:assert/strict";
import {
  applyCanonicalEvidenceResolution,
  reconcileCanonicalEvidenceResolutions,
  type CanonicalEvidenceResolution,
} from "@/lib/extraction/canonical-evidence-resolver";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function activity(title: string) {
  return {
    address: null,
    category: "art_culture",
    city: "Vienna",
    date: "2031-04-02",
    description: null,
    endTime: null,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    sourceFilename: "itinerary.txt",
    sourceHeadingPath: ["April 2", "Vienna"],
    sourceSectionLabel: "Vienna",
    sourceSectionType: "dated_itinerary",
    startTime: null,
    title,
  };
}

function stage(titles: string[], sourceText: string): EvidenceStageInput {
  return {
    label: "April 2 - Vienna",
    source: "model_chunk",
    sourceText,
    stage: {
      activities: titles.map(activity),
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

function cluster({
  groupingDecisions,
  stages,
}: ReturnType<typeof applyCanonicalEvidenceResolution>) {
  return clusterExtractedEvidence({
    groupingDecisions,
    sourceTransportAnchors: [],
    stages,
    tripOverview: { dateRange: "April 1-4, 2031" },
  }).draft as {
    activities: Array<{ title: string }>;
    missingDetails: Array<{ prompt?: string }>;
  };
}

const noRoleDecisions: CanonicalEvidenceResolution["roleDecisions"] = [];

export default async function run() {
  await test("verified same-site components become one auditable Call", () => {
    const titles = [
      "Schonbrunn Palace",
      "Gloriette",
      "Orangeriegarten",
      "Palm House",
      "Apple Strudel Show",
      "Panorama Train pass",
    ];
    const source = titles
      .map((title) => title.replace("Strudel", "Studel"))
      .join("\n");
    const input = stage(titles, source);
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: [
          "stage-1-item-1",
          "stage-1-item-2",
          "stage-1-item-3",
          "stage-1-item-4",
          "stage-1-item-5",
          "stage-1-item-6",
        ],
        claim: "The named stops are visitor components of the Schonbrunn complex.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Schonbrunn Palace",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), ["Schonbrunn Palace"]);
    assert.equal(
      draft.missingDetails.filter((detail) => /We grouped/i.test(detail.prompt ?? "")).length,
      1
    );
  });

  await test("an inconclusive relationship preserves a clean three-stop day", () => {
    const titles = ["Albertina", "St. Stephen's Cathedral", "Prater Ferris Wheel"];
    const input = stage(titles, titles.join("\n"));
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The venues are all in Vienna.",
        confidence: "medium",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Vienna sights",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), titles);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("blank-separated source blocks cannot be collapsed by lookup", () => {
    const titles = ["Schonbrunn Palace", "Prater Ferris Wheel", "Albertina"];
    const input = stage(titles, titles.join("\n\n"));
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "All three are popular Vienna attractions.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Vienna attractions",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), titles);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("a separately timed child rejects the whole proposed grouping", () => {
    const titles = ["Old Town walking tour", "Klementinum tour", "Old Town Square"];
    const input = stage(titles, titles.join("\n"));
    const stagedActivities = (input.stage as { activities: Array<Record<string, unknown>> }).activities;
    stagedActivities[1].startTime = "14:30";
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The stops are in one historic district.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Old Town walking tour",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), titles);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("a high-confidence role decision is the source-role authority", () => {
    const input = stage(["Museum evening"], "Museum evening");
    const stagedActivity = (input.stage as { activities: Array<Record<string, unknown>> })
      .activities[0];
    stagedActivity.evidenceRole = "city_note_candidate";
    stagedActivity.itemType = "note";
    stagedActivity.sourceSectionType = "city_reference";
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [],
      roleDecisions: [{
        candidateId: "stage-1-item-1",
        classification: "keep_activity",
        confidence: "high",
        reason: "The source hierarchy places this inside the dated itinerary block.",
      }],
    });
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), ["Museum evening"]);
  });

  await test("cross-chunk grouping uses shared source evidence and an atomic parent", () => {
    const sourceText = [
      "Schonbrunn Palace",
      "Gloriette",
      "Palm House",
      "Apple Strudel Show",
    ].join("\n");
    const proposalStage = stage(["Schonbrunn cluster"], sourceText);
    proposalStage.sourceUploadId = "shared-upload";
    const proposal = (proposalStage.stage as {
      activities: Array<Record<string, unknown>>;
    }).activities[0];
    proposal.evidenceRole = "grouping_proposal";
    proposal.itemType = "note";
    proposal.sourceSectionType = "city_reference";

    const atomicStage = stage(
      ["Schonbrunn Palace", "Gloriette", "Palm House", "Apple Strudel Show"],
      sourceText
    );
    atomicStage.sourceUploadId = "shared-upload";
    const application = applyCanonicalEvidenceResolution(
      [proposalStage, atomicStage],
      {
        groupings: [{
          candidateIds: [
            "stage-1-item-1",
            "stage-2-item-1",
            "stage-2-item-2",
            "stage-2-item-3",
            "stage-2-item-4",
          ],
          claim: "The named stops are components of one palace-complex visit.",
          confidence: "high",
          parentCandidateId: "stage-1-item-1",
          parentTitle: "Schonbrunn Palace",
        }],
        roleDecisions: noRoleDecisions,
      }
    );
    const draft = cluster(application);

    assert.deepEqual(draft.activities.map((item) => item.title), ["Schonbrunn Palace"]);
    assert.equal(
      draft.missingDetails.filter((detail) => /We grouped/i.test(detail.prompt ?? ""))
        .length,
      1
    );
    assert.deepEqual(application.groupingDecisions[0]?.candidateIds, [
      "stage-2-item-1",
      "stage-2-item-2",
      "stage-2-item-3",
      "stage-2-item-4",
    ]);
  });

  await test("candidate count cannot silently dead-path a late grouping", () => {
    const titles = Array.from({ length: 122 }, (_, index) => `Venue ${index + 1}`);
    const input = stage(titles, titles.join("\n"));
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-121", "stage-1-item-122"],
        claim: "The final two named components form one verified visit.",
        confidence: "high",
        parentCandidateId: "stage-1-item-121",
        parentTitle: "Venue 121",
      }],
      roleDecisions: noRoleDecisions,
    });

    assert.equal(application.groupingDecisions.length, 1);
  });

  await test("conflicting resolver windows preserve separate items and original roles", () => {
    const resolution = reconcileCanonicalEvidenceResolutions([
      {
        groupings: [{
          candidateIds: ["a", "b"],
          claim: "First possible grouping.",
          confidence: "high",
          parentCandidateId: "a",
          parentTitle: "A",
        }],
        roleDecisions: [{
          candidateId: "a",
          classification: "city_note",
          confidence: "high",
          reason: "One window read this as a reference section.",
        }],
      },
      {
        groupings: [{
          candidateIds: ["b", "c"],
          claim: "Second overlapping grouping.",
          confidence: "high",
          parentCandidateId: "b",
          parentTitle: "B",
        }],
        roleDecisions: [{
          candidateId: "a",
          classification: "keep_activity",
          confidence: "high",
          reason: "Another window read this as itinerary content.",
        }],
      },
    ]);

    assert.deepEqual(resolution, { groupings: [], roleDecisions: [] });
  });
}
