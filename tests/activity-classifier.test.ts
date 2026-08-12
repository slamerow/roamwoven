import assert from "node:assert/strict";
import {
  classifyIntentBlocks,
  classifyIdeaListSections,
  classifyOwnTextEvidence,
  classifyRecoveredLineRole,
  decideActivityCandidacy,
  decideRecoveredActivityCandidacy,
  isRoutineTravelerStepTitle,
  isSiteComponentTitlePair,
  resolveMentionCommitment,
  type IdeaListEntry,
  type IntentBlockEntry,
} from "@/lib/extraction/activity-classifier";

// Unit checks for the unified activity-vs-city-note / commitment classifier
// (Arc B centerpiece; acceptance criteria from live-run 7.18.3,
// docs/assembly-defect-docket-2026-07-18-run6.md).

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function entry(overrides: Partial<IdeaListEntry> & { id: string }): IdeaListEntry {
  return {
    category: "art_culture",
    date: "2019-01-21",
    description: null,
    hasFixedEvidence: false,
    headingPath: null,
    ownTextHedge: false,
    sectionLabel: "Monday, January 21st // Budapest Bathing",
    title: null,
    ...overrides,
  };
}

function blockEntry(
  overrides: Partial<IntentBlockEntry> & { id: string; sourceOrder: number }
): IntentBlockEntry {
  const { id, sourceOrder, ...rest } = overrides;
  return {
    approxLatitude: null,
    approxLongitude: null,
    authoredBlockStart: false,
    authoredDayList: false,
    boundaryBefore: false,
    category: "art_culture",
    date: "2019-01-19",
    hasExplicitChoice: false,
    hasFixedEvidence: false,
    hasDayPlanMembership: false,
    hasHedgeMarker: false,
    hasIdeaSignal: false,
    hasResearchEvidence: false,
    hasSequencedDayPlan: false,
    hasSourceSupportedPlan: false,
    hasSourceStructure: true,
    id,
    itemType: "activity",
    observationIds: [`obs-${id}`],
    sourceKey: "source-day-jan-19",
    sourceOrder,
    title: id,
    verifiedLatitude: null,
    verifiedLongitude: null,
    ...rest,
  };
}

export default async function run() {
  await test("activity candidacy: contradictions resolve through one ordered decision", () => {
    const base = {
      category: "art_culture",
      date: "2030-04-12",
      description: "A source item.",
      endTime: null,
      startTime: null,
      title: "Sample place",
    };
    const matrix = [
      {
        expected: ["accessory", "ITEM_TYPE_ADMIN", true],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          itemType: "admin",
        },
      },
      {
        expected: ["accessory", "EXPLICIT_ACCESSORY", true],
        input: {
          ...base,
          evidenceRole: "accessory_detail",
          itemType: "activity",
        },
      },
      {
        expected: ["city_note", "ITEM_TYPE_NOTE", true],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          itemType: "note",
        },
      },
      {
        expected: ["accessory", "ITEM_TYPE_ADMIN", true],
        input: {
          ...base,
          category: "admin_logistics",
          evidenceRole: "atomic_candidate",
          itemType: "note",
          sourceSectionType: "booking_detail",
        },
      },
      {
        expected: ["city_note", "BLOCK_IDEAS", false],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          intentBlockType: "ideas" as const,
          itemType: "activity",
        },
      },
      {
        expected: ["activity", "BLOCK_PLAN", false],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          intentBlockType: "plan" as const,
          itemType: "activity",
        },
      },
      {
        expected: ["activity", "BLOCK_AMBIGUOUS", false],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          intentBlockType: "ambiguous" as const,
          itemType: "activity",
        },
      },
      {
        expected: ["activity", "AUDITED_COMMITMENT", true],
        input: {
          ...base,
          evidenceRole: "city_note_candidate",
          hasAuditedCommitment: true,
          itemType: "activity",
        },
      },
      {
        expected: ["context", "ROUTINE_TRAVELER_STEP", false],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          hasAuditedCommitment: true,
          isRoutineTravelerStep: true,
          itemType: "activity",
          startTime: "06:00",
          title: "Wake up",
        },
      },
      {
        expected: ["activity", "AUDITED_COMMITMENT", false],
        input: {
          ...base,
          evidenceRole: "atomic_candidate",
          hasAuditedCommitment: true,
          itemType: "activity",
          startTime: "09:00",
          title: "Wake up pastries from Panaderia Rosetta",
        },
      },
    ] as const;
    for (const row of matrix) {
      const decision = decideActivityCandidacy(row.input);
      assert.deepEqual(
        [decision.destination, decision.reasonCode, decision.contradiction],
        row.expected
      );
    }
    assert.equal(isRoutineTravelerStepTitle("Freshen up / quick nap"), true);
    assert.equal(
      isRoutineTravelerStepTitle("Wake up pastries from Panaderia Rosetta"),
      false
    );
  });

  await test("activity candidacy: recovery and primary agree on note and accessory refusals", () => {
    const cases = [
      {
        evidenceRole: "city_note_candidate",
        itemType: "note",
        title: "City recommendation",
      },
      {
        evidenceRole: "accessory_detail",
        itemType: "activity",
        startTime: "14:00",
        title: "Walking direction",
      },
    ];
    for (const input of cases) {
      const primary = decideActivityCandidacy(input);
      const recovery = decideRecoveredActivityCandidacy(input);
      assert.equal(recovery.destination, primary.destination);
      assert.equal(recovery.reasonCode, primary.reasonCode);
    }
  });

  await test("intent blocks: one dated section can hold a site plan, scattered ideas, and an unresolved researched choice", () => {
    const entries = [
      blockEntry({
        hasSourceSupportedPlan: true,
        id: "site",
        sourceOrder: 1,
        verifiedLatitude: 48.1858,
        verifiedLongitude: 16.3128,
      }),
      blockEntry({
        hasSourceSupportedPlan: true,
        id: "site-child-a",
        sourceOrder: 2,
        verifiedLatitude: 48.1842,
        verifiedLongitude: 16.3029,
      }),
      blockEntry({
        hasSourceSupportedPlan: true,
        id: "site-child-b",
        sourceOrder: 3,
        verifiedLatitude: 48.1783,
        verifiedLongitude: 16.3087,
      }),
      blockEntry({
        hasIdeaSignal: true,
        hasResearchEvidence: true,
        id: "far-option-a",
        sourceOrder: 4,
        verifiedLatitude: 48.2167,
        verifiedLongitude: 16.3959,
      }),
      blockEntry({
        hasIdeaSignal: true,
        id: "far-option-b",
        sourceOrder: 5,
        verifiedLatitude: 48.2073,
        verifiedLongitude: 16.3943,
      }),
      blockEntry({
        hasResearchEvidence: true,
        id: "researched-choice-a",
        sourceOrder: 6,
        verifiedLatitude: 48.2038,
        verifiedLongitude: 16.3578,
      }),
      blockEntry({
        hasResearchEvidence: true,
        id: "researched-choice-b",
        sourceOrder: 7,
        verifiedLatitude: 48.2052,
        verifiedLongitude: 16.3598,
      }),
      blockEntry({
        boundaryBefore: true,
        hasIdeaSignal: true,
        id: "city-reference-a",
        sourceOrder: 20,
        verifiedLatitude: 48.2082,
        verifiedLongitude: 16.375,
      }),
      blockEntry({
        hasIdeaSignal: true,
        id: "city-reference-b",
        sourceOrder: 21,
        verifiedLatitude: 48.2026,
        verifiedLongitude: 16.3591,
      }),
    ];

    const result = classifyIntentBlocks(entries, {
      geocodeVerificationRan: true,
    });
    assert.equal(result.entryTypes.get("site"), "plan");
    assert.equal(result.entryTypes.get("site-child-a"), "plan");
    assert.equal(result.entryTypes.get("far-option-a"), "ideas");
    assert.equal(result.entryTypes.get("far-option-b"), "ideas");
    assert.equal(result.entryTypes.get("researched-choice-a"), "ambiguous");
    assert.equal(result.entryTypes.get("researched-choice-b"), "ambiguous");
    assert.equal(result.entryTypes.get("city-reference-a"), "ideas");
    assert.equal(result.entryTypes.get("city-reference-b"), "ideas");
    assert.ok(result.blocks.every((block) => block.observationIds.length > 0));
  });

  await test("intent blocks: a fixed meal slot anchors its short source-contiguous peer block; logistics still overrides", () => {
    const entries = [
      blockEntry({ date: "2019-01-20", hasFixedEvidence: true, id: "breakfast", sourceOrder: 1 }),
      blockEntry({ date: "2019-01-20", id: "museum", sourceOrder: 2 }),
      blockEntry({ date: "2019-01-20", id: "cathedral", sourceOrder: 3 }),
      blockEntry({ date: "2019-01-20", id: "library", sourceOrder: 4 }),
      blockEntry({ date: "2019-01-20", id: "kunstforum", sourceOrder: 5 }),
      blockEntry({
        category: "admin_logistics",
        date: "2019-01-20",
        id: "laundry",
        itemType: "admin",
        sourceOrder: 6,
      }),
    ];
    const result = classifyIntentBlocks(entries, {
      geocodeVerificationRan: true,
    });
    for (const id of ["breakfast", "museum", "cathedral", "library", "kunstforum"]) {
      assert.equal(result.entryTypes.get(id), "plan", id);
    }
    assert.equal(result.entryTypes.get("laundry"), "logistics");
  });

  await test("intent blocks: a later traveler-authored block needs its own commitment; pagination continuation does not create that boundary", () => {
    const laterBlock = classifyIntentBlocks(
      [
        blockEntry({ hasFixedEvidence: true, id: "day-plan", sourceOrder: 1 }),
        blockEntry({
          authoredBlockStart: true,
          id: "later-uncommitted-venue",
          sourceKey: "source-day-jan-19|later-block",
          sourceOrder: 2,
        }),
      ],
      { geocodeVerificationRan: true }
    );
    assert.equal(laterBlock.entryTypes.get("day-plan"), "plan");
    assert.equal(laterBlock.entryTypes.get("later-uncommitted-venue"), "ideas");

    const pageContinuation = classifyIntentBlocks(
      [
        blockEntry({ hasFixedEvidence: true, id: "car-pickup", sourceOrder: 1 }),
        blockEntry({
          hasDayPlanMembership: true,
          id: "venue-after-page-break",
          sourceKey: "source-day-jan-17|continued-block",
          sourceOrder: 2,
        }),
      ],
      { geocodeVerificationRan: true }
    );
    assert.equal(
      pageContinuation.entryTypes.get("venue-after-page-break"),
      "plan",
      "a PDF page break cannot turn the continuing dated itinerary into ideas"
    );
  });

  await test("intent blocks: one-item-per-paragraph day lists ignore parser recommendation-category majority", () => {
    const result = classifyIntentBlocks(
      [
        blockEntry({
          authoredDayList: true,
          category: "food_dining",
          hasFixedEvidence: true,
          id: "breakfast",
          sourceOrder: 1,
        }),
        blockEntry({
          authoredDayList: true,
          category: "food_dining",
          id: "market",
          sourceOrder: 2,
        }),
        blockEntry({
          authoredDayList: true,
          category: "shopping_tailor",
          id: "shops",
          sourceOrder: 3,
        }),
      ],
      { geocodeVerificationRan: true }
    );
    assert.equal(result.entryTypes.get("market"), "plan");
    assert.equal(result.entryTypes.get("shops"), "plan");
  });

  await test("intent blocks: missing source telemetry remains ambiguous rather than inventing commitment", () => {
    const unstructured = blockEntry({
      hasSourceStructure: false,
      id: "parser-activity",
      sourceOrder: 1,
    });
    const result = classifyIntentBlocks([unstructured], {
      geocodeVerificationRan: true,
    });

    assert.equal(result.entryTypes.get("parser-activity"), "ambiguous");
    assert.match(
      result.blocks[0]?.reason ?? "",
      /does not distinguish selected plan from ideas/i
    );
  });

  await test("intent blocks: parser coordinates cannot split a block after verification ran, and one verified outlier cannot split it alone", () => {
    const parserOnly = [
      blockEntry({ approxLatitude: 48.1, approxLongitude: 16.1, hasFixedEvidence: true, id: "a", sourceOrder: 1 }),
      blockEntry({ approxLatitude: 49.1, approxLongitude: 17.1, id: "b", sourceOrder: 2 }),
      blockEntry({ approxLatitude: 50.1, approxLongitude: 18.1, id: "c", sourceOrder: 3 }),
    ];
    const ignoredParser = classifyIntentBlocks(parserOnly, {
      geocodeVerificationRan: true,
    });
    assert.equal(ignoredParser.entryTypes.get("b"), "plan");
    assert.equal(ignoredParser.entryTypes.get("c"), "plan");

    const oneOutlier = [
      blockEntry({ hasFixedEvidence: true, id: "p1", sourceOrder: 1, verifiedLatitude: 50.08, verifiedLongitude: 14.40 }),
      blockEntry({ id: "p2", sourceOrder: 2, verifiedLatitude: 50.081, verifiedLongitude: 14.401 }),
      blockEntry({ id: "bad", sourceOrder: 3, verifiedLatitude: 48.2, verifiedLongitude: 16.3 }),
      blockEntry({ id: "p3", sourceOrder: 4, verifiedLatitude: 50.082, verifiedLongitude: 14.402 }),
    ];
    const guarded = classifyIntentBlocks(oneOutlier, {
      geocodeVerificationRan: true,
    });
    assert.equal(guarded.entryTypes.get("bad"), "plan");
  });

  await test("own-text evidence: 'if you want' is a hedge; time/booking/first-person are fixed commitment", () => {
    const hedged = classifyOwnTextEvidence([
      {
        category: null,
        date: "2019-01-21",
        description: "If you want to get out of the city, ride the loop.",
        endTime: null,
        itemType: "activity",
        startTime: null,
        title: "Buda hills loop",
      },
    ]);
    assert.equal(hedged.hasHedgeMarker, true, "'if you want' hedges");
    assert.equal(hedged.hasFixedCommitment, false);

    const committed = classifyOwnTextEvidence([
      {
        category: null,
        date: "2019-01-22",
        description: "We'd like to do the tour.",
        endTime: null,
        itemType: "activity",
        startTime: null,
        title: "Parliament",
      },
    ]);
    assert.equal(committed.hasFixedCommitment, true, "first-person intent is fixed");

    const timed = classifyOwnTextEvidence([
      {
        category: null,
        date: "2019-01-22",
        description: "Bastion.",
        endTime: null,
        itemType: "activity",
        startTime: "09:00",
        title: "Fisherman's Bastion",
      },
    ]);
    assert.equal(timed.hasFixedCommitment, true, "an own time is fixed");
  });

  await test("commitment: sequence inheritance requires a hedge-free OWN text and 3+ timed cards; it is never fixed", () => {
    assert.equal(
      resolveMentionCommitment({
        date: "2019-01-22",
        hasFixedEvidence: false,
        ownTextHedge: false,
        timedCardCountForDate: 4,
      }),
      "sequenced"
    );
    assert.equal(
      resolveMentionCommitment({
        date: "2019-01-22",
        hasFixedEvidence: false,
        ownTextHedge: true,
        timedCardCountForDate: 4,
      }),
      "none",
      "an own-text hedge blocks sequence inheritance"
    );
    assert.equal(
      resolveMentionCommitment({
        date: "2019-01-21",
        hasFixedEvidence: false,
        ownTextHedge: false,
        timedCardCountForDate: 0,
      }),
      "none"
    );
  });

  await test("site↔component (PB-2): 'Palm House at Schonbrunn' never merges with the palace or a sibling component; meal prefixes stay aliases", () => {
    assert.equal(
      isSiteComponentTitlePair("Palm House at Schonbrunn", "Schonbrunn Palace visit"),
      true
    );
    assert.equal(
      isSiteComponentTitlePair("Schonbrunn Palace visit", "Palm House at Schonbrunn"),
      true,
      "order-independent"
    );
    assert.equal(
      isSiteComponentTitlePair(
        "Orangeriegarten at Schonbrunn",
        "Palm House at Schonbrunn"
      ),
      true,
      "two components of one site are grouping structure"
    );
    assert.equal(
      isSiteComponentTitlePair("Breakfast at Cafe Central", "Cafe Central"),
      false,
      "the 7.17.2 meal-prefix alias fold keeps working"
    );
    assert.equal(
      isSiteComponentTitlePair(
        "Xochimilco at dawn tour",
        "Xochimilco at dawn"
      ),
      false,
      "a temporal at-phrase with a generic suffix is identity, not containment"
    );
    assert.equal(
      isSiteComponentTitlePair("Tour", "Xochimilco at dawn tour"),
      false,
      "a bare route label cannot manufacture site containment"
    );
    assert.equal(
      isSiteComponentTitlePair("Prague Castle", "Charles Bridge"),
      false
    );
  });

  await test("idea lists (PB-4): the Jan-21 recommendation dump demotes as a unit; one fixed entry protects the whole section", () => {
    const dump = [
      entry({ id: "synagogue", title: "Great Synagogue/ Jewish History" }),
      entry({ id: "gypsy", category: "social", title: "Hear gypsy music" }),
      entry({ id: "konyv", category: "food_dining", title: "Konyv Bar" }),
      entry({ id: "mazel", category: "food_dining", title: "Mazel Tov restaurant" }),
      entry({ id: "pastry", category: "food_dining", title: "Oldest pastry shop" }),
      entry({ id: "wine", category: "food_dining", title: "Wine Cellar in the Hilton" }),
      entry({ id: "pinball", title: "Pinball Museum" }),
      entry({ id: "statue", title: "Popped up statue" }),
    ];
    const demoted = classifyIdeaListSections(dump);
    assert.equal(demoted.size, 8, "the whole recommendation dump is city notes");

    const deliberate = [
      entry({
        date: "2019-01-20",
        hasFixedEvidence: true,
        id: "cafe",
        sectionLabel: "Sunday, January 20th",
        title: "Cafe Central breakfast",
      }),
      entry({ date: "2019-01-20", id: "stephens", sectionLabel: "Sunday, January 20th", title: "St. Stephen's Cathedral" }),
      entry({ date: "2019-01-20", id: "library", sectionLabel: "Sunday, January 20th", title: "Library" }),
      entry({ date: "2019-01-20", id: "kunstforum", sectionLabel: "Sunday, January 20th", title: "Bank Austria Kunstforum" }),
    ];
    assert.equal(
      classifyIdeaListSections(deliberate).size,
      0,
      "one fixed entry makes the section a day plan"
    );
  });

  await test("idea lists: a crowded untimed SIGHTS day (the discovered-walk pool) is never demoted by shape alone", () => {
    const walkDay = [
      entry({ date: "2019-01-15", id: "square", sectionLabel: "Tuesday, January 15th // Old Town wandering", title: "Old Town Square" }),
      entry({ date: "2019-01-15", id: "clock", sectionLabel: "Tuesday, January 15th // Old Town wandering", title: "Astronomical Clock" }),
      entry({ date: "2019-01-15", id: "tyn", sectionLabel: "Tuesday, January 15th // Old Town wandering", title: "Church of Our Lady before Tyn" }),
      entry({ date: "2019-01-15", id: "powder", sectionLabel: "Tuesday, January 15th // Old Town wandering", title: "Powder Tower" }),
    ];
    assert.equal(classifyIdeaListSections(walkDay).size, 0);
  });

  await test("idea lists: dated cards minted from a NON-day-plan notes section demote; unlabeled sections are never judged", () => {
    const notesBlob = [
      entry({ id: "a", sectionLabel: "Budapest notes and tips", title: "Ruin bars" }),
      entry({ id: "b", sectionLabel: "Budapest notes and tips", title: "Margaret Island" }),
      entry({ id: "c", sectionLabel: "Budapest notes and tips", title: "Hospital in the Rock" }),
    ];
    assert.equal(classifyIdeaListSections(notesBlob).size, 3);

    const unlabeled = [
      entry({ id: "a", sectionLabel: null, title: "Castle Hill" }),
      entry({ id: "b", sectionLabel: null, title: "Matthias Church" }),
      entry({ id: "c", sectionLabel: null, title: "Fisherman's Bastion" }),
    ];
    assert.equal(
      classifyIdeaListSections(unlabeled).size,
      0,
      "structure-less entries keep the benefit of the doubt"
    );
  });

  await test("recovered lines (PB-9): loose-tip vocabulary routes to city notes; committed lines stay activities", () => {
    assert.equal(
      classifyRecoveredLineRole({
        category: null,
        confirmation: null,
        date: "2019-01-21",
        description: "Budapest eats: Comme Chez Soi, Smart Kitchen.",
        endTime: null,
        itemType: "activity",
        startTime: null,
        title: "Budapest food ideas",
      }),
      "city_note_candidate"
    );
    assert.equal(
      classifyRecoveredLineRole({
        category: null,
        confirmation: null,
        date: "2019-01-17",
        description: "Get back by 5 to go to koscom.",
        endTime: null,
        itemType: "activity",
        startTime: "17:00",
        title: "koscom",
      }),
      null,
      "an anchored recovered line stays an activity"
    );
  });
}
