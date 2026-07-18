import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Wave-1.1 ground-truth fixture checks from LIVE run 7.18.1 (2026-07-18,
// trip 5fc3223b…, docs/assembly-defect-docket-2026-07-18-run4.md). Input
// shapes mirror what the live parser emitted in that run.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function emptyStage(value: Record<string, unknown>) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...value,
  };
}

function stage(label: string, stageValue: Record<string, unknown>) {
  return { label, source: "model_chunk" as const, stage: stageValue };
}

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
};

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

export default async function run() {
  await test("ground truth run4 (RW-CLS-001): a notes-blob reference list cannot gut a deliberate day plan (Vienna leg)", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Czech out Eli's Colossal Eastern Europe Excursion (1).pdf notes", emptyStage({
          activities: [
            // The trailing notes blob re-lists the planned venues as a
            // reference list (7.18.1 shape) — both as merged activity copies
            // and as a note candidate.
            {
              category: "art_culture",
              city: "Vienna",
              date: null,
              description: "Jewish Museum, Library, Bank Austria Kunstforum, Laundry, St Stephens Cathedral.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Vienna sights list",
            },
            {
              category: "art_culture",
              date: "2019-01-20",
              description: "Jewish Museum",
              itemType: "activity",
              title: "Jewish Museum",
            },
          ],
          places: [
            { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
          ],
        })),
        stage("Sunday, January 20th", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-20",
              description: "Jewish Museum.",
              itemType: "activity",
              title: "Jewish Museum",
            },
            {
              category: "admin_logistics",
              date: "2019-01-20",
              description: "Laundry.",
              itemType: "activity",
              title: "Laundry",
            },
            {
              category: "art_culture",
              date: "2019-01-20",
              description: "Visit the Library.",
              itemType: "activity",
              title: "Library",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const cardTitles = draft.activities
      .filter((item) => item.itemType === "activity")
      .map((item) => String(item.title));

    assert.ok(cardTitles.includes("Jewish Museum"), "a merged notes-blob copy cannot poison the day-plan exception");
    assert.ok(cardTitles.includes("Laundry"), "deliberate day-plan members stay cards");
    assert.ok(cardTitles.includes("Library"), "deliberate day-plan members stay cards");
  });

  await test("ground truth run4 (RW-CAN-001): a site sharing a timed event's slot is never merged into the event (Prague Castle)", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, January 16th", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-16",
              description: "Prague Castle (2 hours).",
              itemType: "activity",
              startTime: "12:00",
              title: "Prague Castle",
            },
            {
              category: "art_culture",
              date: "2019-01-16",
              description: "Changing of the Guard at 12:00 PM.",
              itemType: "activity",
              startTime: "12:00",
              title: "Changing of the Guard",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const titles = draft.activities.map((item) => String(item.title));

    assert.ok(titles.includes("Prague Castle"), "the site survives");
    assert.ok(titles.includes("Changing of the Guard"), "the timed event survives");
  });

  await test("ground truth run4 (RW-GRP-001): an 'A to B' container with narrative prose cannot form a same-site group", () => {
    const decisionId = "resolver-bastion-castle-hill";
    const result = clusterExtractedEvidence({
      groupingDecisions: [{
        candidateIds: ["item-1", "item-2", "item-3"],
        claim:
          "same-site visit: the source lists 2 stops inside Fisherman's Bastion to Castle Hill's own visit, so one visit card owns them",
        containerCandidateId: "item-1",
        decisionId,
        parentCandidateId: "item-1",
        parentTitle: "Fisherman's Bastion to Castle Hill visit",
        source: "canonical_resolver",
      }],
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            {
              category: "art_culture",
              date: "2019-01-22",
              description:
                "Fisherman's Bastion (view from the top). Stroll through Castle Hill and Buda Castle. Short stroll from Matthias Church. Tour St. Stephen's Basilica and climb the dome.",
              _canonicalGroupingDecisionIds: [decisionId],
              _resolverCandidateId: "item-1",
              itemType: "activity",
              startTime: "09:00",
              title: "Fisherman's Bastion to Castle Hill",
            },
            {
              category: "art_culture",
              date: "2019-01-22",
              description: "Matthias Church.",
              _resolverCandidateId: "item-2",
              itemType: "activity",
              startTime: "09:45",
              title: "Matthias Church",
            },
            {
              category: "temple_shrine",
              date: "2019-01-22",
              description: "Tour the basilica and climb the dome for views over Budapest.",
              _resolverCandidateId: "item-3",
              itemType: "activity",
              title: "St. Stephen's Basilica",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const grouped = draft.activities.filter((item) =>
      Boolean(item._canonicalParentPieceId)
    );

    assert.equal(grouped.length, 0, "'A to B' is a route; narrative mentions are not a component list");
  });

  await test("ground truth run4 (RW-QUE-001): one lunch choice is ONE card with no question (7.18.1 shipped four cards)", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Tuesday, January 22nd", emptyStage({
          activities: [
            {
              category: "food_dining",
              date: "2019-01-22",
              description: "Have lunch at Pest-Buda Bistro or Cafe Pierrot.",
              itemType: "activity",
              startTime: "11:00",
              title: "Lunch option",
            },
            {
              category: "food_dining",
              date: "2019-01-22",
              description: "Have lunch at Pest-Buda Bistro or Cafe Pierrot.",
              itemType: "activity",
              title: "Lunch in Buda",
            },
            {
              category: "food_dining",
              date: "2019-01-22",
              description: "Have lunch at Pest-Buda Bistro.",
              itemType: "activity",
              title: "Pest-Buda Bistro",
            },
            {
              category: "food_dining",
              date: "2019-01-22",
              description: "Have lunch at Cafe Pierrot.",
              itemType: "activity",
              title: "Cafe Pierrot",
            },
          ],
          missingDetails: [
            {
              answerType: "text",
              evidence: "Have lunch at Pest-Buda Bistro or Cafe Pierrot.",
              prompt: "Which lunch option was chosen for January 22nd in Budapest?",
              reason:
                "The source gives two mutually exclusive lunch options and the chosen one changes the activity card.",
              subjectType: "trip",
              targetField: "description",
            },
          ],
          places: [
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const lunchCards = draft.activities.filter(
      (item) =>
        item.itemType === "activity" &&
        /lunch|pest-buda|pierrot/i.test(String(item.title))
    );

    assert.equal(lunchCards.length, 1, "one unresolved choice is one card");
    assert.match(
      String(lunchCards[0]?.description ?? ""),
      /pest-buda bistro or cafe pierrot/i,
      "the choice lives in the description"
    );
    assert.ok(
      !draft.missingDetails.some((detail) =>
        /which lunch option/i.test(String(detail.prompt ?? ""))
      ),
      "the slot card is the answer surface — no question"
    );
  });

  await test("ground truth run4 (RW-REV-001): note-content promotion questions are suppressed (beer spots)", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Wednesday, January 16th", emptyStage({
          activities: [
            {
              category: "nightlife_entertainment",
              city: "Prague",
              date: null,
              description:
                "Peklo is described as a monastery-cellar bar. Popular beer spots: U Fleku, U Medvidku, U Pinkasu.",
              evidenceRole: "city_note_candidate",
              itemType: "note",
              title: "Prague beer ideas",
            },
          ],
          missingDetails: [
            {
              answerType: "single_choice",
              answerOptions: [
                { label: "Peklo", value: "peklo" },
                { label: "U Fleku", value: "u-fleku" },
              ],
              evidence: "Popular beer spots: U Fleku, U Medvidku, U Pinkasu; only Peklo is described.",
              prompt:
                "Which beer spot should be added as the planned activity for this Prague castle area note?",
              reason:
                "The source contains a loose recommendation list for beer spots but only Peklo is described in detail.",
              subjectType: "trip",
              targetField: "title",
            },
          ],
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.ok(
      !draft.missingDetails.some((detail) =>
        /which beer spot/i.test(String(detail.prompt ?? ""))
      ),
      "promoting note-list content is never a maker question"
    );
    assert.ok(
      !draft.activities.some(
        (item) => item.itemType === "activity" && /peklo|u fleku/i.test(String(item.title))
      ),
      "beer recommendations stay note content"
    );
  });

  await test("ground truth run4 (RW-ASM-001): 'Drop bags and tour Rome' folds into the arrival/stay flow", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("Sunday, January 13th", emptyStage({
          activities: [
            {
              category: "arrival_departure",
              date: "2019-01-13",
              description:
                "Land in Rome at 10:15, drop bags at hostel, and spend the day touring starting at 1:30.",
              itemType: "activity",
              title: "Drop bags and tour Rome",
            },
            {
              category: "art_culture",
              date: "2019-01-13",
              description: "Colosseum - 30 min.",
              itemType: "activity",
              startTime: "14:00",
              title: "Colosseum",
            },
          ],
          places: [
            { arriveDate: "2019-01-13", city: "Rome", country: "Italy", leaveDate: "2019-01-14" },
          ],
          stays: [
            {
              checkIn: "2019-01-13",
              checkOut: "2019-01-14",
              city: "Rome",
              name: "The Yellow",
            },
          ],
          transport: [
            {
              arrival: "FCO",
              arrivalTime: "10:15",
              date: "2019-01-12",
              departure: "JFK",
              departureTime: "19:46",
              title: "Delta Flight 444",
              type: "flight",
            },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const titles = draft.activities.map((item) => String(item.title));

    assert.ok(!titles.includes("Drop bags and tour Rome"), "arrival flow folds into the stay");
    assert.ok(titles.includes("Colosseum"), "real cards survive");
  });
}
