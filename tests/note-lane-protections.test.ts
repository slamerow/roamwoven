import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  reapplyCanonicalOutputInvariants,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { assembleCanonicalTripDraft } from "@/lib/extraction/canonical-trip-assembly";

// Arc F.2 C4 — run 7.24.1 chain D, fixture assertions 2, 5, and 6. The
// worst record in the live draft ("Rome Notes & Tips") publicly carried,
// in one description: a Costs-section lodging line ("January 24th
// Rome—$118 (private room—ensuite)"), the apartment access block ("HOW TO
// GET IN … use the key …"), and raw ÖBB FAHRSCHEIN OCR. All three shapes
// are quoted verbatim from the bundle. The step-0 trace additionally
// proved the route's quality retry is the one post-sweep payload mutation
// point (the corridor then rebuilds outputs from those payloads), so the
// retry now re-sweeps whatever it touches.

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

type Draft = {
  activities: Array<Record<string, unknown>>;
  stays: Array<Record<string, unknown>>;
  transport: Array<Record<string, unknown>>;
};

const ROME_PLACES = [
  { arriveDate: "2019-01-24", city: "Rome", country: "Italy", leaveDate: "2019-01-25" },
];

// The three chain D payload shapes, verbatim from the bundle.
const ACCESS_BLOCK =
  "HOW TO GET IN For entering the building, use the key. The apartment is on the first floor, the door on the right side. Step 1:, Step 2:, Step 3:, Step 4:";
const TICKET_OCR =
  "FAHRSCHEIN Zugbindung 01 ERWACHSENER DATUM: 21.01 Sparschiene KEIN UMTAUSCH/KEINE ERSTATTUNG Hinfahrt: Dauer: 2:37";
const ROME_COST_LINE = "January 24th Rome—$118 (private room—ensuite)";
const PRAGUE_COST_LINE = "Prague stay cost note for $56 (airbnb)";

export default async function run() {
  test("chain D: the merged city note excludes access/OCR/cost material with dispositions; recommendations survive; the stay owns the access block", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Thursday, January 24th",
          emptyStage({
            places: ROME_PLACES,
            stays: [
              {
                address: null,
                checkIn: "2019-01-24",
                checkOut: "2019-01-25",
                city: "Rome",
                name: "Roman Holidays Apartment",
              },
            ],
            activities: [
              {
                city: "Rome",
                date: null,
                description: `Trastevere is great for dinner. Try the carbonara at a local trattoria. ${ROME_COST_LINE}. ${ACCESS_BLOCK}. ${TICKET_OCR}.`,
                itemType: "note",
                sourceSectionLabel: "Rome tips",
                title: "Rome ideas",
              },
              {
                city: "Rome",
                date: null,
                description:
                  "Tickets around 1500 HUF each for the baths. Sedlec entry $10 is worth it.",
                itemType: "note",
                sourceSectionLabel: "Rome tips",
                title: "More Rome ideas",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const noteProse = draft.activities
      .filter((item) => item.itemType === "note")
      .map((item) => `${item.title ?? ""} ${item.description ?? ""}`)
      .join(" ");

    assert.equal(
      /how to get in|use the key|door on the right|step \d/i.test(noteProse),
      false,
      "no access-instruction text ships in any public note"
    );
    assert.equal(
      /fahrschein|zugbindung|erwachsener|umtausch|erstattung|sparschiene/i.test(noteProse),
      false,
      "no raw ticket OCR ships in any public note"
    );
    assert.equal(
      /\$118|private room|ensuite/i.test(noteProse),
      false,
      "no lodging-cost text ships in any public note (CEO lodging-cost decision)"
    );
    assert.match(noteProse, /Trastevere/i, "recommendation prose survives");
    assert.match(
      noteProse,
      /1500 HUF/,
      "priced non-lodging prose survives (ddb1699 negative control)"
    );
    assert.match(
      noteProse,
      /\$10 is worth it/,
      "a priced venue line with no lodging vocabulary survives"
    );

    // The access block lands on the stay's PROTECTED access instructions.
    const stay = result.pieces.find(
      (piece) => piece.kind === "stay" && piece.outputEligible
    );
    assert.match(
      `${stay?.payload.accessInstructions ?? ""}`,
      /use the key/i,
      "the stay owns the access material in its protected slot"
    );

    // Every exclusion is recorded (RW-ING-001 — nothing silently dropped).
    const mergedNote = result.pieces.find(
      (piece) =>
        piece.kind === "note" &&
        /notes & tips/i.test(`${piece.payload.title ?? ""}`)
    );
    const reasons = (mergedNote?.actions ?? []).map((action) => action.reason).join(" | ");
    assert.match(reasons, /booking\/receipt boilerplate excluded/i);
    // The access block is routed with a disposition on whichever lane saw
    // it first: the pre-merge 3b note sweep or the composition filter.
    const allReasons = result.pieces
      .flatMap((piece) => piece.actions.map((action) => action.reason))
      .join(" | ");
    assert.match(
      allReasons,
      /arrival-directions block swept from public note|access\/credential material excluded/i,
      "the access routing is auditable"
    );
  });

  test("chain D: the Prague lodging-cost sentence is excluded from note prose", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Prague",
          emptyStage({
            places: [
              { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
            ],
            activities: [
              {
                city: "Prague",
                date: null,
                description: `Visit Sedlec Ossuary. ${PRAGUE_COST_LINE}. Try trdelnik in Old Town.`,
                itemType: "note",
                sourceSectionLabel: "Prague tips",
                title: "Prague ideas",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const noteProse = draft.activities
      .filter((item) => item.itemType === "note")
      .map((item) => `${item.description ?? ""}`)
      .join(" ");

    assert.equal(
      /\$56|stay cost/i.test(noteProse),
      false,
      "the lodging-cost sentence is excluded"
    );
    assert.match(noteProse, /Sedlec Ossuary/i, "neighboring recommendations survive");
    assert.match(noteProse, /trdelnik/i, "neighboring recommendations survive");
  });

  test("step-0 mechanism: the quality retry re-sweeps mutated payloads, and the corridor rebuild ships the re-swept text", () => {
    const evidence = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Friday, January 18th",
          emptyStage({
            places: [
              { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
              { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
            ],
            transport: [
              {
                arrival: "Vienna",
                arrivalTime: "13:23",
                date: "2019-01-18",
                departure: "Prague",
                departureTime: "09:20",
                description: "RegioJet RJ 1033 via Brno. Seats 61-62.",
                provider: "RegioJet",
                title: "Prague to Vienna",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    // Simulate the retry-lane hazard the step-0 trace identified: a pass
    // running AFTER the cluster-time sweep writes unswept text into a
    // public payload (the accessory router's attach path does exactly
    // this shape live).
    const transport = evidence.pieces.find(
      (piece) => piece.kind === "transport" && piece.outputEligible
    );
    assert.ok(transport, "fixture sanity: the transport piece exists");
    transport!.payload.description = `${transport!.payload.description} travel code 0468467890.`;

    const retry = reapplyCanonicalOutputInvariants({
      pieces: evidence.pieces,
      sensitiveDetails: [],
    });
    assert.equal(retry.changed, true, "the retry reports the mutation");
    const retriedTransport = retry.pieces.find(
      (piece) => piece.kind === "transport" && piece.outputEligible
    );
    assert.equal(
      /0468467890|travel code/i.test(`${retriedTransport?.payload.description ?? ""}`),
      false,
      "the retry re-sweeps the injected code shape (T1 restored for the retry lane)"
    );

    // The corridor now detects the draft/pieces drift and rebuilds — from
    // the RE-SWEPT payloads. This is the 7.24.1 'repaired' mechanism
    // end-to-end, with the leak closed.
    const assembly = assembleCanonicalTripDraft({
      draft: evidence.draft,
      evidencePieces: retry.pieces,
      fallbackTripName: "F.2 chain D repro",
      tripId: "aa218430-5da8-4c8c-9ea0-b14ae8a498e6",
    });
    assert.equal(assembly.recovery.status, "repaired", "the corridor rebuild engages on the drift");
    assert.equal(
      assembly.recovery.initialViolations.some((violation) =>
        /semantic payload does not match/.test(violation)
      ),
      true,
      "the drift is named the same way the live run named it"
    );
    const rebuilt = assembly.draft as Draft;
    assert.equal(
      rebuilt.transport.some((row) =>
        /0468467890|travel code/i.test(`${row.description ?? ""}`)
      ),
      false,
      "the rebuilt public output carries the re-swept prose — swept lanes cannot un-sweep at finalization"
    );
    assert.equal(
      rebuilt.transport.some((row) => /via Brno/.test(`${row.description ?? ""}`)),
      true,
      "real itinerary prose survives the rebuild"
    );
  });

  test("retry idempotency: an unchanged piece set reports changed=false", () => {
    const evidence = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Friday, January 18th",
          emptyStage({
            places: [
              { arriveDate: "2019-01-14", city: "Prague", country: "Czech Republic", leaveDate: "2019-01-18" },
              { arriveDate: "2019-01-18", city: "Vienna", country: "Austria", leaveDate: "2019-01-21" },
            ],
            transport: [
              {
                arrival: "Vienna",
                arrivalTime: "13:23",
                date: "2019-01-18",
                departure: "Prague",
                departureTime: "09:20",
                description: "RegioJet RJ 1033 via Brno. Seats 61-62.",
                provider: "RegioJet",
                title: "Prague to Vienna",
                type: "train",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const retry = reapplyCanonicalOutputInvariants({
      pieces: evidence.pieces,
      sensitiveDetails: [],
    });
    assert.equal(
      retry.changed,
      false,
      "re-running the invariants + sweep on an untouched clone is a no-op"
    );
  });
}
