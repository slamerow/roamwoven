import type { StructuredTripRecords } from "@/lib/generated-trip-model";
import { getAuditSnapshotFromUsage } from "@/lib/extraction/trip-extraction-audit-snapshot";
import type {
  AuditAssemblyAction,
  AuditFinalRecordSummary,
  DraftLineageCandidate,
  DraftStayLineageSummary,
  DraftStaySummary,
  TripExtractionAuditLineageRow,
} from "@/lib/extraction/trip-extraction-audit-types";
import {
  asArray,
  asRecord,
  findOpenAIUsage,
  getString,
  normalizeAuditIdentity,
  textForAudit,
  truncate,
} from "@/lib/extraction/trip-extraction-audit-utils";

function lineageKey({
  date,
  title,
}: {
  date: string | null;
  title: string;
}) {
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

export function transportKindForAuditText(value: string) {
  const text = value.toLowerCase();

  if (
    /\b(ferris wheel|observation wheel|panorama train|scenic train|scenic railway|ring tram|tram tour|funicular|cable car|gondola|boat tour|river cruise|sightseeing cruise)\b/.test(
      text
    )
  ) {
    return null;
  }

  if (/\b(flight|fly|airport|fco|jfk|dca|terminal)\b/.test(text)) {
    return "flight";
  }

  if (/\b(train to|rail to|station|bahnhof|hbf|hl\.?\s?n\.?)\b/.test(text)) {
    return "train";
  }

  return null;
}

export function summarizeFinalAuditRecords(records: StructuredTripRecords) {
  const items: AuditFinalRecordSummary[] = records.items
    .filter((item) => item.status !== "ignored")
    .map((item) => ({
      address: item.address,
      category: item.categoryId,
      date: item.date,
      description: truncate(item.description),
      endTime: item.endTime,
      id: item.id,
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
      category: "arrival_departure",
      date: item.date,
      description: truncate(item.description),
      endTime: item.arrivalTime,
      id: item.id,
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
      category: "stay",
      date: stay.checkInDate,
      description: null,
      endTime: stay.checkOutTime,
      id: stay.id,
      recordType: "stay" as const,
      startTime: stay.checkInTime,
      status: stay.status,
      title: stay.name,
      type: stay.stayType,
    }));

  return [...items, ...transport, ...stays];
}

function addAction(
  index: Map<string, AuditAssemblyAction[]>,
  key: string,
  action: AuditAssemblyAction
) {
  const actions = index.get(key) ?? [];

  actions.push(action);
  index.set(key, actions);
}

function createAssemblyActionIndex(usage: unknown) {
  const openai = findOpenAIUsage(usage);
  const consolidation = asRecord(openai.consolidation);
  const index = new Map<string, AuditAssemblyAction[]>();

  for (const item of asArray(consolidation.suppressedTransportActivities)) {
    const record = asRecord(item);
    const removedTitle = getString(record, "removedTitle") ?? "Untitled activity";

    addAction(index, lineageKey({ date: getString(record, "date"), title: removedTitle }), {
      action: "suppressed_transport_activity",
      detail: `Merged into ${getString(record, "matchedTransportTitle") ?? "transport"}.`,
    });
  }

  for (const item of asArray(consolidation.foldedLodgingNotes)) {
    const record = asRecord(item);
    const title = getString(record, "title") ?? "Untitled activity";

    addAction(index, lineageKey({ date: null, title }), {
      action: "folded_lodging_note",
      detail: `Folded into ${getString(record, "stayTitle") ?? "stay"}.`,
    });
  }

  for (const item of asArray(consolidation.removedDuplicateParents)) {
    const record = asRecord(item);
    const removedTitle = getString(record, "removedTitle") ?? "Untitled activity";

    addAction(index, lineageKey({ date: getString(record, "date"), title: removedTitle }), {
      action: "removed_duplicate_parent",
      detail: getString(record, "reason") ?? "Named child cards covered it.",
    });
  }

  for (const item of asArray(consolidation.removedGroupedChildren)) {
    const record = asRecord(item);
    const removedTitle = getString(record, "removedTitle") ?? "Untitled activity";
    const groupedUnder = getString(record, "groupedUnder") ?? "grouped activity";

    addAction(index, lineageKey({ date: getString(record, "date"), title: removedTitle }), {
      action: "grouped_child_removed",
      detail: `Grouped under ${groupedUnder}.`,
    });
    addAction(index, lineageKey({ date: getString(record, "date"), title: groupedUnder }), {
      action: "grouped_children_added",
      detail: `Absorbed ${removedTitle}.`,
    });
  }

  for (const item of asArray(consolidation.suppressedDayOverviews)) {
    const record = asRecord(item);
    const removedTitle = getString(record, "removedTitle") ?? "Untitled activity";

    addAction(index, lineageKey({ date: getString(record, "date"), title: removedTitle }), {
      action: "suppressed_day_overview",
      detail: "Generic day overview was suppressed.",
    });
  }

  for (const item of asArray(consolidation.mergedCityNotes)) {
    const record = asRecord(item);
    const city = getString(record, "city") ?? "city";

    for (const sourceTitle of asArray(record.sourceTitles)) {
      if (typeof sourceTitle !== "string") {
        continue;
      }

      addAction(index, lineageKey({ date: null, title: sourceTitle }), {
        action: "merged_city_note",
        detail: `Merged into ${city} city notes.`,
      });
    }
  }

  for (const item of asArray(consolidation.wrongCityPlacements)) {
    const record = asRecord(item);
    const title = getString(record, "title") ?? "Untitled activity";

    addAction(index, lineageKey({ date: getString(record, "date"), title }), {
      action: "wrong_city_guard",
      detail: `${getString(record, "action") ?? "checked"} for ${getString(record, "explicitCity") ?? "explicit city"}.`,
    });
  }

  return index;
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
  const rawSnapshot = usage
    ? getAuditSnapshotFromUsage(usage, "preAssemblyDraft")
    : null;
  const assembledSnapshot = usage
    ? getAuditSnapshotFromUsage(usage, "assembledDraft")
    : null;
  const raw = new Map<string, DraftLineageCandidate>();
  const assembled = new Map<string, DraftLineageCandidate>();
  const finalRecords = summarizeFinalAuditRecords(records);
  const finalByKey = new Map<string, AuditFinalRecordSummary[]>();
  const actionIndex = usage ? createAssemblyActionIndex(usage) : new Map();

  for (const item of rawSnapshot?.activities ?? []) addCandidate(raw, item);
  for (const item of rawSnapshot?.transport ?? []) addCandidate(raw, item);
  for (const item of rawSnapshot?.stays ?? []) {
    addCandidate(raw, summarizeStayForLineage(item));
  }

  for (const item of assembledSnapshot?.activities ?? []) addCandidate(assembled, item);
  for (const item of assembledSnapshot?.transport ?? []) addCandidate(assembled, item);
  for (const item of assembledSnapshot?.stays ?? []) {
    addCandidate(assembled, summarizeStayForLineage(item));
  }

  for (const item of finalRecords) {
    const key = lineageKey(item);
    const existing = finalByKey.get(key) ?? [];

    existing.push(item);
    finalByKey.set(key, existing);
  }

  const keys = new Set([
    ...raw.keys(),
    ...assembled.keys(),
    ...finalByKey.keys(),
    ...actionIndex.keys(),
  ]);

  return [...keys]
    .map((key) => {
      const rawItem = raw.get(key) ?? null;
      const assembledItem = assembled.get(key) ?? null;
      const finals = finalByKey.get(key) ?? [];
      const title =
        rawItem?.title ??
        assembledItem?.title ??
        finals[0]?.title ??
        key.split("::").pop() ??
        "Untitled";
      const date = rawItem?.date ?? assembledItem?.date ?? finals[0]?.date ?? null;
      const actions = actionIndex.get(key) ?? [];
      const diagnostics: string[] = [];
      let status: TripExtractionAuditLineageRow["status"] = "unmatched";

      if (rawItem && assembledItem && finals.length > 0) {
        status = "survived";
      } else if (rawItem && !assembledItem) {
        status = "removed_in_assembly";
      } else if (rawItem && assembledItem && finals.length === 0) {
        status = "lost_after_assembly";
      } else if (!rawItem && assembledItem && finals.length === 0) {
        status = "created_in_assembly";
      } else if (!rawItem && !assembledItem && finals.length > 0) {
        status = "final_only";
      }

      if (status !== "survived") {
        diagnostics.push(status);
      }

      for (const action of actions) {
        diagnostics.push(action.action);
      }

      return {
        assemblyActions: actions,
        assembled: assembledItem,
        date,
        diagnostics,
        finalRecords: finals,
        identityKey: key,
        raw: rawItem,
        status,
        title,
      };
    })
    .sort((a, b) => {
      const dateCompare = (a.date ?? "9999").localeCompare(b.date ?? "9999");

      return dateCompare || a.title.localeCompare(b.title);
    });
}

export { textForAudit };
