import assert from "node:assert/strict";
import {
  applyCanonicalEvidenceResolution,
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

function cluster(stages: EvidenceStageInput[]) {
  return clusterExtractedEvidence({
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
    const source = [
      "Schonbrunn Palace",
      "Gloriette",
      "Orangeriegarten",
      "Palm House",
      "Apple Strudel Show",
      "Panorama Train pass",
    ].join("\n");
    const input = stage(source.split("\n"), source);
    const stages = applyCanonicalEvidenceResolution([input], {
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
    const draft = cluster(stages);

    assert.deepEqual(draft.activities.map((item) => item.title), ["Schonbrunn Palace"]);
    assert.equal(
      draft.missingDetails.filter((detail) => /We grouped/i.test(detail.prompt ?? "")).length,
      1
    );
  });

  await test("an inconclusive relationship preserves a clean three-stop day", () => {
    const titles = ["Albertina", "St. Stephen's Cathedral", "Prater Ferris Wheel"];
    const input = stage(titles, titles.join("\n"));
    const stages = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The venues are all in Vienna.",
        confidence: "medium",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Vienna sights",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(stages);

    assert.deepEqual(draft.activities.map((item) => item.title), titles);
    assert.equal(draft.missingDetails.length, 0);
  });

  await test("blank-separated source blocks cannot be collapsed by lookup", () => {
    const titles = ["Schonbrunn Palace", "Prater Ferris Wheel", "Albertina"];
    const input = stage(titles, titles.join("\n\n"));
    const stages = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "All three are popular Vienna attractions.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Vienna attractions",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(stages);

    assert.deepEqual(draft.activities.map((item) => item.title), titles);
    assert.equal(draft.missingDetails.length, 0);
  });
}
