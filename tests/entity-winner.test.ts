import assert from "node:assert/strict";
import {
  chooseMergeWinner,
  classifyMergeEligibility,
  headingRemainderSegments,
  isDayArcTitle,
  isHeadingFragmentTitle,
  tripCityTokenSet,
} from "@/lib/extraction/entity-winner";
import {
  normalizeTripClockTime,
  normalizeTripDate,
  PRICE_SIGNAL_PATTERN,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";
import { isDayHeadingLine } from "@/lib/extraction/parser-artifact-normalization";

// Phase 1 shared predicates + the ONE sameEntity/winner ladder
// (docs/code-audit-2026-07-18.md §E Phase 1; live-run 7.18.2 PB-3).

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const VIENNA_HEADING =
  "Friday, January 18th // Explore Vienna / Pick up Card / Schonbrunn Palace";
const CITIES = ["Vienna", "Prague", "Budapest", "Rome"];

export default async function run() {
  await test("winner ladder: a heading-fragment card can never beat a named venue, even with the or-bonus", () => {
    const decision = chooseMergeWinner(
      {
        city: "Vienna",
        description:
          "Visit Schonbrunn Palace, see the Gloriette, lunch at X or Y.",
        sourceSectionLabel: VIENNA_HEADING,
        title: "Explore Vienna",
      },
      { city: "Vienna", title: "Schonbrunn Palace" },
      { leftBonus: 1, rightBonus: 0, tripCities: CITIES }
    );

    assert.equal(decision.winner, "right");
    assert.equal(decision.rung, "eligibility");
  });

  await test("winner ladder: between eligible cards the or-carrying copy wins (RW-CAN-001 locked rule)", () => {
    const decision = chooseMergeWinner(
      { title: "Lunch in Buda", description: "Lunch at Pest-Buda Bistro or Cafe Pierrot." },
      { title: "Pest-Buda Bistro", description: "Lunch spot." },
      { leftBonus: 1, rightBonus: 0, tripCities: CITIES }
    );

    assert.equal(decision.winner, "left");
    assert.equal(decision.rung, "bonus");
  });

  await test("winner ladder: booking beats a longer title; named venue beats commitment; length is last", () => {
    const booked = chooseMergeWinner(
      { confirmation: "ABC123", title: "Dinner" },
      { title: "A very long descriptive dinner card title" },
      { tripCities: CITIES }
    );
    assert.equal(booked.winner, "left");
    assert.equal(booked.rung, "booking");

    const venue = chooseMergeWinner(
      { commitmentRank: 2, title: "Explore" },
      { commitmentRank: 0, title: "Borkonyha" },
      { tripCities: CITIES }
    );
    assert.equal(venue.winner, "right");
    assert.equal(venue.rung, "named_venue");
  });

  await test("eligibility: 'Tour Rome' stays merge-eligible — a bare verb+city title without heading corroboration is a real card", () => {
    assert.equal(
      classifyMergeEligibility(
        { city: "Rome", title: "Tour Rome" },
        { tripCities: CITIES }
      ).eligible,
      true
    );
    // Day-arc shape is still recognized (it feeds the audit detector)...
    assert.equal(isDayArcTitle("Tour Rome", tripCityTokenSet(CITIES)), true);
    // ...but only heading corroboration makes it ineligible.
    assert.equal(
      classifyMergeEligibility(
        {
          city: "Rome",
          sourceSectionLabel: "Monday, January 25th // Tour Rome / Fly home",
          title: "Tour Rome",
        },
        { tripCities: CITIES }
      ).eligible,
      false
    );
  });

  await test("heading fragments: segment titles with no venue content match; venue segments survive", () => {
    const cities = tripCityTokenSet(CITIES);
    assert.deepEqual(headingRemainderSegments("Explore Vienna / Pick up Card"), [
      "Explore Vienna",
      "Pick up Card",
    ]);
    assert.equal(
      isHeadingFragmentTitle("Explore Vienna", [VIENNA_HEADING], cities),
      true
    );
    // "Prague Castle" under "Lesser Town & Prague Castle" keeps its own
    // content tokens and is NOT a fragment.
    assert.equal(
      isHeadingFragmentTitle(
        "Prague Castle",
        ["Wednesday, January 16th // Lesser Town & Prague Castle"],
        cities
      ),
      false
    );
    assert.equal(
      isHeadingFragmentTitle("Pick up Card", [VIENNA_HEADING], cities),
      false,
      "an errand segment keeps content tokens and stays a card"
    );
  });

  await test("shared date parser: slash day-first dates parse (audit B5: '16/1/2026' was a heading nobody could date)", () => {
    assert.equal(normalizeTripDate("16/1/2026"), "2026-01-16");
    assert.equal(normalizeTripDate("16.1.2026"), "2026-01-16");
    assert.equal(normalizeTripDate("16/1/26"), "2026-01-16");
    // Month-first fallback when day-first is impossible.
    assert.equal(normalizeTripDate("1/16/2026"), "2026-01-16");
    assert.equal(tripDatesMatch("16/1/2026", "January 16th, 2026"), true);
  });

  await test("shared time parser: dot-times parse; durations and prices fail closed (audit B5)", () => {
    assert.equal(normalizeTripClockTime("14.30"), "14:30");
    assert.equal(normalizeTripClockTime("3.5"), null);
    assert.equal(normalizeTripClockTime("45.75"), null);
    assert.equal(normalizeTripClockTime("14:30"), "14:30");
  });

  await test("shared price detector covers £ and Ft (audit B5: researched-list marker missed gbp; cost pattern missed forint)", () => {
    assert.equal(PRICE_SIGNAL_PATTERN.test("Entry £12"), true);
    assert.equal(PRICE_SIGNAL_PATTERN.test("4500 Ft entry"), true);
    assert.equal(PRICE_SIGNAL_PATTERN.test("about 250 kc"), true);
    assert.equal(PRICE_SIGNAL_PATTERN.test("12 EUR"), true);
    assert.equal(PRICE_SIGNAL_PATTERN.test("$40 total"), true);
    assert.equal(PRICE_SIGNAL_PATTERN.test("walk along the river"), false);
  });

  await test("shared day-heading detector strips bullet prefixes (audit B5: bulleted headings split chunking vs coverage)", () => {
    assert.equal(isDayHeadingLine("- Friday, January 18th"), true);
    assert.equal(isDayHeadingLine("• January 18"), true);
    assert.equal(isDayHeadingLine("16/1/2026"), true);
    assert.equal(isDayHeadingLine("- pack the bags"), false);
  });
}
