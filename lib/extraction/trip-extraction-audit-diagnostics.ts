import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import {
  hasAuditTokenOverlap,
  summarizeFinalAuditRecords,
  textForAudit,
  transportKindForAuditText,
} from "@/lib/extraction/trip-extraction-audit-lineage";
import type {
  AuditFinalRecordSummary,
  DraftLineageCandidate,
  TripExtractionAuditDiagnostic,
  TripExtractionAuditLineageRow,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  asArray,
  asRecord,
  findOpenAIUsage,
  getString,
  normalizeAuditIdentity,
} from "@/lib/extraction/trip-extraction-audit-utils";

function finalTransportMatchesCandidate(
  candidate: DraftLineageCandidate,
  finalRecords: AuditFinalRecordSummary[]
) {
  const candidateText = textForAudit(candidate);
  const kind = transportKindForAuditText(candidateText);

  if (!kind) {
    return true;
  }

  return finalRecords.some((record) => {
    if (record.recordType !== "transport") {
      return false;
    }

    if (candidate.date && record.date && candidate.date !== record.date) {
      return false;
    }

    if (kind === "rental_car") {
      return record.type === "rental_car" || record.type === "drive";
    }

    if (record.type !== kind) {
      return false;
    }

    return hasAuditTokenOverlap(candidateText, textForAudit(record));
  });
}

function classifyActivityTitle(value: string) {
  const text = value.toLowerCase();
  const classes: string[] = [];

  if (/\b(breakfast|beer|cafe|dinner|food|lunch|restaurant)\b/.test(text)) {
    classes.push("food");
  }
  if (/\b(castle|cathedral|church|palace|basilica)\b/.test(text)) {
    classes.push("site");
  }
  if (/\b(kgb|museum|gallery|library)\b/.test(text)) {
    classes.push("museum");
  }
  if (/\b(statue|bridge|square)\b/.test(text)) {
    classes.push("landmark");
  }
  if (/\b(ticket|tour|guided)\b/.test(text)) {
    classes.push("ticket");
  }

  return classes.length ? classes : ["other"];
}

export function createAuditDiagnostics({
  lineage,
  records,
  usage,
}: {
  lineage: TripExtractionAuditLineageRow[];
  records: StructuredTripRecords;
  usage?: unknown;
}): TripExtractionAuditDiagnostic[] {
  const diagnostics: TripExtractionAuditDiagnostic[] = [];
  const finalRecords = summarizeFinalAuditRecords(records);
  const criticalCandidates = lineage
    .map((row) => row.raw ?? row.assembled)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => transportKindForAuditText(textForAudit(item)));
  const unresolvedCritical = criticalCandidates.filter(
    (item) => !finalTransportMatchesCandidate(item, finalRecords)
  );

  if (unresolvedCritical.length > 0) {
    diagnostics.push({
      code: "critical_transport_not_travel_row",
      detail:
        "Source-backed transport or rental-car candidates did not become matching travel rows.",
      evidence: unresolvedCritical
        .slice(0, 10)
        .map((item) => `${item.date ?? "undated"} - ${item.title}`),
      severity: "p0",
      title: "Critical transport candidates are not travel rows",
    });
  }

  const activeActivities = records.items.filter(
    (item) => item.status !== "ignored" && item.itemType === "activity"
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

  const duplicateGroups = [...groups.values()].filter((items) => items.length > 1);

  if (duplicateGroups.length > 0) {
    diagnostics.push({
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

  const consolidation = asRecord(findOpenAIUsage(usage).consolidation);
  const groupedChildrenByParent = new Map<string, string[]>();

  for (const item of asArray(consolidation.removedGroupedChildren)) {
    const record = asRecord(item);
    const parent = getString(record, "groupedUnder");
    const removedTitle = getString(record, "removedTitle");

    if (!parent || !removedTitle) {
      continue;
    }

    const children = groupedChildrenByParent.get(parent) ?? [];

    children.push(removedTitle);
    groupedChildrenByParent.set(parent, children);
  }

  const riskyGroups = [...groupedChildrenByParent.entries()].filter(([, children]) => {
    const classes = new Set(children.flatMap(classifyActivityTitle));

    return children.length >= 3 && classes.size >= 3;
  });

  if (riskyGroups.length > 0) {
    diagnostics.push({
      code: "over_grouping_risk",
      detail: "Grouped cards absorbed child stops from several different semantic classes.",
      evidence: riskyGroups
        .slice(0, 8)
        .map(([parent, children]) => `${parent}: ${children.join(", ")}`),
      severity: "p1",
      title: "Possible over-grouping",
    });
  }

  return diagnostics;
}
