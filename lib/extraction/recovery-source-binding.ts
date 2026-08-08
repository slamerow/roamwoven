import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import {
  hashStableValue,
  stableJsonStringify,
  type SourceDocumentIndexV1,
  type SourceDocumentSpanV1,
} from "@/lib/extraction/source-document-index";
import { splitLineClauses } from "@/lib/extraction/source-coverage";
import type { SourceRecoveryPlan } from "@/lib/extraction/source-recovery";
import { normalizeText } from "@/lib/extraction/traveler-text";

export type RecoverySourceBindingStatusV1 =
  | "exact"
  | "unique_section_match"
  | "ambiguous"
  | "unresolved";

export type RecoveryExcerptSourceBindingV1 = {
  bindingId: string;
  excerptDigest: string;
  sectionDigest: string;
  sourceSpanIds: string[];
  unresolvedSourceSpanIds: string[];
  status: "exact" | "ambiguous" | "unresolved";
};

export type RecoveryCandidateSourceBindingV1 = {
  bindingId: string;
  // In-memory join only. The decision-ledger builder must remove it before
  // serialization and telemetry.
  ephemeralResolverCandidateId: string | null;
  recordClass:
    | "activity"
    | "decision"
    | "place"
    | "protected_detail"
    | "stay"
    | "transport";
  recordDigest: string;
  sourceSpanIds: string[];
  unresolvedSourceSpanIds: string[];
  status: RecoverySourceBindingStatusV1;
};

export type RecoverySourceBindingSidecarV1 = {
  schemaVersion: 1;
  planDigest: string;
  requestDigest: string;
  excerptBindings: RecoveryExcerptSourceBindingV1[];
  candidateBindings: RecoveryCandidateSourceBindingV1[];
  ambiguousCount: number;
  unresolvedCount: number;
};

const RECORD_ARRAYS = [
  ["activities", "activity"],
  ["missingDetails", "decision"],
  ["places", "place"],
  ["sensitiveDetails", "protected_detail"],
  ["stays", "stay"],
  ["transport", "transport"],
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];
}

function candidateTitle(record: Record<string, unknown>) {
  return (
    stringValue(record, "title") ??
    stringValue(record, "name") ??
    stringValue(record, "routeLabel") ??
    stringValue(record, "relatedTitle") ??
    stringValue(record, "prompt") ??
    ""
  );
}

function candidateSection(record: Record<string, unknown>) {
  return (
    stringValue(record, "sourceSectionLabel") ??
    arrayStrings(record.sourceHeadingPath).at(-1) ??
    null
  );
}

function sectionCompatible(span: SourceDocumentSpanV1, section: string | null) {
  const normalizedSection = normalizeText(section);
  if (!normalizedSection) return true;
  if (!span.normalizedSectionLabel) return false;
  return (
    span.normalizedSectionLabel === normalizedSection ||
    span.normalizedSectionLabel.includes(normalizedSection) ||
    normalizedSection.includes(span.normalizedSectionLabel)
  );
}

function isRecoveryStage(stage: EvidenceStageInput) {
  return asRecord(stage.stage)._sourceRecovery === true;
}

function allowedSpanIdsForSection({
  index,
  section,
  stages,
}: {
  index: SourceDocumentIndexV1;
  section: SourceRecoveryPlan["sections"][number];
  stages: EvidenceStageInput[];
}) {
  const candidates = stages.filter(
    (stage) => !isRecoveryStage(stage) && stage.label === section.label
  );
  const ids = new Set<string>();
  for (const stage of candidates) {
    for (const spanId of stage.sourceSpanIds ?? []) {
      if (index.lookups.spanById.has(spanId)) ids.add(spanId);
    }
    if (stage.sourceUploadId) {
      for (const spanId of
        index.lookups.spanIdsBySourceUploadId.get(stage.sourceUploadId) ?? []) {
        ids.add(spanId);
      }
    }
  }
  const sectionLabel = section.dayHeading ?? section.label;
  return new Set(
    [...ids].filter((spanId) => {
      const span = index.lookups.spanById.get(spanId);
      return Boolean(span && sectionCompatible(span, sectionLabel));
    })
  );
}

function normalizedExcerptClauses(
  index: SourceDocumentIndexV1,
  excerpt: string
) {
  const normalizedExcerpt = normalizeText(excerpt);
  if (index.lookups.spanIdsByNormalizedClause.has(normalizedExcerpt)) {
    return [normalizedExcerpt];
  }
  const clauses = splitLineClauses(excerpt)
    .map(normalizeText)
    .filter(Boolean);
  return clauses.length > 0 ? [...new Set(clauses)] : [normalizedExcerpt];
}

function buildExcerptBinding({
  excerpt,
  index,
  section,
  stages,
}: {
  excerpt: string;
  index: SourceDocumentIndexV1;
  section: SourceRecoveryPlan["sections"][number];
  stages: EvidenceStageInput[];
}): RecoveryExcerptSourceBindingV1 {
  const allowed = allowedSpanIdsForSection({ index, section, stages });
  const sourceSpanIds = new Set<string>();
  const unresolvedSourceSpanIds = new Set<string>();
  let missingClauseCount = 0;

  for (const clause of normalizedExcerptClauses(index, excerpt)) {
    const exact = (index.lookups.spanIdsByNormalizedClause.get(clause) ?? [])
      .filter((spanId) => allowed.has(spanId));
    if (exact.length === 1) sourceSpanIds.add(exact[0]);
    else if (exact.length > 1) {
      exact.forEach((spanId) => unresolvedSourceSpanIds.add(spanId));
    } else missingClauseCount += 1;
  }

  const status: RecoveryExcerptSourceBindingV1["status"] =
    unresolvedSourceSpanIds.size > 0
      ? "ambiguous"
      : sourceSpanIds.size > 0 && missingClauseCount === 0
        ? "exact"
        : "unresolved";
  const excerptDigest = hashStableValue({ excerpt: normalizeText(excerpt) });
  const sectionDigest = hashStableValue({
    dayHeading: normalizeText(section.dayHeading),
    label: normalizeText(section.label),
  });
  const stable = {
    excerptDigest,
    sectionDigest,
    sourceSpanIds: [...sourceSpanIds].sort(),
    status,
    unresolvedSourceSpanIds: [...unresolvedSourceSpanIds].sort(),
  };
  return {
    ...stable,
    bindingId: `recovery_excerpt_${hashStableValue(stable).slice(0, 24)}`,
  };
}

function recordDigest(
  recordClass: RecoveryCandidateSourceBindingV1["recordClass"],
  record: Record<string, unknown>
) {
  return hashStableValue({
    evidenceDigest: hashStableValue({
      evidence: normalizeText(stringValue(record, "evidence")),
    }),
    normalizedSection: normalizeText(candidateSection(record)),
    normalizedTitleDigest: hashStableValue({
      title: normalizeText(candidateTitle(record)),
    }),
    recordClass,
  });
}

export function buildRecoverySourceBindingSidecarV1({
  index,
  plan,
  recoveryStage,
  stages,
}: {
  index: SourceDocumentIndexV1;
  plan: SourceRecoveryPlan | null;
  recoveryStage: EvidenceStageInput | null;
  stages: EvidenceStageInput[];
}): RecoverySourceBindingSidecarV1 {
  const planBefore = stableJsonStringify(plan);
  const requestBefore = plan?.input ?? "";
  if (!plan) {
    return {
      ambiguousCount: 0,
      candidateBindings: [],
      excerptBindings: [],
      planDigest: hashStableValue(null),
      requestDigest: hashStableValue(""),
      schemaVersion: 1,
      unresolvedCount: 0,
    };
  }

  const localBindings = plan.sections.flatMap((section) =>
    section.excerpts.map((excerpt) => ({
      binding: buildExcerptBinding({ excerpt, index, section, stages }),
      normalizedExcerpt: normalizeText(excerpt),
      normalizedSection: normalizeText(section.dayHeading ?? section.label),
    }))
  );
  const excerptBindings = localBindings
    .map(({ binding }) => binding)
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  const rawCandidateBindings: Array<
    Omit<RecoveryCandidateSourceBindingV1, "bindingId">
  > = [];
  const stageRecord = asRecord(recoveryStage?.stage);

  if (recoveryStage && isRecoveryStage(recoveryStage)) {
    for (const [arrayKey, recordClass] of RECORD_ARRAYS) {
      const records = Array.isArray(stageRecord[arrayKey])
        ? (stageRecord[arrayKey] as unknown[])
        : [];
      for (const value of records) {
        const record = asRecord(value);
        const normalizedEvidence = normalizeText(stringValue(record, "evidence"));
        const normalizedTitle = normalizeText(candidateTitle(record));
        const normalizedSection = normalizeText(candidateSection(record));
        let matches = normalizedEvidence
          ? localBindings.filter(
              (entry) => entry.normalizedExcerpt === normalizedEvidence
            )
          : [];
        let status: RecoverySourceBindingStatusV1 = "exact";
        if (matches.length === 0 && normalizedTitle) {
          matches = localBindings.filter(
            (entry) =>
              entry.normalizedExcerpt.includes(normalizedTitle) &&
              (!normalizedSection ||
                !entry.normalizedSection ||
                entry.normalizedSection.includes(normalizedSection) ||
                normalizedSection.includes(entry.normalizedSection))
          );
          status = "unique_section_match";
        }

        const sourceSpanIds = [
          ...new Set(
            matches.flatMap((entry) => entry.binding.sourceSpanIds)
          ),
        ].sort();
        const unresolvedSourceSpanIds = [
          ...new Set(
            matches.flatMap(
              (entry) => entry.binding.unresolvedSourceSpanIds
            )
          ),
        ].sort();
        if (
          matches.length > 1 ||
          matches.some((entry) => entry.binding.status === "ambiguous")
        ) {
          status = "ambiguous";
        } else if (
          matches.length !== 1 ||
          sourceSpanIds.length === 0 ||
          matches[0].binding.status !== "exact"
        ) {
          status = "unresolved";
        }

        rawCandidateBindings.push({
          ephemeralResolverCandidateId: stringValue(
            record,
            "_resolverCandidateId"
          ),
          recordClass,
          recordDigest: recordDigest(recordClass, record),
          sourceSpanIds: status === "exact" || status === "unique_section_match"
            ? sourceSpanIds
            : [],
          status,
          unresolvedSourceSpanIds:
            status === "ambiguous" ? unresolvedSourceSpanIds : [],
        });
      }
    }
  }

  const orderedCandidates = rawCandidateBindings.sort((left, right) =>
    stableJsonStringify(left).localeCompare(stableJsonStringify(right))
  );
  const duplicateCountByKey = new Map<string, number>();
  const candidateBindings = orderedCandidates.map((candidate) => {
    const stableKey = stableJsonStringify({
      recordClass: candidate.recordClass,
      recordDigest: candidate.recordDigest,
      sourceSpanIds: candidate.sourceSpanIds,
      status: candidate.status,
      unresolvedSourceSpanIds: candidate.unresolvedSourceSpanIds,
    });
    const duplicateOrdinal = duplicateCountByKey.get(stableKey) ?? 0;
    duplicateCountByKey.set(stableKey, duplicateOrdinal + 1);
    return {
      ...candidate,
      bindingId: `recovery_candidate_${hashStableValue({
        duplicateOrdinal,
        stableKey,
      }).slice(0, 24)}`,
    };
  });

  if (
    planBefore !== stableJsonStringify(plan) ||
    requestBefore !== plan.input
  ) {
    throw new Error("Recovery source binding mutated the recovery request.");
  }

  return {
    ambiguousCount:
      excerptBindings.filter((binding) => binding.status === "ambiguous").length +
      candidateBindings.filter((binding) => binding.status === "ambiguous").length,
    candidateBindings,
    excerptBindings,
    planDigest: hashStableValue({
      sections: excerptBindings.map((binding) => binding.bindingId),
    }),
    requestDigest: hashStableValue(requestBefore),
    schemaVersion: 1,
    unresolvedCount:
      excerptBindings.filter((binding) => binding.status === "unresolved").length +
      candidateBindings.filter((binding) => binding.status === "unresolved").length,
  };
}
