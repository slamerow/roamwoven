import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import { evaluateTripExtractionCoverage } from "@/lib/extraction/extraction-qa";
import {
  centralEuropeFirstHalfExpectations,
  createCentralEuropeFirstHalfDraft,
} from "@/tests/fixtures/central-europe-extraction-qa";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("extraction QA coverage passes a representative healthy Central Europe draft", () => {
  const records = createStructuredTripRecordsFromDraft({
    draft: createCentralEuropeFirstHalfDraft(),
    fallbackTripName: "Central Europe",
    tripId: "central-europe-qa",
  });
  const report = evaluateTripExtractionCoverage({
    expectations: centralEuropeFirstHalfExpectations,
    records,
  });

  assert.equal(report.missing.length, 0);
  assert.equal(report.categoryMismatches.length, 0);
  assert.equal(report.score, 1);
  assert.equal(report.expectedCountByDate["2019-01-16"], 7);
  assert.equal(report.actualCountByDate["2019-01-16"], 7);
});

test("extraction QA coverage flags missing activities and category drift", () => {
  const healthyDraft = createCentralEuropeFirstHalfDraft();
  const draft = {
    ...healthyDraft,
    activities: healthyDraft.activities
      .filter(
        (item) =>
          ![
            "Prague Castle",
            "KGB Museum",
            "R2D2 statue",
            "Schonbrunn Palace",
            "Ferris Wheel",
            "Mazel Tov",
          ].includes(item.title)
      )
      .map((item) =>
        item.title === "Dinner at Bellevue"
          ? {
              ...item,
              category: "art_culture",
            }
          : item
      ),
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Central Europe",
    tripId: "central-europe-qa-regression",
  });
  const report = evaluateTripExtractionCoverage({
    expectations: centralEuropeFirstHalfExpectations,
    records,
  });

  assert.ok(report.score < 1);
  assert.deepEqual(
    report.missing.map((item) => item.expectedId).sort(),
    [
      "jan16-kgb",
      "jan16-prague-castle",
      "jan16-r2d2",
      "jan19-ferris-wheel",
      "jan19-schonbrunn",
      "jan21-mazel-tov",
    ]
  );
  assert.deepEqual(report.categoryMismatches, [
    {
      actualCategoryId: "art_culture",
      actualLabel: "Dinner at Bellevue",
      expectedCategoryId: "food_dining",
      expectedId: "jan15-bellevue",
      expectedLabel: "Dinner at Bellevue",
    },
  ]);
});
