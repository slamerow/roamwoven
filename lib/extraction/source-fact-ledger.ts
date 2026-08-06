import type { CanonicalEvidenceResolverMetadata } from "@/lib/extraction/canonical-evidence-resolver";
import type {
  CanonicalGroupingDecision,
  EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import {
  hashStableValue,
  sourceSpanRefsV1,
  stableJsonStringify,
  type SourceDocumentIndexV1,
  type SourceDocumentSpanV1,
  type SourceSpanRefV1,
} from "@/lib/extraction/source-document-index";
import { distinctiveLineTokens } from "@/lib/extraction/source-coverage";
import { isExcludedPlanningCostLine } from "@/lib/extraction/source-coverage";
import { normalizeText } from "@/lib/extraction/traveler-text";
import {
  hasCommitmentLanguage,
  hasWeakRecommendationLanguage,
} from "@/lib/trip-card-taxonomy";

export const SOURCE_FACT_LEDGER_SCHEMA_VERSION = 1 as const;

export type SourceFactKindV1 =
  | "entity"
  | "relationship"
  | "intent"
  | "decision"
  | "exclusion";

export type SourceFactV1 = {
  factId: string;
  kind: SourceFactKindV1;
  sourceSpanIds: string[];
  producer: "parser" | "resolver" | "recovery" | "deterministic_source";
  payload: Record<string, unknown>;
};

export type SourceCarrierEdgeV1 = {
  spanId: string;
  factId: string;
  carrierClass:
    | "atomic_entity"
    | "city_note"
    | "stay"
    | "transport"
    | "protected_detail"
    | "structural_only"
    | "context_only";
};

export type SourceFactSetV1 = {
  schemaVersion: typeof SOURCE_FACT_LEDGER_SCHEMA_VERSION;
  sourceFingerprint: string;
  sourceSpans: SourceSpanRefV1[];
  facts: SourceFactV1[];
  carrierEdges: SourceCarrierEdgeV1[];
};

export type SourceFactLedgerMetricsV1 = {
  schemaVersion: typeof SOURCE_FACT_LEDGER_SCHEMA_VERSION;
  ledgerHash: string;
  sourceClauseCount: number;
  factCounts: Record<SourceFactKindV1, number>;
  candidateToSpanAmbiguityCount: number;
  unresolvedRelationshipMemberCount: number;
  serializedByteSize: number;
  ledgerBuildMilliseconds: number;
};

export type SourceFactLedgerBuildResultV1 = {
  factSet: SourceFactSetV1;
  metrics: SourceFactLedgerMetricsV1;
};

type SourceAlignmentV1 =
  | {
      method: "exact_evidence" | "exact_title_in_section" | "source_block_tokens";
      plausibleSpanIds: string[];
      sourceSpanIds: string[];
      status: "aligned";
    }
  | {
      method: null;
      plausibleSpanIds: string[];
      reason: "ambiguous_source" | "unresolved_source";
      sourceSpanIds: [];
      status: "unresolved_source";
    };

type CandidateClass =
  | "activity"
  | "decision"
  | "place"
  | "protected_detail"
  | "stay"
  | "transport";

type CandidateRecord = {
  alignment: SourceAlignmentV1;
  candidateClass: CandidateClass;
  carrierClass: SourceCarrierEdgeV1["carrierClass"];
  normalizedTitle: string;
  primaryFactId: string | null;
  producer: SourceFactV1["producer"];
  record: Record<string, unknown>;
  resolverCandidateId: string | null;
  sourceIdentityHashes: string[];
  stage: EvidenceStageInput;
};

const RECORD_ARRAYS: Array<{
  candidateClass: CandidateClass;
  key: string;
}> = [
  { candidateClass: "activity", key: "activities" },
  { candidateClass: "stay", key: "stays" },
  { candidateClass: "transport", key: "transport" },
  { candidateClass: "place", key: "places" },
  { candidateClass: "decision", key: "missingDetails" },
  { candidateClass: "protected_detail", key: "sensitiveDetails" },
];

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
        (item): item is string => typeof item === "string" && item.trim().length > 0
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

function stageSpanIds(index: SourceDocumentIndexV1, stage: EvidenceStageInput) {
  if (stage.sourceSpanIds?.length) {
    return [...new Set(stage.sourceSpanIds)].filter((spanId) =>
      index.lookups.spanById.has(spanId)
    );
  }
  if (stage.sourceUploadId) {
    return [
      ...(index.lookups.spanIdsBySourceUploadId.get(stage.sourceUploadId) ?? []),
    ];
  }
  return stage.source === "model_spine"
    ? index.spans.map((span) => span.spanId)
    : [];
}

function sectionCompatible(span: SourceDocumentSpanV1, section: string) {
  const normalizedSection = normalizeText(section);
  if (!normalizedSection || !span.normalizedSectionLabel) return false;
  return (
    span.normalizedSectionLabel === normalizedSection ||
    span.normalizedSectionLabel.includes(normalizedSection) ||
    normalizedSection.includes(span.normalizedSectionLabel)
  );
}

function unresolvedAlignment(plausibleSpanIds: string[]): SourceAlignmentV1 {
  return {
    method: null,
    plausibleSpanIds: [...new Set(plausibleSpanIds)].sort(),
    reason:
      plausibleSpanIds.length > 1 ? "ambiguous_source" : "unresolved_source",
    sourceSpanIds: [],
    status: "unresolved_source",
  };
}

export function alignSourceCandidateV1({
  index,
  record,
  stage,
}: {
  index: SourceDocumentIndexV1;
  record: Record<string, unknown>;
  stage: EvidenceStageInput;
}): SourceAlignmentV1 {
  const allowed = new Set(stageSpanIds(index, stage));
  const allowedMatch = (spanId: string) => allowed.has(spanId);
  const evidence = normalizeText(stringValue(record, "evidence"));

  if (evidence) {
    const exactEvidence = (
      index.lookups.spanIdsByNormalizedClause.get(evidence) ?? []
    ).filter(allowedMatch);
    if (exactEvidence.length === 1) {
      return {
        method: "exact_evidence",
        plausibleSpanIds: exactEvidence,
        sourceSpanIds: exactEvidence,
        status: "aligned",
      };
    }
    if (exactEvidence.length > 1) return unresolvedAlignment(exactEvidence);
  }

  const title = normalizeText(candidateTitle(record));
  const section = candidateSection(record);
  if (title && section) {
    const exactTitle = (
      index.lookups.spanIdsByNormalizedClause.get(title) ?? []
    ).filter((spanId) => {
      const span = index.lookups.spanById.get(spanId);
      return Boolean(allowedMatch(spanId) && span && sectionCompatible(span, section));
    });
    if (exactTitle.length === 1) {
      return {
        method: "exact_title_in_section",
        plausibleSpanIds: exactTitle,
        sourceSpanIds: exactTitle,
        status: "aligned",
      };
    }
    if (exactTitle.length > 1) return unresolvedAlignment(exactTitle);
  }

  // Fuzzy alignment is deliberately unavailable without a declared source
  // block. This prevents a trip-wide title similarity guess.
  if (!section || allowed.size === 0) return unresolvedAlignment([]);

  const combined = [
    candidateTitle(record),
    stringValue(record, "description"),
  ]
    .filter(Boolean)
    .join(" ");
  const tokens = [...new Set(distinctiveLineTokens(combined))];
  const matchCounts = new Map<string, number>();
  for (const token of tokens) {
    for (const spanId of index.lookups.spanIdsByToken.get(token) ?? []) {
      if (!allowedMatch(spanId)) continue;
      const span = index.lookups.spanById.get(spanId);
      if (!span || !sectionCompatible(span, section)) continue;
      matchCounts.set(spanId, (matchCounts.get(spanId) ?? 0) + 1);
    }
  }
  const ranked = [...matchCounts.entries()]
    .map(([spanId, matched]) => {
      const span = index.lookups.spanById.get(spanId)!;
      const spanTokenCount = Math.max(
        1,
        new Set(distinctiveLineTokens(span.normalizedClause)).size
      );
      return { matched, ratio: matched / spanTokenCount, spanId };
    })
    .filter((entry) => entry.matched >= 1 && entry.ratio >= 0.5)
    .sort(
      (left, right) =>
        right.ratio - left.ratio ||
        right.matched - left.matched ||
        left.spanId.localeCompare(right.spanId)
    );
  if (ranked.length === 0) return unresolvedAlignment([]);
  const best = ranked[0];
  const tied = ranked.filter(
    (entry) => entry.ratio === best.ratio && entry.matched === best.matched
  );
  if (tied.length !== 1) {
    return unresolvedAlignment(tied.map((entry) => entry.spanId));
  }
  return {
    method: "source_block_tokens",
    plausibleSpanIds: [best.spanId],
    sourceSpanIds: [best.spanId],
    status: "aligned",
  };
}

function producerFor(stage: EvidenceStageInput, record: Record<string, unknown>) {
  const stageRecord = asRecord(stage.stage);
  return stageRecord._sourceRecovery === true || record._sourceRecovery === true
    ? ("recovery" as const)
    : ("parser" as const);
}

function carrierFor(
  candidateClass: CandidateClass,
  record: Record<string, unknown>
): SourceCarrierEdgeV1["carrierClass"] {
  if (candidateClass === "stay") return "stay";
  if (candidateClass === "transport") return "transport";
  if (candidateClass === "protected_detail") return "protected_detail";
  if (candidateClass === "decision") return "context_only";
  const role = stringValue(record, "evidenceRole");
  if (role === "grouping_proposal") return "structural_only";
  if (
    role === "context" ||
    role === "accessory_detail" ||
    role === "rejected"
  ) {
    return "context_only";
  }
  if (stringValue(record, "itemType") === "note" || role === "city_note_candidate") {
    return "city_note";
  }
  return "atomic_entity";
}

function alignmentPayload(alignment: SourceAlignmentV1) {
  return alignment.status === "aligned"
    ? { method: alignment.method, status: alignment.status }
    : {
        ambiguityCount: alignment.plausibleSpanIds.length,
        plausibleSpanIds: alignment.plausibleSpanIds,
        reason: alignment.reason,
        status: alignment.status,
      };
}

function semanticIdentityDigest(
  alignment: SourceAlignmentV1,
  record: Record<string, unknown>
) {
  return hashStableValue({
    sourceSpanIds: alignment.sourceSpanIds,
    title: normalizeText(candidateTitle(record)),
  });
}

function createFact(
  facts: Map<string, SourceFactV1>,
  input: Omit<SourceFactV1, "factId">
) {
  const normalized = {
    ...input,
    sourceSpanIds: [...new Set(input.sourceSpanIds)].sort(),
  };
  const factId = `fact_${hashStableValue({
    kind: normalized.kind,
    payload: normalized.payload,
    producer: normalized.producer,
    sourceSpanIds: normalized.sourceSpanIds,
    version: SOURCE_FACT_LEDGER_SCHEMA_VERSION,
  }).slice(0, 32)}`;
  const fact = { ...normalized, factId };
  const existing = facts.get(factId);
  if (existing && stableJsonStringify(existing) !== stableJsonStringify(fact)) {
    throw new Error("Source fact id collision with different payloads.");
  }
  facts.set(factId, fact);
  return fact;
}

function entityPayload(
  candidateClass: CandidateClass,
  record: Record<string, unknown>,
  alignment: SourceAlignmentV1
) {
  return {
    date: stringValue(record, "date"),
    recordClass: candidateClass,
    semanticIdentityDigest: semanticIdentityDigest(alignment, record),
    sourceAlignment: alignmentPayload(alignment),
    sourceRole: stringValue(record, "evidenceRole"),
  };
}

function intentFor(record: Record<string, unknown>) {
  const ownText =
    stringValue(record, "evidence") ??
    [candidateTitle(record), stringValue(record, "description")]
      .filter(Boolean)
      .join(" ");
  const signals: string[] = [];
  if (hasWeakRecommendationLanguage(ownText)) signals.push("source_hedge");
  if (stringValue(record, "startTime") || stringValue(record, "endTime")) {
    signals.push("fixed_time");
  }
  if (hasCommitmentLanguage(ownText)) signals.push("commitment_language");
  if (
    /\b(?:booked|booking|confirmation|reservation|ticket|voucher)\b/i.test(
      ownText
    )
  ) {
    signals.push("booking_signal");
  }
  return {
    intent:
      signals.includes("source_hedge")
        ? "uncertain"
        : signals.some((signal) => signal !== "source_hedge")
          ? "committed"
          : "unspecified",
    signals: [...new Set(signals)].sort(),
  };
}

function relationshipTypeFor(
  index: SourceDocumentIndexV1,
  sourceSpanIds: string[]
) {
  const sourceText = sourceSpanIds
    .map((spanId) => index.lookups.spanById.get(spanId)?.normalizedClause ?? "")
    .join(" ");
  if (/\bor\b/.test(sourceText)) return "alternative_set";
  if (/\b(?:route|tour|walk|stops?)\b/.test(sourceText)) return "ordered_route";
  return "contains";
}

type RelationshipCandidateLookups = {
  candidatesBySectionToken: Map<string, CandidateRecord[]>;
  candidatesBySpanId: Map<string, CandidateRecord[]>;
};

function sourceSectionKey(span: SourceDocumentSpanV1) {
  return `${span.sourceIdentityHash}:${span.normalizedSectionLabel ?? ""}`;
}

function buildRelationshipCandidateLookups({
  candidates,
  facts,
  index,
}: {
  candidates: CandidateRecord[];
  facts: Map<string, SourceFactV1>;
  index: SourceDocumentIndexV1;
}): RelationshipCandidateLookups {
  const candidatesBySectionToken = new Map<string, CandidateRecord[]>();
  const candidatesBySpanId = new Map<string, CandidateRecord[]>();
  for (const candidate of candidates) {
    const fact = candidate.primaryFactId
      ? facts.get(candidate.primaryFactId)
      : null;
    if (fact?.kind !== "entity") continue;
    for (const spanId of candidate.alignment.sourceSpanIds) {
      const span = index.lookups.spanById.get(spanId);
      if (!span) continue;
      candidatesBySpanId.set(spanId, [
        ...(candidatesBySpanId.get(spanId) ?? []),
        candidate,
      ]);
      for (const token of new Set(distinctiveLineTokens(candidate.normalizedTitle))) {
        const key = `${sourceSectionKey(span)}:${token}`;
        candidatesBySectionToken.set(key, [
          ...(candidatesBySectionToken.get(key) ?? []),
          candidate,
        ]);
      }
    }
  }
  return { candidatesBySectionToken, candidatesBySpanId };
}

function relationMembersForProposal({
  index,
  lookups,
  proposal,
}: {
  index: SourceDocumentIndexV1;
  lookups: RelationshipCandidateLookups;
  proposal: CandidateRecord;
}) {
  const proposalText = normalizeText(
    [
      candidateTitle(proposal.record),
      stringValue(proposal.record, "description"),
      stringValue(proposal.record, "evidence"),
    ]
      .filter(Boolean)
      .join(" ")
  );
  const allowedSpanIds = new Set(stageSpanIds(index, proposal.stage));
  const describedSpanIds = [
    ...new Set(
      distinctiveLineTokens(proposalText).flatMap((token) =>
        (index.lookups.spanIdsByToken.get(token) ?? []).filter((spanId) => {
          if (!allowedSpanIds.has(spanId)) return false;
          const clause =
            index.lookups.spanById.get(spanId)?.normalizedClause ?? "";
          return clause.length >= 3 && proposalText.includes(clause);
        })
      )
    ),
  ];
  const proposalSectionKeys = new Set(
    proposal.alignment.sourceSpanIds
      .map((spanId) => index.lookups.spanById.get(spanId))
      .filter((span): span is SourceDocumentSpanV1 => Boolean(span))
      .map(sourceSectionKey)
  );
  const entityCandidates = [
    ...new Map(
      [
        ...describedSpanIds.flatMap(
          (spanId) => lookups.candidatesBySpanId.get(spanId) ?? []
        ),
        ...distinctiveLineTokens(proposal.normalizedTitle).flatMap((token) =>
          [...proposalSectionKeys].flatMap(
            (sectionKey) =>
              lookups.candidatesBySectionToken.get(`${sectionKey}:${token}`) ?? []
          )
        )
      ]
        .filter((candidate) => candidate.primaryFactId)
        .map((candidate) => [candidate.primaryFactId!, candidate])
    ).values(),
  ];
  const parentCandidates = entityCandidates.filter(
    (candidate) =>
      candidate.normalizedTitle &&
      (proposal.normalizedTitle.includes(candidate.normalizedTitle) ||
        candidate.normalizedTitle.includes(proposal.normalizedTitle))
  );
  const parentFactId =
    parentCandidates.length === 1 ? parentCandidates[0].primaryFactId : null;
  const entityFactIdsBySpan = new Map<string, string[]>();
  for (const candidate of entityCandidates) {
    for (const spanId of candidate.alignment.sourceSpanIds) {
      entityFactIdsBySpan.set(spanId, [
        ...(entityFactIdsBySpan.get(spanId) ?? []),
        candidate.primaryFactId!,
      ]);
    }
  }
  const memberFactIds = new Set<string>();
  for (const candidate of entityCandidates) {
    if (candidate.primaryFactId === parentFactId) continue;
    if (
      candidate.normalizedTitle &&
      proposalText.includes(candidate.normalizedTitle)
    ) {
      memberFactIds.add(candidate.primaryFactId!);
    }
  }
  for (const spanId of describedSpanIds) {
    for (const factId of entityFactIdsBySpan.get(spanId) ?? []) {
      if (factId !== parentFactId) memberFactIds.add(factId);
    }
  }
  const proposalSpans = new Set(proposal.alignment.sourceSpanIds);
  const unresolvedMemberSpanIds = describedSpanIds.filter(
    (spanId) =>
      !proposalSpans.has(spanId) &&
      (entityFactIdsBySpan.get(spanId) ?? []).length === 0
  );

  return {
    describedSpanIds: [...new Set(describedSpanIds)].sort(),
    memberFactIds: [...memberFactIds].sort(),
    parentFactId,
    unresolvedMemberSpanIds: [...new Set(unresolvedMemberSpanIds)].sort(),
  };
}

function addEdges(
  edges: Map<string, SourceCarrierEdgeV1>,
  fact: SourceFactV1,
  carrierClass: SourceCarrierEdgeV1["carrierClass"]
) {
  for (const spanId of fact.sourceSpanIds) {
    const edge = { carrierClass, factId: fact.factId, spanId };
    edges.set(stableJsonStringify(edge), edge);
  }
}

export function buildSourceFactLedgerV1({
  groupingDecisions = [],
  index,
  resolverMetadata = null,
  stages,
}: {
  groupingDecisions?: CanonicalGroupingDecision[];
  index: SourceDocumentIndexV1;
  resolverMetadata?: CanonicalEvidenceResolverMetadata | null;
  stages: EvidenceStageInput[];
}): SourceFactLedgerBuildResultV1 {
  const startedAt = performance.now();
  const facts = new Map<string, SourceFactV1>();
  const edges = new Map<string, SourceCarrierEdgeV1>();
  const candidates: CandidateRecord[] = [];

  for (const stage of stages) {
    const stageRecord = asRecord(stage.stage);
    for (const descriptor of RECORD_ARRAYS) {
      const records = Array.isArray(stageRecord[descriptor.key])
        ? (stageRecord[descriptor.key] as unknown[])
        : [];
      for (const value of records) {
        const record = asRecord(value);
        if (Object.keys(record).length === 0) continue;
        const alignment = alignSourceCandidateV1({ index, record, stage });
        const producer = producerFor(stage, record);
        const carrierClass = carrierFor(descriptor.candidateClass, record);
        const candidate: CandidateRecord = {
          alignment,
          candidateClass: descriptor.candidateClass,
          carrierClass,
          normalizedTitle: normalizeText(candidateTitle(record)),
          primaryFactId: null,
          producer,
          record,
          resolverCandidateId: stringValue(record, "_resolverCandidateId"),
          sourceIdentityHashes: [...new Set(
            [...alignment.sourceSpanIds, ...alignment.plausibleSpanIds]
              .map(
                (spanId) =>
                  index.lookups.spanById.get(spanId)?.sourceIdentityHash ?? null
              )
              .filter((value): value is string => Boolean(value))
          )].sort(),
          stage,
        };

        const role = stringValue(record, "evidenceRole");
        if (descriptor.candidateClass === "activity" && role === "grouping_proposal") {
          candidates.push(candidate);
          continue;
        }

        const kind =
          descriptor.candidateClass === "decision" ? "decision" : "entity";
        const payload =
          kind === "decision"
            ? {
                decisionType: stringValue(record, "targetField") ?? "unknown",
                semanticIdentityDigest: semanticIdentityDigest(alignment, record),
                sourceAlignment: alignmentPayload(alignment),
                status: "proposed",
              }
            : entityPayload(descriptor.candidateClass, record, alignment);
        const fact = createFact(facts, {
          kind,
          payload,
          producer,
          sourceSpanIds: alignment.sourceSpanIds,
        });
        candidate.primaryFactId = fact.factId;
        addEdges(edges, fact, carrierClass);
        candidates.push(candidate);
      }
    }
  }

  // Structural proposals are facts of relationship, never entity aliases.
  const relationshipLookups = buildRelationshipCandidateLookups({
    candidates,
    facts,
    index,
  });
  for (const proposal of candidates.filter(
    (candidate) =>
      candidate.candidateClass === "activity" &&
      stringValue(candidate.record, "evidenceRole") === "grouping_proposal"
  )) {
    const members = relationMembersForProposal({
      index,
      lookups: relationshipLookups,
      proposal,
    });
    const fact = createFact(facts, {
      kind: "relationship",
      payload: {
        memberFactIds: members.memberFactIds,
        parentFactId: members.parentFactId,
        relationshipType: relationshipTypeFor(index, [
          ...proposal.alignment.sourceSpanIds,
          ...members.describedSpanIds,
        ]),
        sourceAlignment: alignmentPayload(proposal.alignment),
        status: "proposed",
        unresolvedMemberSpanIds: members.unresolvedMemberSpanIds,
      },
      producer: proposal.producer,
      sourceSpanIds: [
        ...proposal.alignment.sourceSpanIds,
        ...members.describedSpanIds,
      ],
    });
    proposal.primaryFactId = fact.factId;
    addEdges(edges, fact, "structural_only");
  }

  // Intent is orthogonal to entity/relationship. The same source span may
  // therefore own both an entity/relationship fact and its own intent fact.
  for (const candidate of candidates) {
    if (!candidate.primaryFactId || candidate.candidateClass === "decision") continue;
    const intent = intentFor(candidate.record);
    const fact = createFact(facts, {
      kind: "intent",
      payload: {
        ...intent,
        sourceAlignment: alignmentPayload(candidate.alignment),
        subjectFactId: candidate.primaryFactId,
      },
      producer: candidate.producer,
      sourceSpanIds: candidate.alignment.sourceSpanIds,
    });
    addEdges(edges, fact, candidate.carrierClass);
  }

  const candidateByResolverId = new Map(
    candidates
      .filter((candidate) => candidate.resolverCandidateId)
      .map((candidate) => [candidate.resolverCandidateId!, candidate])
  );
  const acceptedCandidateSets = groupingDecisions.map(
    (decision) => new Set(decision.candidateIds)
  );
  for (const evaluation of resolverMetadata?.claimEvaluations ?? []) {
    const mapped = evaluation.candidateIds
      .map((candidateId) => candidateByResolverId.get(candidateId) ?? null)
      .filter((candidate): candidate is CandidateRecord => Boolean(candidate));
    const entityMembers = mapped.filter((candidate) => {
      const fact = candidate.primaryFactId
        ? facts.get(candidate.primaryFactId)
        : null;
      return fact?.kind === "entity";
    });
    const parentCandidate = evaluation.parentCandidateId
      ? candidateByResolverId.get(evaluation.parentCandidateId) ?? null
      : null;
    const parentFact = parentCandidate?.primaryFactId
      ? facts.get(parentCandidate.primaryFactId)
      : null;
    const parentFactId = parentFact?.kind === "entity" ? parentFact.factId : null;
    const memberFactIds = entityMembers
      .map((candidate) => candidate.primaryFactId!)
      .filter((factId) => factId !== parentFactId)
      .sort();
    const unresolvedMemberSpanIds = mapped
      .flatMap((candidate) =>
        candidate.alignment.status === "unresolved_source"
          ? candidate.alignment.plausibleSpanIds
          : []
      )
      .sort();
    const missingCandidateCount = evaluation.candidateIds.length - mapped.length;
    const rejectionCodes: string[] = [...evaluation.rejectionCodes];
    if (missingCandidateCount > 0) rejectionCodes.push("unresolved_source_member");
    const accepted = acceptedCandidateSets.some((candidateSet) =>
      evaluation.candidateIds.every(
        (candidateId) =>
          candidateSet.has(candidateId) ||
          stringValue(
            candidateByResolverId.get(candidateId)?.record ?? {},
            "evidenceRole"
          ) === "grouping_proposal"
      )
    );
    const sourceSpanIds = mapped.flatMap(
      (candidate) => candidate.alignment.sourceSpanIds
    );
    const fact = createFact(facts, {
      kind: "relationship",
      payload: {
        claimDigest: evaluation.claimDigest,
        memberFactIds,
        missingCandidateCount,
        parentFactId,
        rejectionCodes: [...new Set(rejectionCodes)].sort(),
        relationshipType: "contains",
        status: accepted ? "accepted" : evaluation.status,
        unresolvedMemberSpanIds: [...new Set(unresolvedMemberSpanIds)].sort(),
      },
      producer: "resolver",
      sourceSpanIds,
    });
    addEdges(edges, fact, "structural_only");
  }

  // Shared deterministic source rules own exclusions and structural day
  // context. They observe source meaning without inventing traveler entities.
  for (const span of index.spans) {
    if (isExcludedPlanningCostLine(span.normalizedClause)) {
      createFact(facts, {
        kind: "exclusion",
        payload: {
          exclusionCode: "planning_cost",
          rule: "shared_planning_cost_predicate",
        },
        producer: "deterministic_source",
        sourceSpanIds: [span.spanId],
      });
      continue;
    }
    if (span.isDayHeading) {
      const fact = createFact(facts, {
        kind: "relationship",
        payload: {
          relationshipType: "attribute_of",
          status: "source_declared_section_context",
        },
        producer: "deterministic_source",
        sourceSpanIds: [span.spanId],
      });
      addEdges(edges, fact, "context_only");
    }
  }

  const factList = [...facts.values()].sort((left, right) =>
    left.factId.localeCompare(right.factId)
  );
  const carrierEdges = [...edges.values()].sort((left, right) =>
    stableJsonStringify(left).localeCompare(stableJsonStringify(right))
  );
  const factSet: SourceFactSetV1 = {
    carrierEdges,
    facts: factList,
    schemaVersion: SOURCE_FACT_LEDGER_SCHEMA_VERSION,
    sourceFingerprint: index.sourceFingerprint,
    sourceSpans: sourceSpanRefsV1(index),
  };
  const serialized = stableJsonStringify(factSet);
  const factCounts: Record<SourceFactKindV1, number> = {
    decision: 0,
    entity: 0,
    exclusion: 0,
    intent: 0,
    relationship: 0,
  };
  for (const fact of factList) factCounts[fact.kind] += 1;

  return {
    factSet,
    metrics: {
      candidateToSpanAmbiguityCount: candidates.filter(
        (candidate) =>
          candidate.alignment.status === "unresolved_source" &&
          candidate.alignment.reason === "ambiguous_source"
      ).length,
      factCounts,
      ledgerBuildMilliseconds: Math.max(0, performance.now() - startedAt),
      ledgerHash: hashStableValue(factSet),
      schemaVersion: SOURCE_FACT_LEDGER_SCHEMA_VERSION,
      serializedByteSize: Buffer.byteLength(serialized, "utf8"),
      sourceClauseCount: factSet.sourceSpans.length,
      unresolvedRelationshipMemberCount: factList
        .filter((fact) => fact.kind === "relationship")
        .reduce((count, fact) => {
          const unresolved = fact.payload.unresolvedMemberSpanIds;
          return count + (Array.isArray(unresolved) ? unresolved.length : 0);
        }, 0),
    },
  };
}
