import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  sourceTransportAnchorMatchesRecord,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";
import {
  hasAuditTokenOverlap,
  summarizeFinalAuditRecords,
  textForAudit,
} from "@/lib/extraction/trip-extraction-audit-lineage";
import type {
  AuditFinalRecordSummary,
  DraftLineageCandidate,
  TripExtractionAuditDiagnostic,
  TripExtractionAuditLineageRow,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  asRecord,
  findOpenAIUsage,
  normalizeAuditIdentity,
} from "@/lib/extraction/trip-extraction-audit-utils";
import {
  getSourceBackedRequiredTransportIssues,
  getSourceBackedTransportFieldGaps,
  getSoftTransportCompletenessIssues,
  isCriticalTransportRecord as isPolicyCriticalTransportRecord,
  type TransportCompletenessRecord,
} from "@/lib/trip-transport-policy";
import { isDayOverviewActivityTitle } from "@/lib/trip-card-taxonomy";
import {
  inferTravelBoundaryTransportKind,
  shouldBeTravelRow,
  type TravelBoundaryRecord,
} from "@/lib/trip-travel-boundary-policy";
import { tripDatesMatch } from "@/lib/extraction/traveler-text";

function travelBoundaryRecordForLineageCandidate(
  candidate: DraftLineageCandidate
): TravelBoundaryRecord {
  return {
    arrivalLocation: "arrival" in candidate ? candidate.arrival : null,
    category: "category" in candidate ? candidate.category : null,
    confirmationLabel:
      "confirmation" in candidate ? candidate.confirmation : null,
    departureLocation: "departure" in candidate ? candidate.departure : null,
    description:
      "description" in candidate ? candidate.description : null,
    itemType: "itemType" in candidate ? candidate.itemType : null,
    provider: "provider" in candidate ? candidate.provider : null,
    title: candidate.title,
    transportType: "type" in candidate ? candidate.type : null,
  };
}

function finalTransportMatchesCandidate(
  candidate: DraftLineageCandidate,
  finalRecords: AuditFinalRecordSummary[]
) {
  const candidateText = textForAudit(candidate);
  const kind = inferTravelBoundaryTransportKind(
    travelBoundaryRecordForLineageCandidate(candidate)
  );

  if (!kind) {
    return true;
  }

  return finalRecords.some((record) => {
    if (record.recordType !== "transport") {
      return false;
    }

    if (candidate.date && record.date && !tripDatesMatch(candidate.date, record.date)) {
      return false;
    }

    if (record.type !== kind) {
      return false;
    }

    return hasAuditTokenOverlap(candidateText, textForAudit(record));
  });
}

function isActiveFinalRecord(record: AuditFinalRecordSummary) {
  return record.status !== "ignored";
}

function canonicalPieceIdsForFinalRecords(
  lineage: TripExtractionAuditLineageRow[],
  records: AuditFinalRecordSummary[]
) {
  const recordIds = new Set(records.map((record) => record.id));
  return lineage.flatMap((row) =>
    row.canonicalPieceId &&
    row.finalRecords.some((record) => recordIds.has(record.id))
      ? [row.canonicalPieceId]
      : []
  );
}

function isCriticalTransportRecord(record: AuditFinalRecordSummary) {
  return record.recordType === "transport" && isPolicyCriticalTransportRecord(
    transportPolicyRecordForFinalRecord(record)
  );
}

function isCriticalTransportCandidate(candidate: DraftLineageCandidate) {
  return shouldBeTravelRow(travelBoundaryRecordForLineageCandidate(candidate));
}

function isActivityCandidate(candidate: DraftLineageCandidate) {
  return "itemType" in candidate && candidate.itemType === "activity";
}

function normalizedText(value: string | null | undefined) {
  return normalizeAuditIdentity(value);
}

function words(value: string | null | undefined) {
  return normalizedText(value)
    .split(" ")
    .filter((word) => word.length > 2);
}

function titleAppearsInText(title: string, text: string) {
  const titleText = normalizedText(title);
  const haystack = normalizedText(text);

  if (!titleText || !haystack) {
    return false;
  }

  if (haystack.includes(titleText)) {
    return true;
  }

  const titleWords = words(titleText);
  const matched = titleWords.filter((word) => haystack.includes(word));

  return matched.length >= Math.min(2, titleWords.length);
}

function noteTextFor(records: StructuredTripRecords) {
  return records.items
    .filter((item) => item.status !== "ignored" && item.itemType === "note")
    .map((item) => [item.title, item.description].filter(Boolean).join(" "))
    .join("\n");
}

function hasWeakNoteMarker(candidate: DraftLineageCandidate) {
  return /\b(optional|maybe|if time|could visit|ideas?|recommendations?|possible sights?|open until|open til|hours?|free\s*\d|free admission|would recommend|recommended)\b/.test(
    textForAudit(candidate).toLowerCase()
  );
}

function hasHighIntentActivitySignal(candidate: DraftLineageCandidate) {
  const text = textForAudit(candidate).toLowerCase();
  const title = candidate.title.toLowerCase();
  const startTime = "startTime" in candidate ? candidate.startTime : null;
  const endTime = "endTime" in candidate ? candidate.endTime : null;

  if (
    startTime ||
    endTime ||
    /\b(ticket|tickets|timed|reserved|reservation|booking|confirmation|provider|paid|paypal|guided tour|tour at|starts at)\b/.test(
      text
    )
  ) {
    return true;
  }

  return /\b(palace|castle|church|cathedral|basilica|synagogue)\b/.test(title);
}

function looksLikeIncludedStopCluster(candidate: DraftLineageCandidate) {
  const description = "description" in candidate ? candidate.description ?? "" : "";
  const text = description.toLowerCase();
  const separators = description
    .split(/\bincluding\b|,|;|\band\b/)
    .map((part) => part.trim())
    .filter((part) => part.length > 3);

  return (
    separators.length >= 4 &&
    /\b(including|palace|castle|grounds|garden|gardens|complex|campus|estate|route|walk|wander|explore)\b/.test(
      text
    )
  );
}

function isLikelyPlannedActivityBuriedInNotes(
  row: TripExtractionAuditLineageRow,
  notesText: string
) {
  const candidate = row.canonical;

  if (
    !candidate ||
    row.status !== "missing_from_structured" ||
    row.finalRecords.length > 0 ||
    !candidate.date ||
    !isActivityCandidate(candidate) ||
    isCriticalTransportCandidate(candidate) ||
    hasWeakNoteMarker(candidate) ||
    !titleAppearsInText(candidate.title, notesText)
  ) {
    return false;
  }

  return (
    hasHighIntentActivitySignal(candidate) ||
    looksLikeIncludedStopCluster(candidate)
  );
}

function transportPolicyRecordForFinalRecord(
  record: AuditFinalRecordSummary
): TransportCompletenessRecord {
  return {
    arrivalLocation: record.arrivalLocation,
    arrivalTime: record.endTime,
    confirmationLabel: record.confirmationLabel,
    departureLocation: record.departureLocation,
    departureTime: record.startTime,
    description: record.description,
    provider: record.provider,
    routeLabel: record.title,
    transportType: record.type,
  };
}

function transportDescriptionLooksContaminated(record: AuditFinalRecordSummary) {
  const text = [record.title, record.description].filter(Boolean).join(" ").toLowerCase();

  if (!text) {
    return false;
  }

  return (
    /\b(check in|check-in|hostel|hotel|airbnb|buzzer|room number|reception)\b/.test(
      text
    ) ||
    /\b(from .*train station|metro line|take .*metro|take .*tram|tram towards|walk .*hostel)\b/.test(
      text
    )
  );
}

function finalRecordForSourceAnchorMatch(record: AuditFinalRecordSummary) {
  return {
    arrivalLocation: record.arrivalLocation,
    arrivalTime: record.endTime,
    confirmationLabel: record.confirmationLabel,
    date: record.date,
    departureLocation: record.departureLocation,
    departureTime: record.startTime,
    provider: record.provider,
    routeLabel: record.title,
    transportType: record.type,
  };
}

function finalRecordMatchesSourceAnchor(
  anchor: SourceTransportAnchor,
  record: AuditFinalRecordSummary
) {
  if (record.recordType !== "transport" || !record.type) {
    return false;
  }

  return sourceTransportAnchorMatchesRecord(
    anchor,
    finalRecordForSourceAnchorMatch(record)
  );
}

function sourceAnchorMissingFields({
  anchor,
  record,
}: {
  anchor: SourceTransportAnchor;
  record: AuditFinalRecordSummary;
}) {
  return getSourceBackedTransportFieldGaps({
    record: transportPolicyRecordForFinalRecord(record),
    source: anchor,
  });
}

function getOcrFailedCount(usage: unknown) {
  const usageRecord = asRecord(usage);
  const ocr = asRecord(usageRecord.ocr);
  const failed = ocr.failed;

  return typeof failed === "number" ? failed : 0;
}

export function createAuditDiagnostics({
  undisposedObservationCount = 0,
  lineage,
  records,
  sourceTransportAnchors = [],
  usage,
}: {
  undisposedObservationCount?: number;
  lineage: TripExtractionAuditLineageRow[];
  records: StructuredTripRecords;
  sourceTransportAnchors?: SourceTransportAnchor[];
  usage?: unknown;
}): TripExtractionAuditDiagnostic[] {
  const diagnostics: TripExtractionAuditDiagnostic[] = [];
  const finalRecords = summarizeFinalAuditRecords(records);
  const ocrFailedCount = getOcrFailedCount(usage);

  if (undisposedObservationCount > 0) {
    diagnostics.push({
      code: "canonical_evidence_disposition_gap",
      detail:
        "Canonical assembly completed without recording exactly one routing outcome for every evidence observation.",
      evidence: [
        `${undisposedObservationCount} observation${undisposedObservationCount === 1 ? " is" : "s are"} missing a canonical disposition.`,
      ],
      severity: "p0",
      title: "Canonical evidence is missing a disposition",
    });
  }

  if (ocrFailedCount > 0) {
    diagnostics.push({
      code: "ocr_backfill_failed",
      detail:
        "One or more visual/OCR extraction attempts failed before trip assembly. Source-backed screenshot details may be missing.",
      evidence: [`${ocrFailedCount} OCR material${ocrFailedCount === 1 ? "" : "s"} failed.`],
      severity: "p0",
      title: "OCR backfill failed",
    });
  }

  // Reconcile before raising a P0 (RW-AUD-001; live runs 7.17.1/7.17.2 both
  // raised false "missing transport" P0s from identity-join failures):
  // 1. An anchor with no time, no digit-bearing number, and no full route is
  //    not independent proof of a transport segment (7.17.2's anchor came
  //    from ÖBB ticket marketing boilerplate).
  // 2. An anchor whose date already has a final transport row of the same
  //    kind is represented — a failed field-level join is a join defect, not
  //    a missing record, and must not be reported as one.
  const anchorHasSegmentSignal = (anchor: SourceTransportAnchor) =>
    Boolean(
      anchor.departureTime ||
        anchor.arrivalTime ||
        (anchor.number && /\d/.test(anchor.number)) ||
        (anchor.departureLocation && anchor.arrivalLocation)
    );
  const sameDateKindRecordExists = (anchor: SourceTransportAnchor) =>
    finalRecords.some(
      (record) =>
        record.recordType === "transport" &&
        Boolean(anchor.date) &&
        record.date === anchor.date &&
        (!record.type ||
          !anchor.kind ||
          record.type === anchor.kind ||
          (anchor.kind === "flight" && /flight|plane/i.test(record.type)) ||
          (anchor.kind === "train" && /train|rail/i.test(record.type)))
    );
  const anchorEvidenceLine = (anchor: SourceTransportAnchor) =>
    `${anchor.date ?? "undated"} - ${anchor.routeLabel}: ${[
      anchor.departureTime,
      anchor.departureLocation,
      anchor.arrivalTime,
      anchor.arrivalLocation,
    ]
      .filter(Boolean)
      .join(" -> ")}`;
  const unmatchedSourceAnchors = sourceTransportAnchors.filter(
    (anchor) =>
      anchorHasSegmentSignal(anchor) &&
      !finalRecords.some((record) => finalRecordMatchesSourceAnchor(anchor, record)) &&
      !sameDateKindRecordExists(anchor)
  );
  // A route-only anchor (no time, no transport number) is thin, positionally
  // dated evidence — it can flag a soft gap but can never authorize a P0 by
  // itself (live-run 7.18.0: a Costs-section route line raised the run's only
  // P0 while all 8 real segments were present and correct).
  const missingSourceAnchors = unmatchedSourceAnchors.filter((anchor) =>
    Boolean(
      anchor.departureTime ||
        anchor.arrivalTime ||
        (anchor.number && /\d/.test(anchor.number))
    )
  );
  const weakUnmatchedSourceAnchors = unmatchedSourceAnchors.filter(
    (anchor) => !missingSourceAnchors.includes(anchor)
  );

  if (missingSourceAnchors.length > 0) {
    diagnostics.push({
      code: "critical_transport_source_anchor_missing",
      detail:
        "Source text or OCR exposed critical transport that did not survive into final travel rows.",
      evidence: missingSourceAnchors.slice(0, 10).map(anchorEvidenceLine),
      severity: "p0",
      title: "Source-backed transport is missing from final app",
    });
  }

  if (weakUnmatchedSourceAnchors.length > 0) {
    diagnostics.push({
      code: "weak_transport_source_anchor_unmatched",
      detail:
        "Route-only source lines (no time, no transport number) did not match a final travel row. These are usually planning or summary lines, not missing segments.",
      evidence: weakUnmatchedSourceAnchors.slice(0, 10).map(anchorEvidenceLine),
      severity: "p2",
      title: "Weak transport source lines left unmatched",
    });
  }

  // Anchor coverage (second-audit finding, 2026-07-17): a final transport
  // row with NO source anchor at all means source-truth verification is
  // blind to that segment (7.18.0 shipped Ryanair FR8331 with zero anchor
  // coverage). Internal quiet notice — never maker-facing, never a mutation.
  const unanchoredTransportRows = finalRecords.filter(
    (record) =>
      record.recordType === "transport" &&
      !sourceTransportAnchors.some((anchor) =>
        finalRecordMatchesSourceAnchor(anchor, record)
      )
  );
  if (
    sourceTransportAnchors.length > 0 &&
    unanchoredTransportRows.length > 0
  ) {
    diagnostics.push({
      code: "transport_row_without_source_anchor",
      detail:
        "Final travel rows with no matching source transport anchor: source-truth verification cannot protect these segments.",
      evidence: unanchoredTransportRows
        .slice(0, 10)
        .map((record) => `${record.date ?? "undated"} - ${record.title}`),
      severity: "p2",
      title: "Travel rows without source-anchor coverage",
    });
  }

  // Deterministic day-section source coverage (wave 2, RW-EVD-001; live runs
  // 7.18.0/7.18.1 silently dropped koscom, "maybe communism museum", Tour
  // Rome, and Szechenyi Baths from day sections in different combinations).
  // Candidate finding only (RW-QA-001/RW-AUD-001): a quiet P2 advisory that
  // never authorizes a mutation and never becomes a maker Question by itself.
  const sourceCoverage = asRecord(findOpenAIUsage(usage).sourceCoverage);
  const uncoveredLineCount = Number(sourceCoverage.uncoveredLineCount) || 0;

  if (uncoveredLineCount > 0) {
    const coverageStages = Array.isArray(sourceCoverage.stages)
      ? sourceCoverage.stages
      : [];
    const evidenceLines = coverageStages.flatMap((stageReport) => {
      const report = asRecord(stageReport);
      const label =
        typeof report.label === "string" ? report.label : "day section";
      const uncovered = Array.isArray(report.uncoveredLines)
        ? report.uncoveredLines
        : [];

      return uncovered.flatMap((line) => {
        const lineRecord = asRecord(line);
        return typeof lineRecord.excerpt === "string"
          ? [`${label}: "${lineRecord.excerpt}"`]
          : [];
      });
    });

    diagnostics.push({
      code: "day_section_source_line_unextracted",
      detail:
        "Deterministic day-section coverage found meaningful source lines that produced no extracted output. Candidate parser drops (RW-EVD-001): verify against the source before acting — this advisory never authorizes a mutation.",
      evidence: evidenceLines.slice(0, 10),
      severity: "p2",
      title: "Day-section source lines produced no observations",
    });
  }

  // Time-corruption tripwire (defect docket 2026-07-17): the detector missed
  // Delta 5925 shipping 2:30-5:00 against a source anchor saying 5:00-6:41.
  // A matched anchor's times are source truth; a final row that disagrees is
  // a hard warning even though the row itself "matched".
  const anchorTimeDisagreements = sourceTransportAnchors.flatMap((anchor) => {
    if (!anchor.departureTime && !anchor.arrivalTime) return [];
    const matched = finalRecords.find(
      (record) =>
        record.recordType === "transport" &&
        finalRecordMatchesSourceAnchor(anchor, record)
    );
    if (!matched) return [];
    const departureDisagrees = Boolean(
      anchor.departureTime &&
        matched.startTime &&
        anchor.departureTime !== matched.startTime
    );
    const arrivalDisagrees = Boolean(
      anchor.arrivalTime &&
        matched.endTime &&
        anchor.arrivalTime !== matched.endTime
    );
    if (!departureDisagrees && !arrivalDisagrees) return [];

    return [
      `${anchor.date ?? "undated"} - ${anchor.routeLabel}: final ${[
        matched.startTime,
        matched.endTime,
      ]
        .filter(Boolean)
        .join(" -> ")} vs source ${[anchor.departureTime, anchor.arrivalTime]
        .filter(Boolean)
        .join(" -> ")}`,
    ];
  });

  if (anchorTimeDisagreements.length > 0) {
    diagnostics.push({
      code: "transport_times_disagree_with_source_anchor",
      detail:
        "A final travel row's times disagree with the source-text anchor that matches it. Source text is authoritative for times.",
      evidence: anchorTimeDisagreements.slice(0, 10),
      severity: "p1",
      title: "Transport times disagree with source text",
    });
  }

  const sourceAnchorsMissingDetails = sourceTransportAnchors
    .flatMap((anchor) => {
      const matchedRecord = finalRecords.find((record) =>
        finalRecordMatchesSourceAnchor(anchor, record)
      );

      if (!matchedRecord) {
        return [];
      }

      const missing = sourceAnchorMissingFields({ anchor, record: matchedRecord });

      return missing.length > 0 ? [{ anchor, missing, record: matchedRecord }] : [];
    });
  const hardSourceAnchorsMissingDetails = sourceAnchorsMissingDetails
    .map(({ anchor, missing, record }) => ({
      anchor,
      missing: missing.filter((issue) => issue.severity === "requiredForReview"),
      record,
    }))
    .filter(({ missing }) => missing.length > 0);
  const softSourceAnchorsMissingDetails = sourceAnchorsMissingDetails
    .map(({ anchor, missing, record }) => ({
      anchor,
      missing: missing.filter((issue) => issue.severity === "softCompleteness"),
      record,
    }))
    .filter(({ missing }) => missing.length > 0);

  if (hardSourceAnchorsMissingDetails.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        hardSourceAnchorsMissingDetails.map(({ record }) => record)
      ),
      code: "critical_transport_source_anchor_missing_details",
      detail:
        "Source text or OCR had critical transport fields that are absent from final travel rows.",
      evidence: hardSourceAnchorsMissingDetails
        .slice(0, 10)
        .map(
          ({ anchor, missing, record }) =>
            `${record.date ?? anchor.date ?? "undated"} - ${record.title}: missing ${missing.map((issue) => issue.label).join(", ")} from source anchor ${anchor.routeLabel}`
        ),
      severity: "p0",
      title: "Source-backed transport details are missing",
    });
  }

  if (softSourceAnchorsMissingDetails.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        softSourceAnchorsMissingDetails.map(({ record }) => record)
      ),
      code: "critical_transport_source_anchor_missing_soft_details",
      detail:
        "Source text or OCR had useful non-blocking transport details that are absent from final travel rows.",
      evidence: softSourceAnchorsMissingDetails
        .slice(0, 10)
        .map(
          ({ anchor, missing, record }) =>
            `${record.date ?? anchor.date ?? "undated"} - ${record.title}: missing ${missing.map((issue) => issue.label).join(", ")} from source anchor ${anchor.routeLabel}`
        ),
      severity: "p2",
      title: "Source-backed transport details could be richer",
    });
  }

  const criticalCandidateRows = lineage
    .filter(
      (row) =>
        row.outputEligible !== false &&
        row.observations.some((observation) => observation.kind === "transport")
    )
    .filter(
      (row) => row.canonical && isCriticalTransportCandidate(row.canonical)
    );
  const unresolvedCritical = criticalCandidateRows.filter(
    (row) =>
      row.canonical && !finalTransportMatchesCandidate(row.canonical, finalRecords)
  );

  if (unresolvedCritical.length > 0) {
    diagnostics.push({
      canonicalPieceIds: unresolvedCritical.flatMap((row) =>
        row.canonicalPieceId ? [row.canonicalPieceId] : []
      ),
      code: "critical_transport_not_travel_row",
      detail:
        "Source-backed flight or intercity train candidates did not become matching travel rows.",
      evidence: unresolvedCritical
        .slice(0, 10)
        .map((row) =>
          `${row.canonical?.date ?? "undated"} - ${row.canonical?.title ?? row.title}`
        ),
      severity: "p0",
      title: "Critical transport candidates are not travel rows",
    });
  }

  const criticalTransportsMissingDetails = finalRecords
    .filter(isActiveFinalRecord)
    .filter(isCriticalTransportRecord)
    .map((record) => ({
      missing: getSourceBackedRequiredTransportIssues(
        transportPolicyRecordForFinalRecord(record)
      ),
      record,
    }))
    .filter(({ missing }) => missing.length > 0);

  if (criticalTransportsMissingDetails.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        criticalTransportsMissingDetails.map(({ record }) => record)
      ),
      code: "critical_transport_missing_details",
      detail:
        "Flight and train rows are missing traveler-critical departure time or station/airport fields.",
      evidence: criticalTransportsMissingDetails
        .slice(0, 10)
        .map(
          ({ missing, record }) =>
            `${record.date ?? "undated"} - ${record.title}: missing ${missing.map((issue) => issue.label).join(", ")}`
        ),
      severity: "p0",
      title: "Critical transport rows are missing details",
    });
  }

  const criticalTransportsMissingSoftDetails = finalRecords
    .filter(isActiveFinalRecord)
    .filter(isCriticalTransportRecord)
    .map((record) => ({
      missing: getSoftTransportCompletenessIssues(
        transportPolicyRecordForFinalRecord(record)
      ),
      record,
    }))
    .filter(({ missing }) => missing.length > 0);

  if (criticalTransportsMissingSoftDetails.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        criticalTransportsMissingSoftDetails.map(({ record }) => record)
      ),
      code: "critical_transport_missing_soft_details",
      detail:
        "Travel rows are missing useful non-blocking arrival details that source evidence appears to contain.",
      evidence: criticalTransportsMissingSoftDetails
        .slice(0, 10)
        .map(
          ({ missing, record }) =>
            `${record.date ?? "undated"} - ${record.title}: missing ${missing.map((issue) => issue.label).join(", ")}`
        ),
      severity: "p2",
      title: "Critical transport rows could be richer",
    });
  }

  const contaminatedTransports = finalRecords
    .filter(isActiveFinalRecord)
    .filter(isCriticalTransportRecord)
    .filter(transportDescriptionLooksContaminated);

  if (contaminatedTransports.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        contaminatedTransports
      ),
      code: "transport_description_contaminated",
      detail:
        "Flight or train rows include stay check-in, hostel directions, or local transfer text that should live elsewhere.",
      evidence: contaminatedTransports
        .slice(0, 10)
        .map((record) => `${record.date ?? "undated"} - ${record.title}`),
      severity: "p1",
      title: "Transport cards include non-transport details",
    });
  }

  const activeActivities = records.items.filter(
    (item) =>
      item.status !== "ignored" &&
      item.itemType === "activity" &&
      !item.parentItemId
  );
  const groups = new Map<string, typeof activeActivities>();

  for (const item of activeActivities) {
    const key = normalizeAuditIdentity(item.title);

    if (!key) {
      continue;
    }

    const existing = groups.get(key) ?? [];

    existing.push(item);
    groups.set(key, existing);
  }

  const duplicateGroups = [...groups.values()].filter((items) => {
    if (items.length < 2) return false;
    const occurrenceKeys = items.map((item) =>
      [item.date, item.startTime]
        .filter(Boolean)
        .join("|")
    );
    const independentlySupportedRepeats =
      occurrenceKeys.every(Boolean) &&
      new Set(occurrenceKeys).size === items.length &&
      items.every(
        (item) =>
          Boolean(item.startTime) ||
          /\b(?:again|another visit|booked|reservation|return visit|second visit|ticketed)\b/i.test(
            [item.title, item.description].filter(Boolean).join(" ")
          )
      );

    return !independentlySupportedRepeats;
  });

  if (duplicateGroups.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        finalRecords.filter((record) =>
          duplicateGroups.some((items) =>
            items.some((item) => item.id === record.id)
          )
        )
      ),
      code: "duplicate_same_venue_activity",
      detail: "Multiple active activity cards have the same normalized identity.",
      evidence: duplicateGroups
        .slice(0, 10)
        .map((items) =>
          items.map((item) => `${item.date ?? "undated"} - ${item.title}`).join("; ")
        ),
      severity: "p1",
      title: "Possible duplicate traveler cards",
    });
  }

  const looseActivityExamples = activeActivities.filter((item) => {
    const text = [item.title, item.description, item.categoryId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      !item.startTime &&
      /\b(cafe ideas|food ideas|ideas|museums|notes|optional|shopping ideas|tip|tips|transit tip|wine notes)\b/.test(
        text
      )
    );
  });

  if (looseActivityExamples.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        finalRecords.filter((record) =>
          looseActivityExamples.some((item) => item.id === record.id)
        )
      ),
      code: "loose_tip_promoted_to_activity",
      detail:
        "Loose recommendations or tips are still appearing as dated activities instead of city notes.",
      evidence: looseActivityExamples
        .slice(0, 12)
        .map((item) => `${item.date ?? "undated"} - ${item.title}`),
      severity: "p1",
      title: "Loose tips promoted to activities",
    });
  }

  const visibleDayOverviews = activeActivities.filter((item) =>
    isDayOverviewActivityTitle(item.title)
  );

  if (visibleDayOverviews.length > 0) {
    diagnostics.push({
      canonicalPieceIds: canonicalPieceIdsForFinalRecords(
        lineage,
        finalRecords.filter((record) =>
          visibleDayOverviews.some((item) => item.id === record.id)
        )
      ),
      code: "day_overview_activity_survived",
      detail:
        "Generic day overview or day-plan cards are still visible as traveler activities.",
      evidence: visibleDayOverviews
        .slice(0, 10)
        .map((item) => `${item.date ?? "undated"} - ${item.title}`),
      severity: "p0",
      title: "Day overview cards survived canonicalization",
    });
  }

  const notesText = noteTextFor(records);
  const buriedPlannedActivities = lineage.filter((row) =>
    isLikelyPlannedActivityBuriedInNotes(row, notesText)
  );

  if (buriedPlannedActivities.length > 0) {
    diagnostics.push({
      canonicalPieceIds: buriedPlannedActivities.flatMap((row) =>
        row.canonicalPieceId ? [row.canonicalPieceId] : []
      ),
      code: "planned_activity_buried_in_city_notes",
      detail:
        "Dated planned activity candidates disappeared from the timeline and now appear only inside city notes.",
      evidence: buriedPlannedActivities
        .slice(0, 12)
        .map((row) => `${row.date ?? "undated"} - ${row.title}`),
      severity: "p1",
      title: "Planned activities were buried in city notes",
    });
  }

  return diagnostics;
}
