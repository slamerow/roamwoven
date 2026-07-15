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
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import { createGeneratedTripSummaryView } from "@/lib/generated-trip-summary";
import { createTravelerAppViewModel } from "@/lib/traveler-view-model";

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
    activities: Array<{
      _canonicalParentPieceId?: string;
      description?: string | null;
      itemType?: string | null;
      startTime?: string | null;
      title: string;
    }>;
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
    const source = [
      "Schonbrunn Palace complex includes these visitor stops:",
      ...titles.map((title) => title.replace("Strudel", "Studel")),
    ].join("\n");
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

    const roots = draft.activities.filter((item) => !item._canonicalParentPieceId);
    const stops = draft.activities.filter((item) => item._canonicalParentPieceId);
    assert.deepEqual(roots.map((item) => item.title), ["Schonbrunn Palace"]);
    assert.equal(stops.length, 5);
    assert.deepEqual(stops.map((item) => item.title), titles.slice(1));
    assert.equal(
      roots[0]?.description?.includes("Gloriette") ?? false,
      false
    );
    assert.equal(
      draft.missingDetails.filter((detail) => /one activity card/i.test(detail.prompt ?? "")).length,
      1
    );
  });

  await test("first-class grouping compiles to one traveler card with ordered stops", () => {
    const titles = ["Schonbrunn Palace", "Gloriette", "Palm House"];
    const input = stage(
      titles,
      ["Schonbrunn Palace complex includes:", ...titles].join("\n")
    );
    const draft = cluster(applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The named stops form one palace-complex visit.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Schonbrunn Palace",
      }],
      roleDecisions: noRoleDecisions,
    }));
    const records = createStructuredTripRecordsFromDraft({
      draft,
      fallbackTripName: "Vienna",
      tripId: "trip-first-class-group",
    });
    const traveler = createTravelerAppViewModel(records);

    assert.equal(records.items.length, 3);
    assert.equal(records.items.filter((item) => !item.parentItemId).length, 1);
    assert.equal(records.items.filter((item) => item.parentItemId).length, 2);
    assert.equal(traveler.cards.length, 1);
    assert.deepEqual(traveler.cards[0]?.stops.map((stop) => stop.title), titles.slice(1));
    assert.equal(createGeneratedTripSummaryView(records).counts.activities, 1);
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

  await test("same dated heading cannot group a city-card pickup with a museum", () => {
    const titles = ["Vienna Card pickup", "Albertina"];
    const input = stage(titles, titles.join("\n"));
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2"],
        claim:
          "Vienna Card pickup and Albertina are presented together under the same dated itinerary heading.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Vienna Card pickup and Albertina",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    assert.equal(application.groupingDecisions.length, 0);
    assert.deepEqual(draft.activities.map((item) => item.title), titles);
  });

  await test("city-pass pickup remains standalone outside the European fixtures", () => {
    const titles = ["Kyoto Transit Pass pickup", "Kiyomizu-dera"];
    const input = stage(titles, titles.join("\n"));
    const activities = (input.stage as {
      activities: Array<Record<string, unknown>>;
    }).activities;
    activities.forEach((item) => {
      item.city = "Kyoto";
      item.sourceHeadingPath = ["April 2", "Kyoto"];
      item.sourceSectionLabel = "Kyoto";
    });
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2"],
        claim: "The items sit under the same dated heading.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Kyoto morning",
      }],
      roleDecisions: noRoleDecisions,
    });

    assert.equal(application.groupingDecisions.length, 0);
  });

  await test("a runtime city name cannot become a generic grouping parent", () => {
    const titles = ["Kiyomizu-dera", "Sannenzaka", "Yasaka Pagoda"];
    const input = stage(
      titles,
      ["Kyoto attractions include:", ...titles].join("\n")
    );
    const activities = (input.stage as {
      activities: Array<Record<string, unknown>>;
    }).activities;
    activities.forEach((item) => {
      item.city = "Kyoto";
      item.sourceHeadingPath = ["April 2", "Kyoto"];
      item.sourceSectionLabel = "Kyoto";
    });
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: [
          "stage-1-item-1",
          "stage-1-item-2",
          "stage-1-item-3",
        ],
        claim: "The source presents one continuous route through the city.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Kyoto attractions",
      }],
      roleDecisions: noRoleDecisions,
    });

    assert.equal(application.groupingDecisions.length, 0);
  });

  await test("generic dated itinerary headings cannot become group parents", () => {
    const titles = ["Albertina", "Belvedere Palace", "Prater Ferris Wheel"];
    const input = stage(titles, titles.join("\n"));
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: [
          "stage-1-item-1",
          "stage-1-item-2",
          "stage-1-item-3",
        ],
        claim: "The activities are listed together under the same date.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Friday January 18",
      }],
      roleDecisions: noRoleDecisions,
    });

    assert.equal(application.groupingDecisions.length, 0);
  });

  await test("execution rejects overlapping groups even before reconciliation", () => {
    const titles = [
      "Schonbrunn Palace",
      "Gloriette",
      "Palm House",
      "Belvedere Palace",
      "Upper Belvedere",
    ];
    const input = stage(
      titles,
      ["Schonbrunn Palace complex includes these stops:", ...titles].join("\n")
    );
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [
        {
          candidateIds: [
            "stage-1-item-1",
            "stage-1-item-2",
            "stage-1-item-3",
          ],
          claim: "These are components of one palace complex.",
          confidence: "high",
          parentCandidateId: "stage-1-item-1",
          parentTitle: "Schonbrunn Palace",
        },
        {
          candidateIds: [
            "stage-1-item-3",
            "stage-1-item-4",
            "stage-1-item-5",
          ],
          claim: "These are components of one museum complex.",
          confidence: "high",
          parentCandidateId: "stage-1-item-4",
          parentTitle: "Belvedere Palace",
        },
      ],
      roleDecisions: noRoleDecisions,
    });

    assert.equal(application.groupingDecisions.length, 1);
    assert.deepEqual(application.groupingDecisions[0]?.candidateIds, [
      "stage-1-item-1",
      "stage-1-item-2",
      "stage-1-item-3",
    ]);
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

  await test("an independently timed child stays outside a continuous grouping", () => {
    const titles = ["Old Town walking tour", "Klementinum tour", "Old Town Square"];
    const input = stage(
      titles,
      ["Old Town walking route", ...titles].join("\n")
    );
    const stagedActivities = (input.stage as { activities: Array<Record<string, unknown>> }).activities;
    stagedActivities[1].startTime = "14:30";
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The source presents one continuous walking route.",
        confidence: "high",
        parentCandidateId: "stage-1-item-1",
        parentTitle: "Old Town walking tour",
      }],
      roleDecisions: noRoleDecisions,
    });
    const draft = cluster(application);

    const roots = draft.activities.filter((item) => !item._canonicalParentPieceId);
    const stops = draft.activities.filter((item) => item._canonicalParentPieceId);
    assert.deepEqual(
      roots.map((item) => item.title).sort(),
      [titles[0], titles[1]].sort()
    );
    assert.equal(
      roots.find((item) => item.title === titles[1])?.startTime,
      "14:30"
    );
    assert.deepEqual(stops.map((item) => item.title), [titles[2]]);
    assert.equal(
      draft.missingDetails.filter((detail) => /one activity card/i.test(detail.prompt ?? "")).length,
      1
    );
  });

  await test("two independently timed stops reject a proposed grouping", () => {
    const titles = ["Old Town walking tour", "Klementinum tour", "Old Town Square"];
    const input = stage(
      titles,
      ["Old Town walking route", ...titles].join("\n")
    );
    const stagedActivities = (input.stage as { activities: Array<Record<string, unknown>> }).activities;
    stagedActivities[1].startTime = "14:30";
    stagedActivities[2].startTime = "16:00";
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-1", "stage-1-item-2", "stage-1-item-3"],
        claim: "The source presents one continuous walking route.",
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

  await test("downstream timing cannot override a canonical city-note decision", () => {
    const input = stage(["Museum opening time"], "Museum opening time");
    const stagedActivity = (input.stage as { activities: Array<Record<string, unknown>> })
      .activities[0];
    stagedActivity.startTime = "18:00";
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [],
      roleDecisions: [{
        candidateId: "stage-1-item-1",
        classification: "city_note",
        confidence: "high",
        reason: "The source places this opening-time reference under city notes.",
      }],
    });
    const draft = cluster(application);

    assert.equal(draft.activities.length, 1);
    assert.equal(draft.activities[0]?.itemType, "note");
  });

  await test("cross-chunk grouping uses shared source evidence and an atomic parent", () => {
    const sourceText = [
      "Schonbrunn Palace complex includes:",
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

    const roots = draft.activities.filter((item) => !item._canonicalParentPieceId);
    const stops = draft.activities.filter((item) => item._canonicalParentPieceId);
    assert.deepEqual(roots.map((item) => item.title), ["Schonbrunn Palace"]);
    assert.equal(stops.length, 4);
    assert.equal(
      draft.missingDetails.filter((detail) => /one activity card/i.test(detail.prompt ?? ""))
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

  await test("a source-authored dated route needs no assembly Call", () => {
    const sourceText = [
      "Old Town walking route",
      "Charles Bridge",
      "Old Town Square",
    ].join("\n");
    const proposalStage = stage(["Old Town walk"], sourceText);
    proposalStage.sourceUploadId = "old-town-source";
    const proposal = (proposalStage.stage as {
      activities: Array<Record<string, unknown>>;
    }).activities[0];
    proposal.evidenceRole = "grouping_proposal";
    proposal.sourceSectionType = "dated_itinerary";
    const stopsStage = stage(["Charles Bridge", "Old Town Square"], sourceText);
    stopsStage.sourceUploadId = "old-town-source";
    const draft = cluster(applyCanonicalEvidenceResolution(
      [proposalStage, stopsStage],
      {
        groupings: [{
          candidateIds: ["stage-1-item-1", "stage-2-item-1", "stage-2-item-2"],
          claim: "The source explicitly presents one walking route.",
          confidence: "high",
          parentCandidateId: "stage-1-item-1",
          parentTitle: "Old Town walk",
        }],
        roleDecisions: noRoleDecisions,
      }
    ));

    assert.equal(
      draft.activities.filter((item) => !item._canonicalParentPieceId).length,
      1
    );
    assert.equal(
      draft.missingDetails.filter((detail) => /one activity card/i.test(detail.prompt ?? ""))
        .length,
      0
    );
  });

  await test("candidate count cannot silently dead-path a late grouping", () => {
    const titles = [
      ...Array.from({ length: 120 }, (_, index) => `Venue ${index + 1}`),
      "Schonbrunn Palace",
      "Gloriette",
    ];
    const input = stage(
      titles,
      ["Schonbrunn Palace complex includes Gloriette.", ...titles].join("\n")
    );
    const application = applyCanonicalEvidenceResolution([input], {
      groupings: [{
        candidateIds: ["stage-1-item-121", "stage-1-item-122"],
        claim: "The final two named components form one verified visit.",
        confidence: "high",
        parentCandidateId: "stage-1-item-121",
        parentTitle: "Schonbrunn Palace",
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

  await test("nested resolver windows keep the more complete compatible grouping", () => {
    const resolution = reconcileCanonicalEvidenceResolutions([
      {
        groupings: [{
          candidateIds: ["a", "b"],
          claim: "Verified palace visit.",
          confidence: "high",
          parentCandidateId: "a",
          parentTitle: "Palace",
        }],
        roleDecisions: [],
      },
      {
        groupings: [{
          candidateIds: ["a", "b", "c"],
          claim: "Verified palace visit with gardens.",
          confidence: "high",
          parentCandidateId: "a",
          parentTitle: "Palace",
        }],
        roleDecisions: [],
      },
    ]);

    assert.deepEqual(resolution.groupings[0]?.candidateIds, ["a", "b", "c"]);
  });
}
