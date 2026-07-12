import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { getAuditSnapshotFromUsage } from "@/lib/extraction/trip-extraction-audit-snapshot";
import type {
  AuditFinalRecordSummary,
  DraftLineageCandidate,
  DraftStayLineageSummary,
  DraftStaySummary,
  TripExtractionAuditLineageRow,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  normalizeAuditIdentity,
  textForAudit,
  truncate,
} from "@/lib/extraction/trip-extraction-audit-utils";

function lineageKey({ date, title }: { date: string | null; title: string }) {
  return `${date ?? "undated"}::${normalizeAuditIdentity(title) || title.toLowerCase()}`;
}

function tokenSet(value: string) {
  const stopWords = new Set([
    "and",
    "arrive",
    "arrives",
    "arrival",
    "at",
    "car",
    "check",
    "departure",
    "drive",
    "fly",
    "from",
    "guided",
    "in",
    "pick",
    "pickup",
    "the",
    "to",
    "tour",
    "train",
    "up",
    "visit",
  ]);

  return new Set(
    normalizeAuditIdentity(value)
      .split(" ")
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

export function hasAuditTokenOverlap(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      return true;
    }
  }

  return false;
}

export function summarizeFinalAuditRecords(records: StructuredTripRecords) {
  const items: AuditFinalRecordSummary[] = records.items
    .filter((item) => item.status !== "ignored")
    .map((item) => ({
      address: item.address,
      arrivalLocation: null,
      confirmationLabel: null,
      category: item.categoryId,
      date: item.date,
      departureLocation: null,
      description: truncate(item.description),
      endTime: item.endTime,
      id: item.id,
      provider: null,
      recordType: "item" as const,
      startTime: item.startTime,
      status: item.status,
      title: item.title,
      type: item.itemType,
    }));
  const transport: AuditFinalRecordSummary[] = records.transport
    .filter((item) => item.status !== "ignored")
    .map((item) => ({
      address: null,
      arrivalLocation: item.arrivalLocation,
      confirmationLabel: item.confirmationLabel,
      category: "arrival_departure",
      date: item.date,
      departureLocation: item.departureLocation,
      description: truncate(item.description),
      endTime: item.arrivalTime,
      id: item.id,
      provider: item.provider,
      recordType: "transport" as const,
      startTime: item.departureTime,
      status: item.status,
      title: item.routeLabel,
      type: item.transportType,
    }));
  const stays: AuditFinalRecordSummary[] = records.stays
    .filter((stay) => stay.status !== "ignored")
    .map((stay) => ({
      address: stay.address,
      arrivalLocation: null,
      confirmationLabel: null,
      category: "stay",
      date: stay.checkInDate,
      departureLocation: null,
      description: null,
      endTime: stay.checkOutTime,
      id: stay.id,
      provider: null,
      recordType: "stay" as const,
      startTime: stay.checkInTime,
      status: stay.status,
      title: stay.name,
      type: stay.stayType,
    }));

  return [...items, ...transport, ...stays];
}

function addCandidate(
  map: Map<string, DraftLineageCandidate>,
  item: DraftLineageCandidate
) {
  map.set(lineageKey(item), item);
}

function summarizeStayForLineage(item: DraftStaySummary): DraftStayLineageSummary {
  return {
    ...item,
    date: item.checkIn,
    title: item.name,
  };
}

export function createAuditLineageRows({
  records,
  usage,
}: {
  records: StructuredTripRecords;
  usage?: unknown;
}): TripExtractionAuditLineageRow[] {
  const canonicalSnapshot = usage
    ? getAuditSnapshotFromUsage(usage, "canonicalDraft")
    : null;
  const canonical = new Map<string, DraftLineageCandidate>();
  const finalByKey = new Map<string, AuditFinalRecordSummary[]>();

  for (const item of canonicalSnapshot?.activities ?? []) {
    addCandidate(canonical, item);
  }
  for (const item of canonicalSnapshot?.transport ?? []) {
    addCandidate(canonical, item);
  }
  for (const item of canonicalSnapshot?.stays ?? []) {
    addCandidate(canonical, summarizeStayForLineage(item));
  }

  for (const item of summarizeFinalAuditRecords(records)) {
    const key = lineageKey(item);
    finalByKey.set(key, [...(finalByKey.get(key) ?? []), item]);
  }

  const keys = new Set([...canonical.keys(), ...finalByKey.keys()]);

  return [...keys]
    .map((key): TripExtractionAuditLineageRow => {
      const canonicalItem = canonical.get(key) ?? null;
      const finalRecords = finalByKey.get(key) ?? [];
      const status = canonicalItem
        ? finalRecords.length > 0
          ? "compiled"
          : "missing_from_structured"
        : "final_only";

      return {
        canonical: canonicalItem,
        date: canonicalItem?.date ?? finalRecords[0]?.date ?? null,
        diagnostics: status === "compiled" ? [] : [status],
        finalRecords,
        identityKey: key,
        status,
        title:
          canonicalItem?.title ??
          finalRecords[0]?.title ??
          key.split("::").pop() ??
          "Untitled",
      };
    })
    .sort((a, b) => {
      const dateCompare = (a.date ?? "9999").localeCompare(b.date ?? "9999");
      return dateCompare || a.title.localeCompare(b.title);
    });
}

export { textForAudit };
