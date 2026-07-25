import assert from "node:assert/strict";
import {
  findProtectedCodeShapedTokens,
  scrubProtectedCodeShapedTokens,
} from "@/lib/extraction/identity-prose";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Δ3 NEGATIVE CONTROL (Arc F.3 F4; run 7.25.0 docket fixture assertion 1).
//
// Delta-3 amendment, Eli 2026-07-24, verbatim: "it's fine if they see seats
// too. we just need to hide confirmation codes so a bad actor can't get the
// info and cancel a transit." On travel cards, protection therefore covers
// CONFIRMATION / BOOKING / TICKET CODES ONLY — seat number, seat class, route
// and times are PUBLIC. This is Δ2's sabotage-surface principle applied
// consistently: a seat number cannot cancel anything.
//
// The 7.25.0 docket originally scored seats in public transport prose as a
// bar-item-6 FAIL and planned an F.3 "seat fix". Eli's ruling re-scored it
// PASS and DROPPED that fix. This fixture exists so the decision cannot be
// silently reversed by a future sweep-widening: it asserts BOTH directions on
// this bundle's eight travel rows verbatim — every seat, route and time
// SURVIVES, every protected code is SWEPT.
//
// It is a pure characterisation test of the shared predicate plus the live
// transport lane. Nothing here changes behaviour; it pins behaviour.

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

function stage(label: string, value: Record<string, unknown>): EvidenceStageInput {
  return { label, source: "model_chunk", stage: value };
}

function emptyStage(overrides: Record<string, unknown> = {}) {
  return {
    activities: [],
    missingDetails: [],
    places: [],
    sensitiveDetails: [],
    stays: [],
    transport: [],
    ...overrides,
  };
}

// The eight live rows' seat tokens, quoted from the 7.25.0 bundle
// (docket chain A, transport[0]…transport[7]).
const LIVE_SEAT_TOKENS = [
  "11C",
  "30F",
  "4/11",
  "C1",
  "14J",
  "13D",
  "2D",
  "Seat 2 class",
];

// Live protected codes from the same bundle that MUST be swept.
const LIVE_PROTECTED_CODES = [
  "0468406277", // RegioJet travel code
  "2159 1990 1842 0436", // ÖBB ticket code
];

export default async function run() {
  test("Δ3: every live seat token survives the protected-code sweep", () => {
    for (const seat of LIVE_SEAT_TOKENS) {
      const prose = `Delta Flight 5925, DCA -> JFK, seat ${seat}, departs 14:05.`;
      assert.deepEqual(
        findProtectedCodeShapedTokens(prose),
        [],
        `a seat is public trip content, never a protected code: ${seat}`
      );
      assert.equal(
        scrubProtectedCodeShapedTokens(prose),
        prose,
        `the prose is returned untouched for seat ${seat}`
      );
    }
  });

  test("Δ3: route endpoints, flight numbers, clock times and dates all survive", () => {
    for (const prose of [
      "Delta Flight 5925, DCA -> JFK, seat 11C, 14:05 - 15:32.",
      "RegioJet RJ 1033, Prague to Vienna, departs 10:42, arrives 14:30.",
      "Wizz Air W6 2339, Budapest (BUD) to Vienna (VIE), 2019-01-18 06:20.",
      "RyanAir FR8331 to Prague, seat 2D, Terminal 2, gate A12.",
      "Delta 444 overnight, 8.5 hours, seat 30F, arrives next day 09:15.",
      "ÖBB, Class 2, Vienna Hbf to Prague hl.n., 25.01.2019 at 17:20.",
      "Delta 2934, seat 13D, JFK to DCA, 19:00.",
      "Delta 1043, seat 14J, DCA to JFK, January 12-25, 2019 window.",
    ]) {
      assert.deepEqual(
        findProtectedCodeShapedTokens(prose),
        [],
        `route + times + seats are the public face of a travel card: ${prose}`
      );
    }
  });

  test("Δ3: every protected code in the SAME prose is still swept", () => {
    for (const code of LIVE_PROTECTED_CODES) {
      const prose = `RegioJet RJ 1033, Prague to Vienna, seat 4/11, departs 10:42. Travel code ${code}.`;
      const tokens = findProtectedCodeShapedTokens(prose);
      assert.ok(
        tokens.length > 0,
        `a confirmation/ticket code is protected class: ${code}`
      );
      const scrubbed = scrubProtectedCodeShapedTokens(prose);
      assert.equal(
        scrubbed.includes(code),
        false,
        `the code value is gone: ${code}`
      );
      // BOTH directions in one string: the code leaves, the seat/route/time
      // stay. This is the assertion a future sweep-widening would break.
      assert.match(scrubbed, /RegioJet RJ 1033/, "the route identity survives");
      assert.match(scrubbed, /Prague to Vienna/, "the endpoints survive");
      assert.match(scrubbed, /seat 4\/11/, "the seat survives (Δ3)");
      assert.match(scrubbed, /10:42/, "the departure time survives");
    }
  });

  test("KNOWN_GAP (Δ3 tension): a fused train number is still swept from transport prose", () => {
    // HONESTY BLOCK — this asserts CURRENT behaviour, not desired behaviour.
    //
    // Δ3 says route information is PUBLIC, and a train number is route
    // identity. But the alphanumeric branch of findProtectedCodeShapedTokens
    // flags any letter+digit token of >= 5 chars whose shape is not a 1-2
    // letter flight code, so a FUSED continental train number ("REX2513",
    // "NJ40295") is swept from transport/stay DESCRIPTIONS. Two-letter forms
    // ("RJ 1033", "FR8331", "W6 2339") are exempt or split, which is why the
    // live bundle never showed this.
    //
    // NOT FIXED IN F.3, deliberately: any widening of the exemption that
    // admits "REX2513" (3 letters + 4 digits) also admits short booking
    // locators of the same shape — i.e. it trades a content bug for a privacy
    // loosening. That trade is a CEO call, not a CTO one, and it is recorded
    // in docs/next-session.md for Arc G.
    //
    // MITIGATION, verified in source (evidence-clustering.ts:4472): transport
    // TITLES and routeLabels are NOT swept — only descriptions — so the row's
    // public identity survives regardless. That is asserted below so the
    // mitigation cannot silently disappear either.
    //
    // If this test FAILS, the exemption was changed: re-verify that no short
    // booking locator became exempt, then update Δ3's evidence in the ledger.
    assert.deepEqual(
      findProtectedCodeShapedTokens("Train REX2513 departs Wien Meidling at 10:42."),
      ["REX2513"],
      "KNOWN_GAP: a fused 3-letter train number reads as a protected code"
    );
    assert.deepEqual(
      findProtectedCodeShapedTokens("RegioJet RJ 1033 departs 10:42."),
      [],
      "but the spaced/two-letter forms the live corpus uses are already safe"
    );
    assert.deepEqual(
      findProtectedCodeShapedTokens("RyanAir FR8331 to Prague, seat 2D."),
      [],
      "and a two-letter flight code is exempt by construction"
    );
  });

  test("Δ3: the live transport lane ships seats and hides codes end to end", () => {
    // The full pipeline, not just the predicate: a transport row whose
    // description carries a seat, a route, times AND a travel code.
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "delta3",
          emptyStage({
            places: [
              {
                arriveDate: "2019-01-14",
                city: "Vienna",
                country: "Austria",
                leaveDate: "2019-01-18",
              },
            ],
            transport: [
              {
                arrival: "Vienna",
                arrivalTime: "14:30",
                confirmation: null,
                date: "2019-01-14",
                departure: "Prague",
                departureTime: "10:42",
                description:
                  "RegioJet RJ 1033, Prague to Vienna, Seat 4/11, Class 2, departs 10:42, arrives 14:30. Travel code 0468406277.",
                provider: "RegioJet",
                title: "RegioJet RJ 1033 to Vienna",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const transport = (
      result.draft as { transport: Array<Record<string, unknown>> }
    ).transport;
    assert.equal(transport.length, 1, "the travel row survives (it has endpoints)");
    const description = String(transport[0]?.description ?? "");
    const title = String(transport[0]?.title ?? "");

    // PUBLIC per Δ3.
    assert.match(description, /Seat 4\/11/, "seat number is public");
    assert.match(description, /Class 2/, "seat class is public");
    assert.match(description, /Prague to Vienna/, "route is public");
    assert.match(description, /10:42/, "departure time is public");
    assert.match(description, /14:30/, "arrival time is public");
    assert.match(title, /RJ 1033/, "the train identity is public");
    // The mitigation for the KNOWN_GAP above: transport titles are never
    // swept, so a row's public route identity survives even for a token shape
    // the description sweep would remove.
    assert.match(
      String(transport[0]?.provider ?? ""),
      /RegioJet/,
      "the provider field is public"
    );

    // PROTECTED — the sabotage surface.
    assert.equal(
      description.includes("0468406277"),
      false,
      "the travel code is swept: a bad actor must not be able to cancel the transit"
    );
  });
}
