import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";
import {
  planSourceRecoveryBatch,
  SOURCE_RECOVERY_STAGE_LABEL,
} from "@/lib/extraction/source-recovery";
import {
  isExcludedPlanningCostLine,
  isPlanningCostSectionLabel,
  type SourceCoverageSummary,
} from "@/lib/extraction/source-coverage";

// Live-run 7.23.0r P1 (trip 892b2e3e, bundle sha256 419b7405…): source
// recovery re-ingested the Costs section (excluded trip content per the
// approved ground truth) and minted TWO PHANTOM OVERNIGHT LEGS — "Prague"
// arrive 2019-01-15 leave 2019-01-17 (piece_4443af…) and "Budapest" arrive
// 2019-01-21 leave 2019-01-23 (piece_4f1f87…), both from observations
// labeled "source recovery" — plus a never-taken "Train to/from Cesky
// Krumlov ($15-$20)" card. 7 legs shipped instead of 5.

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

function stage(
  label: string,
  stageValue: Record<string, unknown>,
  source: "model_chunk" | "model_spine" = "model_chunk"
) {
  return { label, source, stage: stageValue };
}

const TRIP_OVERVIEW = { dateRange: "January 12-25, 2019" };

type DraftRecord = Record<string, unknown>;

function placesOf(result: { draft: unknown }) {
  return ((result.draft as DraftRecord).places ?? []) as DraftRecord[];
}

export default async function run() {
  await test("RW-TRV-001 (7.23.0r): recovery-only place observations never mint a trip leg; spine legs survive", () => {
    const result = clusterExtractedEvidence({
      sourceTransportAnchors: [],
      stages: [
        stage("trip spine", emptyStage({
          places: [
            { arriveDate: "2019-01-14", city: "Prague", country: "Czechia", leaveDate: "2019-01-18" },
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-24" },
          ],
        }), "model_spine"),
        stage("Monday, January 14th", emptyStage({
          stays: [
            {
              name: "Prague Airbnb",
              city: "Prague",
              checkIn: "2019-01-14",
              checkOut: "2019-01-18",
            },
          ],
        })),
        stage(SOURCE_RECOVERY_STAGE_LABEL, emptyStage({
          places: [
            // The exact 7.23.0r phantom shapes: nested date ranges from
            // per-night Costs lines, titled by the recovery stage.
            { arriveDate: "2019-01-15", city: "Prague", country: "Czechia", leaveDate: "2019-01-17" },
            { arriveDate: "2019-01-21", city: "Budapest", country: "Hungary", leaveDate: "2019-01-23" },
          ],
        })),
      ],
      tripOverview: TRIP_OVERVIEW,
    });

    const places = placesOf(result);
    const pragueLegs = places.filter(
      (record) => record.city === "Prague"
    );
    const budapestLegs = places.filter(
      (record) => record.city === "Budapest"
    );
    assert.equal(
      pragueLegs.length,
      1,
      `phantom Prague leg shipped: ${JSON.stringify(places)}`
    );
    assert.equal(
      budapestLegs.length,
      1,
      `phantom Budapest leg shipped: ${JSON.stringify(places)}`
    );
    // The surviving legs are the corroborated spine legs, not the
    // recovery copies.
    assert.equal(pragueLegs[0].arriveDate, "2019-01-14");
    assert.equal(budapestLegs[0].leaveDate, "2019-01-24");
  });

  await test("RW-EVD-001 (7.23.0r): Costs-section lines are excluded from recovery batching, with an honest count", () => {
    const coverage = {
      daySectionCount: 2,
      meaningfulLineCount: 6,
      stages: [
        {
          dayHeading: null,
          label: "January 15th Prague - $56 (airbnb)",
          uncoveredLines: [
            { excerpt: "January 15th Prague - $56 (airbnb)" },
            { excerpt: "January 16th Prague - $56 (airbnb)" },
          ],
        },
        {
          dayHeading: "Friday, January 25th",
          label: "Friday, January 25th",
          uncoveredLines: [
            { excerpt: "Train to/from Cesky Krumlov ($15-$20)" },
            { excerpt: "Flight to Rome: $300 (in points) + $110 flight upgrade" },
            { excerpt: "(Budget: $470)" },
            { excerpt: "Guided Tour / Prohlídka — 15.01.2019, 14:30" },
          ],
        },
      ],
      uncoveredLineCount: 6,
    } as unknown as SourceCoverageSummary;

    const plan = planSourceRecoveryBatch({
      coverage,
      maxInputChars: 8000,
      maxLines: 40,
    });

    assert.ok(plan, "a plan must still exist for the legitimate line");
    assert.equal(plan.excludedPlanningCostLineCount, 5);
    assert.equal(plan.batchedLineCount, 1);
    assert.ok(
      plan.input.includes("Guided Tour / Prohlídka"),
      "the legitimate uncovered line is still recovered"
    );
    assert.ok(
      !plan.input.includes("Cesky Krumlov"),
      "cost-ledger transit lines never reach recovery"
    );
    assert.ok(!plan.input.includes("$56"), "per-night cost lines never reach recovery");
  });

  await test("negative controls: stay costs due on arrival, HUF prose, and priced venue lines are NOT cost-excluded", () => {
    assert.equal(
      isExcludedPlanningCostLine("45.75 euro due upon arrival + tax"),
      false,
      "stay cost due on arrival is stay material, not a Costs artifact"
    );
    assert.equal(
      isExcludedPlanningCostLine(
        "take the pricey funicular to the bottom (HUF 1,200 one way, HUF 1,800 return)"
      ),
      false
    );
    assert.equal(
      isExcludedPlanningCostLine("Walking tour in the morning 9:00 AM ($20)"),
      false,
      "a priced activity line is trip content"
    );
    assert.equal(
      isExcludedPlanningCostLine("Albertina (free-12.90) // Open til 6"),
      false
    );
    assert.equal(isPlanningCostSectionLabel("Friday, January 18th"), false);
    assert.equal(
      isPlanningCostSectionLabel("January 24th Rome - $118 (private room-ensuite)"),
      true
    );
    assert.equal(isExcludedPlanningCostLine("Costs"), true);
    assert.equal(isExcludedPlanningCostLine("Travel: (Budget: $470)"), true);
  });
}
