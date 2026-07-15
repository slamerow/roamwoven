import assert from "node:assert/strict";
import { createStructuredTripRecordsFromDraft } from "@/tests/helpers/canonical-structured-records";
import {
  assessTripAuditReport,
  assessTripDraftQuality,
  attachTripQualityAssessment,
  createTripQualityNotices,
} from "@/lib/extraction/trip-quality-assessment";
import { createTripExtractionAuditNotices } from "@/lib/extraction/trip-extraction-audit-view";
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

  const p0 = assessment.p0Diagnostics[0];
  assert.ok(p0);
  const contradictoryReport = {
    ...assessment.report,
    diagnostics: [
      {
        ...p0,
        code: "critical_transport_not_travel_row" as const,
        severity: "p0" as const,
      },
      {
        ...p0,
        code: "day_overview_activity_survived" as const,
        severity: "p0" as const,
      },
      {
        ...p0,
        code: "duplicate_same_venue_activity" as const,
        severity: "p1" as const,
      },
    ],
    structured: {
      ...assessment.report.structured,
      hardWarnings: 6,
      openQuestions: 0,
      quietWarnings: 0,
    },
    warnings: Array.from({ length: 6 }, (_, index) => ({
      severity: "hard" as const,
      subjectId: "item-" + String(index + 1),
      subjectType: "item" as const,
      title: "Hard warning " + String(index + 1),
    })),
  };
  const contradictoryAssessment = assessTripAuditReport(contradictoryReport);

  assert.equal(contradictoryAssessment.disposition, "needs_review");
  assert.equal(contradictoryAssessment.p0Diagnostics.length, 2);
  assert.equal(contradictoryAssessment.p1Diagnostics.length, 1);
  assert.equal(contradictoryAssessment.hardWarnings.length, 6);
  assert.deepEqual(createTripQualityNotices(contradictoryAssessment), [
    "Semantic audit found 2 P0 issues and 1 P1 issue.",
    "Structured review found 6 hard warnings.",
  ]);
  const auditNotices = createTripExtractionAuditNotices({
    hasRecords: true,
    latestRun: null,
    report: contradictoryReport,
    reportRun: null,
    snapshot: {
      createdAt: "2026-07-15T00:00:00.000Z",
      id: "snapshot-1",
      processingRunId: "run-1",
      source: "extraction",
    },
  });

  assert.equal(auditNotices.includes("No audit notices."), false);
  assert.deepEqual(auditNotices.slice(0, 2), [
    "Semantic audit found 2 P0 issues and 1 P1 issue.",
    "Structured review found 6 hard warnings.",
  ]);
}
