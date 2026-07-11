import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/lib/extraction/draft-to-structured-trip";
import {
  assertTripDraftQuality,
  TripDraftQualityGateError,
} from "@/lib/extraction/trip-quality-gate";
import { SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY } from "@/lib/extraction/source-transport-anchors";

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

  assert.throws(
    () => assertTripDraftQuality({ draft, records }),
    TripDraftQualityGateError
  );
}
