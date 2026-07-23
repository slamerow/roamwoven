import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Arc F stay candidacy gate — run 7.23.2 chain 2 live shape (docket
// fixture assertion 2). The parser emitted a stay-kind piece named
// "Eli J Kamerow" from a booking passenger field (no dates, no leg, no
// address); assembly had no stay candidacy rule, the privacy sweep never
// touched stay names, and the identity detector scanned items only —
// records.stays went 5 GT stays + 1 public phantom carrying the
// traveler's name.

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

const GT_STAYS = [
  { checkIn: "2019-01-12", checkOut: "2019-01-14", city: "Rome", name: "The Yellow" },
  { checkIn: "2019-01-14", checkOut: "2019-01-18", city: "Prague", name: "Prague Airbnb" },
  { checkIn: "2019-01-18", checkOut: "2019-01-21", city: "Vienna", name: "Vienna Private Room" },
  { checkIn: "2019-01-21", checkOut: "2019-01-24", city: "Budapest", name: "Vitae Hostel" },
  { checkIn: "2019-01-24", checkOut: "2019-01-25", city: "Rome", name: "The RomeHello Hostel" },
].map((stay) => ({ ...stay, address: null }));

const PLACES = [
  { arriveDate: "2019-01-12", city: "Rome", country: "Italy", leaveDate: "2019-01-14" },
  { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
  { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
  { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
];

type Draft = {
  stays: Array<Record<string, unknown>>;
};

export default async function run() {
  test("chain 2: the person-named dateless phantom stay is suppressed as booking material; the 5 GT stays ship", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Czech out itinerary",
          emptyStage({
            places: PLACES,
            stays: [
              ...GT_STAYS,
              // The live phantom verbatim: name from the OBB FAHRSCHEIN
              // "Zugbindung Kamerow Eli" block / voucher Client field —
              // no dates, no leg, no address.
              { address: null, checkIn: null, checkOut: null, city: null, name: "Eli J Kamerow" },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(draft.stays.length, 5, "exactly the 5 GT stays ship");
    assert.equal(
      draft.stays.some((stay) => /kamerow/i.test(`${stay.name ?? ""}`)),
      false,
      "no public stay carries the traveler's name"
    );
    const suppressed = result.pieces.find(
      (piece) =>
        piece.kind === "stay" &&
        !piece.outputEligible &&
        /kamerow/i.test(`${piece.payload.name ?? ""}`)
    );
    assert.ok(suppressed, "the phantom is suppressed, not silently dropped");
    assert.equal(
      suppressed?.actions.some((action) =>
        /booking material/.test(action.reason)
      ),
      true,
      "the suppression carries the booking-material disposition"
    );
  });

  test("night-evidence negative controls: check-in-only and checkout-only stays survive the gate", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Czech out itinerary",
          emptyStage({
            places: PLACES,
            stays: [
              // A parse-variance shape: a real stay carrying only one
              // boundary date still represents a night.
              { address: null, checkIn: "2019-01-14", checkOut: null, city: "Prague", name: "Prague Airbnb" },
              { address: null, checkIn: null, checkOut: "2019-01-21", city: "Vienna", name: "Vienna Private Room" },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.stays.length,
      2,
      "single-boundary stays keep shipping (the gate needs night evidence, not a full range)"
    );
  });

  test("a dateless VENUE-named stay is suppressed for night evidence, with the non-person disposition", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Czech out itinerary",
          emptyStage({
            places: PLACES,
            stays: [
              ...GT_STAYS,
              { address: null, checkIn: null, checkOut: null, city: "Prague", name: "Golden Well Hotel" },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.stays.some((stay) => /golden well/i.test(`${stay.name ?? ""}`)),
      false,
      "a dateless venue stay covers no night and does not ship"
    );
    const suppressed = result.pieces.find(
      (piece) =>
        piece.kind === "stay" &&
        !piece.outputEligible &&
        /golden well/i.test(`${piece.payload.name ?? ""}`)
    );
    assert.equal(
      suppressed?.actions.some((action) =>
        /no night evidence/.test(action.reason)
      ),
      true,
      "the disposition names the night rule, not booking material"
    );
  });
}
