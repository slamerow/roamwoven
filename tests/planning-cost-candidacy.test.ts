import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { isPlanningCostMaterial } from "@/lib/extraction/source-coverage";

// Arc F shared Costs predicate at canonical candidacy — run 7.23.2 chain 4
// (docket fixture assertion 4). The live bundle proved the mechanism
// inside one run: lineage row …0c85bd5f ("Vienna lodging cost",
// sourceLabel literally the Costs line "January 19th Vienna- $72 (private
// room- ensuite)") was SUPPRESSED by ddb1699's recovery-path exclusion,
// while the shipped card …b3be4619 was the SAME Costs line arriving as a
// second model_chunk observation shaped as an admin activity. The
// exclusion now lives at candidacy, so no producing path matters.

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
const COSTS_LINE_LABEL = "January 19th Vienna- $72 (private room- ensuite)";

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
};

export default async function run() {
  test("chain 4: the Vienna lodging cost card fails candidacy regardless of producing path", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          COSTS_LINE_LABEL,
          emptyStage({
            activities: [
              // The shipped card's shape: the Costs line re-emitted as an
              // admin activity by a chunk call (not by recovery — that
              // path was already closed by ddb1699).
              {
                city: "Vienna",
                date: "2019-01-20",
                description: "Private room ensuite lodging cost for Vienna",
                itemType: "admin",
                sourceSectionLabel: COSTS_LINE_LABEL,
                title: "Vienna lodging cost",
              },
            ],
          })
        ),
        stage(
          "Sunday, January 20th",
          emptyStage({
            activities: [
              {
                city: "Vienna",
                date: "2019-01-20",
                description: "Morning visit before the palace gardens.",
                itemType: "activity",
                sourceSectionLabel: "Sunday, January 20th",
                title: "Schönbrunn Palace",
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
        /lodging cost/i.test(`${item.title ?? ""}`)
      ),
      false,
      "no cost card ships from any path"
    );
    assert.equal(
      draft.activities.some((item) =>
        /schönbrunn/i.test(`${item.title ?? ""}`)
      ),
      true,
      "the real sight still ships"
    );
    const suppressed = result.pieces.find((piece) =>
      piece.actions.some((action) =>
        /Costs-section planning line fails canonical candidacy/.test(
          action.reason
        )
      )
    );
    assert.ok(
      suppressed,
      "the cost candidate is suppressed with an auditable candidacy disposition"
    );
    assert.equal(suppressed?.outputEligible, false);
  });

  test("ddb1699 negative controls hold at candidacy: priced venue/idea lines and arrival-due costs still ship", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage(
          "Monday, January 21st",
          emptyStage({
            activities: [
              {
                city: "Budapest",
                date: "2019-01-21",
                description: "Funicular (HUF 1,200 one way) up to the castle.",
                itemType: "activity",
                sourceSectionLabel: "Monday, January 21st",
                title: "Buda Castle Funicular",
              },
              {
                city: "Budapest",
                date: "2019-01-21",
                description:
                  "45.75 euro due upon arrival at the hostel reception.",
                itemType: "activity",
                sourceSectionLabel: "Monday, January 21st",
                title: "Check in and pay balance",
                // A real timed task, not a ledger line.
                startTime: "15:00",
              },
            ],
          })
        ),
      ],
      tripOverview: TRIP_OVERVIEW,
    });
    const draft = result.draft as Draft;
    const prose = draft.activities
      .map((item) => `${item.title ?? ""} ${item.description ?? ""}`)
      .join(" ");

    assert.match(prose, /funicular/i, "priced venue line survives candidacy");
    assert.match(
      prose,
      /due upon arrival/i,
      "stay cost due on arrival survives candidacy"
    );
  });

  test("the shared predicate is one function across recovery, candidacy, and audit", () => {
    // Section-label positive (both the Costs heading and a ledger label).
    assert.equal(
      isPlanningCostMaterial({ label: COSTS_LINE_LABEL, lines: [] }),
      true
    );
    assert.equal(isPlanningCostMaterial({ label: "Costs", lines: [] }), true);
    // Line positives (the ddb1699 shapes).
    assert.equal(
      isPlanningCostMaterial({
        label: "Sunday, January 20th",
        lines: ["Train to/from Cesky Krumlov ($15-$20)"],
      }),
      true
    );
    assert.equal(
      isPlanningCostMaterial({ label: null, lines: ["$110 flight upgrade"] }),
      true
    );
    // Negative controls (approved ground truth).
    assert.equal(
      isPlanningCostMaterial({
        label: "Monday, January 21st",
        lines: ["funicular (HUF 1,200 one way)"],
      }),
      false
    );
    assert.equal(
      isPlanningCostMaterial({
        label: "Saturday, January 12th",
        lines: ["45.75 euro due upon arrival"],
      }),
      false
    );
  });
}
