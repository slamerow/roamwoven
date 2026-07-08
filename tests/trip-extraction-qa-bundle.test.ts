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

const checkpoints: MaterialExtractionRecord[] = [
  {
    completedAt: "2026-07-08T00:01:00.000Z",
    createdAt: "2026-07-08T00:00:30.000Z",
    errorMessage: null,
    extractedCharCount: 88,
    extractionMethod: "ocr",
    failureClass: null,
    id: "checkpoint-1",
    metadata: {
      ocrProvider: "openai-responses",
      ocrRawText: "should not leak",
      pageCount: 2,
    },
    status: "text_ready",
    textContent:
      "Train to Vienna 09:20 Praha Hlavni Nadrazi 13:23 Wien Hauptbahnhof",
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
      reviewRequired: false,
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
      createdAt: null,
      evidence: "The source says Lunch: U Maliru 1:00 PM.",
      guessedValue: "1:00 PM",
      id: "question-1",
      prompt: "Should U Maliru use 1:00 PM?",
      reason: "This should not become a source-obvious question.",
      resolvedAt: null,
      sourceConfidence: "high",
      status: "open",
      subjectId: "item-lunch",
      subjectType: "item",
      targetField: "startTime",
      tripId: "trip-qa",
    },
    {
      answerType: "confirm",
      answerValue: null,
      createdAt: null,
      evidence: "Same attraction complex.",
      guessedValue: "Grouped child stops under Schonnbrunn Palace.",
      id: "call-1",
      prompt: "We grouped the Schonnbrunn stops.",
      reason: "Same-site clusters should stay together.",
      resolvedAt: null,
      sourceConfidence: "high",
      status: "noted",
      subjectId: "item-1",
      subjectType: "item",
      targetField: null,
      tripId: "trip-qa",
    },
  ],
  stays: [
    {
      accessDetailsVisibility: "traveler_password",
      address: "Private apartment address",
      addressVisibility: "traveler_password",
      bookingUrl: null,
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
  assert.equal(bundle.records?.privateDetails[0]?.value, "[redacted private detail]");
  assert.equal(bundle.records?.stays[0]?.address, "[redacted stay address]");
  assert.equal(bundle.records?.stays[0]?.confirmationLabel, "[redacted confirmation]");
  assert.equal(bundle.records?.transport[0]?.departureTime, "09:20");
  assert.equal(bundle.records?.review.openQuestions.length, 1);
  assert.equal(bundle.records?.review.calls.length, 1);
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
    /Train to Vienna 09:20/
  );
  assert.equal(bundle.records?.privateDetails[0]?.value, "2468");
  assert.equal(bundle.records?.stays[0]?.address, "Private apartment address");
  assert.equal(bundle.records?.stays[0]?.confirmationLabel, "ABC123");
  assert.equal(bundle.audit.processingEvents[0]?.details.rawText, "door code 2468");
});
