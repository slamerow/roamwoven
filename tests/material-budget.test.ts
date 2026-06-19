import assert from "node:assert/strict";
import { optimizeTripExtractionMaterials } from "@/lib/extraction/material-budget";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("material budget removes repeated boilerplate and reports reduction", () => {
  const boilerplate = "Terms and conditions apply.";
  const materials = [
    {
      filename: "flight.pdf",
      text: [
        "Flight BA 123 departs at 7:00 PM.",
        boilerplate,
        boilerplate,
        boilerplate,
        "Record locator ABC123.",
      ].join("\n"),
      type: "pdf_text" as const,
    },
  ];
  const result = optimizeTripExtractionMaterials({
    materials,
    perMaterialCharBudget: 1000,
    totalCharBudget: 1000,
  });

  assert.equal(result.materials.length, 1);
  assert.equal(
    (result.materials[0]?.text.match(/Terms and conditions apply/g) ?? [])
      .length,
    2
  );
  assert.ok(
    result.summary.submittedCharCount < result.summary.rawCharCount,
    "expected submitted text to be smaller than raw text"
  );
  assert.ok(result.summary.estimatedInputTokens > 0);
});

test("material budget caps large material bundles before model submission", () => {
  const longText = Array.from({ length: 200 }, (_, index) =>
    `Important reservation line ${index}: hotel, flight, dinner, and transfer details.`
  ).join("\n");
  const result = optimizeTripExtractionMaterials({
    materials: [
      { filename: "hotel.pdf", text: longText, type: "pdf_text" },
      { filename: "airline.pdf", text: longText, type: "pdf_text" },
    ],
    perMaterialCharBudget: 2000,
    totalCharBudget: 2500,
  });

  assert.equal(result.materials.length, 2);
  assert.ok(result.summary.submittedCharCount <= 2600);
  assert.equal(result.summary.truncatedMaterialCount, 2);
});
