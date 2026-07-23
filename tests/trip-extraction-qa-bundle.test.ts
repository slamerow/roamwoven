import assert from "node:assert/strict";
import { createTripExtractionQaBundlePayload } from "@/lib/extraction/trip-extraction-qa-bundle";
import type { MaterialExtractionRecord } from "@/lib/extraction/material-extractions";
import type { TripExtractionAuditPayload } from "@/lib/extraction/trip-extraction-audit-view";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import type { TripUpload } from "@/lib/uploads";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const auditPayload: TripExtractionAuditPayload = {
  latestRun: null,
  notices: ["Fresh extractions should include audit snapshots."],
  processingEvents: [
    {
      createdAt: "2026-07-08T00:02:00.000Z",
      details: {
        materialCount: 1,
        nested: {
          confirmationLabel: "ABC123",
        },
        rawText: "door code 2468",
        statusCounts: {
          text_ready: 1,
        },
      },
      errorMessage: "Call +1 555 123 4567 if OCR fails.",
      id: "event-1",
      processingRunId: "run-1",
      stage: "ocr",
      status: "completed",
      tripId: "trip-qa",
    },
  ],
  report: null,
  reportRun: null,
  snapshot: null,
  trip: {
    id: "trip-qa",
    name: "Central Europe QA",
    processingStatus: "parsed",
  },
};

const uploads: TripUpload[] = [
  {
    contentSha256: "sha",
    createdAt: "2026-07-08T00:00:00.000Z",
    fileSizeBytes: 1200,
    fileType: "application/pdf",
    id: "upload-1",
    originalFilename: "central-europe.pdf",
    processingStatus: "uploaded",
    sourceKind: "file",
    storagePath: "owner/trip/upload/file.pdf",
    tripId: "trip-qa",
    userNote: null,
  },
];

const ocrCheckpointText = [
  "Central Europe January 2019",
  "Friday, January 18th",
  "Train to Vienna",
  "Train Code: 1beb5005",
  "Outbound - Jan 18, 2019",
  "09:20",
  "Praha, Hlavni Nadrazi",
  "04:03h",
  "RegioJet | RJ 1033",
  "13:23",
  "Wien, Hauptbahnhof",
  "Friday, January 25th Home Delta Flight 1043 (Operated by Alitalia) Confirmation #GHFHPG FCO -> JFK (10 hours) 14J 2:45 -> 6:45 Delta Flight 2934 (Operated by Alitalia) JFK-> DCA 13D 8:30 PM -> 9:50 PM",
].join("\n");

const checkpoints: MaterialExtractionRecord[] = [
  {
    completedAt: "2026-07-08T00:01:00.000Z",
    createdAt: "2026-07-08T00:00:30.000Z",
    errorMessage: null,
    extractedCharCount: ocrCheckpointText.length,
    extractionMethod: "ocr",
    failureClass: null,
    id: "checkpoint-1",
    metadata: {
      ocrProvider: "openai-responses",
      ocrRawText: "should not leak",
      pageCount: 2,
    },
    status: "text_ready",
    textContent: ocrCheckpointText,
    tripId: "trip-qa",
    updatedAt: "2026-07-08T00:01:00.000Z",
    uploadId: "upload-1",
  },
];

const records: StructuredTripRecords = {
  categories: [],
  days: [],
  items: [
    {
      address: "Public museum address",
      canonicalId: "canonical-item-1",
      categoryId: "art_culture",
      date: "2019-01-18",
      description: "Schonnbrunn palace and gardens.",
      endTime: null,
      id: "item-1",
      itemType: "activity",
      latitude: null,
      legId: "leg-vienna",
      locationName: "Schonnbrunn",
      longitude: null,
      parentItemId: null,
      reviewRequired: true,
      sortOrder: 1,
      sourceConfidence: "high",
      startTime: "15:00",
      status: "confirmed",
      summary: null,
      title: "Schonnbrunn Palace",
      tripId: "trip-qa",
      url: null,
    },
  ],
  legs: [
    {
      arriveDate: "2019-01-18",
      canonicalId: "canonical-leg-vienna",
      city: "Vienna",
      country: "Austria",
      displayName: "Vienna",
      id: "leg-vienna",
      language: null,
      latitude: null,
      leaveDate: "2019-01-21",
      legKey: "vienna",
      longitude: null,
      region: null,
      reviewRequired: false,
      sortOrder: 1,
      sourceConfidence: "high",
      status: "confirmed",
      summary: null,
      timezone: null,
      tripId: "trip-qa",
    },
  ],
  photos: [],
  phrases: [],
  privateDetails: [
    {
      detailType: "door_code",
      id: "private-1",
      label: "Apartment door code",
      reason: "Access instructions should stay private.",
      reviewRequired: true,
      sourceConfidence: "high",
      subjectCanonicalId: "canonical-stay-1",
      subjectId: "stay-1",
      subjectType: "stay",
      tripId: "trip-qa",
      value: "2468",
      visibility: "traveler_password",
    },
  ],
  reviewQuestions: [
    {
      answerType: "confirm",
      answerValue: null,
      canonicalId: "canonical-question-1",
      createdAt: null,
      evidence: "The source says Lunch: U Maliru 1:00 PM.",
      guessedValue: "1:00 PM",
      id: "question-1",
      prompt: "Should U Maliru use 1:00 PM?",
      reason: "This should not become a source-obvious question.",
      resolvedAt: null,
      sourceConfidence: "high",
      status: "open",
      subjectCanonicalId: "canonical-item-lunch",
      subjectId: "item-lunch",
      subjectType: "item",
      targetField: "startTime",
      tripId: "trip-qa",
    },
    {
      answerType: "confirm",
      answerValue: null,
      canonicalId: "canonical-call-1",
      createdAt: null,
      evidence: "Same attraction complex.",
      guessedValue: "Grouped child stops under Schonnbrunn Palace.",
      id: "call-1",
      prompt: "We grouped the Schonnbrunn stops.",
      reason: "Same-site clusters should stay together.",
      resolvedAt: null,
      sourceConfidence: "high",
      status: "noted",
      subjectCanonicalId: "canonical-item-1",
      subjectId: "item-1",
      subjectType: "item",
      targetField: null,
      tripId: "trip-qa",
    },
    // Run 7.23.2 chain 8.3: dismissed questions used to reach the bundle
    // as a bare count — the content and the dismissal reason now ship so
    // a wrong dismissal (the chain-7 baths shape) can be quoted, not
    // inferred.
    {
      answerType: "single_choice",
      answerValue: null,
      canonicalId: "canonical-question-dismissed",
      createdAt: null,
      dismissalReason:
        "subject entity no longer exists after assembly; a review item cannot outlive its subject",
      evidence: "Day title: Budapest Bathing",
      guessedValue: null,
      id: "question-dismissed",
      prompt: "Which bath house is planned?",
      reason: "The day title commits a bathing slot.",
      resolvedAt: null,
      sourceConfidence: "high",
      status: "dismissed",
      subjectCanonicalId: "canonical-item-baths",
      subjectId: "item-baths",
      subjectType: "item",
      targetField: "subject",
      tripId: "trip-qa",
    },
  ],
  stays: [
    {
      accessDetailsVisibility: "traveler_password",
      address: "Private apartment address",
      addressVisibility: "traveler_password",
      bookingUrl: null,
      canonicalId: "canonical-stay-1",
      checkInDate: "2019-01-18",
      checkInTime: "14:30",
      checkOutDate: "2019-01-21",
      checkOutTime: null,
      confirmationLabel: "ABC123",
      confirmationVisibility: "traveler_password",
      id: "stay-1",
      latitude: null,
      legId: "leg-vienna",
      longitude: null,
      name: "Vienna apartment",
      privateDetailIds: ["private-1"],
      publicLocationLabel: "Vienna",
      reviewRequired: false,
      sourceConfidence: "high",
      status: "confirmed",
      stayType: "apartment",
      tripId: "trip-qa",
    },
  ],
  transport: [
    {
      arrivalLocation: "Wien Hauptbahnhof",
      arrivalTime: "13:23",
      bookingUrl: null,
      bookingUrlVisibility: "public",
      canonicalId: "canonical-transport-1",
      confirmationLabel: "RJ1033",
      confirmationVisibility: "public",
      date: "2019-01-18",
      departureLocation: "Praha Hlavni Nadrazi",
      departureTime: "09:20",
      description: "RegioJet RJ 1033.",
      fromLegId: "leg-prague",
      id: "transport-1",
      legId: "leg-vienna",
      privateDetailIds: [],
      provider: "RegioJet",
      reviewRequired: false,
      routeLabel: "Prague to Vienna train",
      sourceConfidence: "high",
      status: "confirmed",
      toLegId: "leg-vienna",
      transportType: "train",
      tripId: "trip-qa",
    },
  ],
  trip: {
    destinationSummary: "Prague, Vienna",
    endDate: "2019-01-21",
    id: "trip-qa",
    name: "Central Europe QA",
    startDate: "2019-01-18",
    travelerAppTitle: "Central Europe QA",
  },
  weatherHooks: [],
};

test("QA bundle redacts private values and raw material text by default", () => {
  const bundle = createTripExtractionQaBundlePayload({
    auditPayload,
    checkpoints,
    records,
    uploads,
  });

  assert.equal(bundle.redaction.privateDetailValues, "redacted");
  assert.equal(bundle.materialPipeline.checkpoints[0]?.textPreview, null);
  assert.equal(bundle.materialPipeline.checkpoints[0]?.textPreviewRedacted, true);
  assert.equal("ocrRawText" in bundle.materialPipeline.checkpoints[0]?.metadata!, false);
  const trainAnchor = bundle.materialPipeline.sourceAnchors.transport.find(
    (anchor) => anchor.kind === "train"
  );
  const jfkToDcaAnchor = bundle.materialPipeline.sourceAnchors.transport.find(
    (anchor) =>
      anchor.kind === "flight" &&
      anchor.departureLocation === "JFK" &&
      anchor.arrivalLocation === "DCA"
  );
  assert.ok(trainAnchor, "expected OCR checkpoint train anchor");
  assert.equal(trainAnchor.departureTime, "09:20");
  assert.equal(trainAnchor.arrivalTime, "13:23");
  assert.deepEqual(trainAnchor.provenance, ["ocr"]);
  assert.ok(jfkToDcaAnchor, "expected OCR checkpoint JFK to DCA anchor");
  assert.equal(jfkToDcaAnchor.departureTime, "20:30");
  assert.equal(jfkToDcaAnchor.arrivalTime, "21:50");
  assert.match(jfkToDcaAnchor.evidence ?? "", /JFK/);
  assert.equal(
    bundle.materialPipeline.sourceAnchors.coverage.materialTransportAnchors,
    3
  );
  assert.equal(
    bundle.materialPipeline.sourceAnchors.coverage.finalMatchedTransportAnchors,
    1
  );
  assert.equal(
    bundle.materialPipeline.sourceAnchors.coverage.missingFromFinalRecords.length,
    2
  );
  assert.equal(
    bundle.materialPipeline.diagnostics[0]?.code,
    "material_transport_anchor_missing_final"
  );
  assert.equal(bundle.materialPipeline.diagnostics[0]?.severity, "p0");
  assert.equal(bundle.records?.privateDetails[0]?.value, "[redacted private detail]");
  assert.equal(bundle.records?.stays[0]?.address, "[redacted stay address]");
  assert.equal(bundle.records?.stays[0]?.confirmationLabel, "[redacted confirmation]");
  assert.equal(bundle.records?.transport[0]?.departureTime, "09:20");
  assert.equal(bundle.records?.counts.actionRequiredReviewItems, 1);
  assert.equal(bundle.records?.counts.reviewRequiredRecords, 1);
  assert.equal(
    bundle.records?.review.internalSignals.rawReviewRequiredRecords,
    1
  );
  assert.equal(
    bundle.records?.review.internalSignals.privateDetailsNeedingReview,
    1
  );
  assert.equal(bundle.records?.review.reviewPageActionCount, 1);
  const reviewPageSections = Object.fromEntries(
    bundle.records?.review.reviewPageSections.map((section) => [
      section.id,
      section.visibleItems,
    ]) ?? []
  );
  assert.equal(reviewPageSections.activities, 0);
  assert.equal(reviewPageSections.notes, 1);
  assert.equal(reviewPageSections.questions, 1);
  assert.equal(reviewPageSections["private-details"], 0);
  assert.equal(bundle.records?.review.openQuestions.length, 1);
  assert.equal(bundle.records?.review.calls.length, 1);
  assert.equal(bundle.records?.counts.dismissedQuestions, 1);
  assert.equal(bundle.records?.review.dismissedQuestions.length, 1);
  assert.equal(
    bundle.records?.review.dismissedQuestions[0]?.prompt,
    "Which bath house is planned?"
  );
  assert.match(
    bundle.records?.review.dismissedQuestions[0]?.dismissalReason ?? "",
    /cannot outlive its subject/
  );
  assert.equal(bundle.audit.processingEvents[0]?.details.rawText, "[redacted value]");
  assert.equal(
    (bundle.audit.processingEvents[0]?.details.nested as Record<string, unknown>)
      .confirmationLabel,
    "[redacted value]"
  );
  assert.equal(
    bundle.audit.processingEvents[0]?.errorMessage,
    "Call [redacted phone] if OCR fails."
  );
});

test("QA bundle can include private debug previews when explicitly requested", () => {
  const bundle = createTripExtractionQaBundlePayload({
    auditPayload,
    checkpoints,
    includePrivate: true,
    records,
    uploads,
  });

  assert.equal(bundle.redaction.privateDetailValues, "included");
  assert.match(
    bundle.materialPipeline.checkpoints[0]?.textPreview ?? "",
    /Train to Vienna/
  );
  assert.match(
    bundle.materialPipeline.checkpoints[0]?.textPreview ?? "",
    /09:20/
  );
  assert.equal(bundle.records?.privateDetails[0]?.value, "2468");
  assert.equal(bundle.records?.stays[0]?.address, "Private apartment address");
  assert.equal(bundle.records?.stays[0]?.confirmationLabel, "ABC123");
  assert.equal(bundle.audit.processingEvents[0]?.details.rawText, "door code 2468");
});
