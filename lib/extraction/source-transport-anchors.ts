import type {
  TripLegRecord,
  TripTransportRecord,
  TripTransportType,
} from "@/lib/generated-trip-model";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
import { normalizeText } from "@/lib/extraction/traveler-text";

export const SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY = "_sourceTransportAnchors";

export type SourceTransportAnchorKind =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "transfer";

export type SourceTransportAnchorProvenance =
  | "manual_note"
  | "ocr"
  | "text_layer"
  | "unknown";

export type SourceTransportAnchor = {
  anchorId: string;
  arrivalLocation: string | null;
  arrivalTime: string | null;
  confidence: "high" | "medium";
  confirmation: string | null;
  date: string | null;
  departureLocation: string | null;
  departureTime: string | null;
  evidence: string;
  kind: SourceTransportAnchorKind;
  number: string | null;
  provider: string | null;
  provenance: SourceTransportAnchorProvenance[];
  routeLabel: string;
  sourceFilename: string | null;
  sourceUploadId: string | null;
};

type SourceLine = {
  line: string;
  provenance: SourceTransportAnchorProvenance;
  sourceFilename: string | null;
  sourceUploadId: string | null;
};

const MONTHS: Record<string, number> = {
  april: 4,
  apr: 4,
  august: 8,
  aug: 8,
  december: 12,
  dec: 12,
  february: 2,
  feb: 2,
  january: 1,
  jan: 1,
  july: 7,
  jul: 7,
  june: 6,
  jun: 6,
  march: 3,
  mar: 3,
  may: 5,
  november: 11,
  nov: 11,
  october: 10,
  oct: 10,
  september: 9,
  sept: 9,
  sep: 9,
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizeClockTime(value: string | null | undefined) {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  const match = /^(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const suffix = match[3]?.toLowerCase();

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (suffix === "pm" && hour < 12) {
    hour += 12;
  } else if (suffix === "am" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractStartTime(line: string) {
  if (/^\d{1,2}:\d{2}\s*h\b/i.test(line)) {
    return null;
  }

  const match = /^(?:at\s*)?(\d{1,2}:\d{2})\s*(am|pm)?\b/i.exec(line);
  const time = normalizeClockTime(
    match ? `${match[1]}${match[2] ? ` ${match[2]}` : ""}` : null
  );

  if (!match || !time) {
    return null;
  }

  return {
    rest: cleanLine(line.slice(match[0].length)),
    time,
  };
}

function extractClockTimesFromLine(line: string) {
  if (/\b\d{1,2}:\d{2}\s*h\b/i.test(line)) {
    return [];
  }

  const times: string[] = [];

  for (const match of line.matchAll(/\b(\d{1,2}:\d{2})\s*(am|pm)?\b/gi)) {
    const time = normalizeClockTime(
      `${match[1]}${match[2] ? ` ${match[2]}` : ""}`
    );

    if (time) {
      times.push(time);
    }
  }

  for (const match of line.matchAll(/\b(\d{1,2})\s*(am|pm)\b/gi)) {
    const time = normalizeClockTime(`${match[1]} ${match[2]}`);

    if (time) {
      times.push(time);
    }
  }

  return uniqueValues(times);
}

function likelyLocationLine(value: string) {
  const text = normalizeText(value);

  return Boolean(
    text &&
      !/\b(adult|booking|code|duration|flight|free|open|paid|paypal|price|status|ticket|total)\b/.test(
        text
      ) &&
      !/^\d{1,2}:\d{2}\s*h\b/.test(text)
  );
}

function parseDateFromText(value: string, defaultYear: number | null) {
  const match = new RegExp(
    String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[,]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,]?\s+(\d{4}))?\b`,
    "i"
  ).exec(value);

  if (!match) {
    return null;
  }

  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3] ?? defaultYear);

  if (!month || !year || Number.isNaN(day) || day < 1 || day > 31) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferDefaultYear(materials: TripExtractionMaterial[]) {
  for (const material of materials) {
    const match = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i.exec(
      material.text
    );

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function initialProvenanceFor(material: TripExtractionMaterial): SourceTransportAnchorProvenance {
  if (material.type === "note") {
    return "manual_note";
  }

  if (material.type === "pdf_text") {
    return "text_layer";
  }

  return "unknown";
}

function createSourceLines(materials: TripExtractionMaterial[]) {
  const lines: SourceLine[] = [];

  for (const material of materials) {
    let provenance = initialProvenanceFor(material);

    for (const rawLine of material.text.split(/\r?\n/)) {
      const line = cleanLine(rawLine);

      if (!line) {
        continue;
      }

      if (/^\[pdf text layer\]$/i.test(line)) {
        provenance = "text_layer";
        continue;
      }

      if (/^\[ocr text from embedded images\]$/i.test(line)) {
        provenance = "ocr";
        continue;
      }

      lines.push({
        line,
        provenance,
        sourceFilename: material.filename,
        sourceUploadId: material.sourceUploadId ?? null,
      });
    }
  }

  return lines;
}

function isScenicOrLocalRideLine(value: string) {
  return /\b(ferris wheel|funicular|gondola|panorama train|ring tram|scenic train|tram tour)\b/i.test(
    value
  );
}

function getSignalKind(value: string): SourceTransportAnchorKind | null {
  const text = value.toLowerCase();

  if (isScenicOrLocalRideLine(value)) {
    return null;
  }

  if (
    /\btrain\s+(to|from)\b/.test(text) ||
    /\btrain code\b/.test(text) ||
    /\b(regiojet|railjet|amtrak|eurostar|italo|trenitalia|sncf|oebb|obb)\b/.test(
      text
    )
  ) {
    return "train";
  }

  if (
    /\bflight\b/.test(text) ||
    /\b(delta|ryanair|wizz air|united|american|southwest|jetblue|british airways|air france|klm|lufthansa|easyjet|easy jet)\b.*\b[A-Z0-9]{1,3}\s?\d{2,4}\b/.test(
      value
    )
  ) {
    return "flight";
  }

  if (/\b(intercity bus|bus\s+(to|from)|coach\s+(to|from))\b/.test(text)) {
    return "bus";
  }

  if (/\b(ferry\s+(to|from)|boat\s+transfer)\b/.test(text)) {
    return "ferry";
  }

  if (
    /\b(booked transfer|private transfer|reserved transfer|shuttle voucher)\b/.test(
      text
    )
  ) {
    return "transfer";
  }

  return null;
}

function getBlock(lines: SourceLine[], index: number) {
  const block: SourceLine[] = [];

  for (let cursor = Math.max(0, index - 3); cursor < lines.length; cursor += 1) {
    if (cursor > index + 14) {
      break;
    }

    if (
      cursor > index + 2 &&
      parseDateFromText(lines[cursor].line, null) &&
      !getSignalKind(lines[cursor].line)
    ) {
      break;
    }

    block.push(lines[cursor]);
  }

  return block;
}

function extractTimedLocations(block: SourceLine[]) {
  const timed: Array<{ location: string | null; time: string }> = [];

  block.forEach((entry, index) => {
    const startTime = extractStartTime(entry.line);

    if (!startTime) {
      return;
    }

    let location = likelyLocationLine(startTime.rest) ? startTime.rest : null;

    if (!location) {
      const nextLine = block[index + 1]?.line ?? null;
      location = nextLine && likelyLocationLine(nextLine) ? nextLine : null;
    }

    timed.push({ location, time: startTime.time });
  });

  return timed;
}

function extractAllTimes(block: SourceLine[]) {
  return uniqueValues(block.flatMap((entry) => extractClockTimesFromLine(entry.line)));
}

function extractConfirmation(blockText: string) {
  const match =
    /\b(?:booking|confirmation|train)\s+(?:code|number|reference|ref)[:#]?\s*([a-z0-9-]{4,})\b/i.exec(
      blockText
    ) ?? /\b(?:code|booking)[:#]?\s*([a-z0-9-]{4,})\b/i.exec(blockText);

  return match?.[1] ?? null;
}

function extractProviderAndNumber(kind: SourceTransportAnchorKind, blockText: string) {
  if (kind === "flight") {
    const match =
      /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s+Flight\s+([A-Z0-9]{1,3}\s?\d{2,4})\b/.exec(
        blockText
      ) ?? /\b([A-Z]{2})\s?(\d{2,4})\b/.exec(blockText);

    return {
      number: match ? cleanLine(`${match[2]}`) : null,
      provider: match?.[1] ?? null,
    };
  }

  if (kind === "train") {
    const match =
      /\b(RegioJet|Railjet|Amtrak|Eurostar|Italo|Trenitalia|SNCF|DB|OBB|OEBB)\b(?:\s*\|\s*)?([A-Z]{1,4}\s?\d{2,5})?/i.exec(
        blockText
      ) ?? /\b([A-Z]{1,4}\s?\d{2,5})\b/.exec(blockText);

    return {
      number: match?.[2] ?? (match && match.length === 2 ? match[1] : null),
      provider: match?.[1] ?? null,
    };
  }

  return { number: null, provider: null };
}

function extractRouteFromText(kind: SourceTransportAnchorKind, blockText: string) {
  const routeArrow =
    /\b([A-Z]{3})\s*(?:->|\u2192|to)\s*([A-Z]{3})\b/.exec(blockText) ??
    /\b([A-Z][A-Za-z .'-]{2,40})\s+(?:->|\u2192|to)\s+([A-Z][A-Za-z .'-]{2,40})\b/.exec(
      blockText
    );
  const trainTo = /\btrain\s+to\s+([A-Z][A-Za-z .'-]{2,50})\b/i.exec(blockText);
  const trainFromTo = /\b([A-Z][A-Za-z .'-]{2,40})\s+to\s+([A-Z][A-Za-z .'-]{2,40})\s+train\b/i.exec(
    blockText
  );

  if (routeArrow) {
    return {
      arrival: cleanLine(routeArrow[2]),
      departure: cleanLine(routeArrow[1]),
      title: `${kind === "flight" ? "Flight" : "Travel"} ${cleanLine(
        routeArrow[1]
      )} to ${cleanLine(routeArrow[2])}`,
    };
  }

  if (kind === "train" && trainFromTo) {
    return {
      arrival: cleanLine(trainFromTo[2]),
      departure: cleanLine(trainFromTo[1]),
      title: `Train ${cleanLine(trainFromTo[1])} to ${cleanLine(trainFromTo[2])}`,
    };
  }

  if (kind === "train" && trainTo) {
    return {
      arrival: cleanLine(trainTo[1]),
      departure: null,
      title: `Train to ${cleanLine(trainTo[1])}`,
    };
  }

  return { arrival: null, departure: null, title: null };
}

function routeLabelFor({
  arrivalLocation,
  departureLocation,
  fallbackTitle,
  kind,
}: {
  arrivalLocation: string | null;
  departureLocation: string | null;
  fallbackTitle: string | null;
  kind: SourceTransportAnchorKind;
}) {
  if (fallbackTitle) {
    return fallbackTitle;
  }

  if (departureLocation && arrivalLocation) {
    return `${kind === "flight" ? "Flight" : "Travel"} from ${departureLocation} to ${arrivalLocation}`;
  }

  if (arrivalLocation) {
    return `${kind === "flight" ? "Flight" : "Travel"} to ${arrivalLocation}`;
  }

  return kind === "flight"
    ? "Flight"
    : kind === "train"
      ? "Train"
      : kind === "bus"
        ? "Bus"
        : kind === "ferry"
          ? "Ferry"
          : "Transfer";
}

function filledAnchorScore(anchor: SourceTransportAnchor) {
  return [
    anchor.arrivalLocation,
    anchor.arrivalTime,
    anchor.confirmation,
    anchor.date,
    anchor.departureLocation,
    anchor.departureTime,
    anchor.number,
    anchor.provider,
  ].filter(Boolean).length;
}

function createAnchorFromBlock({
  block,
  currentDate,
  defaultYear,
  index,
  kind,
}: {
  block: SourceLine[];
  currentDate: string | null;
  defaultYear: number | null;
  index: number;
  kind: SourceTransportAnchorKind;
}): SourceTransportAnchor | null {
  const blockText = block.map((entry) => entry.line).join("\n");
  const date =
    block
      .map((entry) => parseDateFromText(entry.line, defaultYear))
      .find(Boolean) ?? currentDate;
  const timedLocations = extractTimedLocations(block);
  const times = extractAllTimes(block);
  const route = extractRouteFromText(kind, blockText);
  const providerAndNumber = extractProviderAndNumber(kind, blockText);
  const departureTime = timedLocations[0]?.time ?? times[0] ?? null;
  const arrivalTime = timedLocations[1]?.time ?? times[1] ?? null;
  const departureLocation =
    timedLocations[0]?.location ?? route.departure ?? null;
  const arrivalLocation =
    timedLocations[1]?.location ?? route.arrival ?? null;
  const routeLabel = routeLabelFor({
    arrivalLocation,
    departureLocation,
    fallbackTitle: route.title,
    kind,
  });
  const confirmation = extractConfirmation(blockText);
  const provenance = uniqueValues(block.map((entry) => entry.provenance));
  const sourceFilename = block.find((entry) => entry.sourceFilename)?.sourceFilename ?? null;
  const sourceUploadId = block.find((entry) => entry.sourceUploadId)?.sourceUploadId ?? null;
  const anchor: SourceTransportAnchor = {
    anchorId: "",
    arrivalLocation,
    arrivalTime,
    confidence: departureTime || providerAndNumber.number || confirmation ? "high" : "medium",
    confirmation,
    date,
    departureLocation,
    departureTime,
    evidence: blockText.slice(0, 1200),
    kind,
    number: providerAndNumber.number,
    provider: providerAndNumber.provider,
    provenance,
    routeLabel,
    sourceFilename,
    sourceUploadId,
  };

  if (!departureTime && !arrivalTime && !providerAndNumber.number && !confirmation) {
    return null;
  }

  anchor.anchorId = createAnchorId(anchor, index);

  return anchor;
}

function createAnchorId(anchor: SourceTransportAnchor, index: number) {
  return [
    anchor.kind,
    anchor.date ?? "undated",
    anchor.number ?? anchor.confirmation ?? anchor.routeLabel,
    anchor.departureTime ?? "notime",
    index + 1,
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function anchorDedupeKey(anchor: SourceTransportAnchor) {
  return [
    anchor.kind,
    anchor.date ?? "",
    normalizeText(anchor.number ?? anchor.confirmation ?? anchor.routeLabel),
    anchor.departureTime ?? "",
  ].join("|");
}

export function extractSourceTransportAnchorsFromMaterials(
  materials: TripExtractionMaterial[]
): SourceTransportAnchor[] {
  const defaultYear = inferDefaultYear(materials);
  const lines = createSourceLines(materials);
  const anchors = new Map<string, SourceTransportAnchor>();
  let currentDate: string | null = null;

  lines.forEach((entry, index) => {
    currentDate = parseDateFromText(entry.line, defaultYear) ?? currentDate;

    const kind = getSignalKind(entry.line);

    if (!kind) {
      return;
    }

    const anchor = createAnchorFromBlock({
      block: getBlock(lines, index),
      currentDate,
      defaultYear,
      index,
      kind,
    });

    if (!anchor) {
      return;
    }

    const key = anchorDedupeKey(anchor);
    const existing = anchors.get(key);

    if (!existing || filledAnchorScore(anchor) > filledAnchorScore(existing)) {
      anchors.set(key, anchor);
    }
  });

  return [...anchors.values()];
}

export function getSourceTransportAnchorsFromDraft(
  draft: unknown
): SourceTransportAnchor[] {
  const record = asRecord(draft);
  const sourceRecord = asRecord(record[SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]);

  return asArray(sourceRecord.transport)
    .map((value) => normalizeSourceTransportAnchor(value))
    .filter((value): value is SourceTransportAnchor => Boolean(value));
}

export function getSourceTransportAnchorsFromUsage(
  usage: unknown
): SourceTransportAnchor[] {
  const record = asRecord(usage);
  const openai = asRecord(record.openai ?? usage);
  const sourceRecord = asRecord(openai.sourceAnchors);

  return asArray(sourceRecord.transport)
    .map((value) => normalizeSourceTransportAnchor(value))
    .filter((value): value is SourceTransportAnchor => Boolean(value));
}

function normalizeSourceTransportAnchor(value: unknown) {
  const record = asRecord(value);
  const kind = getString(record, "kind");

  if (
    kind !== "flight" &&
    kind !== "train" &&
    kind !== "bus" &&
    kind !== "ferry" &&
    kind !== "transfer"
  ) {
    return null;
  }

  return {
    anchorId: getString(record, "anchorId") ?? createAnchorId(record as SourceTransportAnchor, 0),
    arrivalLocation: getString(record, "arrivalLocation"),
    arrivalTime: normalizeClockTime(getString(record, "arrivalTime")),
    confidence: getString(record, "confidence") === "high" ? "high" : "medium",
    confirmation: getString(record, "confirmation"),
    date: getString(record, "date"),
    departureLocation: getString(record, "departureLocation"),
    departureTime: normalizeClockTime(getString(record, "departureTime")),
    evidence: getString(record, "evidence") ?? "",
    kind,
    number: getString(record, "number"),
    provider: getString(record, "provider"),
    provenance: asArray(record.provenance).filter(
      (item): item is SourceTransportAnchorProvenance =>
        item === "manual_note" ||
        item === "ocr" ||
        item === "text_layer" ||
        item === "unknown"
    ),
    routeLabel: getString(record, "routeLabel") ?? kind,
    sourceFilename: getString(record, "sourceFilename"),
    sourceUploadId: getString(record, "sourceUploadId"),
  } satisfies SourceTransportAnchor;
}

function transportTypeForAnchor(kind: SourceTransportAnchorKind): TripTransportType {
  return kind === "transfer" ? "transfer" : kind;
}

function textTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter(
      (token) =>
        ![
          "and",
          "flight",
          "from",
          "the",
          "to",
          "train",
          "travel",
        ].includes(token)
    );
}

function overlapScore(a: string | null | undefined, b: string | null | undefined) {
  const left = textTokens(a);
  const right = new Set(textTokens(b));

  return left.filter((token) => right.has(token)).length;
}

export function sourceTransportAnchorMatchesRecord(
  anchor: SourceTransportAnchor,
  record: {
    arrivalLocation: string | null;
    confirmationLabel: string | null;
    date: string | null;
    departureLocation: string | null;
    provider: string | null;
    routeLabel: string;
    transportType: string | null;
  }
) {
  if (record.transportType !== transportTypeForAnchor(anchor.kind)) {
    return false;
  }

  if (anchor.date && record.date && anchor.date !== record.date) {
    return false;
  }

  const recordText = [
    record.routeLabel,
    record.departureLocation,
    record.arrivalLocation,
    record.provider,
    record.confirmationLabel,
  ]
    .filter(Boolean)
    .join(" ");
  const anchorText = [
    anchor.routeLabel,
    anchor.departureLocation,
    anchor.arrivalLocation,
    anchor.provider,
    anchor.number,
    anchor.confirmation,
  ]
    .filter(Boolean)
    .join(" ");

  if (
    anchor.confirmation &&
    record.confirmationLabel &&
    normalizeText(anchor.confirmation) === normalizeText(record.confirmationLabel)
  ) {
    return true;
  }

  if (
    anchor.number &&
    normalizeText(recordText).includes(normalizeText(anchor.number))
  ) {
    return true;
  }

  return overlapScore(anchorText, recordText) >= 1;
}

function matchScore(anchor: SourceTransportAnchor, record: TripTransportRecord) {
  if (!sourceTransportAnchorMatchesRecord(anchor, record)) {
    return 0;
  }

  let score = 4;

  if (anchor.date && record.date === anchor.date) {
    score += 4;
  }

  if (anchor.departureTime && record.departureTime === anchor.departureTime) {
    score += 2;
  }

  if (anchor.arrivalTime && record.arrivalTime === anchor.arrivalTime) {
    score += 1;
  }

  score += overlapScore(anchor.routeLabel, record.routeLabel);
  score += overlapScore(anchor.departureLocation, record.departureLocation);
  score += overlapScore(anchor.arrivalLocation, record.arrivalLocation);

  return score;
}

function canCreateTransportFromAnchor(anchor: SourceTransportAnchor) {
  return Boolean(
    anchor.date &&
      (anchor.departureTime ||
        anchor.departureLocation ||
        anchor.arrivalLocation ||
        anchor.provider ||
        anchor.number ||
        anchor.confirmation)
  );
}

function findLegForDate(legs: TripLegRecord[], date: string | null) {
  if (!date) {
    return null;
  }

  return (
    legs.find(
      (leg) =>
        leg.arriveDate &&
        leg.leaveDate &&
        date >= leg.arriveDate &&
        date < leg.leaveDate
    ) ?? legs.find((leg) => leg.arriveDate === date) ?? null
  );
}

function repairedTransport(
  record: TripTransportRecord,
  anchor: SourceTransportAnchor
): TripTransportRecord {
  return {
    ...record,
    arrivalLocation: record.arrivalLocation ?? anchor.arrivalLocation,
    arrivalTime: record.arrivalTime ?? anchor.arrivalTime,
    confirmationLabel: record.confirmationLabel ?? anchor.confirmation,
    date: record.date ?? anchor.date,
    departureLocation: record.departureLocation ?? anchor.departureLocation,
    departureTime: record.departureTime ?? anchor.departureTime,
    description: record.description,
    provider: record.provider ?? anchor.provider,
    reviewRequired: record.reviewRequired && !anchor.departureTime,
    routeLabel:
      normalizeText(record.routeLabel) === normalizeText(record.transportType)
        ? anchor.routeLabel
        : record.routeLabel,
  };
}

function createTransportFromAnchor({
  anchor,
  index,
  legs,
  tripId,
}: {
  anchor: SourceTransportAnchor;
  index: number;
  legs: TripLegRecord[];
  tripId: string;
}): TripTransportRecord {
  const leg = findLegForDate(legs, anchor.date);

  return {
    arrivalLocation: anchor.arrivalLocation,
    arrivalTime: anchor.arrivalTime,
    bookingUrl: null,
    bookingUrlVisibility: "traveler_password",
    confirmationLabel: anchor.confirmation,
    confirmationVisibility: anchor.confirmation ? "traveler_password" : "public",
    date: anchor.date,
    departureLocation: anchor.departureLocation,
    departureTime: anchor.departureTime,
    description: null,
    fromLegId: null,
    id: `${tripId}-transport-source-${anchor.anchorId || index + 1}`,
    legId: leg?.id ?? null,
    privateDetailIds: [],
    provider: anchor.provider,
    reviewRequired: !anchor.date || !anchor.departureTime,
    routeLabel: anchor.routeLabel,
    sourceConfidence: anchor.confidence,
    status: "draft",
    toLegId: null,
    transportType: transportTypeForAnchor(anchor.kind),
    tripId,
  };
}

export function applySourceTransportAnchorsToRecords({
  anchors,
  legs,
  transport,
  tripId,
}: {
  anchors: SourceTransportAnchor[];
  legs: TripLegRecord[];
  transport: TripTransportRecord[];
  tripId: string;
}) {
  const records = transport.map((record) => ({ ...record }));

  anchors.forEach((anchor, index) => {
    const scored = records
      .map((record, recordIndex) => ({
        recordIndex,
        score: matchScore(anchor, record),
      }))
      .sort((a, b) => b.score - a.score);
    const match = scored[0];

    if (match && match.score > 0) {
      records[match.recordIndex] = repairedTransport(
        records[match.recordIndex],
        anchor
      );
      return;
    }

    if (canCreateTransportFromAnchor(anchor)) {
      records.push(
        createTransportFromAnchor({
          anchor,
          index,
          legs,
          tripId,
        })
      );
    }
  });

  return records;
}
