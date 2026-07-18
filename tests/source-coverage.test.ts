import assert from "node:assert/strict";
import { createTripExtractionAuditReport } from "@/lib/extraction/trip-extraction-audit";
import { computeDaySectionSourceCoverage } from "@/lib/extraction/source-coverage";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";

// Wave-2 source-coverage fixtures from LIVE runs 7.18.0/7.18.1: the parser
// silently dropped day-section lines (koscom, "maybe communism museum",
// "Drop bags and tour Rome", Szechenyi Baths) in different combinations
// across runs of the same PDF (docs/assembly-defect-docket-2026-07-18-run4.md).

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

function chunkStage(
  label: string,
  sourceText: string | null,
  stageValue: Record<string, unknown>
) {
  return {
    label,
    source: "model_chunk" as const,
    sourceText,
    stage: emptyStage(stageValue),
  };
}

const KUTNA_HORA_SOURCE = [
  "Thursday, January 17th // Kutna Hora day trip",
  "9:00 Pick up rental car",
  "Sedlec Ossuary and the silver mines",
  "Get back by 5 to go to koscom and maybe communism museum",
].join("\n");

export default async function run() {
  await test("a dropped day-section line is reported uncovered (koscom + maybe communism museum)", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage("Thursday, January 17th", KUTNA_HORA_SOURCE, {
        activities: [
          {
            date: "2019-01-17",
            itemType: "activity",
            startTime: "9:00",
            title: "Pick up rental car",
          },
          {
            date: "2019-01-17",
            itemType: "activity",
            title: "Sedlec Ossuary and silver mines visit",
          },
        ],
      }),
    ]);

    assert.equal(coverage.daySectionCount, 1);
    assert.equal(coverage.uncoveredLineCount, 1);
    assert.match(coverage.stages[0].uncoveredLines[0].excerpt, /koscom/i);
  });

  await test("run5 calibration: page markers and ticket boilerplate are never meaningful lines", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage(
        "Friday, January 25th",
        [
          "Friday, January 25th",
          "=== Page 2 ===",
          "Order summary: 2x Colosseum entry",
          "Booking reference: QX123ABC",
          "Visit the Pantheon in the morning",
        ].join("\n"),
        {
          activities: [
            {
              date: "2019-01-25",
              itemType: "activity",
              title: "Pantheon morning visit",
            },
          ],
        }
      ),
    ]);

    assert.equal(coverage.uncoveredLineCount, 0);
    assert.equal(coverage.stages.length, 0);
  });

  await test("run5 calibration: a line covered by ANOTHER stage's output is cross-stage content, not a drop", () => {
    const coverage = computeDaySectionSourceCoverage([
      {
        label: "trip spine",
        source: "model_spine" as const,
        stage: {
          transport: [
            {
              arrival: "FCO",
              departure: "JFK",
              title: "Flight JFK to FCO",
            },
          ],
        },
      },
      chunkStage(
        "Saturday, January 12th",
        [
          "Saturday, January 12th",
          "Flight JFK -> FCO overnight",
          "Catacombs tour with the guide",
        ].join("\n"),
        {
          activities: [],
        }
      ),
      chunkStage(
        "appendix pages",
        "reference text with no day heading",
        {
          activities: [
            {
              date: "2019-01-13",
              itemType: "activity",
              title: "Catacombs tour",
            },
          ],
        }
      ),
    ]);

    assert.equal(
      coverage.uncoveredLineCount,
      0,
      "spine-covered and other-chunk-covered lines are not drops"
    );
    assert.equal(coverage.crossStageCoveredLineCount, 2);
  });

  await test("an extracted day section reports full coverage", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage("Thursday, January 17th", KUTNA_HORA_SOURCE, {
        activities: [
          {
            date: "2019-01-17",
            itemType: "activity",
            startTime: "9:00",
            title: "Pick up rental car",
          },
          {
            date: "2019-01-17",
            itemType: "activity",
            title: "Sedlec Ossuary and silver mines visit",
          },
          {
            date: "2019-01-17",
            itemType: "activity",
            title: "Koscom watch shop",
          },
          {
            date: null,
            evidenceRole: "city_note_candidate",
            itemType: "note",
            title: "Museum of Communism (maybe)",
          },
        ],
      }),
    ]);

    assert.equal(coverage.daySectionCount, 1);
    assert.equal(coverage.uncoveredLineCount, 0);
    assert.equal(coverage.stages.length, 0);
  });

  await test("a dropped sparse commitment is reported uncovered (Drop bags and tour Rome)", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage(
        "Thursday, January 24th",
        [
          "Thursday, January 24th",
          "Drop bags and tour Rome",
          "7:30 Dinner reservation at Aroma",
        ].join("\n"),
        {
          activities: [
            {
              date: "2019-01-24",
              itemType: "activity",
              startTime: "7:30 PM",
              title: "Dinner reservation at Aroma",
            },
          ],
        }
      ),
    ]);

    assert.equal(coverage.uncoveredLineCount, 1);
    assert.match(coverage.stages[0].uncoveredLines[0].excerpt, /tour Rome/i);
  });

  await test("stages without a day heading and spine stages are never judged", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage(
        "itinerary.pdf notes",
        ["Vienna reference list", "Albertina, Belvedere, State Hall Library"].join("\n"),
        { activities: [] }
      ),
      {
        label: "trip spine",
        source: "model_spine" as const,
        sourceText: null,
        stage: emptyStage({}),
      },
    ]);

    assert.equal(coverage.daySectionCount, 0);
    assert.equal(coverage.uncoveredLineCount, 0);
  });

  await test("a section already in recovery is not re-flagged line by line", () => {
    const coverage = computeDaySectionSourceCoverage([
      chunkStage("Thursday, January 17th", KUTNA_HORA_SOURCE, {
        activities: [
          {
            _recoveryRequired: true,
            itemType: "placeholder",
            title: "Review missing source section 1",
          },
        ],
      }),
    ]);

    assert.equal(coverage.daySectionCount, 0);
    assert.equal(coverage.uncoveredLineCount, 0);
  });

  await test("uncovered lines raise one quiet P2 advisory in the audit (never a P0, never a mutation)", () => {
    const draft = {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: { dateRange: "January 12-25, 2019" },
    };
    const records = createStructuredTripRecordsFromDraft({
      draft,
      fallbackTripName: "Coverage trip",
      tripId: "trip-source-coverage",
    });
    const usage = {
      sourceCoverage: {
        daySectionCount: 12,
        meaningfulLineCount: 80,
        stages: [
          {
            dayHeading: "Thursday, January 17th // Kutna Hora day trip",
            label: "Thursday, January 17th",
            meaningfulLineCount: 3,
            uncoveredLines: [
              {
                excerpt: "Get back by 5 to go to koscom and maybe communism museum",
                lineIndex: 3,
              },
            ],
          },
        ],
        uncoveredLineCount: 1,
        version: 1,
      },
    };
    const report = createTripExtractionAuditReport({ draft, records, usage });
    const diagnostic = report.diagnostics.find(
      (item) => item.code === "day_section_source_line_unextracted"
    );

    assert.ok(diagnostic);
    assert.equal(diagnostic.severity, "p2");
    assert.match(diagnostic.evidence[0], /koscom/i);
    assert.equal(report.extraction.sourceCoverage?.uncoveredLineCount, 1);

    const cleanReport = createTripExtractionAuditReport({
      draft,
      records,
      usage: {
        sourceCoverage: {
          daySectionCount: 12,
          meaningfulLineCount: 80,
          stages: [],
          uncoveredLineCount: 0,
          version: 1,
        },
      },
    });

    assert.equal(
      cleanReport.diagnostics.some(
        (item) => item.code === "day_section_source_line_unextracted"
      ),
      false
    );
  });
}
