import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import type { EvidenceArtifactBundle } from "@/lib/extraction/evidence-artifacts";
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
      canonicalId: item.canonicalId,
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
      canonicalId: item.canonicalId,
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
      canonicalId: stay.canonicalId,
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

function recordValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function candidateFromArtifactPiece(
  piece: EvidenceArtifactBundle["pieces"][number]
): DraftLineageCandidate {
  const payload = piece.payload;
  const title =
    recordValue(payload, "title") ??
    recordValue(payload, "name") ??
    recordValue(payload, "city") ??
    "Untitled evidence";

  if (piece.kind === "stay") {
    return {
      address: recordValue(payload, "address"),
      checkIn:
        recordValue(payload, "checkIn") ??
        recordValue(payload, "firstNightDate"),
      checkInTime: recordValue(payload, "checkInTime"),
      checkOut: recordValue(payload, "checkOut"),
      checkOutTime: recordValue(payload, "checkOutTime"),
      date:
        recordValue(payload, "checkIn") ??
        recordValue(payload, "firstNightDate"),
      name: title,
      title,
    };
  }

  if (piece.kind === "transport") {
    return {
      arrival:
        recordValue(payload, "arrival") ??
        recordValue(payload, "arrivalLocation"),
      arrivalTime: recordValue(payload, "arrivalTime"),
      confirmation:
        recordValue(payload, "confirmation") ??
        recordValue(payload, "confirmationLabel"),
      date: recordValue(payload, "date"),
      departure:
        recordValue(payload, "departure") ??
        recordValue(payload, "departureLocation"),
      departureTime: recordValue(payload, "departureTime"),
      description: truncate(recordValue(payload, "description")),
      provider: recordValue(payload, "provider"),
      title,
      type: recordValue(payload, "type"),
    };
  }

  return {
    address: recordValue(payload, "address"),
    category: recordValue(payload, "category"),
    date: recordValue(payload, "date"),
    description: truncate(recordValue(payload, "description")),
    endTime: recordValue(payload, "endTime"),
    evidence: null,
    itemType: recordValue(payload, "itemType"),
    locationName: recordValue(payload, "locationName"),
    sourceFilename: recordValue(payload, "sourceFilename"),
    startTime:
      recordValue(payload, "startTime") ?? recordValue(payload, "time"),
    title,
  };
}

function createArtifactLineageRows({
  artifacts,
  records,
}: {
  artifacts: EvidenceArtifactBundle;
  records: StructuredTripRecords;
}) {
  const finalRecords = summarizeFinalAuditRecords(records);
  const usedFinalRecordIds = new Set<string>();
  const observationById = new Map(
    artifacts.observations.map((observation) => [observation.id, observation])
  );
  const rows = artifacts.pieces.map((piece): TripExtractionAuditLineageRow => {
    const canonical = candidateFromArtifactPiece(piece);
    const matches = piece.outputEligible
      ? finalRecords.filter((record) => record.canonicalId === piece.id)
      : [];

    matches.forEach((record) => usedFinalRecordIds.add(record.id));

    return {
      actions: piece.actions,
      canonical,
      canonicalPieceId: piece.id,
      date: canonical.date,
      diagnostics: piece.outputEligible
        ? matches.length > 0
          ? []
          : ["missing_from_structured"]
        : ["suppressed"],
      finalRecords: matches,
      identityKey: piece.id,
      mergeReasons: piece.mergeReasons,
      observations: piece.observationIds.flatMap((id) => {
        const observation = observationById.get(id);

        if (!observation) return [];

        return [{
          date:
            recordValue(observation.payload, "date") ??
            recordValue(observation.payload, "checkIn"),
          id: observation.id,
          kind: observation.kind,
          role: observation.role,
          source: observation.source,
          sourceLabel: observation.sourceLabel,
          title:
            recordValue(observation.payload, "title") ??
            recordValue(observation.payload, "name") ??
            observation.sourceLabel,
        }];
      }),
      outputEligible: piece.outputEligible,
      status: piece.outputEligible
        ? matches.length > 0
          ? "compiled"
          : "missing_from_structured"
        : "suppressed",
      title: canonical.title,
    };
  });

  for (const record of finalRecords) {
    if (usedFinalRecordIds.has(record.id)) continue;

    rows.push({
      actions: [],
      canonical: null,
      canonicalPieceId: null,
      date: record.date,
      diagnostics: ["final_only"],
      finalRecords: [record],
      identityKey: `final::${record.id}`,
      mergeReasons: [],
      observations: [],
      outputEligible: null,
      status: "final_only",
      title: record.title,
    });
  }

  return rows.sort((a, b) => {
    const dateCompare = (a.date ?? "9999").localeCompare(b.date ?? "9999");
    return dateCompare || a.title.localeCompare(b.title);
  });
}

function summarizeStayForLineage(item: DraftStaySummary): DraftStayLineageSummary {
  return {
    ...item,
    date: item.checkIn,
    title: item.name,
  };
}

export function createAuditLineageRows({
  artifacts,
  records,
  usage,
}: {
  artifacts?: EvidenceArtifactBundle | null;
  records: StructuredTripRecords;
  usage?: unknown;
}): TripExtractionAuditLineageRow[] {
  if (artifacts) {
    return createArtifactLineageRows({ artifacts, records });
  }

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
        actions: [],
        canonical: canonicalItem,
        canonicalPieceId: null,
        date: canonicalItem?.date ?? finalRecords[0]?.date ?? null,
        diagnostics: status === "compiled" ? [] : [status],
        finalRecords,
        identityKey: key,
        mergeReasons: [],
        observations: [],
        outputEligible: canonicalItem ? true : null,
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
