import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  createCentralEuropeGroundTruthDraft,
  createCentralEuropeGroundTruthSourceText,
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
        sourceText: createCentralEuropeGroundTruthSourceText(),
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
  "useful-material-questions": (records) => {
    const open = records.reviewQuestions.filter(
      (question) => question.status === "open"
    );
    assert.equal(
      open.filter(
        (question) =>
          /prague castle/i.test(question.prompt) &&
          /ticket|tour option/i.test(question.prompt)
      ).length,
      1,
      "one Prague Castle ticket decision"
    );
    assert.equal(
      open.filter(
        (question) =>
          /planned.*ideas|planned for (?:this|the) day/i.test(question.prompt) &&
          /state hall|time travel|belvedere/i.test(question.evidence ?? "")
      ).length,
      1,
      "one Vienna researched-list decision"
    );
    assert.equal(
      open.filter((question) => /bath/i.test(question.prompt)).length,
      1,
      "one Budapest baths decision"
    );
    const duplicateKeys = open
      .map((question) =>
        [
          question.subjectCanonicalId ?? question.subjectId ?? "unbound",
          question.targetField ?? "subject",
        ].join(":")
      )
      .filter((key, index, keys) => keys.indexOf(key) !== index);
    assert.deepEqual(
      duplicateKeys,
      [],
      "one canonical subject/target can own at most one open Question"
    );
    const offContract = open.filter((question) => {
      const text = `${question.prompt ?? ""} ${question.reason ?? ""}`;
      return (
        question.targetField === "sourceRecovery" ||
        /booking\/?reference code|confirmation code|provider name|how many adults/i.test(
          text
        ) ||
        /automatic extraction|review missing source|technical recovery/i.test(
          text
        ) ||
        /(?:\bhome\b.*(?:which|what) city|(?:which|what) city.*\bhome\b)/i.test(
          text
        )
      );
    });
    assert.deepEqual(
      offContract.map((question) => question.prompt),
      [],
      "source-answerable, routine, and technical asks are not useful Questions"
    );
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
    assert.ok(
      stops.every((stop) => !stop.parentItemId),
      "all four stops remain top-level when the source does not author a route"
    );
    assert.equal(
      activityCards(records, /^lesser town walk$/i).length,
      0,
      "assembly does not invent a walk parent"
    );
  },
  "museum-source-separate-notes": (records) => {
    const cards = records.items.filter(
      (item) =>
        item.itemType !== "note" &&
        (/mumok/i.test(item.title) || /natural history/i.test(item.title))
    );
    const noteText = records.items
      .filter((item) => item.itemType === "note")
      .map((item) => `${item.title} ${item.description ?? ""}`)
      .join("\n");
    const questions = records.reviewQuestions.filter(
      (question) =>
        question.status === "open" &&
        (/mumok/i.test(question.prompt) || /natural history/i.test(question.prompt))
    );

    assert.equal(cards.length, 0, "neither uncommitted museum idea is an Activity");
    assert.match(noteText, /mumok museum/i, "Mumok survives in City Notes");
    assert.match(
      noteText,
      /natural history museum/i,
      "Natural History Museum survives separately in City Notes"
    );
    assert.equal(questions.length, 0, "the source does not present a choice to resolve");
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
  "castle-survives-stay-shadow": (records) => {
    const castle = activityCards(records, /^prague castle/i);
    assert.equal(castle.length, 1, "Prague Castle survives as one card");
    assert.equal(castle[0].date, "2019-01-16");
  },
  "castle-same-site-group": (records) => {
    const castle = activityCards(records, /^prague castle/i)[0];
    assert.ok(castle, "castle parent exists");
    const guard = activityCards(records, /changing of the guard/i);
    const vitus = activityCards(records, /st\.? vitus/i);
    assert.equal(guard.length, 1);
    assert.equal(vitus.length, 1);
    assert.equal(guard[0].parentItemId, null, "guard remains top-level");
    assert.equal(vitus[0].parentItemId, null, "St. Vitus remains top-level");
  },
  "schonbrunn-all-stops": (records) => {
    const palace = activityCards(records, /schonbrunn palace/i).find(
      (item) => !item.parentItemId
    );
    assert.ok(palace, "Schönbrunn Palace survives as a top-level card");
    for (const stop of [/gloriette/i, /orangeriegarten/i, /panorama train/i]) {
      const cards = activityCards(records, stop);
      assert.equal(cards.length, 1, `${stop} appears exactly once`);
      assert.equal(
        cards[0].parentItemId,
        null,
        `${stop} remains top-level without source-authored containment`
      );
    }
    assert.match(
      records.items
        .map((item) => `${item.title} ${item.description ?? ""}`)
        .join("\n"),
      /apple strudel show/i,
      "the source-poor fixture still preserves Apple Strudel Show content"
    );
  },
  "silver-mines-placement": (records) => {
    const cards = activityCards(records, /silver mines/i);
    assert.equal(cards.length, 1, "silver mines is one activity card");
    assert.equal(cards[0].date, "2019-01-17", "placed from source structure");
    assert.equal(
      records.reviewQuestions.some((question) =>
        /which day does/i.test(question.prompt) &&
        /silver mines|koscom/i.test(question.prompt)
      ),
      false,
      "no fabricated date questions for day-trip items"
    );
  },
  "vitae-directions-fold": (records) => {
    assert.equal(
      activityCards(records, /arrival directions/i).length,
      0,
      "stay directions never ship as an activity card"
    );
    assert.equal(
      records.reviewQuestions.some((question) =>
        /vitae/i.test(question.prompt)
      ),
      false,
      "no question about stay directions"
    );
  },
  "dropbags-folds-into-stay": (records) => {
    assert.equal(
      activityCards(records, /drop bags/i).length,
      0,
      "arrival-time bag drop folds into the stay"
    );
    const jan13 = records.items.filter(
      (item) =>
        item.itemType !== "note" &&
        item.date === "2019-01-13" &&
        !item.parentItemId
    );
    assert.equal(jan13.length, 4, "Jan 13 ships with exactly 4 cards");
  },
  "rome-key-pickup-suppressed": (records) => {
    assert.equal(
      activityCards(records, /key pickup/i).length,
      0,
      "access instructions never ship as a traveler card"
    );
  },
  "budapest-note-copies-win": (records) => {
    for (const venue of [/konyv bar/i, /mazel tov/i, /wine cellar/i, /gypsy music/i]) {
      assert.equal(
        activityCards(records, venue).length,
        0,
        `${venue} stays a city-note entry, not a dated card`
      );
    }
  },
  "cafe-central-planned-wins": (records) => {
    const cards = activityCards(records, /cafe central/i);
    assert.equal(cards.length, 1, "one Cafe Central card");
    assert.equal(cards[0].date, "2019-01-20", "the planned breakfast wins");
  },
  "chain-bridge-single-card": (records) => {
    const cards = activityCards(records, /chain bridge/i);
    assert.equal(cards.length, 1, "one Chain Bridge card");
    assert.equal(cards[0].startTime, "11:00", "the timed crossing wins");
  },
  "budget-scrubbed-from-notes": (records) => {
    const notes = records.items.filter((item) => item.itemType === "note");
    assert.ok(notes.length > 0, "city notes exist");
    for (const note of notes) {
      const text = `${note.title} ${note.description ?? ""}`;
      assert.doesNotMatch(text, /budget|\$1200|\$100\/day/i);
    }
  },
  "city-note-sections": (records) => {
    const budapest = records.items.find(
      (item) => item.itemType === "note" && /budapest/i.test(item.title)
    );
    assert.ok(budapest, "Budapest note exists");
    assert.match(
      budapest.description ?? "",
      /^(Food|Drinks & Nightlife|Sights & Culture|Shopping|Getting Around|Local Tips|Notes):/m,
      "note description renders labeled sections"
    );
  },
  "one-castle-ticket-question": (records) => {
    const ticketQuestions = records.reviewQuestions.filter(
      (question) =>
        question.status === "open" && /ticket|tour option/i.test(question.prompt)
    );
    assert.equal(
      ticketQuestions.length,
      1,
      "exactly one castle-complex ticket question"
    );
    assert.match(ticketQuestions[0].prompt, /prague castle/i);
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
