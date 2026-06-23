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
  assert.equal(report.contentMismatches.length, 0);
  assert.equal(report.overCompressed.length, 0);
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

test("extraction QA flags compressed named sights and generic titles", () => {
  const healthyDraft = createCentralEuropeFirstHalfDraft();
  const draft = {
    ...healthyDraft,
    activities: [
      ...healthyDraft.activities.filter(
        (item) =>
          ![
            "Klementinum tour",
            "Albertina",
            "State Hall Library",
            "Time Travel Vienna",
            "Upper and Lower Belvedere",
          ].includes(item.title)
      ),
      {
        address: null,
        category: "art_culture",
        date: "2019-01-15",
        description: "Old Town Square, Jewish Quarter, and Klementinum.",
        endTime: null,
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        startTime: null,
        title: "Prague history sights",
      },
      {
        address: null,
        category: "art_culture",
        date: "2019-01-18",
        description:
          "Albertina, State Hall Library, Time Travel Vienna, Upper and Lower Belvedere.",
        endTime: null,
        itemType: "activity",
        sourceFilename: "central-europe.pdf",
        startTime: null,
        title: "Vienna museums and sights",
      },
    ],
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Central Europe",
    tripId: "central-europe-qa-compressed",
  });
  const report = evaluateTripExtractionCoverage({
    expectations: centralEuropeFirstHalfExpectations,
    records,
  });

  assert.ok(report.score < 1);
  assert.ok(
    report.missing.some((item) => item.expectedId === "jan15-klementinum"),
    "expected generic Prague title to fail the Klementinum card check"
  );
  assert.ok(
    report.missing.some((item) => item.expectedId === "jan18-albertina"),
    "expected compressed Vienna sights to miss discrete Albertina card"
  );
});

test("travel record cleanup keeps destination plans out of transport QA", () => {
  const healthyDraft = createCentralEuropeFirstHalfDraft();
  const draft = {
    ...healthyDraft,
    transport: healthyDraft.transport.map((item) =>
      item.title === "Train to Budapest"
        ? {
            ...item,
            description:
              "Train arrives at Budapest Keleti. Plans for Budapest include Mazel Tov and thermal baths.",
          }
        : item
    ),
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Central Europe",
    tripId: "central-europe-qa-travel-purity",
  });
  const report = evaluateTripExtractionCoverage({
    expectations: centralEuropeFirstHalfExpectations,
    records,
  });

  assert.deepEqual(report.contentMismatches, []);
  assert.match(
    records.transport.find((item) => item.routeLabel === "Train to Budapest")
      ?.description ?? "",
    /^Train arrives at Budapest Keleti\.$/
  );
});
