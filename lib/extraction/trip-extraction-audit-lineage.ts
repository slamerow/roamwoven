import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { identityTokens } from "@/lib/extraction/evidence-clustering";
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
import {
  normalizeText,
  normalizeTripClockTime,
  tripDatesMatch,
} from "@/lib/extraction/traveler-text";

function lineageKey({ date, title }: { date: string | null; title: string }) {
  return `${date ?? "undated"}::${normalizeAuditIdentity(title) || title.toLowerCase()}`;
}

function tokenSet(value: string) {
  // Phase 1 (audit B4): the audit joins titles with the pipeline's OWN
  // identity tokenizer (plural folding + the pipeline stopword set). The
  // previous private token model produced phantom duplicate/missing
  // findings whenever the two tokenizers disagreed.
  return new Set(identityTokens(value));
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

function auditTitleIdentityMatches(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;

  return Boolean(
    normalizeAuditIdentity(a) === normalizeAuditIdentity(b) ||
      (overlap >= 2 && union > 0 && overlap / union >= 0.8)
  );
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

function normalizedValuesMatch(
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

function normalizedExactMatch(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const normalizedLeft = normalizeText(left).replace(/\s+/g, "");
  const normalizedRight = normalizeText(right).replace(/\s+/g, "");
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function clockTimesMatch(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const normalizedLeft = normalizeTripClockTime(left);
  const normalizedRight = normalizeTripClockTime(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function semanticMatchScore({
  candidate,
  kind,
  record,
  uniqueConfirmationValues,
}: {
  candidate: DraftLineageCandidate;
  kind: EvidenceArtifactBundle["pieces"][number]["kind"];
  record: AuditFinalRecordSummary;
  uniqueConfirmationValues: Set<string>;
}) {
  const expectedRecordType =
    kind === "transport" ? "transport" : kind === "stay" ? "stay" : "item";

  if (record.recordType !== expectedRecordType) return null;

  const datesAgree = Boolean(
    candidate.date && record.date && tripDatesMatch(candidate.date, record.date)
  );

  if (candidate.date && record.date && !datesAgree) return null;

  if (kind === "transport" && "departure" in candidate) {
    const typeAgrees = Boolean(
      candidate.type && record.type && normalizeText(candidate.type) === normalizeText(record.type)
    );

    if (candidate.type && record.type && !typeAgrees) return null;

    const confirmationAgrees = normalizedExactMatch(
      candidate.confirmation,
      record.confirmationLabel
    );
    const confirmationValue = normalizeText(candidate.confirmation).replace(
      /\s+/g,
      ""
    );
    const uniqueConfirmationAgrees = Boolean(
      confirmationAgrees && uniqueConfirmationValues.has(confirmationValue)
    );
    const departureAgrees = normalizedValuesMatch(
      candidate.departure,
      record.departureLocation
    );
    const arrivalAgrees = normalizedValuesMatch(
      candidate.arrival,
      record.arrivalLocation
    );
    const departureTimeAgrees = clockTimesMatch(
      candidate.departureTime,
      record.startTime
    );
    const arrivalTimeAgrees = clockTimesMatch(candidate.arrivalTime, record.endTime);
    const providerAgrees = normalizedValuesMatch(candidate.provider, record.provider);
    const titleAgrees = hasAuditTokenOverlap(candidate.title, record.title);
    const typedAgreementCount = [
      confirmationAgrees,
      datesAgree,
      departureAgrees,
      arrivalAgrees,
      departureTimeAgrees,
      arrivalTimeAgrees,
      providerAgrees,
      titleAgrees,
    ].filter(Boolean).length;
    const routeAgrees = departureAgrees && arrivalAgrees;
    const hasIndependentProof =
      uniqueConfirmationAgrees || typedAgreementCount >= 2;

    if (!hasIndependentProof) return null;

    return (
      (confirmationAgrees ? 10 : 0) +
      (routeAgrees ? 8 : 0) +
      (datesAgree ? 4 : 0) +
      (typeAgrees ? 3 : 0) +
      (departureTimeAgrees ? 2 : 0) +
      (arrivalTimeAgrees ? 2 : 0) +
      (providerAgrees ? 2 : 0) +
      (titleAgrees ? 1 : 0)
    );
  }

  if (kind === "stay" && "name" in candidate) {
    const nameAgrees = normalizedValuesMatch(candidate.name, record.title);
    const addressAgrees = normalizedValuesMatch(candidate.address, record.address);
    const typedAgreementCount = [nameAgrees, addressAgrees, datesAgree].filter(
      Boolean
    ).length;

    if (typedAgreementCount < 2) return null;

    return (addressAgrees ? 8 : 0) + (nameAgrees ? 5 : 0) + (datesAgree ? 4 : 0);
  }

  if (record.recordType !== "item") return null;

  const titleAgrees = normalizedExactMatch(candidate.title, record.title);
  const titleTokensAgree = auditTitleIdentityMatches(
    candidate.title,
    record.title
  );
  const typeAgrees =
    "itemType" in candidate && candidate.itemType && record.type
      ? normalizeText(candidate.itemType) === normalizeText(record.type)
      : false;
  const locationAgrees =
    "locationName" in candidate
      ? normalizedValuesMatch(candidate.locationName, record.title) ||
        normalizedValuesMatch(candidate.locationName, record.address)
      : false;
  const typedAgreementCount = [
    datesAgree,
    titleAgrees || titleTokensAgree,
    typeAgrees,
    locationAgrees,
  ].filter(Boolean).length;

  if (!(titleAgrees || titleTokensAgree || locationAgrees) || typedAgreementCount < 2) {
    return null;
  }

  return (
    (titleAgrees ? 8 : 0) +
    (titleTokensAgree ? 2 : 0) +
    (datesAgree ? 4 : 0) +
    (typeAgrees ? 2 : 0) +
    (locationAgrees ? 2 : 0)
  );
}

function uniqueSemanticMatch({
  candidate,
  finalRecords,
  kind,
  usedFinalRecordIds,
}: {
  candidate: DraftLineageCandidate;
  finalRecords: AuditFinalRecordSummary[];
  kind: EvidenceArtifactBundle["pieces"][number]["kind"];
  usedFinalRecordIds: Set<string>;
}) {
  const confirmationCounts = finalRecords.reduce((counts, record) => {
    const value = normalizeText(record.confirmationLabel).replace(/\s+/g, "");
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const uniqueConfirmationValues = new Set(
    [...confirmationCounts]
      .filter(([, count]) => count === 1)
      .map(([value]) => value)
  );
  const ranked = finalRecords
    .filter((record) => !usedFinalRecordIds.has(record.id))
    .flatMap((record) => {
      const score = semanticMatchScore({
        candidate,
        kind,
        record,
        uniqueConfirmationValues,
      });
      return score === null ? [] : [{ record, score }];
    })
    .sort((left, right) => right.score - left.score);

  if (ranked.length === 0) return null;
  if (ranked[1] && ranked[0].score === ranked[1].score) return null;

  return ranked[0].record;
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

  const numberValue = (key: string) => {
    const value = payload[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return {
    address: recordValue(payload, "address"),
    approxLatitude: numberValue("approxLatitude"),
    approxLongitude: numberValue("approxLongitude"),
    // Geocode-lane results ride into lineage so radius claims are
    // verifiable from the QA bundle (live-run 7.21.0: the Gresham "within
    // 300 m" call was unfalsifiable — zero verified fields in the bundle).
    verifiedLatitude: numberValue("verifiedLatitude"),
    verifiedLongitude: numberValue("verifiedLongitude"),
    geoVerified: payload._geoVerified === true ? true : null,
    area: recordValue(payload, "area"),
    category: recordValue(payload, "category"),
    date: recordValue(payload, "date"),
    description: truncate(recordValue(payload, "description")),
    endTime: recordValue(payload, "endTime"),
    evidence: null,
    itemType: recordValue(payload, "itemType"),
    locationName: recordValue(payload, "locationName"),
    sourceFilename: recordValue(payload, "sourceFilename"),
    sourceHeadingPath: Array.isArray(payload.sourceHeadingPath)
      ? payload.sourceHeadingPath.filter(
          (value): value is string => typeof value === "string"
        )
      : null,
    sourceSectionLabel: recordValue(payload, "sourceSectionLabel"),
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
  const exactMatchesByPieceId = new Map(
    artifacts.pieces.map((piece) => [
      piece.id,
      piece.outputEligible
        ? finalRecords.filter((record) => record.canonicalId === piece.id)
        : [],
    ])
  );

  for (const matches of exactMatchesByPieceId.values()) {
    matches.forEach((record) => usedFinalRecordIds.add(record.id));
  }
  const observationById = new Map(
    artifacts.observations.map((observation) => [observation.id, observation])
  );
  const rows = artifacts.pieces.map((piece): TripExtractionAuditLineageRow => {
    const canonical = candidateFromArtifactPiece(piece);
    const exactMatches = exactMatchesByPieceId.get(piece.id) ?? [];
    const semanticMatch =
      piece.outputEligible && exactMatches.length === 0
        ? uniqueSemanticMatch({
            candidate: canonical,
            finalRecords,
            kind: piece.kind,
            usedFinalRecordIds,
          })
        : null;
    const matches = semanticMatch ? [semanticMatch] : exactMatches;
    const matchMethod =
      exactMatches.length > 0
        ? "canonical_id" as const
        : semanticMatch
          ? "semantic_fallback" as const
          : "none" as const;

    matches.forEach((record) => usedFinalRecordIds.add(record.id));

    return {
      actions: piece.actions,
      canonical,
      canonicalPieceId: piece.id,
      date: canonical.date,
      diagnostics: piece.outputEligible
        ? matches.length > 0
          ? matchMethod === "semantic_fallback"
            ? ["canonical_identity_mismatch_reconciled"]
            : []
          : ["missing_from_structured"]
        : ["suppressed"],
      finalRecords: matches,
      identityKey: piece.id,
      mergeReasons: piece.mergeReasons,
      matchMethod,
      observations: piece.observationIds.flatMap((id) => {
        const observation = observationById.get(id);

        if (!observation) return [];

        const observationNumber = (key: string) => {
          const value = observation.payload[key];
          return typeof value === "number" && Number.isFinite(value)
            ? value
            : null;
        };

        return [{
          approxLatitude: observationNumber("approxLatitude"),
          approxLongitude: observationNumber("approxLongitude"),
          verifiedLatitude: observationNumber("verifiedLatitude"),
          verifiedLongitude: observationNumber("verifiedLongitude"),
          area: recordValue(observation.payload, "area"),
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
      matchMethod: "none",
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
        matchMethod: finalRecords.length > 0 && canonicalItem ? "semantic_fallback" : "none",
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
