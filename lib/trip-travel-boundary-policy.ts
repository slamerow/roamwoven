export type TravelBoundaryTransportType =
  | "bus"
  | "drive"
  | "ferry"
  | "flight"
  | "other"
  | "rental_car"
  | "train"
  | "transfer";

export type TravelBoundaryRecord = {
  arrivalDate?: string | null;
  arrivalLocation?: string | null;
  category?: string | null;
  confirmationLabel?: string | null;
  departureDate?: string | null;
  departureLocation?: string | null;
  description?: string | null;
  itemType?: string | null;
  provider?: string | null;
  title?: string | null;
  transportType?: string | null;
};

const RENTAL_LOCATION_STOPWORDS = new Set([
  "airport",
  "car",
  "center",
  "centre",
  "city",
  "downtown",
  "dropoff",
  "hire",
  "location",
  "office",
  "pickup",
  "rental",
  "station",
]);

function rentalLocationTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter((token) => !RENTAL_LOCATION_STOPWORDS.has(token));
}

export function isIntercityRentalCarCandidate(record: TravelBoundaryRecord) {
  if (!isRentalCarPickupCandidate(record)) return false;

  const departureTokens = rentalLocationTokens(record.departureLocation);
  const arrivalTokens = rentalLocationTokens(record.arrivalLocation);
  if (departureTokens.length === 0 || arrivalTokens.length === 0) return false;

  if (departureTokens.some((token) => arrivalTokens.includes(token))) {
    return false;
  }

  const text = travelBoundaryText(record);
  const explicitIntercityRoute = Boolean(
    /\b(intercity|one way|one-way|different city)\b/.test(text) ||
      /\b(?:drive|rental car|car rental)\s+from\b.*\bto\b/.test(text)
  );
  const differentHandoffDates = Boolean(
    record.departureDate &&
      record.arrivalDate &&
      record.departureDate !== record.arrivalDate
  );

  return explicitIntercityRoute || differentHandoffDates;
}

function normalizeText(value: string | null | undefined) {
  return (
    value
      ?.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim() ?? ""
  );
}

export function normalizeTravelBoundaryTransportType(
  value: string | null | undefined
): TravelBoundaryTransportType | null {
  const type = normalizeText(value).replace(/\s+/g, "_");

  if (
    type === "bus" ||
    type === "drive" ||
    type === "ferry" ||
    type === "flight" ||
    type === "other" ||
    type === "rental_car" ||
    type === "train" ||
    type === "transfer"
  ) {
    return type;
  }

  if (type === "car" || type === "rental") {
    return "rental_car";
  }

  return null;
}

export function travelBoundaryText(record: TravelBoundaryRecord) {
  return normalizeText(
    [
      record.title,
      record.description,
      record.departureLocation,
      record.arrivalLocation,
      record.provider,
      record.confirmationLabel,
      record.category,
      record.itemType,
      record.transportType,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function isRentalCarPickupCandidate(record: TravelBoundaryRecord) {
  const type = normalizeTravelBoundaryTransportType(record.transportType);
  const text = travelBoundaryText(record);

  return (
    type === "rental_car" ||
    /\b(rental car|car rental|car pickup|pick up car|pickup car|hire car)\b/.test(
      text
    )
  );
}

export function isScenicRideCandidate(record: TravelBoundaryRecord) {
  return /\b(children'?s train|ferris wheel|observation wheel|panorama train|scenic train|scenic railway|ring tram|tram tour|funicular|chairlift|cable car|gondola|boat tour|river cruise|sightseeing cruise)\b/.test(
    travelBoundaryText(record)
  );
}

export function hasBookedTransferEvidence(record: TravelBoundaryRecord) {
  const text = travelBoundaryText(record);

  return Boolean(
    record.confirmationLabel ||
      record.provider ||
      /\b(booking|booked|car service|confirmation|driver|private\b.*\btransfer|pickup arrangement|pick up arrangement|reservation|reserved|shuttle|ticket|voucher)\b/.test(
        text
      )
  );
}

export function inferTravelBoundaryTransportKind(
  record: TravelBoundaryRecord
): TravelBoundaryTransportType | null {
  const explicitType = normalizeTravelBoundaryTransportType(record.transportType);
  const text = travelBoundaryText(record);

  if (explicitType) {
    return explicitType;
  }

  if (
    /\b(train to|train from|rail to|rail from|train code|intercity train)\b/.test(
      text
    )
  ) {
    return "train";
  }

  if (/\b(bus to|bus from|coach to|coach from)\b/.test(text)) {
    return "bus";
  }

  if (/\b(ferry to|ferry from|boat transfer)\b/.test(text)) {
    return "ferry";
  }

  if (/\b(drive to|drive from|road trip to|road trip from)\b/.test(text)) {
    return "drive";
  }

  if (
    /\b(airport transfer|booked transfer|leave for airport|move to airport|private transfer|public transport|shuttle|take public transport|taxi to airport|transfer)\b/.test(
      text
    )
  ) {
    return "transfer";
  }

  if (/\b(airline|boarding|flight|fly|terminal)\b/.test(text)) {
    return "flight";
  }

  return null;
}

export function isSeparateLocalMovementCandidate(record: TravelBoundaryRecord) {
  const text = travelBoundaryText(record);

  return (
    /\b(take|catch|ride|get on|board|leave for|go to)\b/.test(text) &&
    /\b(metro|subway|bus|tram|taxi|uber|lyft|shuttle|driver|private transfer|car service|pickup|pick up)\b/.test(
      text
    )
  );
}

export function isTravelActionCandidate(record: TravelBoundaryRecord) {
  const text = travelBoundaryText(record);

  if (
    (isRentalCarPickupCandidate(record) && !isIntercityRentalCarCandidate(record)) ||
    isScenicRideCandidate(record)
  ) {
    return false;
  }

  return /\b(flight|fly|train to|rail to|bus to|coach to|ferry to|airport|station|transfer|depart|departure|arrive|arrival|get to|travel to)\b/.test(
    text
  );
}

export function isRedundantLocalAirportTransferCandidate(
  record: TravelBoundaryRecord
) {
  const kind = inferTravelBoundaryTransportKind(record);
  const text = travelBoundaryText(record);

  if (!text.includes("airport") || hasBookedTransferEvidence(record)) {
    return false;
  }

  return (
    (kind === "transfer" ||
      /\b(leave for airport|move to airport|public transport|take public transport|taxi to airport|airport transfer|go to airport|wake.*airport)\b/.test(
        text
      )) &&
    /\b(before|flight|fly|depart|departure|airport)\b/.test(text)
  );
}

export function shouldBeTravelRow(record: TravelBoundaryRecord) {
  const kind = inferTravelBoundaryTransportKind(record);

  if (isRentalCarPickupCandidate(record)) {
    return isIntercityRentalCarCandidate(record);
  }

  if (isScenicRideCandidate(record)) {
    return false;
  }

  if (
    kind === "bus" ||
    kind === "drive" ||
    kind === "ferry" ||
    kind === "flight" ||
    kind === "train"
  ) {
    return true;
  }

  if (kind === "transfer") {
    return hasBookedTransferEvidence(record);
  }

  return false;
}
