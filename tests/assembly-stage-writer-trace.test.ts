import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { createCanonicalizationSummary } from "@/lib/extraction/trip-extraction-audit-snapshot";

function stage(): EvidenceStageInput {
  return {
    label: "Budapest ideas and day mention",
    source: "model_chunk",
    sourceFilename: "sanitized-production-shape.txt",
    stage: {
      activities: [
        {
          category: "art_culture",
          city: "Budapest",
          date: "2030-04-12",
          description: "A loose untimed mention.",
          evidenceRole: "atomic_candidate",
          itemType: "activity",
          title: "Sample Museum",
        },
        {
          category: "art_culture",
          city: "Budapest",
          date: null,
          description: "Sample Museum, Riverside Market",
          evidenceRole: "city_note_candidate",
          itemType: "note",
          sourceSectionType: "city_reference",
          title: "Sample Museum",
        },
      ],
      missingDetails: [],
      places: [
        {
          arriveDate: "2030-04-11",
          city: "Budapest",
          country: "Hungary",
          leaveDate: "2030-04-14",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

export default function run() {
  const result = clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [stage()],
    tripOverview: { dateRange: "April 11-14, 2030", title: "Sample trip" },
  });
  const trace = result.summary.stageWriterTrace;
  const early = trace.find(
    (entry) => entry.writer === "reconcileCardsAgainstCityNotes:early"
  );
  const classifier = trace.find(
    (entry) => entry.writer === "applyIntentBlockClassification"
  );

  assert.ok(early, "early card/note reconciliation is traceable");
  assert.ok(classifier, "classification is traceable");
  assert.ok(early.ordinal < classifier.ordinal, "the trace exposes the current wrong order");
  assert.equal(early.decisionDomain, "pre_classification_mutation");
  assert.equal(trace.every((entry, index) => entry.ordinal === index + 1), true);
  assert.equal(trace.every((entry) => entry.beforeHash.length === 24), true);
  assert.equal(trace.every((entry) => entry.afterHash.length === 24), true);

  const served = createCanonicalizationSummary({
    openai: { evidence: result.summary },
  });
  assert.equal(served.stageWriterTrace.length, trace.length);
  assert.equal(served.stageWriterTrace[early.ordinal - 1]?.writer, early.writer);
  assert.equal(
    JSON.stringify(served.stageWriterTrace).includes("Sample Museum"),
    false,
    "served trace contains hashes and writer names, never source prose"
  );
}
