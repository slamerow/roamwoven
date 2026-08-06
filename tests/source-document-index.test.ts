import assert from "node:assert/strict";

import {
  buildSourceDocumentIndexV1,
  sourceSpanIdsForMaterialTextV1,
  sourceSpanRefsV1,
} from "@/lib/extraction/source-document-index";
import { createActivityExtractionChunks } from "@/lib/extraction/openai-trip-parser";

const material = {
  filename: "sanitized-itinerary.txt",
  sourceProvenance: "manual_note",
  sourceUploadId: "upload-sanitized",
  text: [
    "Tuesday, April 8 — Old Quarter & Citadel",
    "Citadel visit",
    "Changing of the Guard - 12:00",
    "Cathedral",
    "Cathedral",
    "maybe History Museum",
  ].join("\n"),
  type: "note",
} as const;

export default function run() {
  const first = buildSourceDocumentIndexV1([material]);
  const second = buildSourceDocumentIndexV1([{ ...material }]);

  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.deepEqual(
    sourceSpanRefsV1(first),
    sourceSpanRefsV1(second),
    "identical source bytes must rebuild identical span ids"
  );
  assert.ok(
    first.spans.every(
      (span) =>
        span.spanId.startsWith("span_") &&
        span.materialFingerprint.length === 64 &&
        span.excerptDigest.length === 64
    )
  );
  assert.equal(
    new Set(first.spans.map((span) => span.spanId)).size,
    first.spans.length,
    "duplicate source lines remain distinct occurrences"
  );
  assert.equal(
    first.spans.filter((span) => span.normalizedClause === "cathedral").length,
    2
  );

  const reorderedChunks = [
    "maybe History Museum\nCathedral",
    "Citadel visit\nChanging of the Guard - 12:00",
  ];
  const idsBefore = reorderedChunks.map((text) =>
    sourceSpanIdsForMaterialTextV1({ index: first, material, text })
  );
  const idsAfter = [...reorderedChunks]
    .reverse()
    .map((text) =>
      sourceSpanIdsForMaterialTextV1({ index: first, material, text })
    )
    .reverse();
  assert.deepEqual(idsBefore, idsAfter, "chunk order cannot change source ids");

  const chunkIds = createActivityExtractionChunks([material], 90, first)
    .flatMap((chunk) => chunk.sourceSpanIds)
    .sort();
  assert.deepEqual(
    [...new Set(chunkIds)],
    first.spans.map((span) => span.spanId).sort(),
    "chunks reference the pre-existing index instead of minting chunk ids"
  );

  assert.deepEqual(
    sourceSpanRefsV1(first).map((span) => Object.keys(span).sort()),
    sourceSpanRefsV1(first).map(() =>
      [
        "clauseOrdinal",
        "excerptDigest",
        "lineOccurrence",
        "materialFingerprint",
        "sourceIdentityHash",
        "sourceUploadId",
        "spanId",
      ].sort()
    ),
    "persistable span refs contain locations and digests, never source prose"
  );
}
