import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  createCentralEuropeGroundTruthDraft,
  groundTruthChecks,
} from "@/tests/fixtures/central-europe-ground-truth";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function assembleGroundTruthRecords(): StructuredTripRecords {
  const draft = createCentralEuropeGroundTruthDraft();
  const clustered = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "Central Europe ground-truth source",
        source: "model_spine",
        stage: draft,
      },
    ],
    tripOverview: draft.tripOverview,
  });

  return createStructuredTripRecordsFromDraft({
    draft: clustered.draft,
    fallbackTripName: "Central Europe",
    tripId: "central-europe-ground-truth",
  });
}

function activityCards(records: StructuredTripRecords, pattern: RegExp) {
  return records.items.filter(
    (item) => item.itemType !== "note" && pattern.test(item.title)
  );
}

type CheckEvaluator = (records: StructuredTripRecords) => void;

const evaluators: Record<string, CheckEvaluator> = {
  "legs-spine": (records) => {
    assert.deepEqual(
      records.legs.map((leg) => leg.city),
      ["Rome", "Prague", "Vienna", "Budapest", "Rome"]
    );
    assert.deepEqual(
      records.legs.map((leg) => [leg.arriveDate, leg.leaveDate]),
      [
        ["2019-01-13", "2019-01-14"],
        ["2019-01-14", "2019-01-18"],
        ["2019-01-18", "2019-01-21"],
        ["2019-01-21", "2019-01-24"],
        ["2019-01-24", "2019-01-25"],
      ]
    );
  },
  "stay-night-coverage": (records) => {
    const yellow = records.stays.find((stay) => /yellow/i.test(stay.name));
    assert.ok(yellow, "The Yellow stay must exist");
    assert.equal(yellow.checkInDate, "2019-01-13");
    assert.equal(yellow.checkOutDate, "2019-01-14");
    assert.equal(
      records.stays.some((stay) => stay.checkInDate === "2019-01-12"),
      false,
      "no fabricated stay for the overnight-flight night"
    );
    assert.equal(records.stays.length, 5);
  },
  "eight-travel-cards": (records) => {
    const segments = records.transport.filter(
      (item) => item.transportType === "flight" || item.transportType === "train"
    );
    assert.equal(segments.length, 8, "8 per-segment travel cards");
    assert.deepEqual(
      segments
        .map((item) => item.date)
        .sort(),
      [
        "2019-01-12",
        "2019-01-12",
        "2019-01-14",
        "2019-01-18",
        "2019-01-21",
        "2019-01-24",
        "2019-01-25",
        "2019-01-25",
      ]
    );
  },
  "rental-car-is-activity": (records) => {
    assert.equal(
      records.transport.some(
        (item) =>
          item.date === "2019-01-17" ||
          /rental/i.test(item.routeLabel ?? "")
      ),
      false,
      "same-day rental car must not be a transport record"
    );
    const rentalActivity = records.items.find(
      (item) => item.itemType !== "note" && /rental car/i.test(item.title)
    );
    assert.ok(rentalActivity, "rental car pickup must be an activity");
    assert.equal(rentalActivity.date, "2019-01-17");
    assert.equal(rentalActivity.startTime, "09:00");
  },
  "three-questions": (records) => {
    const open = records.reviewQuestions.filter(
      (question) => question.status === "open"
    );
    assert.equal(open.length, 3, "exactly 3 open review questions");
  },
  "communism-city-note": (records) => {
    assert.equal(
      activityCards(records, /communism/i).length,
      0,
      "Museum of Communism was never committed; no activity card"
    );
  },
  "r2d2-demoted": (records) => {
    assert.equal(
      activityCards(records, /r2d2/i).length,
      0,
      "R2D2 '(far away)' demotes to city note"
    );
  },
  "pinball-city-note": (records) => {
    assert.equal(
      activityCards(records, /pinball/i).length,
      0,
      "Pinball Museum repeated but never committed; no activity card"
    );
  },
  "market-hall-dedup": (records) => {
    const cards = activityCards(records, /great market hall/i);
    assert.equal(cards.length, 1, "one Great Market Hall card");
    assert.equal(cards[0].date, "2019-01-22", "planned Jan 22 card wins");
  },
  "borkonyha-single-home": (records) => {
    assert.equal(
      activityCards(records, /borkonyha/i).length,
      1,
      "Borkonyha keeps exactly one activity card"
    );
  },
  "mala-strana-group": (records) => {
    const stops = [
      /kafka statue/i,
      /john lennon wall/i,
      /vinarna certovka/i,
      /novy svet/i,
    ].map((pattern) => {
      const matches = activityCards(records, pattern);
      assert.equal(matches.length, 1, `${pattern} appears exactly once`);
      return matches[0];
    });
    const parentIds = new Set(stops.map((stop) => stop.parentItemId));
    assert.equal(parentIds.size, 1, "all four stops share one parent");
    const parentId = [...parentIds][0];
    assert.ok(parentId, "stops must be parented (system-created group)");
    const parent = records.items.find((item) => item.id === parentId);
    assert.ok(parent, "group parent card exists");
    assert.equal(parent.date, "2019-01-16");
  },
  "museum-disjunction": (records) => {
    const cards = activityCards(records, /mumok/i);
    assert.equal(cards.length, 1, "one flexible museum card");
    assert.match(cards[0].title, /or/i, "card keeps the unresolved choice");
  },
  "trdelnik-activity": (records) => {
    const cards = activityCards(records, /trdelnik/i);
    assert.equal(cards.length, 1, "trdelnik breakfast is one activity card");
    assert.equal(cards[0].date, "2019-01-16");
  },
  "koscom-activity": (records) => {
    const cards = activityCards(records, /koscom/i);
    assert.equal(cards.length, 1, "koscom is an activity card");
    assert.equal(cards[0].date, "2019-01-17");
  },
  "tour-rome-activity": (records) => {
    const cards = activityCards(records, /tour rome/i);
    assert.equal(cards.length, 1, "'Tour Rome' line becomes an activity card");
    assert.equal(cards[0].date, "2019-01-24");
  },
};

const records = assembleGroundTruthRecords();
const gapReport: string[] = [];

for (const check of groundTruthChecks) {
  const evaluate = evaluators[check.id];
  assert.ok(evaluate, `missing evaluator for ground-truth check ${check.id}`);

  if (check.status === "enforced") {
    test(`ground truth (${check.contract}): ${check.label}`, () => {
      evaluate(records);
    });
    continue;
  }

  // known_gap: the check must currently FAIL. If it starts passing, this test
  // fails loudly so the fixture status and the contract ledger get updated in
  // the same change (coverage honesty per AGENTS.md).
  test(`known gap still open (${check.contract}): ${check.label}`, () => {
    let passed = false;
    try {
      evaluate(records);
      passed = true;
    } catch {
      gapReport.push(`${check.contract} — ${check.label}`);
    }
    assert.equal(
      passed,
      false,
      `known_gap check "${check.id}" now passes — flip it to enforced in ` +
        "tests/fixtures/central-europe-ground-truth.ts and update the ledger"
    );
  });
}

if (gapReport.length > 0) {
  console.log(
    `ground-truth gaps still open (${gapReport.length}):\n  - ` +
      gapReport.join("\n  - ")
  );
}
