import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTravelerAppViewModel } from "@/lib/traveler-view-model";
import {
  classifyAddressSensitivity,
  classifySensitiveText,
} from "@/lib/traveler-privacy";
import type {
  StructuredTripRecords,
  TripItemRecord,
  TripLegRecord,
  TripSourceConfidence,
  TripStayRecord,
} from "@/lib/generated-trip-model";
import type { TravelerAppViewModel } from "@/lib/traveler-view-model";
import { getSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PublishedTripSnapshotPayload = {
  createdFrom: "structured_trip_records";
  recordsSummary: {
    cardCount: number;
    dayCount: number;
    legCount: number;
    privateDetailCount: number;
    sourceConfidence: TripSourceConfidence;
  };
  schemaVersion: 1;
  travelerApp: TravelerAppViewModel;
};

export type PublishedTripSnapshot = {
  createdAt: string | null;
  id: string;
  shareToken: string;
  snapshotJson: PublishedTripSnapshotPayload;
  tripId: string;
  version: number;
};

type PublishedTripSnapshotRow = {
  created_at: string | null;
  id: string;
  share_token: string;
  snapshot_json: unknown;
  trip_id: string;
  version: number | null;
};

type TripPublicationStateRow = {
  published_snapshot_id: string | null;
  status: string | null;
};

function hasSupabaseServerConfig() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey);
}

function hasSupabaseAdminConfig() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return Boolean(url && serviceRoleKey);
}

function normalizeSnapshot(row: PublishedTripSnapshotRow): PublishedTripSnapshot {
  return {
    createdAt: row.created_at,
    id: row.id,
    shareToken: row.share_token,
    snapshotJson: row.snapshot_json as PublishedTripSnapshotPayload,
    tripId: row.trip_id,
    version: row.version ?? 1,
  };
}

function createShareToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getLowestConfidence(records: StructuredTripRecords): TripSourceConfidence {
  const confidences = [
    ...records.days.map((record) => record.sourceConfidence),
    ...records.legs.map((record) => record.sourceConfidence),
    ...records.stays.map((record) => record.sourceConfidence),
    ...records.transport.map((record) => record.sourceConfidence),
    ...records.items.map((record) => record.sourceConfidence),
    ...records.privateDetails.map((record) => record.sourceConfidence),
  ];

  if (confidences.includes("low")) {
    return "low";
  }

  if (confidences.includes("medium")) {
    return "medium";
  }

  return "high";
}

function getPrivateSubjectKeys(records: StructuredTripRecords) {
  return new Set(
    records.privateDetails.map(
      (detail) => `${detail.subjectType}:${detail.subjectId}`
    )
  );
}

function redactSensitiveItem(
  item: TripItemRecord,
  privateSubjectKeys: Set<string>
): TripItemRecord {
  const hasPrivateDetail = privateSubjectKeys.has(`item:${item.id}`);
  const hasSensitiveDescription = Boolean(classifySensitiveText(item.description));
  const hasSensitiveAddress = Boolean(
    classifyAddressSensitivity({
      address: item.address,
      context: `${item.title} ${item.description ?? ""}`,
    })
  );

  return {
    ...item,
    address: hasPrivateDetail || hasSensitiveAddress ? null : item.address,
    description:
      hasPrivateDetail || hasSensitiveDescription
        ? "Protected detail. Enter the trip password to view this in traveler mode."
        : item.description,
  };
}

function redactSensitiveStay(stay: TripStayRecord): TripStayRecord {
  const shouldRedactAddress =
    stay.addressVisibility !== "public" ||
    Boolean(
      classifyAddressSensitivity({
        address: stay.address,
        context: `${stay.name} ${stay.publicLocationLabel ?? ""}`,
      })
    );

  return {
    ...stay,
    address: shouldRedactAddress ? null : stay.address,
    confirmationLabel:
      stay.confirmationVisibility === "public" ? stay.confirmationLabel : null,
  };
}

function redactSensitiveLeg(
  leg: TripLegRecord,
  redactedStays: TripStayRecord[]
): TripLegRecord {
  const stay = redactedStays.find((item) => item.legId === leg.id);

  if (!stay) {
    return leg;
  }

  return leg;
}

export function createPublicSnapshotRecords(
  records: StructuredTripRecords
): StructuredTripRecords {
  const privateSubjectKeys = getPrivateSubjectKeys(records);
  const stays = records.stays.map(redactSensitiveStay);

  return {
    ...records,
    items: records.items.map((item) =>
      redactSensitiveItem(item, privateSubjectKeys)
    ),
    legs: records.legs.map((leg) => redactSensitiveLeg(leg, stays)),
    stays,
  };
}

export function createPublishedTripSnapshotPayload(
  records: StructuredTripRecords
): PublishedTripSnapshotPayload {
  const publicRecords = createPublicSnapshotRecords(records);
  const travelerApp = createTravelerAppViewModel(publicRecords);

  return {
    createdFrom: "structured_trip_records",
    recordsSummary: {
      cardCount: travelerApp.cards.length,
      dayCount: travelerApp.days.length,
      legCount: travelerApp.legs.length,
      privateDetailCount: travelerApp.privacy.privateDetailCount,
      sourceConfidence: getLowestConfidence(publicRecords),
    },
    schemaVersion: 1,
    travelerApp,
  };
}

export async function publishTripSnapshot({
  records,
  tripId,
}: {
  records: StructuredTripRecords;
  tripId: string;
}) {
  if (!hasSupabaseServerConfig() || tripId === "demo-trip") {
    const payload = createPublishedTripSnapshotPayload(records);
    return {
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      shareToken: "demo",
      snapshotJson: payload,
      tripId,
      version: 1,
    } satisfies PublishedTripSnapshot;
  }

  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in to publish this trip.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: latestVersionRow, error: latestVersionError } = await supabase
    .from("published_trip_snapshots")
    .select("version")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    throw new Error(
      `Unable to load latest published version: ${latestVersionError.message}`
    );
  }

  const latestVersion =
    typeof latestVersionRow?.version === "number" ? latestVersionRow.version : 0;
  const version = latestVersion + 1;
  const payload = createPublishedTripSnapshotPayload(records);
  const shareToken = createShareToken();
  const { data, error } = await supabase
    .from("published_trip_snapshots")
    .insert({
      created_by_user_id: user.id,
      share_token: shareToken,
      snapshot_json: payload,
      trip_id: tripId,
      version,
    })
    .select("id,trip_id,version,share_token,snapshot_json,created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to publish trip snapshot: ${error?.message ?? "No row"}`
    );
  }

  const snapshot = normalizeSnapshot(data as unknown as PublishedTripSnapshotRow);
  const { error: tripError } = await supabase
    .from("trips")
    .update({
      processing_status: "published",
      published_app_token: snapshot.shareToken,
      published_at: snapshot.createdAt ?? new Date().toISOString(),
      published_snapshot_id: snapshot.id,
      status: "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .neq("status", "deleted");

  if (tripError) {
    throw new Error(`Unable to mark trip published: ${tripError.message}`);
  }

  return snapshot;
}

export async function getPublishedTripSnapshotByToken(token: string) {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("published_trip_snapshots")
    .select("id,trip_id,version,share_token,snapshot_json,created_at")
    .eq("share_token", token)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load published snapshot: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const snapshot = normalizeSnapshot(data as unknown as PublishedTripSnapshotRow);
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("status,published_snapshot_id")
    .eq("id", snapshot.tripId)
    .maybeSingle();

  if (tripError) {
    throw new Error(`Unable to load trip publication state: ${tripError.message}`);
  }

  const publicationState = trip as unknown as TripPublicationStateRow | null;

  if (
    publicationState?.status === "deleted" ||
    publicationState?.published_snapshot_id !== snapshot.id
  ) {
    return null;
  }

  return snapshot;
}
