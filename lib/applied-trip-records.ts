import {
  getLatestTripDraftSnapshot,
  type TripDraftSnapshot,
} from "@/lib/extraction/processing-runs";
import { readStructuredTripSnapshot } from "@/lib/extraction/structured-trip-snapshot";
import { applyReviewDecisions } from "@/lib/generated-trip-decisions";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { listTripReviewDecisions } from "@/lib/review-decisions";
import { getAsiaDemoStructuredTripRecords } from "@/lib/traveler-view-model";

export type AppliedTripRecordsResult = {
  latestDraft: TripDraftSnapshot | null;
  records: StructuredTripRecords | null;
};

export async function getAppliedTripRecords({
  fallbackTripName,
  isDemo = false,
  tripId,
}: {
  fallbackTripName: string;
  isDemo?: boolean;
  tripId: string;
}): Promise<AppliedTripRecordsResult> {
  if (isDemo || tripId === "demo-trip") {
    return {
      latestDraft: null,
      records: getAsiaDemoStructuredTripRecords(),
    };
  }

  const latestDraft = await getLatestTripDraftSnapshot(tripId);

  if (!latestDraft) {
    return {
      latestDraft: null,
      records: null,
    };
  }

  const records = readStructuredTripSnapshot(latestDraft.draftJson);
  if (!records) {
    return { latestDraft, records: null };
  }
  const reviewDecisions = await listTripReviewDecisions(tripId);

  return {
    latestDraft,
    records: applyReviewDecisions(records, reviewDecisions),
  };
}
