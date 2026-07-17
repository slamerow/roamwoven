import type { TripTransportType } from "@/lib/generated-trip-model";
import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
import {
  normalizeText,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";

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

const DATE_HEADING_PATTERN =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[,]?\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:[,]?\s+\d{4})?\b/gi;

function shouldSplitAtDateHeading(value: string, index: number, matchText: string) {
  if (index <= 0) {
    return false;
  }

  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(matchText.trim())) {
    return true;
  }

  const prefix = value.slice(0, index).trim();

  if (/^(arrival|depart(?:ure)?|inbound|outbound|return)\W*$/i.test(prefix)) {
    return false;
  }

  return prefix.length > 80;
}

function splitAtPattern(value: string, pattern: RegExp) {
  const indexes = [...value.matchAll(pattern)]
    .filter((match) =>
      shouldSplitAtDateHeading(value, match.index ?? -1, match[0] ?? "")
    )
    .map((match) => match.index ?? -1);

  if (indexes.length === 0) {
    return [value];
  }

  const parts: string[] = [];
  let start = 0;

  for (const index of indexes) {
    const part = value.slice(start, index).trim();

    if (part) {
      parts.push(part);
    }

    start = index;
  }

  const tail = value.slice(start).trim();

  if (tail) {
    parts.push(tail);
  }

  return parts;
}

function splitSourceLineForAnchors(value: string) {
  return splitAtPattern(cleanLine(value), DATE_HEADING_PATTERN);
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
      !/^(?:bus|ferry|flight|train|transfer|travel)\s+(?:from|to)\b/.test(text) &&
      !/^\d{1,2}:\d{2}\s*h\b/.test(text) &&
      !/^(?:to\s+)?\d{1,2}\s+\d{2}(?:\s+(?:am|pm))?$/.test(text) &&
      !/(?:->|→)/.test(value)
  );
}

function parseDateFromText(value: string, defaultYear: number | null) {
  const monthFirst = new RegExp(
    String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[,]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,]?\s+(\d{4}))?\b`,
    "i"
  ).exec(value);
  const dayFirst = new RegExp(
    String.raw`\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[,]?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[,]?\s+(\d{2,4}))?\b`,
    "i"
  ).exec(value);
  const numeric = /\b(?:datum\s*:\s*)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/i.exec(
    value
  );

  const numericLooksLikeDuration = Boolean(
    numeric &&
      /^(?:\s*\)?\s*)(?:hours?|hrs?|h)\b/i.test(
        value.slice((numeric.index ?? 0) + numeric[0].length)
      )
  );
  const numericHasDateContext = Boolean(
    numeric &&
      (numeric[3] ||
        /\b(?:date|datum)\s*:/i.test(numeric[0]) ||
        /\b(?:date|datum|dated|departure|arrival|inbound|outbound|return|on)\b/i.test(
          value.slice(Math.max(0, (numeric.index ?? 0) - 28), numeric.index)
        ) ||
        /^\s*(?:\w+day[,]?\s*)?\d{1,2}[./]\d{1,2}\s*$/i.test(value))
  );

  if (
    !monthFirst &&
    !dayFirst &&
    (!numeric || numericLooksLikeDuration || !numericHasDateContext)
  ) {
    return null;
  }

  const month = monthFirst
    ? MONTHS[monthFirst[1].toLowerCase()]
    : dayFirst
      ? MONTHS[dayFirst[2].toLowerCase()]
      : Number(numeric?.[2]);
  const day = Number(monthFirst?.[2] ?? dayFirst?.[1] ?? numeric?.[1]);
  const rawYear = monthFirst?.[3] ?? dayFirst?.[3] ?? numeric?.[3];
  const yearValue = rawYear ? Number(rawYear) : defaultYear;
  const year = yearValue && yearValue < 100 ? 2000 + yearValue : yearValue;

  if (
    !month ||
    month < 1 ||
    month > 12 ||
    !year ||
    Number.isNaN(day) ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferDefaultYear(materials: TripExtractionMaterial[]) {
  for (const material of materials) {
    const datedMatch = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i.exec(
      material.text
    );

    if (datedMatch) {
      return Number(datedMatch[1]);
    }

    const monthYearMatch = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(
      material.text
    );

    if (monthYearMatch) {
      return Number(monthYearMatch[1]);
    }
  }

  return null;
}

function initialProvenanceFor(material: TripExtractionMaterial): SourceTransportAnchorProvenance {
  if (
    material.sourceProvenance === "manual_note" ||
    material.sourceProvenance === "ocr" ||
    material.sourceProvenance === "text_layer" ||
    material.sourceProvenance === "unknown"
  ) {
    return material.sourceProvenance;
  }

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

      for (const sourceLine of splitSourceLineForAnchors(line)) {
        lines.push({
          line: sourceLine,
          provenance,
          sourceFilename: material.filename,
          sourceUploadId: material.sourceUploadId ?? null,
        });
      }
    }
  }

  return lines;
}

function isPageBoundaryLine(value: string) {
  return /^===\s*page\s+\d+\s*===$/i.test(value.trim());
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

function getBlock(lines: SourceLine[], index: number, defaultYear: number | null) {
  const block: SourceLine[] = [];
  let startIndex = index;

  const isTicketSectionDateLine = (value: string) =>
    /^(arrival|depart(?:ure)?|inbound|outbound|return)\W+/i.test(value.trim());

  for (
    let cursor = index - 1;
    cursor >= Math.max(0, index - 3);
    cursor -= 1
  ) {
    if (isPageBoundaryLine(lines[cursor].line)) {
      break;
    }

    if (
      parseDateFromText(lines[cursor].line, defaultYear) &&
      !isTicketSectionDateLine(lines[cursor].line)
    ) {
      break;
    }

    startIndex = cursor;
  }

  for (let cursor = startIndex; cursor < lines.length; cursor += 1) {
    if (cursor > index + 14) {
      break;
    }

    if (cursor !== index && isPageBoundaryLine(lines[cursor].line)) {
      break;
    }

    if (
      cursor > index &&
      parseDateFromText(lines[cursor].line, defaultYear) &&
      !isTicketSectionDateLine(lines[cursor].line)
    ) {
      break;
    }

    block.push(lines[cursor]);
  }

  return block;
}

function flightSegmentMatches(value: string) {
  return [
    ...value.matchAll(
      /\b(?:[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2}\s+)?Flight\s+[A-Z0-9]{1,3}\s?\d{2,4}\b/g
    ),
  ].filter((match) => typeof match.index === "number");
}

function splitSignalEntry(entry: SourceLine, kind: SourceTransportAnchorKind) {
  if (kind !== "flight") {
    return [entry];
  }

  const matches = flightSegmentMatches(entry.line);

  if (matches.length <= 1) {
    return [entry];
  }

  const firstIndex = matches[0]?.index ?? 0;
  const prefix = entry.line.slice(0, firstIndex).trim();

  return matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? entry.line.length;
      const segment = entry.line.slice(start, end).trim();
      const line = index === 0 && prefix ? `${prefix} ${segment}` : segment;

      return {
        ...entry,
        line: cleanLine(line),
      };
    })
    .filter((segment) => segment.line);
}

function extractTimedLocations(block: SourceLine[]) {
  const timed: Array<{ location: string | null; time: string }> = [];

  block.forEach((entry, index) => {
    const startTime = extractStartTime(entry.line);

    if (!startTime) {
      return;
    }

    if (
      /^(?:bus|ferry|flight|train|transfer|travel)\s+(?:from|to)\b/i.test(
        startTime.rest
      )
    ) {
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

function addTwelveHours(time: string) {
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 1 ||
    hour > 11
  ) {
    return time;
  }

  return `${String(hour + 12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function adjustAmbiguousFlightTimes({
  arrivalTime,
  blockText,
  departureTime,
  kind,
}: {
  arrivalTime: string | null;
  blockText: string;
  departureTime: string | null;
  kind: SourceTransportAnchorKind;
}) {
  if (kind !== "flight" || !departureTime || !arrivalTime) {
    return { arrivalTime, departureTime };
  }

  const duration = /\((\d+(?:\.\d+)?)\s*hours?\)/i.exec(blockText);
  const range = /\b\d{1,2}:\d{2}\s*(?:->|\u2192|to|-)\s*\d{1,2}:\d{2}\b/i.exec(
    blockText
  );

  if (
    !duration ||
    Number(duration[1]) < 6 ||
    !range ||
    /\b(am|pm)\b/i.test(range[0])
  ) {
    return { arrivalTime, departureTime };
  }

  const departureHour = Number(departureTime.slice(0, 2));
  const arrivalHour = Number(arrivalTime.slice(0, 2));

  if (
    departureHour >= 1 &&
    departureHour <= 7 &&
    arrivalHour >= 1 &&
    arrivalHour <= 7
  ) {
    return {
      arrivalTime: addTwelveHours(arrivalTime),
      departureTime: addTwelveHours(departureTime),
    };
  }

  return { arrivalTime, departureTime };
}

function extractConfirmation(blockText: string) {
  const match =
    /\b(?:booking|confirmation|train)\s+(?:(?:code|number|reference|ref)\s*)?[:#]?\s*#?([a-z0-9-]{4,})\b/i.exec(
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
    /\b([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4})\s*(?:\([^)]*\))?\s*(?:->|\u2192)\s*([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4})(?=\s+\d{1,2}:\d{2}|\s*$)/.exec(
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

function endpointQuality(value: string | null) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return 0;
  }

  if (/\b(?:flight|train|bus|ferry|transfer|travel)\s+(?:to|from)\b/.test(normalized)) {
    return 1;
  }

  if (/^[a-z]{3}$/.test(normalized)) {
    return 6;
  }

  if (/\b(?:airport|bahnhof|hbf|station|terminal|nadrazi)\b/.test(normalized)) {
    return 6;
  }

  return normalized.split(" ").length >= 2 ? 4 : 3;
}

function betterEndpoint(left: string | null, right: string | null) {
  return endpointQuality(right) > endpointQuality(left) ? right : left;
}

// --- Segment time binding (defect docket 2026-07-17, Delta 5925) ---
//
// Times must bind to the transport segment itself, never to surrounding prep
// notes. "Leave for Airport at 2:30 PM ... Delta Flight 5925 ... DCA -> JFK
// 5:00 -> 6:41 PM" previously produced departure 14:30 / arrival 17:00 by
// taking the first two clock times in the block. Binding order is now:
// 1. An explicit time range (X -> Y / X to Y) in the segment-scoped text.
// 2. Clock times from segment-scoped text with prep-note clauses stripped.
// Prep-note clause times ("leave for/by", "wake at", "be at X by") are never
// segment times; the prose remains in evidence and rides along as a prep
// note on the travel card downstream.

const PREP_NOTE_CLAUSE_PATTERN =
  /\b(?:leave\s+(?:for|by|at|the)|head\s+(?:to|for)|wake(?:\s?up)?\s+at|get\s+up\s+at|be\s+at\s+[^,.;]{0,40}?\s+by|get\s+to\s+[^,.;]{0,40}?\s+by|uber\s+to|taxi\s+to)[^,.;]{0,60}?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/gi;

export function stripPrepNoteClauses(value: string) {
  return value.replace(PREP_NOTE_CLAUSE_PATTERN, " ");
}

const TIME_RANGE_PATTERN =
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:->|→|–|-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;

function extractSegmentTimeRange(text: string) {
  const match = TIME_RANGE_PATTERN.exec(text);

  if (!match) return null;
  // Guard against price/number ranges ("12-18 EUR"): a real clock range has
  // minutes or an am/pm marker on at least one side.
  const clockLike = /(?::\d{2}|am|pm)/i;

  if (!clockLike.test(match[1]) && !clockLike.test(match[2])) {
    return null;
  }
  const departure = normalizeClockTime(match[1]);
  let arrival = normalizeClockTime(match[2]);

  if (!departure || !arrival) return null;

  // Segment splitting can strand the right side's meridiem in the next
  // segment's prefix ("5:00 PM -> 6:41 [PM Delta Flight 444...]"). When only
  // the left side carries am/pm and the range runs backwards, the right side
  // inherits the afternoon reading if that restores forward order.
  const leftHasMeridiem = /\b(?:am|pm)\b/i.test(match[1]);
  const rightHasMeridiem = /\b(?:am|pm)\b/i.test(match[2]);

  if (leftHasMeridiem && !rightHasMeridiem && arrival < departure) {
    const shifted = addTwelveHours(arrival);

    if (shifted > departure) {
      arrival = shifted;
    }
  }

  return { arrival, departure };
}

/**
 * The portion of the block text that belongs to the transport segment
 * itself: for flights, everything from the first flight-number token onward
 * (prefixes carry day headings and prep notes); for other kinds, the whole
 * block with prep-note clauses stripped.
 */
function segmentScopedText(kind: SourceTransportAnchorKind, blockText: string) {
  if (kind === "flight") {
    const matches = flightSegmentMatches(blockText);
    const first = matches[0];

    if (first && typeof first.index === "number") {
      return stripPrepNoteClauses(blockText.slice(first.index));
    }
  }

  return stripPrepNoteClauses(blockText);
}

function extractSegmentTimes(
  kind: SourceTransportAnchorKind,
  block: SourceLine[],
  blockText: string
) {
  const scoped = segmentScopedText(kind, blockText);
  const range = extractSegmentTimeRange(scoped);

  if (range) {
    return { arrivalTime: range.arrival, departureTime: range.departure };
  }

  const scopedLines: SourceLine[] = block
    .map((entry) => ({ ...entry, line: stripPrepNoteClauses(entry.line) }))
    .filter((entry) => cleanLine(entry.line));
  const timedLocations = extractTimedLocations(scopedLines);
  const times = uniqueValues(
    extractClockTimesFromLine(scoped).concat(extractAllTimes(scopedLines))
  );

  return {
    arrivalTime: timedLocations[1]?.time ?? times[1] ?? null,
    departureTime: timedLocations[0]?.time ?? times[0] ?? null,
  };
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
  const route = extractRouteFromText(kind, blockText);
  const providerAndNumber = extractProviderAndNumber(kind, blockText);
  const segmentTimes = extractSegmentTimes(kind, block, blockText);
  const { arrivalTime, departureTime } = adjustAmbiguousFlightTimes({
    arrivalTime: segmentTimes.arrivalTime,
    blockText,
    departureTime: segmentTimes.departureTime,
    kind,
  });
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
  const segmentIdentity = anchor.number
    ? normalizeText(anchor.number)
    : anchor.departureLocation && anchor.arrivalLocation
      ? `${normalizeText(anchor.departureLocation)}>${normalizeText(anchor.arrivalLocation)}`
      : normalizeText(anchor.confirmation ?? anchor.routeLabel);

  return [
    anchor.kind,
    anchor.date ?? "",
    segmentIdentity,
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
    if (isPageBoundaryLine(entry.line)) {
      currentDate = null;
      return;
    }

    currentDate = parseDateFromText(entry.line, defaultYear) ?? currentDate;

    const kind = getSignalKind(entry.line);

    if (!kind) {
      return;
    }

    for (const signalEntry of splitSignalEntry(entry, kind)) {
      const anchor = createAnchorFromBlock({
        block:
          signalEntry === entry
            ? getBlock(lines, index, defaultYear)
            : [signalEntry],
        currentDate,
        defaultYear,
        index,
        kind,
      });

      if (!anchor) {
        continue;
      }

      const key = anchorDedupeKey(anchor);
      const existing = anchors.get(key);

      if (!existing || filledAnchorScore(anchor) > filledAnchorScore(existing)) {
        anchors.set(key, {
          ...anchor,
          provenance: uniqueValues([
            ...(existing?.provenance ?? []),
            ...anchor.provenance,
          ]),
        });
      } else {
        existing.provenance = uniqueValues([
          ...existing.provenance,
          ...anchor.provenance,
        ]);
      }
    }
  });

  return canonicalizeSourceTransportAnchors([...anchors.values()]);
}

function anchorRecordForMatch(anchor: SourceTransportAnchor) {
  return {
    arrivalLocation: anchor.arrivalLocation,
    arrivalTime: anchor.arrivalTime,
    confirmationLabel: anchor.confirmation,
    date: anchor.date,
    departureLocation: anchor.departureLocation,
    departureTime: anchor.departureTime,
    provider: anchor.provider,
    routeLabel: anchor.routeLabel,
    transportType: transportTypeForAnchor(anchor.kind),
  };
}

function anchorsRepresentSameSegment(
  left: SourceTransportAnchor,
  right: SourceTransportAnchor
) {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.date && right.date && !tripDatesMatch(left.date, right.date)) {
    return false;
  }

  const weakEndpoint = (value: string | null) => {
    const normalized = normalizeText(value);
    return (
      !normalized ||
      /^(?:bus|ferry|flight|train|transfer|travel)(?:\s+(?:to|from)(?:\s+.+)?)?$/.test(
        normalized
      )
    );
  };

  if (
    left.confirmation &&
    right.confirmation &&
    normalizeText(left.confirmation) === normalizeText(right.confirmation) &&
    (weakEndpoint(left.departureLocation) ||
      weakEndpoint(left.arrivalLocation) ||
      weakEndpoint(right.departureLocation) ||
      weakEndpoint(right.arrivalLocation))
  ) {
    return true;
  }

  return (
    sourceTransportAnchorMatchesRecord(left, anchorRecordForMatch(right)) ||
    sourceTransportAnchorMatchesRecord(right, anchorRecordForMatch(left))
  );
}

function combineAnchorEvidence(left: string, right: string) {
  const values = [left.trim(), right.trim()].filter(Boolean);
  return Array.from(new Set(values)).join("\n").slice(0, 2400);
}

export function canonicalizeSourceTransportAnchors(
  anchors: SourceTransportAnchor[]
) {
  const canonical: SourceTransportAnchor[] = [];

  for (const anchor of anchors) {
    const match = canonical.find((candidate) =>
      anchorsRepresentSameSegment(candidate, anchor)
    );

    if (!match) {
      canonical.push({ ...anchor, provenance: [...anchor.provenance] });
      continue;
    }

    const preferred =
      filledAnchorScore(anchor) > filledAnchorScore(match) ? anchor : match;
    const fallback = preferred === anchor ? match : anchor;
    const departureLocation = betterEndpoint(
      preferred.departureLocation,
      fallback.departureLocation
    );
    const arrivalLocation = betterEndpoint(
      preferred.arrivalLocation,
      fallback.arrivalLocation
    );
    const merged: SourceTransportAnchor = {
      ...preferred,
      arrivalLocation,
      arrivalTime: preferred.arrivalTime ?? fallback.arrivalTime,
      confirmation: preferred.confirmation ?? fallback.confirmation,
      date: preferred.date ?? fallback.date,
      departureLocation,
      departureTime: preferred.departureTime ?? fallback.departureTime,
      evidence: combineAnchorEvidence(preferred.evidence, fallback.evidence),
      number: preferred.number ?? fallback.number,
      provider: preferred.provider ?? fallback.provider,
      provenance: uniqueValues([
        ...preferred.provenance,
        ...fallback.provenance,
      ]),
      sourceFilename: preferred.sourceFilename ?? fallback.sourceFilename,
      sourceUploadId: preferred.sourceUploadId ?? fallback.sourceUploadId,
      routeLabel: routeLabelFor({
        arrivalLocation,
        departureLocation,
        fallbackTitle: null,
        kind: preferred.kind,
      }),
    };

    Object.assign(match, merged);
  }

  return canonical;
}

export function getSourceTransportAnchorsFromDraft(
  draft: unknown
): SourceTransportAnchor[] {
  const record = asRecord(draft);
  const sourceRecord = asRecord(record[SOURCE_TRANSPORT_ANCHORS_DRAFT_KEY]);

  return canonicalizeSourceTransportAnchors(asArray(sourceRecord.transport)
    .map((value) => normalizeSourceTransportAnchor(value))
    .filter((value): value is SourceTransportAnchor => Boolean(value)));
}

export function getSourceTransportAnchorsFromUsage(
  usage: unknown
): SourceTransportAnchor[] {
  const record = asRecord(usage);
  const openai = asRecord(record.openai ?? usage);
  const sourceRecord = asRecord(openai.sourceAnchors);

  return canonicalizeSourceTransportAnchors(asArray(sourceRecord.transport)
    .map((value) => normalizeSourceTransportAnchor(value))
    .filter((value): value is SourceTransportAnchor => Boolean(value)));
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
          "connection",
          "connecting",
          "final",
          "flight",
          "from",
          "home",
          "inbound",
          "leg",
          "outbound",
          "return",
          "the",
          "to",
          "train",
          "travel",
        ].includes(token)
    );
}

function overlapScore(a: string | null | undefined, b: string | null | undefined) {
  const left = new Set(textTokens(a));
  const right = new Set(textTokens(b));

  return [...left].filter((token) => right.has(token)).length;
}

function routeTextForMatch(value: {
  arrivalLocation: string | null;
  departureLocation: string | null;
  routeLabel: string;
}) {
  return [
    value.routeLabel,
    value.departureLocation,
    value.arrivalLocation,
  ]
    .filter(Boolean)
    .join(" ");
}

function locationMatches(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.includes(normalizedRight) ||
        normalizedRight.includes(normalizedLeft))
  );
}

function bothHaveEndpointRoutes(
  anchor: SourceTransportAnchor,
  record: {
    arrivalLocation: string | null;
    departureLocation: string | null;
  }
) {
  return Boolean(
    anchor.departureLocation &&
      anchor.arrivalLocation &&
      record.departureLocation &&
      record.arrivalLocation
  );
}

function routeEndpointsMatch(
  anchor: SourceTransportAnchor,
  record: {
    arrivalLocation: string | null;
    departureLocation: string | null;
  }
) {
  return (
    locationMatches(anchor.departureLocation, record.departureLocation) &&
    locationMatches(anchor.arrivalLocation, record.arrivalLocation)
  );
}

function isGenericTransportRouteLabel(
  value: string | null | undefined,
  transportType: string | null | undefined
) {
  const normalized = normalizeText(value);
  const type = normalizeText(transportType);

  if (!normalized || !type) {
    return false;
  }

  return (
    isVagueTransportRouteLabel(normalized, type) ||
    normalized === `${type} to` ||
    normalized.startsWith(`${type} to `) ||
    normalized.startsWith(`${type} from `) ||
    normalized.startsWith(`return ${type} `) ||
    normalized.startsWith(`home ${type} `) ||
    normalized.startsWith(`final ${type} `) ||
    /^(?:flight|train|bus|ferry|transfer|drive|transport)(?:\s+(?:to|from)\s+[a-z0-9 ]+)?$/.test(
      normalized
    )
  );
}

function isVagueTransportRouteLabel(normalized: string, type: string) {
  return (
    normalized === type ||
    normalized === `${type} home` ||
    normalized === `return ${type}` ||
    normalized === `return ${type} home` ||
    normalized === `${type} return` ||
    normalized === `home ${type}` ||
    normalized === `final ${type}` ||
    normalized.startsWith(`return ${type} `) ||
    normalized.startsWith(`home ${type} `) ||
    normalized.startsWith(`final ${type} `)
  );
}

export function sourceTransportAnchorMatchesRecord(
  anchor: SourceTransportAnchor,
  record: {
    arrivalLocation: string | null;
    arrivalTime?: string | null;
    confirmationLabel: string | null;
    date: string | null;
    departureLocation: string | null;
    departureTime?: string | null;
    provider: string | null;
    routeLabel: string;
    transportType: string | null;
  }
) {
  if (record.transportType !== transportTypeForAnchor(anchor.kind)) {
    return false;
  }

  if (anchor.date && record.date && !tripDatesMatch(anchor.date, record.date)) {
    return false;
  }

  const departureTimeMatches = Boolean(
    anchor.departureTime &&
      record.departureTime &&
      anchor.departureTime === record.departureTime
  );
  const arrivalTimeMatches = Boolean(
    anchor.arrivalTime &&
      record.arrivalTime &&
      anchor.arrivalTime === record.arrivalTime
  );

  if (departureTimeMatches && arrivalTimeMatches) {
    return true;
  }

  // RW-AUD-001 semantic fallback (defect docket 2026-07-17): a mangled
  // anchor that still shares one exact clock time, the date, and any route
  // token with a record is describing that record — an identity-join failure
  // must not be reported as a missing traveler row (false Budapest P0).
  if (
    (departureTimeMatches || arrivalTimeMatches) &&
    anchor.date &&
    record.date &&
    tripDatesMatch(anchor.date, record.date) &&
    overlapScore(routeTextForMatch(anchor), routeTextForMatch(record)) >= 1
  ) {
    return true;
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
  const recordRouteText = routeTextForMatch(record);
  const anchorRouteText = routeTextForMatch(anchor);
  const routeOverlap = overlapScore(anchorRouteText, recordRouteText);
  const hasSpecificAnchorRoute = textTokens(anchorRouteText).length >= 2;
  const hasSpecificRecordRoute = textTokens(recordRouteText).length >= 2;
  const bothHaveSpecificRoutes = hasSpecificAnchorRoute && hasSpecificRecordRoute;
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
    anchor.number &&
    normalizeText(recordText).includes(normalizeText(anchor.number))
  ) {
    return true;
  }

  if (
    anchor.confirmation &&
    record.confirmationLabel &&
    normalizeText(anchor.confirmation) === normalizeText(record.confirmationLabel)
  ) {
    if (bothHaveEndpointRoutes(anchor, record)) {
      return routeEndpointsMatch(anchor, record);
    }

    return !bothHaveSpecificRoutes || routeOverlap >= 2;
  }

  if (routeOverlap >= 2) {
    return true;
  }

  if (
    (departureTimeMatches || arrivalTimeMatches) &&
    (locationMatches(anchor.departureLocation, record.departureLocation) ||
      locationMatches(anchor.arrivalLocation, record.arrivalLocation))
  ) {
    return true;
  }

  if (
    routeOverlap >= 1 &&
    !bothHaveSpecificRoutes &&
    isGenericTransportRouteLabel(record.routeLabel, record.transportType)
  ) {
    return true;
  }

  return !bothHaveSpecificRoutes && overlapScore(anchorText, recordText) >= 2;
}
