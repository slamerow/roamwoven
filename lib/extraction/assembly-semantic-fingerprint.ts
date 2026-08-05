import { createHash } from "node:crypto";
import { normalizeText } from "@/lib/extraction/traveler-text";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

type LegacyFingerprintSurface = {
  activeNotes?: string[];
  groupedStops?: string[];
};

type FingerprintInput = Pick<
  StructuredTripRecords,
  "items" | "legs" | "reviewQuestions" | "stays" | "transport"
>;

type SemanticSection = "items" | "cityNotes" | "review" | "spine";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function digest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function clean(value: unknown) {
  return normalizeText(
    value === null || value === undefined ? null : String(value)
  );
}

function itemIdentity(item: FingerprintInput["items"][number]) {
  return [item.itemType, item.date ?? "", clean(item.title)].join("|");
}

function groupedSortOrderByChild(
  groupedStops: string[] | undefined
) {
  const result = new Map<string, number>();
  for (const entry of groupedStops ?? []) {
    const parts = String(entry).split("|");
    const sortOrder = Number(parts[1]);
    const childTitle = clean(parts[3]);
    if (childTitle && Number.isFinite(sortOrder)) {
      result.set(childTitle, sortOrder);
    }
  }
  return result;
}

function activeItemRows(
  records: FingerprintInput,
  legacy: LegacyFingerprintSurface
) {
  const active = records.items.filter(
    (item) => item.status !== "ignored" && item.itemType !== "note"
  );
  const identityById = new Map(
    active.map((item) => [item.id, itemIdentity(item)])
  );
  const persistedSortOrder = groupedSortOrderByChild(legacy.groupedStops);

  return active
    .map((item) => ({
      date: item.date ?? null,
      kind: item.itemType,
      parent:
        (item.parentItemId && identityById.get(item.parentItemId)) || null,
      sortOrder: item.parentItemId
        ? Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : (persistedSortOrder.get(clean(item.title)) ?? null)
        : null,
      status: item.status,
      title: clean(item.title),
    }))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function cityNoteRows(legacy: LegacyFingerprintSurface) {
  return (legacy.activeNotes ?? [])
    .map((entry) => {
      const [cityNoteKey, date, title, category, location, ...tail] = String(
        entry
      ).split("|");
      const status = tail.at(-1) ?? "";
      const description = tail.slice(0, -1).join("|");
      return {
        category,
        cityNoteKey,
        date: date || null,
        descriptionDigest: digest(description),
        location,
        status,
        title,
      };
    })
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function reviewRows(records: FingerprintInput, includeAnswerOptions: boolean) {
  return records.reviewQuestions
    .filter(
      (question) => question.status === "open" || question.status === "noted"
    )
    .map((question) => ({
      anchor: question.decisionAnchor
        ? {
            date: question.decisionAnchor.date,
            legKey: question.decisionAnchor.legKey,
            normalizedTitle: clean(
              question.decisionAnchor.normalizedTitle
            ),
            sourceAnchorRef: question.decisionAnchor.sourceAnchorRef,
            subjectType: question.decisionAnchor.subjectType,
            version: question.decisionAnchor.version,
          }
        : null,
      answerOptions: includeAnswerOptions
        ? (question.answerOptions ?? []).map((option) => ({
            label: clean(option.label),
            value: clean(option.value),
          }))
        : undefined,
      answerType: question.answerType,
      evidenceDigest: digest(question.evidence ?? ""),
      promptDigest: digest(question.prompt),
      reasonDigest: digest(question.reason),
      status: question.status,
      subjectType: question.subjectType,
      targetField: question.targetField,
    }))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

const PROTECTED_CITY_NOTE_SEGMENT =
  /\b(?:customer|travell?er|passenger)\s+(?:details?|name|email|phone)|\b(?:booking|reservation|confirmation|ticket)\s*(?:number|no\.?|code|reference|id)\b|\b(?:wi[ -]?fi|door|entry|lockbox|buzzer)\s+(?:password|code|instructions?)\b/i;

export function countPublicProtectedCityNoteSegments(
  records: FingerprintInput
) {
  const segments = records.items
    .filter((item) => item.status !== "ignored" && item.itemType === "note")
    .flatMap((item) => String(item.description ?? "").split(/\n+|(?<=[.!?])\s+/))
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.filter((segment) => PROTECTED_CITY_NOTE_SEGMENT.test(segment))
    .length;
}

export function createAssemblySemanticFingerprint({
  legacyFingerprints = {},
  records,
  reviewAnswerOptionsAvailable = true,
}: {
  legacyFingerprints?: LegacyFingerprintSurface;
  records: FingerprintInput;
  reviewAnswerOptionsAvailable?: boolean;
}) {
  const items = activeItemRows(records, legacyFingerprints);
  const cityNotes = cityNoteRows(legacyFingerprints);
  const review = reviewRows(records, reviewAnswerOptionsAvailable);
  const spine = {
    activeItemCount: records.items.filter(
      (item) => item.status !== "ignored" && item.itemType !== "note"
    ).length,
    activeNoteCount: records.items.filter(
      (item) => item.status !== "ignored" && item.itemType === "note"
    ).length,
    callCount: records.reviewQuestions.filter(
      (question) => question.status === "noted"
    ).length,
    groupedStopCount: records.items.filter(
      (item) => item.status !== "ignored" && Boolean(item.parentItemId)
    ).length,
    legCount: records.legs.filter((leg) => leg.status !== "ignored").length,
    openQuestionCount: records.reviewQuestions.filter(
      (question) => question.status === "open"
    ).length,
    publicProtectedValueCount:
      countPublicProtectedCityNoteSegments(records),
    stayCount: records.stays.filter((stay) => stay.status !== "ignored").length,
    transportCount: records.transport.filter(
      (transport) => transport.status !== "ignored"
    ).length,
  };
  const sections = { cityNotes, items, review, spine };

  return {
    fieldAvailability: {
      reviewAnswerOptions: reviewAnswerOptionsAvailable,
    },
    hash: digest(sections),
    sectionHashes: {
      cityNotes: digest(cityNotes),
      items: digest(items),
      review: digest(review),
      spine: digest(spine),
    },
    sections,
    version: 1 as const,
  };
}

export type AssemblySemanticFingerprint = ReturnType<
  typeof createAssemblySemanticFingerprint
>;

export function diffAssemblySemanticFingerprints(
  left: AssemblySemanticFingerprint,
  right: AssemblySemanticFingerprint
) {
  const sections = (Object.keys(left.sectionHashes) as SemanticSection[]).flatMap(
    (section) =>
      left.sectionHashes[section] === right.sectionHashes[section]
        ? []
        : [
            {
              leftCount: Array.isArray(left.sections[section])
                ? left.sections[section].length
                : Object.keys(left.sections[section]).length,
              leftHash: left.sectionHashes[section],
              rightCount: Array.isArray(right.sections[section])
                ? right.sections[section].length
                : Object.keys(right.sections[section]).length,
              rightHash: right.sectionHashes[section],
              section,
            },
          ]
  );

  return {
    equal: left.hash === right.hash,
    fieldAvailability: {
      left: left.fieldAvailability,
      right: right.fieldAvailability,
    },
    leftHash: left.hash,
    rightHash: right.hash,
    sections,
  };
}
