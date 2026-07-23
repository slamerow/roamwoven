import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";

// Arc F chain 3b (run 7.23.2; Eli 2026-07-24: full fix in Arc F). GT
// protects stay "getting there" material; the live run shipped it publicly
// at two sites: the admin card "The RomeHello Hostel access details"
// (the walk from Termini) and the Rome city note carrying The Yellow's
// directions block verbatim ("Exit the train station onto Via Marsala by
// track 1. Find Via Marghera…" — GT stays table, Rome 1 row). Both shapes
// are reproduced here; the negative controls keep ordinary sightseeing
// walk advice as note/card content.

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

const ROME_PLACE = {
  arriveDate: "2019-01-12",
  city: "Rome",
  country: "Italy",
  leaveDate: "2019-01-14",
};

const YELLOW_DIRECTIONS =
  "Exit the train station onto Via Marsala by track 1. Find Via Marghera and walk two blocks. The entrance is on your left.";

type Draft = {
  activities: Array<Record<string, unknown>>;
  missingDetails: Array<Record<string, unknown>>;
  stays: Array<Record<string, unknown>>;
};

function noteProse(draft: Draft) {
  return draft.activities
    .filter((item) => item.itemType === "note")
    .map((item) => `${item.title ?? ""} ${item.description ?? ""}`)
    .join(" ");
}

export default async function run() {
  test("chain 3b card lane: a stay-named access-details admin card folds into the stay", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Saturday, January 12th",
          emptyStage({
            activities: [
              {
                city: "Rome",
                date: "2019-01-12",
                description:
                  "From Termini station exit toward Via Marsala. Walk along Via Marghera. The hostel door is on your right after 200 m.",
                itemType: "admin",
                sourceSectionLabel: "Saturday, January 12th",
                title: "The RomeHello Hostel access details",
              },
              {
                city: "Rome",
                date: "2019-01-12",
                description: "Evening walk through the centro storico.",
                itemType: "activity",
                sourceSectionLabel: "Saturday, January 12th",
                title: "Piazza Navona",
              },
            ],
            places: [ROME_PLACE],
            stays: [
              {
                address: null,
                checkIn: "2019-01-12",
                checkOut: "2019-01-14",
                city: "Rome",
                name: "The RomeHello Hostel",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.activities.some((item) =>
        /access details/i.test(`${item.title ?? ""}`)
      ),
      false,
      "the access-details card never ships as a traveler activity"
    );
    assert.equal(
      /via marghera/i.test(
        draft.activities
          .map((item) => `${item.title ?? ""} ${item.description ?? ""}`)
          .join(" ")
      ),
      false,
      "the directions prose is gone from every public card"
    );
    assert.equal(
      draft.activities.some((item) => /piazza navona/i.test(`${item.title ?? ""}`)),
      true,
      "the real sight still ships"
    );
    const stay = result.pieces.find(
      (piece) => piece.kind === "stay" && piece.outputEligible
    );
    assert.match(
      `${stay?.payload.accessInstructions ?? ""}`,
      /Via Marghera/,
      "the walk is retained as the stay's protected access instructions"
    );
  });

  test("chain 3b unnamed lane: direction prose naming NO stay still routes to the leg's stay", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Saturday, January 12th",
          emptyStage({
            activities: [
              {
                city: "Rome",
                date: "2019-01-12",
                description: YELLOW_DIRECTIONS,
                itemType: "admin",
                sourceSectionLabel: "Saturday, January 12th",
                title: "Arrival walk",
              },
            ],
            places: [ROME_PLACE],
            stays: [
              {
                address: null,
                checkIn: "2019-01-12",
                checkOut: "2019-01-14",
                city: "Rome",
                name: "The Yellow",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.equal(
      draft.activities.some((item) =>
        /via marsala|via marghera/i.test(
          `${item.title ?? ""} ${item.description ?? ""}`
        )
      ),
      false,
      "the unnamed directions card never ships publicly"
    );
    const stay = result.pieces.find(
      (piece) => piece.kind === "stay" && piece.outputEligible
    );
    assert.match(
      `${stay?.payload.accessInstructions ?? ""}`,
      /Via Marsala/,
      "the material lands on the same-city stay despite naming no stay"
    );
  });

  test("chain 3b note lane: The Yellow's directions block is swept from the city note; other note content survives", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Rome Notes & Tips",
          emptyStage({
            activities: [
              {
                city: "Rome",
                date: null,
                description: `${YELLOW_DIRECTIONS} Trastevere is lovely after dark. Carry small change for espresso bars.`,
                itemType: "note",
                sourceSectionLabel: "Rome Notes & Tips",
                title: "Rome Notes & Tips",
              },
            ],
            places: [ROME_PLACE],
            stays: [
              {
                address: null,
                checkIn: "2019-01-12",
                checkOut: "2019-01-14",
                city: "Rome",
                name: "The Yellow",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const prose = noteProse(draft);

    assert.equal(
      /via marsala|via marghera|by track 1/i.test(prose),
      false,
      "the directions block is gone from public note prose"
    );
    assert.match(prose, /Trastevere/i, "real note content survives the sweep");
    assert.match(prose, /espresso/i, "real note content survives the sweep");
    const stay = result.pieces.find(
      (piece) => piece.kind === "stay" && piece.outputEligible
    );
    assert.match(
      `${stay?.payload.accessInstructions ?? ""}`,
      /Via Marsala/,
      "the swept block becomes the stay's protected access instructions"
    );
  });

  test("chain 3b negative control: incidental walk advice is not arrival directions", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Rome Notes & Tips",
          emptyStage({
            activities: [
              {
                city: "Rome",
                date: null,
                description:
                  "Walk along the Tiber at sunset for the best light. The Aventine keyhole is worth the detour.",
                itemType: "note",
                sourceSectionLabel: "Rome Notes & Tips",
                title: "Rome Notes & Tips",
              },
              {
                city: "Rome",
                date: "2019-01-13",
                description: "Turn left at the obelisk for the panoramic terrace.",
                itemType: "activity",
                sourceSectionLabel: "Sunday, January 13th",
                title: "Pincio Terrace",
              },
            ],
            places: [ROME_PLACE],
            stays: [
              {
                address: null,
                checkIn: "2019-01-12",
                checkOut: "2019-01-14",
                city: "Rome",
                name: "The Yellow",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;

    assert.match(
      noteProse(draft),
      /Tiber/i,
      "a single walk-advice sentence stays note content"
    );
    assert.equal(
      draft.activities.some((item) => /pincio/i.test(`${item.title ?? ""}`)),
      true,
      "a sight card with one incidental turn cue keeps shipping"
    );
  });
}
