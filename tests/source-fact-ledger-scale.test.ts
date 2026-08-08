import assert from "node:assert/strict";

import { buildSourceCoverageV4 } from "@/lib/extraction/source-coverage-v4";
import { buildSourceDocumentIndexV1 } from "@/lib/extraction/source-document-index";
import { buildSourceFactLedgerV1 } from "@/lib/extraction/source-fact-ledger";

const SHAPES = [
  {
    filename: "booking-shaped.txt",
    sourceUploadId: "shape-booking",
    text: "Monday, April 7th\nRail transfer 08:10\nReservation ZX91-QP77\nDoor code 4412",
    stage: {
      activities: [
        {
          evidence: "Rail transfer 08:10",
          evidenceRole: "atomic_candidate",
          sourceSectionLabel: "Monday, April 7th",
          title: "Rail transfer",
        },
      ],
      sensitiveDetails: [
        {
          evidence: "Door code 4412",
          relatedTitle: "Apartment access",
          sourceSectionLabel: "Monday, April 7th",
        },
      ],
    },
  },
  {
    filename: "recommendations-shaped.txt",
    sourceUploadId: "shape-recommendations",
    text: "Tuesday, April 8th\nMaybe visit the design museum\nCould try the riverside market",
    stage: {
      activities: [
        {
          evidence: "Maybe visit the design museum",
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceSectionLabel: "Tuesday, April 8th",
          title: "Design museum",
        },
      ],
    },
  },
  {
    filename: "spreadsheet-shaped.csv",
    sourceUploadId: "shape-spreadsheet",
    text: "Wednesday, April 9th\nHotel Example,15:00,check-in\nTrain 44,18:20,Central Station",
    stage: {
      stays: [
        {
          evidence: "Hotel Example",
          name: "Hotel Example",
          sourceSectionLabel: "Wednesday, April 9th",
        },
      ],
      transport: [
        {
          evidence: "Train 44",
          routeLabel: "Train 44",
          sourceSectionLabel: "Wednesday, April 9th",
        },
      ],
    },
  },
  {
    filename: "freeform-shaped.txt",
    sourceUploadId: "shape-freeform",
    text: "Thursday, April 10th\nWalk uphill after breakfast\nOld observatory if weather is clear\nBudget: $120",
    stage: {
      activities: [
        {
          evidence: "Walk uphill after breakfast",
          evidenceRole: "atomic_candidate",
          sourceSectionLabel: "Thursday, April 10th",
          title: "Uphill walk",
        },
      ],
    },
  },
] as const;

export default function run() {
  const durations: number[] = [];
  const byteSizes: number[] = [];
  for (let iteration = 0; iteration < 40; iteration += 1) {
    for (const shape of SHAPES) {
      const index = buildSourceDocumentIndexV1([
        { ...shape, sourceProvenance: "sanitized_test", type: "text" },
      ]);
      const startedAt = performance.now();
      const ledger = buildSourceFactLedgerV1({
        index,
        stages: [
          {
            label: shape.filename,
            source: "model_chunk",
            sourceSpanIds: index.spans.map((span) => span.spanId),
            sourceUploadId: shape.sourceUploadId,
            stage: shape.stage,
          },
        ],
      });
      const coverage = buildSourceCoverageV4({ factSet: ledger.factSet, index });
      assert.equal(coverage.entries.length, index.spans.length);
      durations.push(performance.now() - startedAt);
      byteSizes.push(ledger.metrics.serializedByteSize);
    }
  }
  durations.sort((left, right) => left - right);
  byteSizes.sort((left, right) => left - right);
  const p95Index = Math.ceil(durations.length * 0.95) - 1;
  assert.ok(durations[p95Index] < 200, "p95 ledger build must remain under 200ms");
  assert.ok(byteSizes[p95Index] < 256 * 1024, "p95 ledger must remain under 256KB");
  assert.ok(byteSizes.at(-1)! < 1024 * 1024, "no ledger may exceed 1MB");

  const aggregate = {
    byteSizes,
    durations,
    schemas: [1, 4],
  };
  const collectStrings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(collectStrings);
    if (value && typeof value === "object") {
      return Object.values(value).flatMap(collectStrings);
    }
    return [];
  };
  const aggregateStringValues = collectStrings(aggregate).join("\n");
  for (const protectedValue of ["ZX91-QP77", "4412", "Door code"]) {
    // Numeric timings can coincidentally contain the digit sequence 4412 when
    // JSON-stringified (for example 0.144125 ms). Privacy is about persisted
    // string values, not the decimal spelling of aggregate measurements.
    assert.doesNotMatch(
      aggregateStringValues,
      new RegExp(protectedValue, "i")
    );
  }
}
