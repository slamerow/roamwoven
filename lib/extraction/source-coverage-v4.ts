import {
  hashStableValue,
  type SourceDocumentIndexV1,
  type SourceSpanRefV1,
} from "@/lib/extraction/source-document-index";
import type {
  SourceCarrierEdgeV1,
  SourceFactSetV1,
  SourceFactV1,
} from "@/lib/extraction/source-fact-ledger";

export const SOURCE_COVERAGE_SCHEMA_VERSION = 4 as const;
export const SHADOW_RECOVERY_PLAN_SCHEMA_VERSION = 1 as const;

export type SourceCoverageStatusV4 =
  | "carried"
  | "structural_only"
  | "context_only"
  | "excluded"
  | "uncovered";

export type SourceCoverageEntryV4 = SourceSpanRefV1 & {
  ambiguous: boolean;
  exclusionCode: string | null;
  owningFactIds: string[];
  status: SourceCoverageStatusV4;
};

export type SourceCoverageV4 = {
  schemaVersion: typeof SOURCE_COVERAGE_SCHEMA_VERSION;
  sourceFingerprint: string;
  coverageHash: string;
  entries: SourceCoverageEntryV4[];
  counts: Record<SourceCoverageStatusV4, number> & {
    ambiguous: number;
  };
};

export type ShadowRecoveryClauseRefV1 = SourceSpanRefV1;

export type ShadowRecoveryBatchV1 = {
  batchId: string;
  sourceIdentityHash: string;
  sectionDigest: string;
  clauses: ShadowRecoveryClauseRefV1[];
};

export type ShadowRecoveryPlanV1 = {
  schemaVersion: typeof SHADOW_RECOVERY_PLAN_SCHEMA_VERSION;
  sourceFingerprint: string;
  planHash: string;
  batchCount: number;
  uncoveredClauseCount: number;
  batches: ShadowRecoveryBatchV1[];
};

const CARRIED_CLASSES = new Set<SourceCarrierEdgeV1["carrierClass"]>([
  "atomic_entity",
  "city_note",
  "stay",
  "transport",
  "protected_detail",
]);

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function sourceAlignment(fact: SourceFactV1) {
  const value = fact.payload.sourceAlignment;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function ambiguousSpanIds(factSet: SourceFactSetV1) {
  const spanIds = new Set<string>();
  for (const fact of factSet.facts) {
    const alignment = sourceAlignment(fact);
    if (
      alignment?.status !== "unresolved_source" ||
      alignment.reason !== "ambiguous_source"
    ) {
      continue;
    }
    for (const spanId of stringArray(alignment.plausibleSpanIds)) {
      spanIds.add(spanId);
    }
  }
  return spanIds;
}

function exclusionForSpan(facts: SourceFactV1[], spanId: string) {
  const exclusions = facts.filter(
    (fact) => fact.kind === "exclusion" && fact.sourceSpanIds.includes(spanId)
  );
  if (exclusions.length === 0) return null;
  const codes = [
    ...new Set(
      exclusions
        .map((fact) => fact.payload.exclusionCode)
        .filter((value): value is string => typeof value === "string")
    ),
  ].sort();
  if (codes.length !== 1) {
    throw new Error("An excluded source span must have one shared exclusion code.");
  }
  return { code: codes[0], factIds: exclusions.map((fact) => fact.factId).sort() };
}

function statusForEdges(edges: SourceCarrierEdgeV1[]) {
  if (edges.some((edge) => CARRIED_CLASSES.has(edge.carrierClass))) {
    return "carried" as const;
  }
  if (edges.some((edge) => edge.carrierClass === "structural_only")) {
    return "structural_only" as const;
  }
  if (edges.some((edge) => edge.carrierClass === "context_only")) {
    return "context_only" as const;
  }
  return "uncovered" as const;
}

export function buildSourceCoverageV4({
  factSet,
  index,
}: {
  factSet: SourceFactSetV1;
  index: SourceDocumentIndexV1;
}): SourceCoverageV4 {
  if (factSet.sourceFingerprint !== index.sourceFingerprint) {
    throw new Error("Source coverage cannot join a ledger to a different source index.");
  }
  const knownFactIds = new Set(factSet.facts.map((fact) => fact.factId));
  const knownSpanIds = new Set(index.spans.map((span) => span.spanId));
  for (const edge of factSet.carrierEdges) {
    if (!knownFactIds.has(edge.factId) || !knownSpanIds.has(edge.spanId)) {
      throw new Error("Source coverage received a dangling carrier edge.");
    }
  }

  const edgesBySpan = new Map<string, SourceCarrierEdgeV1[]>();
  for (const edge of factSet.carrierEdges) {
    edgesBySpan.set(edge.spanId, [
      ...(edgesBySpan.get(edge.spanId) ?? []),
      edge,
    ]);
  }
  const ambiguous = ambiguousSpanIds(factSet);
  const entries: SourceCoverageEntryV4[] = index.spans.map((span) => {
    const edges = edgesBySpan.get(span.spanId) ?? [];
    const exclusion = exclusionForSpan(factSet.facts, span.spanId);
    const status = exclusion ? ("excluded" as const) : statusForEdges(edges);
    const owningFactIds = exclusion
      ? exclusion.factIds
      : [...new Set(edges.map((edge) => edge.factId))].sort();
    const {
      isDayHeading: _isDayHeading,
      normalizedClause: _normalizedClause,
      normalizedDocumentIdentity: _normalizedDocumentIdentity,
      normalizedSectionLabel: _normalizedSectionLabel,
      ...sourceRef
    } = span;
    return {
      ...sourceRef,
      ambiguous: ambiguous.has(span.spanId),
      exclusionCode: exclusion?.code ?? null,
      owningFactIds,
      status,
    };
  });
  const statusCounts: Record<SourceCoverageStatusV4, number> = {
    carried: 0,
    context_only: 0,
    excluded: 0,
    structural_only: 0,
    uncovered: 0,
  };
  for (const entry of entries) statusCounts[entry.status] += 1;
  const base = {
    counts: {
      ...statusCounts,
      ambiguous: entries.filter((entry) => entry.ambiguous).length,
    },
    entries,
    schemaVersion: SOURCE_COVERAGE_SCHEMA_VERSION,
    sourceFingerprint: index.sourceFingerprint,
  };
  return { ...base, coverageHash: hashStableValue(base) };
}

export function buildShadowRecoveryPlanV1({
  coverage,
  index,
}: {
  coverage: SourceCoverageV4;
  index: SourceDocumentIndexV1;
}): ShadowRecoveryPlanV1 {
  if (coverage.sourceFingerprint !== index.sourceFingerprint) {
    throw new Error("Recovery planning cannot join different source versions.");
  }
  const uncovered = coverage.entries.filter(
    (entry) => entry.status === "uncovered"
  );
  const groups = new Map<
    string,
    { sourceIdentityHash: string; sectionDigest: string; spanIds: string[] }
  >();
  for (const entry of uncovered) {
    const span = index.lookups.spanById.get(entry.spanId);
    if (!span) throw new Error("Recovery plan references an unknown source span.");
    const sectionDigest = hashStableValue(span.normalizedSectionLabel ?? "");
    const key = `${span.sourceIdentityHash}:${sectionDigest}`;
    const group = groups.get(key) ?? {
      sectionDigest,
      sourceIdentityHash: span.sourceIdentityHash,
      spanIds: [],
    };
    group.spanIds.push(span.spanId);
    groups.set(key, group);
  }
  const batches: ShadowRecoveryBatchV1[] = [...groups.values()]
    .map((group) => {
      const clauses = group.spanIds
        .map((spanId) =>
          coverage.entries.find((entry) => entry.spanId === spanId)
        )
        .filter((entry): entry is SourceCoverageEntryV4 => Boolean(entry))
        .sort(
          (left, right) =>
            left.lineOccurrence - right.lineOccurrence ||
            left.clauseOrdinal - right.clauseOrdinal ||
            left.spanId.localeCompare(right.spanId)
        )
        .map(({ ambiguous: _ambiguous, exclusionCode: _exclusionCode, owningFactIds: _owningFactIds, status: _status, ...sourceRef }) => sourceRef);
      const batchBase = {
        clauses,
        sectionDigest: group.sectionDigest,
        sourceIdentityHash: group.sourceIdentityHash,
      };
      return {
        ...batchBase,
        batchId: `recovery_${hashStableValue(batchBase).slice(0, 32)}`,
      };
    })
    .sort((left, right) => left.batchId.localeCompare(right.batchId));
  const base = {
    batchCount: batches.length,
    batches,
    schemaVersion: SHADOW_RECOVERY_PLAN_SCHEMA_VERSION,
    sourceFingerprint: index.sourceFingerprint,
    uncoveredClauseCount: uncovered.length,
  };
  return { ...base, planHash: hashStableValue(base) };
}
