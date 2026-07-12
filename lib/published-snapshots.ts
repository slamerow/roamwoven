import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createTravelerAppViewModel } from "@/lib/traveler-view-model";
import {
  classifyAddressSensitivity,
  classifySensitiveText,
  shouldProtectPublicItemText,
} from "@/lib/trip-privacy-policy";
import type {
  StructuredTripRecords,
  TripPrivateDetailRecord,
  TripItemRecord,
  TripSourceConfidence,
  TripStayRecord,
  TripTransportRecord,
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

export class PublicSnapshotPrivacyError extends Error {
  constructor(public leaks: string[]) {
    super(
      `Public snapshot privacy validation failed: ${leaks.join(", ")}.`
    );
    this.name = "PublicSnapshotPrivacyError";
  }
}

export type PublishedTripPrivateDetail = {
  detailId: string;
  label: string;
  reason: string | null;
  subjectId: string;
  subjectType: string;
  value: string;
  visibility: string;
};

type PublishedTripSnapshotRow = {
  created_at: string | null;
  id: string;
  share_token: string;
  snapshot_json: unknown;
  trip_id: string;
  version: number | null;
};

type PublishedTripPrivateDetailRow = {
  detail_id: string;
  label: string;
  reason: string | null;
  subject_id: string;
  subject_type: string;
  value: string;
  visibility: string;
};

type TripPublicationStateRow = {
  published_snapshot_id: string | null;
  traveler_password_enabled: boolean | null;
  traveler_password_hash: string | null;
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
  privateSubjectKeys: Set<string>,
  protectedLodgingAddresses: Set<string>
): TripItemRecord {
  const hasPrivateDetail = privateSubjectKeys.has(`item:${item.id}`);
  const normalizedAddress = normalizedLeakValue(item.address);
  const descriptionText = normalizedLeakValue(item.description);
  const repeatsProtectedLodgingAddress = Boolean(
    (normalizedAddress && protectedLodgingAddresses.has(normalizedAddress)) ||
      Array.from(protectedLodgingAddresses).some(
        (address) => descriptionText && descriptionText.includes(address)
      )
  );
  const hasSensitiveDescription = shouldProtectPublicItemText({
    text: item.description,
    title: item.title,
  });
  const hasSensitiveAddress = Boolean(
    classifyAddressSensitivity({
      address: item.address,
      context: `${item.title} ${item.description ?? ""}`,
    })
  );

  return {
    ...item,
    address:
      hasPrivateDetail || hasSensitiveAddress || repeatsProtectedLodgingAddress
        ? null
        : item.address,
    description:
      hasPrivateDetail || hasSensitiveDescription || repeatsProtectedLodgingAddress
        ? "Protected detail. Enter the trip password to view this in traveler mode."
        : item.description,
  };
}

function redactSensitiveTransport(
  transport: TripTransportRecord
): TripTransportRecord {
  const hasSensitiveDescription = Boolean(
    classifySensitiveText(transport.description)
  );

  return {
    ...transport,
    bookingUrl: null,
    confirmationLabel: null,
    description: hasSensitiveDescription
      ? "Protected travel detail. Enter the trip password to view it."
      : transport.description,
  };
}

function redactSensitiveStay(stay: TripStayRecord): TripStayRecord {
  return {
    ...stay,
    address: null,
    bookingUrl: null,
    confirmationLabel: null,
  };
}

export function createPublishedPrivateDetails(
  records: StructuredTripRecords
): TripPrivateDetailRecord[] {
  return records.privateDetails.filter(
    (detail) =>
      detail.visibility === "traveler_password" ||
      detail.visibility === "maker_only"
  );
}

export function createPublicSnapshotRecords(
  records: StructuredTripRecords
): StructuredTripRecords {
  const privateSubjectKeys = getPrivateSubjectKeys(records);
  const protectedLodgingAddresses = new Set(
    records.stays
      .map((stay) => stay.address)
      .filter((address): address is string => looksLikeExactAddress(address))
      .map(normalizedLeakValue)
  );
  const stays = records.stays.map(redactSensitiveStay);

  return {
    ...records,
    items: records.items.map((item) =>
      redactSensitiveItem(item, privateSubjectKeys, protectedLodgingAddresses)
    ),
    legs: records.legs,
    stays,
    transport: records.transport.map(redactSensitiveTransport),
  };
}

function normalizedLeakValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function looksLikeExactAddress(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return Boolean(
    text.length >= 8 &&
      (/\d|,/.test(text) ||
        /\b(?:avenue|boulevard|floor|lane|platz|road|route|square|strasse|straße|street|via|way)\b/i.test(
          text
        ))
  );
}

export function findPublicSnapshotPrivacyLeaks({
  payload,
  records,
}: {
  payload: PublishedTripSnapshotPayload;
  records: StructuredTripRecords;
}) {
  const publicText = JSON.stringify(payload).toLowerCase();
  const protectedValues = [
    ...records.stays.flatMap((stay) => [
      {
        checkExact: looksLikeExactAddress(stay.address),
        label: `stay address ${stay.id}`,
        value: stay.address,
      },
      { checkExact: true, label: `stay confirmation ${stay.id}`, value: stay.confirmationLabel },
      { checkExact: true, label: `stay booking URL ${stay.id}`, value: stay.bookingUrl },
    ]),
    ...records.transport.flatMap((transport) => [
      {
        checkExact: true,
        label: `travel confirmation ${transport.id}`,
        value: transport.confirmationLabel,
      },
      { checkExact: true, label: `travel booking URL ${transport.id}`, value: transport.bookingUrl },
    ]),
    ...records.privateDetails
      .filter((detail) =>
        detail.visibility === "traveler_password" ||
        detail.visibility === "maker_only"
      )
      .map((detail) => ({
        checkExact:
          !detail.detailType.toLowerCase().includes("address") ||
          looksLikeExactAddress(detail.value),
        label: `private detail ${detail.id}`,
        value: detail.value,
      })),
  ];
  const exactLeaks = protectedValues
    .filter(({ checkExact, value }) => checkExact && normalizedLeakValue(value).length >= 3)
    .filter(({ value }) => publicText.includes(normalizedLeakValue(value)))
    .map(({ label }) => label);
  const universalSecretPatterns: Array<[string, RegExp]> = [
    ["access credential", /\b(?:door|gate|lockbox|access|entry)\s*(?:code|pin)\b[^.]{0,80}/i],
    ["Wi-Fi password", /\bwi-?fi\b[^.]{0,40}\b(?:password|passcode)\b/i],
    ["passport or payment data", /\b(?:passport|credit card|card number|cvv|cvc)\b/i],
  ];
  const patternLeaks = universalSecretPatterns
    .filter(([, pattern]) => pattern.test(publicText))
    .map(([label]) => label);

  return Array.from(new Set([...exactLeaks, ...patternLeaks]));
}

function createPublishedPrivateDetailPayload(records: StructuredTripRecords) {
  return createPublishedPrivateDetails(records).map((detail) => ({
    id: detail.id,
    label: detail.label,
    reason: detail.reason,
    subjectId: detail.subjectId,
    subjectType: detail.subjectType,
    value: detail.value,
    visibility: detail.visibility,
  }));
}

export function createPublishedTripSnapshotPayload(
  records: StructuredTripRecords
): PublishedTripSnapshotPayload {
  const publicRecords = createPublicSnapshotRecords(records);
  const travelerApp = createTravelerAppViewModel(publicRecords);

  const payload = {
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
  } satisfies PublishedTripSnapshotPayload;
  const leaks = findPublicSnapshotPrivacyLeaks({ payload, records });

  if (leaks.length > 0) {
    throw new PublicSnapshotPrivacyError(leaks);
  }

  return payload;
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

  const payload = createPublishedTripSnapshotPayload(records);
  const shareToken = createShareToken();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("publish_trip_snapshot", {
      p_created_by_user_id: user.id,
      p_private_details: createPublishedPrivateDetailPayload(records),
      p_share_token: shareToken,
      p_snapshot_json: payload,
      p_trip_id: tripId,
    })
    .select("id,trip_id,version,share_token,snapshot_json,created_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Unable to transactionally publish trip snapshot: ${
        error?.message ?? "No row"
      }`
    );
  }

  return normalizeSnapshot(data as unknown as PublishedTripSnapshotRow);
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

export async function getPublishedTripPrivateDetailsByToken(token: string) {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }

  const snapshot = await getPublishedTripSnapshotByToken(token);

  if (!snapshot) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("published_trip_private_details")
    .select("detail_id,label,reason,subject_id,subject_type,value,visibility")
    .eq("snapshot_id", snapshot.id)
    .eq("visibility", "traveler_password")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load private traveler details: ${error.message}`);
  }

  return ((data ?? []) as unknown as PublishedTripPrivateDetailRow[]).map(
    (detail) => ({
      detailId: detail.detail_id,
      label: detail.label,
      reason: detail.reason,
      subjectId: detail.subject_id,
      subjectType: detail.subject_type,
      value: detail.value,
      visibility: detail.visibility,
    })
  );
}

export async function getPublishedTripAccessStateByToken(token: string) {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }

  const snapshot = await getPublishedTripSnapshotByToken(token);

  if (!snapshot) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("trips")
    .select("status,published_snapshot_id,traveler_password_enabled,traveler_password_hash")
    .eq("id", snapshot.tripId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load trip access state: ${error.message}`);
  }

  const publicationState = data as unknown as TripPublicationStateRow | null;

  if (
    !publicationState ||
    publicationState.status === "deleted" ||
    publicationState.published_snapshot_id !== snapshot.id
  ) {
    return null;
  }

  return {
    passwordEnabled: Boolean(publicationState.traveler_password_enabled),
    passwordHash: publicationState.traveler_password_hash,
    snapshot,
  };
}
