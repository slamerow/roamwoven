import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  assessTripDraftQuality,
  attachTripQualityAssessment,
} from "@/lib/extraction/trip-quality-assessment";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";
import { prepareTripDraftForReview } from "@/lib/extraction/trip-spine-validation";

export default function run() {
  const draft = {
    _evidence: {
      canonicalPieceIds: [],
      observationIds: [],
      version: 2,
    },
    [SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]: {
      transport: [
        {
          anchorId: "missing-flight",
          arrivalLocation: "BBB",
          arrivalTime: "12:00",
          confidence: "high",
          confirmation: "ABC123",
          date: "2030-05-01",
          departureLocation: "AAA",
          departureTime: "10:00",
          evidence: "Booked flight AAA to BBB at 10:00.",
          kind: "flight",
          number: "EX 100",
          provider: "Example Air",
          provenance: ["ocr"],
          routeLabel: "AAA to BBB",
          sourceFilename: "trip.pdf",
          sourceUploadId: "upload-1",
        },
      ],
    },
    activities: [],
    missingDetails: [],
    places: [
      {
        arriveDate: "2030-05-01",
        city: "Sample City",
        country: "Example",
        leaveDate: "2030-05-02",
      },
    ],
    stays: [],
    transport: [],
    tripOverview: {
      dateRange: "May 1-2, 2030",
      destinationSummary: "Sample City",
      title: "Sample Trip",
    },
  };
  const records = createStructuredTripRecordsFromDraft({
    draft,
    fallbackTripName: "Sample Trip",
    tripId: "quality-gate-trip",
  });

  const assessment = assessTripDraftQuality({ draft, records });
  const reviewableDraft = attachTripQualityAssessment({ assessment, draft });

  assert.equal(assessment.disposition, "needs_review");
  assert.equal(assessment.p0Diagnostics.length, 1);
  assert.equal(
    (reviewableDraft._qualityAssessment as { disposition?: string }).disposition,
    "needs_review"
  );
  assert.deepEqual(
    (reviewableDraft as Record<string, unknown>).transport,
    []
  );

  const sparseDraft = prepareTripDraftForReview({
    activities: [],
    missingDetails: [],
    places: [],
    stays: [],
    transport: [],
    tripOverview: {},
  });
  const sparseRecords = createStructuredTripRecordsFromDraft({
    draft: sparseDraft,
    fallbackTripName: "Untitled trip",
    tripId: "sparse-review-trip",
  });

  assert.equal(
    (sparseDraft._processingReview as { disposition?: string }).disposition,
    "needs_review"
  );
  assert.ok(
    sparseRecords.reviewQuestions.some(
      (question) => question.prompt === "What dates should this trip cover?"
    )
  );
}
