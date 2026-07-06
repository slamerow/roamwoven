import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  extractSourceTransportAnchorsFromMaterials,
  SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import { createAuditDiagnostics } from "@/lib/extraction/trip-extraction-audit-diagnostics";
import { createTripExtractionFingerprints } from "@/lib/extraction/trip-extraction-fingerprint";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const embeddedTrainMaterial = {
  filename: "mixed-source.pdf",
  sourceUploadId: "upload-1",
  text: [
    "[PDF text layer]",
    "Friday, January 18th",
    "Train to Vienna",
    "Train Code: 1beb5005",
    "[OCR text from embedded images]",
    "Outbound - Jan 18, 2019",
    "09:20",
    "Praha, Hlavni Nadrazi",
    "04:03h",
    "RegioJet | RJ 1033",
    "13:23",
    "Wien, Hauptbahnhof",
  ].join("\n"),
  type: "pdf_text" as const,
};

function createBaseDraft(sourceAnchors: SourceTransportAnchor[]) {
  return {
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: sourceAnchors,
    },
    activities: [],
    missingDetails: [
      {
        answerType: "time",
        confidence: "medium",
        evidence: "Train to Vienna. Train Code: 1beb5005.",
        guessedValue: null,
        prompt: "What time does Train to Vienna depart?",
        reason: "The departure time is needed for the travel row.",
        relatedTitle: "Train to Vienna",
        subjectType: "transport",
        targetField: "departureTime",
      },
    ],
    places: [
      {
        arriveDate: "2019-01-14",
        city: "Prague",
        country: "Czech Republic",
        leaveDate: "2019-01-18",
      },
      {
        arriveDate: "2019-01-18",
        city: "Vienna",
        country: "Austria",
        leaveDate: "2019-01-21",
      },
    ],
    sensitiveDetails: [],
    stays: [],
    transport: [
      {
        arrival: null,
        arrivalTime: null,
        confirmation: "1beb5005",
        date: "2019-01-18",
        departure: null,
        departureTime: null,
        description: null,
        provider: null,
        title: "Train to Vienna",
        type: "train",
      },
    ],
    tripOverview: {
      dateRange: "January 2019",
      destinationSummary: "Central Europe",
      title: "Central Europe",
    },
  };
}

test("source anchors extract embedded visual train times from mixed PDF text", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const train = anchors.find((anchor) => anchor.kind === "train");

  assert.ok(train, "expected train anchor");
  assert.equal(train.date, "2019-01-18");
  assert.equal(train.departureTime, "09:20");
  assert.equal(train.arrivalTime, "13:23");
  assert.equal(train.departureLocation, "Praha, Hlavni Nadrazi");
  assert.equal(train.arrivalLocation, "Wien, Hauptbahnhof");
  assert.equal(train.provider, "RegioJet");
  assert.equal(train.number, "RJ 1033");
  assert.equal(train.confirmation, "1beb5005");
  assert.deepEqual(train.provenance.sort(), ["ocr", "text_layer"]);
});

test("source anchors repair transport and suppress already-answered time questions", () => {
  const anchors = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const records = createStructuredTripRecordsFromDraft({
    draft: createBaseDraft(anchors),
    fallbackTripName: "Central Europe",
    tripId: "source-anchor-repair",
  });
  const train = records.transport.find(
    (item) => item.routeLabel === "Train to Vienna"
  );

  assert.ok(train, "expected train transport");
  assert.equal(train.departureTime, "09:20");
  assert.equal(train.arrivalTime, "13:23");
  assert.equal(train.departureLocation, "Praha, Hlavni Nadrazi");
  assert.equal(train.arrivalLocation, "Wien, Hauptbahnhof");
  assert.equal(train.provider, "RegioJet");
  assert.equal(
    records.reviewQuestions.some(
      (question) =>
        question.status === "open" &&
        question.prompt.includes("Train to Vienna")
    ),
    false
  );

  const fingerprints = createTripExtractionFingerprints(records);
  assert.deepEqual(fingerprints.openQuestions, []);
  assert.equal(fingerprints.transport.length, 1);
});

test("audit flags source-backed transport anchors missing from final records", () => {
  const [anchor] = extractSourceTransportAnchorsFromMaterials([
    embeddedTrainMaterial,
  ]);
  const records = createStructuredTripRecordsFromDraft({
    draft: {
      activities: [],
      missingDetails: [],
      places: [],
      sensitiveDetails: [],
      stays: [],
      transport: [],
      tripOverview: { title: "Empty" },
    },
    fallbackTripName: "Empty",
    tripId: "source-anchor-missing",
  });
  const diagnostics = createAuditDiagnostics({
    lineage: [],
    records,
    sourceTransportAnchors: [anchor],
  });

  assert.ok(
    diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "critical_transport_source_anchor_missing" &&
        diagnostic.severity === "p0"
    )
  );
});
