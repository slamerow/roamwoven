import assert from "node:assert/strict";
import {
  classifyIdeaListSections,
  classifyOwnTextEvidence,
  classifyRecoveredLineRole,
  isSiteComponentTitlePair,
  resolveMentionCommitment,
  type IdeaListEntry,
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

export default async function run() {
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
