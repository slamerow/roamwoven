import { getAppliedTripRecords } from "@/lib/applied-trip-records";
import { getEvidenceArtifacts } from "@/lib/extraction/evidence-artifacts";
import {
  listTripProcessingEvents,
  type TripProcessingEvent,
} from "@/lib/extraction/processing-events";
import {
  getLatestTripProcessingRun,
  getTripProcessingRun,
} from "@/lib/extraction/processing-runs";
import {
  createTripExtractionAuditReport,
  type TripExtractionAuditReport,
} from "@/lib/extraction/trip-extraction-audit";
import {
  assessTripAuditReport,
  createTripQualityNotices,
} from "@/lib/extraction/trip-quality-assessment";
import { getMakerTrip } from "@/lib/trips";

type AuditRunSummary = {
  completedAt: string | null;
  createdAt: string | null;
  errorMessage: string | null;
  id: string;
  inputCharCount: number;
  model: string | null;
  runType: string;
  sourceUploadCount: number;
  status: string;
};

type AuditSnapshotSummary = {
  createdAt: string | null;
  id: string;
  processingRunId: string | null;
  source: string;
};

export type TripExtractionAuditPayload = {
  latestRun: AuditRunSummary | null;
  notices: string[];
  processingEvents: TripProcessingEvent[];
  report: TripExtractionAuditReport | null;
  reportRun: AuditRunSummary | null;
  snapshot: AuditSnapshotSummary | null;
  trip: {
    id: string;
    name: string;
    processingStatus: string;
  };
};

function summarizeRun(
  run: Awaited<ReturnType<typeof getLatestTripProcessingRun>>
): AuditRunSummary | null {
  if (!run) {
    return null;
  }

  return {
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    errorMessage: run.errorMessage,
    id: run.id,
    inputCharCount: run.inputCharCount,
    model: run.model,
    runType: run.runType,
    sourceUploadCount: run.sourceUploadIds.length,
    status: run.status,
  };
}

export function createTripExtractionAuditNotices({
  hasRecords,
  latestRun,
  report,
  reportRun,
  snapshot,
}: {
  hasRecords: boolean;
  latestRun: AuditRunSummary | null;
  report: TripExtractionAuditReport | null;
  reportRun: AuditRunSummary | null;
  snapshot: AuditSnapshotSummary | null;
}) {
  const notices = report
    ? createTripQualityNotices(assessTripAuditReport(report))
    : [];

  if (!snapshot) {
    notices.push("No saved draft snapshot exists yet.");
  }

  if (!hasRecords) {
    notices.push("Structured records are not available for this draft yet.");
  }

  if (!latestRun) {
    notices.push("No processing run metadata exists yet.");
  }

  if (
    latestRun &&
    snapshot?.processingRunId &&
    latestRun.id !== snapshot.processingRunId
  ) {
    notices.push(
      "The latest processing run is newer than the latest saved draft snapshot."
    );
  }

  if (reportRun && reportRun.status !== "completed") {
    notices.push(`The report run is ${reportRun.status}.`);
  }

  if (report?.extraction.activityChunks?.failed) {
    notices.push(
      `${report.extraction.activityChunks.failed} activity extraction chunk failed.`
    );
  }

  return notices;
}

export async function getTripExtractionAuditPayload(
  tripId: string
): Promise<TripExtractionAuditPayload> {
  const trip = await getMakerTrip(tripId);
  const [latestRun, appliedRecords, processingEvents] = await Promise.all([
    trip.isDemo ? Promise.resolve(null) : getLatestTripProcessingRun(tripId),
    getAppliedTripRecords({
      fallbackTripName: trip.name,
      isDemo: trip.isDemo,
      tripId,
    }),
    trip.isDemo ? Promise.resolve([]) : listTripProcessingEvents(tripId),
  ]);
  const snapshot = appliedRecords.latestDraft
    ? {
        createdAt: appliedRecords.latestDraft.createdAt,
        id: appliedRecords.latestDraft.id,
        processingRunId: appliedRecords.latestDraft.processingRunId,
        source: appliedRecords.latestDraft.source,
      }
    : null;
  const snapshotRun =
    snapshot?.processingRunId && latestRun?.id !== snapshot.processingRunId
      ? await getTripProcessingRun(snapshot.processingRunId)
      : latestRun;
  const evidenceArtifacts = snapshotRun?.id
    ? await getEvidenceArtifacts({
        processingRunId: snapshotRun.id,
        tripId,
      })
    : null;
  const report =
    appliedRecords.latestDraft && appliedRecords.records
      ? createTripExtractionAuditReport({
          draft: appliedRecords.latestDraft.draftJson,
          evidenceArtifacts,
          records: appliedRecords.records,
          usage: snapshotRun?.openaiUsage ?? latestRun?.openaiUsage,
        })
      : null;
  const latestRunSummary = summarizeRun(latestRun);
  const reportRunSummary = summarizeRun(snapshotRun);

  return {
    latestRun: latestRunSummary,
    notices: createTripExtractionAuditNotices({
      hasRecords: Boolean(appliedRecords.records),
      latestRun: latestRunSummary,
      report,
      reportRun: reportRunSummary,
      snapshot,
    }),
    processingEvents,
    report,
    reportRun: reportRunSummary,
    snapshot,
    trip: {
      id: trip.id,
      name: trip.name,
      processingStatus: trip.processingStatus,
    },
  };
}
