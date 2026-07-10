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

test("material budget preserves source-backed transport evidence when trimming", () => {
  const filler = Array.from(
    { length: 120 },
    (_, index) =>
      `Low-priority screenshot line ${index}: traveler notes, site copy, and duplicate page chrome.`
  );
  const trainEvidence = [
    "Thursday, January 24, 2019",
    "Train to Vienna",
    "Train Code: 1beb5005",
    "09:20 Praha, Hlavni Nadrazi",
    "RegioJet | RJ 1033",
    "13:23 Wien, Hauptbahnhof",
  ].join("\n");
  const result = optimizeTripExtractionMaterials({
    materials: [
      {
        filename: "prague-vienna-train.png",
        sourceProvenance: "ocr",
        sourceUploadId: "upload-train",
        text: [...filler, trainEvidence, ...filler].join("\n"),
        type: "file_text",
      },
    ],
    perMaterialCharBudget: 1400,
    totalCharBudget: 1400,
  });
  const submittedText = result.materials[0]?.text ?? "";

  assert.match(
    submittedText,
    /extraction-critical source travel evidence preserved/
  );
  assert.match(submittedText, /Train to Vienna/);
  assert.match(submittedText, /09:20 Praha, Hlavni Nadrazi/);
  assert.match(submittedText, /RegioJet \| RJ 1033/);
  assert.match(submittedText, /13:23 Wien, Hauptbahnhof/);
  assert.ok(
    submittedText.length <= 1500,
    "expected preserved evidence to stay inside the model budget"
  );
});
