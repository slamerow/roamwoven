import type {
  TripPrivateDetailRecord,
  TripTransportRecord,
} from "@/lib/generated-trip-model";

export const TRANSPORT_DESCRIPTION_VISIBILITY = "traveler_password" as const;

export function getTransportDescriptionVisibility(
  _transport: Pick<TripTransportRecord, "descriptionVisibility">
) {
  // Missing means legacy, never public. Keeping this fail-closed rule in one
  // place prevents projection, QA, and serving from interpreting old records
  // differently.
  return TRANSPORT_DESCRIPTION_VISIBILITY;
}

export function transportDescriptionDetailId(transportId: string) {
  return `${transportId}:description`;
}

export function createTransportDescriptionPrivateDetail(
  transport: TripTransportRecord
): TripPrivateDetailRecord | null {
  if (!transport.description?.trim()) {
    return null;
  }

  return {
    detailType: "travel_description",
    id: transportDescriptionDetailId(transport.id),
    label: "Travel details",
    reason: "Travel-card descriptions stay behind the trip password.",
    reviewRequired: false,
    sourceConfidence: transport.sourceConfidence,
    subjectCanonicalId: transport.canonicalId,
    subjectId: transport.id,
    subjectType: "transport",
    tripId: transport.tripId,
    value: transport.description,
    visibility: getTransportDescriptionVisibility(transport),
  };
}

export function createTransportDescriptionPrivateDetails(
  transport: TripTransportRecord[]
) {
  return transport
    .filter((record) => record.status !== "ignored")
    .map(createTransportDescriptionPrivateDetail)
    .filter((detail): detail is TripPrivateDetailRecord => Boolean(detail));
}
