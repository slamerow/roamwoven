import {
  applyCanonicalEvidenceResolution,
  buildCanonicalEvidenceCandidates,
  type CanonicalEvidenceResolution,
  type ResolverCandidate,
} from "@/lib/extraction/canonical-evidence-resolver";
import type {
  CanonicalGroupingDecision,
  EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import {
  alignSourceCandidateV1,
  buildSourceFactLedgerV1,
  type SourceFactLedgerBuildResultV1,
  type SourceFactV1,
} from "@/lib/extraction/source-fact-ledger";
import {
  hashStableValue,
  type SourceDocumentIndexV1,
} from "@/lib/extraction/source-document-index";
import {
  comparableTokens,
  normalizeText,
} from "@/lib/extraction/traveler-text";
export { isSourceFactAssemblyAuthorityEnabled } from "@/lib/extraction/source-fact-assembly-config";
import {
  hasCityTipSignal,
  hasExplicitRecommendationVerb,
  hasGenericCityTipHeader,
  hasWeakRecommendationLanguage,
  SITE_CONTAINER_NOUN_PATTERN,
} from "@/lib/trip-card-taxonomy";

export const SOURCE_FACT_ASSEMBLY_AUTHORITY_VERSION = 1 as const;

export type SourceFactAssemblyAuthorityMetricsV1 = {
  authorityHash: string;
  behaviorSignalCandidateCount: number;
  candidateCount: number;
  compositePlanRecoveredCandidateCount: number;
  mappedCandidateCount: number;
  relationshipDecisionCount: number;
  relationshipRecoveredCandidateCount: number;
  relationshipRecoveryStageCount: number;
  relationshipUnresolvedCount: number;
  roleDecisionCount: number;
  schemaVersion: typeof SOURCE_FACT_ASSEMBLY_AUTHORITY_VERSION;
  tailReferenceRecoveredCandidateCount: number;
  unresolvedBehaviorCandidateCount: number;
  unresolvedSourceBindingCount: number;
};

export type SourceFactRelationshipRecoveryResultV1 = {
  recoveredCandidateCount: number;
  recoveredRelationshipCount: number;
  recoveredTailReferenceCount: number;
  stages: EvidenceStageInput[];
};

export type SourceFactCompositePlanRecoveryResultV1 = {
  recoveredCandidateCount: number;
  stages: EvidenceStageInput[];
};

export type SourceFactAssemblyAuthorityResultV1 = {
  diagnostics: {
    unresolvedBehaviorCandidates: Array<{
      candidateId: string;
      date: string | null;
      evidenceRole: string | null;
      hasDecision: boolean;
      hasFact: boolean;
      sourceSpanCount: number;
      title: string;
    }>;
  };
  groupingDecisions: CanonicalGroupingDecision[];
  metrics: SourceFactAssemblyAuthorityMetricsV1;
  sourceLedger: SourceFactLedgerBuildResultV1;
  stages: EvidenceStageInput[];
};

type CandidateBinding = {
  candidate: ResolverCandidate;
  fact: SourceFactV1 | null;
  record: Record<string, unknown>;
  sourceIsRecovery: boolean;
  sourceSaysCityTip: boolean;
  sourceSpanIds: string[];
  sourceTitleHasExplicitUncertainty: boolean;
};

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

function allowedSpanIdsForStage(
  index: SourceDocumentIndexV1,
  stage: EvidenceStageInput
) {
  return new Set(
    stage.sourceSpanIds?.length
      ? stage.sourceSpanIds
      : stage.sourceUploadId
        ? index.lookups.spanIdsBySourceUploadId.get(stage.sourceUploadId) ?? []
        : []
  );
}

function recoveredRelationshipMemberTitle(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^(?:open(?:ing)?|hours?)\b/i.test(trimmed)) return null;
  const title = trimmed
    // Price/availability parentheticals are attributes of the venue. The
    // exact source line remains in `evidence`; only the traveler title is
    // cleaned here.
    .replace(
      /\s*\((?:\s*(?:free\s*[-:]?\s*)?(?:[$€£]\s*)?\d[\d.,]*(?:\s*(?:czk|kc|eur|huf|ft|usd|gbp))?\s*)\)\s*$/i,
      ""
    )
    .trim();
  if (
    title.length < 3 ||
    title.length > 120 ||
    comparableTokens(title).length === 0 ||
    /^(?:open(?:ing)?|hours?)\b/i.test(title)
  ) {
    return null;
  }
  return title;
}

function cleanSourceFactNoteTitle(value: string) {
  const title = value
    .replace(/^[-*•●▪◦>·]+\s*/, "")
    .replace(/^(?:and|or)\s+/i, "")
    .replace(/\s+for\s+(?:breakfast|brunch|dinner|drinks|lunch)\s*$/i, "")
    .replace(/\s*\([^)]{1,40}\)\s*$/, "")
    .replace(/[.;:,]+\s*$/, "")
    .trim();
  if (
    title.length < 2 ||
    title.length > 80 ||
    title.split(/\s+/).length > 8 ||
    /https?:\/\/|@|\b(?:address|booking|confirmation|customer|email|phone|reservation|wifi|password)\b/i.test(
      title
    ) ||
    /\b(?:built|founded|located|opened|serves|speciali[sz]es|walk|take|turn)\b/i.test(
      title
    )
  ) {
    return null;
  }
  return title;
}

function compositePlanMemberTitles(title: string) {
  if (!/\s(?:\/|→|->)\s/.test(title)) return [];
  return title
    .split(/\s+(?:\/|→|->)\s+/)
    .map((member) => member.trim())
    .filter(
      (member) =>
        member.length >= 4 &&
        member.length <= 100 &&
        comparableTokens(member).length >= 2
    );
}

function sameSourceFactMemberIdentity(left: string, right: string) {
  const leftTokens = comparableTokens(left);
  const rightTokens = comparableTokens(right);
  if (leftTokens.length < 2 || rightTokens.length < 2) return false;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  return (
    leftTokens.every((token) => rightSet.has(token)) ||
    rightTokens.every((token) => leftSet.has(token))
  );
}

// A composite parser card may be the only surviving witness for several
// source-authored route members. Recover a missing atomic member only when an
// exact local source line names it and that same line explicitly says to tour,
// visit, enter, explore, or climb. Passing mentions such as a view or quick
// peek cannot mint an Activity. This runs after geocoding so recovery adds no
// external work and cannot influence containment through fabricated location.
export function recoverMissingSourceFactCompositePlanMembersV1({
  index,
  stages,
}: {
  index: SourceDocumentIndexV1;
  stages: EvidenceStageInput[];
}): SourceFactCompositePlanRecoveryResultV1 {
  const existingByDate = new Map<string, string[]>();
  for (const stage of stages) {
    const stageRecord = asRecord(stage.stage);
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    for (const activity of activities) {
      const record = asRecord(activity);
      if (stringValue(record, "evidenceRole") === "grouping_proposal") {
        continue;
      }
      const date = stringValue(record, "date");
      const title = stringValue(record, "title");
      if (!date || !title) continue;
      existingByDate.set(date, [...(existingByDate.get(date) ?? []), title]);
    }
  }

  const recoveredByStage = new Map<number, Record<string, unknown>[]>();
  for (const [stageIndex, stage] of stages.entries()) {
    const stageRecord = asRecord(stage.stage);
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    const allowedSpanIds = allowedSpanIdsForStage(index, stage);
    if (allowedSpanIds.size === 0) continue;
    for (const activity of activities) {
      const proposal = asRecord(activity);
      if (stringValue(proposal, "evidenceRole") !== "grouping_proposal") {
        continue;
      }
      const date = stringValue(proposal, "date");
      const city = stringValue(proposal, "city");
      const proposalTitle = stringValue(proposal, "title");
      if (!date || !city || !proposalTitle) continue;
      for (const memberTitle of compositePlanMemberTitles(proposalTitle)) {
        if (
          (existingByDate.get(date) ?? []).some((existingTitle) =>
            sameSourceFactMemberIdentity(memberTitle, existingTitle)
          )
        ) {
          continue;
        }
        const memberTokens = comparableTokens(memberTitle).filter(
          (token) => token.length >= 3
        );
        if (memberTokens.length < 2) continue;
        const titleSpans = index.spans.filter((span) => {
          if (
            !allowedSpanIds.has(span.spanId) ||
            span.normalizedClause.length > 600
          ) {
            return false;
          }
          const tokens = new Set(comparableTokens(span.normalizedClause));
          return memberTokens.every((token) => tokens.has(token));
        });
        const supportedTitleSpans = titleSpans.filter((titleSpan) =>
          index.spans.some(
            (span) => {
              const actionTokens = new Set(
                comparableTokens(span.normalizedClause)
              );
              return (
                allowedSpanIds.has(span.spanId) &&
                span.normalizedClause.length <= 600 &&
                span.sourceIdentityHash === titleSpan.sourceIdentityHash &&
                span.lineOccurrence === titleSpan.lineOccurrence &&
                /\b(?:climb|enter|explore|tour|visit)\b/.test(
                  span.normalizedClause
                ) &&
                memberTokens.some((token) => actionTokens.has(token))
              );
            }
          )
        );
        if (supportedTitleSpans.length === 0) continue;
        const sourceSpan = [...supportedTitleSpans].sort(
          (left, right) =>
            left.normalizedClause.length - right.normalizedClause.length ||
            left.spanId.localeCompare(right.spanId)
        )[0];
        recoveredByStage.set(stageIndex, [
          ...(recoveredByStage.get(stageIndex) ?? []),
          {
            _sourceFactCompositePlanRecovery: true,
            address: null,
            area: stringValue(proposal, "area"),
            category: stringValue(proposal, "category") ?? "art_culture",
            city,
            date,
            description: memberTitle,
            endTime: null,
            evidence: memberTitle,
            evidenceRole: "atomic_candidate",
            itemType: "activity",
            sourceFilename:
              stringValue(proposal, "sourceFilename") ??
              stage.sourceFilename ??
              null,
            sourceHeadingPath: Array.isArray(proposal.sourceHeadingPath)
              ? [...proposal.sourceHeadingPath]
              : [],
            sourceSectionLabel:
              stringValue(proposal, "sourceSectionLabel") ??
              sourceSpan.normalizedSectionLabel,
            sourceSectionType: "dated_itinerary",
            startTime: null,
            title: memberTitle,
          },
        ]);
        existingByDate.set(date, [
          ...(existingByDate.get(date) ?? []),
          memberTitle,
        ]);
      }
    }
  }

  if (recoveredByStage.size === 0) {
    return { recoveredCandidateCount: 0, stages };
  }
  return {
    recoveredCandidateCount: [...recoveredByStage.values()].reduce(
      (count, records) => count + records.length,
      0
    ),
    stages: stages.map((stage, stageIndex) => {
      const recovered = recoveredByStage.get(stageIndex) ?? [];
      if (recovered.length === 0) return stage;
      const stageRecord = asRecord(stage.stage);
      const activities = Array.isArray(stageRecord.activities)
        ? stageRecord.activities
        : [];
      return {
        ...stage,
        stage: {
          ...stageRecord,
          activities: [...activities, ...recovered],
        },
      };
    }),
  };
}

// Deterministic pre-geocode recovery for a narrow parser omission: a
// source-authored same-site proposal names individual source lines, but the
// parser emits only the structural proposal and some of its atomic members.
// The preliminary Source Fact Ledger is the trigger and exact local source
// lines are the only material that may mint records. General uncovered text,
// fuzzy title matches, and unanchored relationships remain untouched.
export function recoverMissingSourceFactRelationshipMembersV1({
  index,
  stages,
}: {
  index: SourceDocumentIndexV1;
  stages: EvidenceStageInput[];
}): SourceFactRelationshipRecoveryResultV1 {
  const preliminaryLedger = buildSourceFactLedgerV1({ index, stages });
  const anchoredRelationships = preliminaryLedger.factSet.facts.filter(
    (fact) =>
      fact.kind === "relationship" &&
      stringValue(fact.payload, "relationshipType") === "contains" &&
      Boolean(stringValue(fact.payload, "parentFactId")) &&
      arrayStrings(fact.payload.memberFactIds).length > 0 &&
      arrayStrings(fact.payload.unresolvedMemberSpanIds).length > 0
  );
  if (anchoredRelationships.length === 0) {
    return {
      recoveredCandidateCount: 0,
      recoveredRelationshipCount: 0,
      recoveredTailReferenceCount: 0,
      stages,
    };
  }

  const recoveredByStage = new Map<number, Record<string, unknown>[]>();
  const recoveredRelationshipFactIds = new Set<string>();
  let recoveredTailReferenceCount = 0;
  const existingTitlesByStage = stages.map((stage) => {
    const stageRecord = asRecord(stage.stage);
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    return new Set(
      activities
        .map((activity) => normalizeText(stringValue(asRecord(activity), "title")))
        .filter(Boolean)
    );
  });

  stages.forEach((stage, stageIndex) => {
    const stageRecord = asRecord(stage.stage);
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    const allowedSpanIds = allowedSpanIdsForStage(index, stage);
    for (const activity of activities) {
      const proposal = asRecord(activity);
      const proposalEvidence = stringValue(proposal, "evidence") ?? "";
      if (
        stringValue(proposal, "evidenceRole") !== "grouping_proposal" ||
        stringValue(proposal, "sourceSectionType") !== "dated_itinerary" ||
        !stringValue(proposal, "date") ||
        !stringValue(proposal, "city") ||
        !SITE_CONTAINER_NOUN_PATTERN.test(
          `${stringValue(proposal, "title") ?? ""} ${proposalEvidence}`
        )
      ) {
        continue;
      }
      const evidenceLines = proposalEvidence
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (evidenceLines.length < 2) continue;
      const proposalSectionLabel = normalizeText(
        stringValue(proposal, "sourceSectionLabel")
      );
      for (const line of evidenceLines) {
        const title = recoveredRelationshipMemberTitle(line);
        if (!title) continue;
        const normalizedLine = normalizeText(line);
        const sourceSpans = index.spans.filter(
          (span) =>
            allowedSpanIds.has(span.spanId) &&
            span.normalizedClause === normalizedLine &&
            (!proposalSectionLabel ||
              span.normalizedSectionLabel === proposalSectionLabel)
        );
        if (sourceSpans.length !== 1) continue;
        const span = sourceSpans[0];
        const relationships = anchoredRelationships.filter(
          (fact) =>
            fact.sourceSpanIds.includes(span.spanId) &&
            arrayStrings(fact.payload.unresolvedMemberSpanIds).includes(
              span.spanId
            )
        );
        if (relationships.length !== 1) continue;
        const normalizedTitle = normalizeText(title);
        if (existingTitlesByStage[stageIndex].has(normalizedTitle)) continue;
        existingTitlesByStage[stageIndex].add(normalizedTitle);
        recoveredRelationshipFactIds.add(relationships[0].factId);
        recoveredByStage.set(stageIndex, [
          ...(recoveredByStage.get(stageIndex) ?? []),
          {
            _sourceFactRelationshipRecovery: true,
            _sourceRecovery: true,
            address: null,
            area: stringValue(proposal, "area"),
            category: stringValue(proposal, "category") ?? "art_culture",
            city: stringValue(proposal, "city"),
            date: stringValue(proposal, "date"),
            description: title,
            endTime: null,
            evidence: line,
            evidenceRole: "atomic_candidate",
            itemType: "activity",
            sourceFilename:
              stringValue(proposal, "sourceFilename") ?? stage.sourceFilename ?? null,
            sourceHeadingPath: Array.isArray(proposal.sourceHeadingPath)
              ? [...proposal.sourceHeadingPath]
              : [],
            sourceSectionLabel: stringValue(proposal, "sourceSectionLabel"),
            sourceSectionType: "dated_itinerary",
            startTime: null,
            title,
          },
        ]);
      }

      // A same-site proposal can end at a verified boundary while the source
      // continues with researched venue ideas that the parser omits. Recover
      // only exact, price-marked venue rows in the short local tail. Generic
      // uncovered text, availability rows, and unpriced prose remain out.
      const evidenceSpans = evidenceLines.flatMap((line) => {
        const normalizedLine = normalizeText(line);
        const matches = index.spans.filter(
          (span) =>
            allowedSpanIds.has(span.spanId) &&
            span.normalizedClause === normalizedLine &&
            (!proposalSectionLabel ||
              span.normalizedSectionLabel === proposalSectionLabel)
        );
        return matches.length === 1 ? matches : [];
      });
      const relationshipForProposal = anchoredRelationships.filter((fact) =>
        evidenceSpans.some((span) => fact.sourceSpanIds.includes(span.spanId))
      );
      const boundaryLine = evidenceSpans.reduce(
        (maximum, span) => Math.max(maximum, span.lineOccurrence),
        -1
      );
      const boundarySpan = evidenceSpans.find(
        (span) => span.lineOccurrence === boundaryLine
      );
      if (
        relationshipForProposal.length === 1 &&
        boundarySpan &&
        boundaryLine >= 0
      ) {
        const sourceLines = (stage.sourceText ?? "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const tailSpans = index.spans.filter(
          (span) =>
            allowedSpanIds.has(span.spanId) &&
            span.sourceIdentityHash === boundarySpan.sourceIdentityHash &&
            span.normalizedSectionLabel === boundarySpan.normalizedSectionLabel &&
            span.lineOccurrence > boundaryLine &&
            span.lineOccurrence <= boundaryLine + 12 &&
            /\bfree\s+\d/.test(span.normalizedClause)
        );
        for (const span of tailSpans) {
          const matchingLines = sourceLines.filter(
            (line) => normalizeText(line) === span.normalizedClause
          );
          if (matchingLines.length !== 1) continue;
          const line = matchingLines[0];
          const title = recoveredRelationshipMemberTitle(line);
          const normalizedTitle = normalizeText(title);
          if (
            !title ||
            existingTitlesByStage[stageIndex].has(normalizedTitle)
          ) {
            continue;
          }
          existingTitlesByStage[stageIndex].add(normalizedTitle);
          recoveredTailReferenceCount += 1;
          recoveredByStage.set(stageIndex, [
            ...(recoveredByStage.get(stageIndex) ?? []),
            {
              _sourceFactTailReferenceRecovery: true,
              _sourceRecovery: true,
              address: null,
              area: stringValue(proposal, "area"),
              category: stringValue(proposal, "category") ?? "art_culture",
              city: stringValue(proposal, "city"),
              date: stringValue(proposal, "date"),
              description: title,
              endTime: null,
              evidence: line,
              evidenceRole: "city_note_candidate",
              itemType: "note",
              sourceFilename:
                stringValue(proposal, "sourceFilename") ??
                stage.sourceFilename ??
                null,
              sourceHeadingPath: Array.isArray(proposal.sourceHeadingPath)
                ? [...proposal.sourceHeadingPath]
                : [],
              sourceSectionLabel: stringValue(proposal, "sourceSectionLabel"),
              sourceSectionType: "dated_itinerary",
              startTime: null,
              title,
            },
          ]);
        }
      }
    }
  });

  if (recoveredByStage.size === 0) {
    return {
      recoveredCandidateCount: 0,
      recoveredRelationshipCount: 0,
      recoveredTailReferenceCount: 0,
      stages,
    };
  }
  const nextStages = stages.map((stage, stageIndex) => {
    const recovered = recoveredByStage.get(stageIndex) ?? [];
    if (recovered.length === 0) return stage;
    const stageRecord = asRecord(stage.stage);
    const activities = Array.isArray(stageRecord.activities)
      ? stageRecord.activities
      : [];
    return {
      ...stage,
      stage: {
        ...stageRecord,
        activities: [...activities, ...recovered],
      },
    };
  });
  return {
    recoveredCandidateCount: [...recoveredByStage.values()].reduce(
      (count, records) => count + records.length,
      0
    ),
    recoveredRelationshipCount: recoveredRelationshipFactIds.size,
    recoveredTailReferenceCount,
    stages: nextStages,
  };
}

function recordForCandidate(
  stages: EvidenceStageInput[],
  candidate: ResolverCandidate
) {
  const stage = asRecord(stages[candidate.stageIndex]?.stage);
  const activities = Array.isArray(stage.activities) ? stage.activities : [];
  return asRecord(activities[candidate.itemIndex]);
}

function entityFactKey({
  date,
  semanticIdentityDigest,
}: {
  date: string | null;
  semanticIdentityDigest: string;
}) {
  return `${semanticIdentityDigest}|${date ?? "undated"}`;
}

const GENERIC_NOTE_TITLE_TOKENS = new Set([
  "bar",
  "bars",
  "cafe",
  "cafes",
  "food",
  "idea",
  "ideas",
  "note",
  "notes",
  "restaurant",
  "restaurants",
  "shopping",
  "tip",
  "tips",
]);

function mostSpecificSourceSpanIds(
  matches: SourceDocumentIndexV1["spans"]
) {
  if (matches.length === 0) return [];
  const sorted = [...matches].sort(
    (left, right) =>
      left.normalizedClause.length - right.normalizedClause.length ||
      left.spanId.localeCompare(right.spanId)
  );
  const shortestClause = sorted[0].normalizedClause;
  const shortest = sorted.filter(
    (span) => span.normalizedClause === shortestClause
  );
  const competingAtSameLength = sorted.some(
    (span) =>
      span.normalizedClause.length === shortestClause.length &&
      span.normalizedClause !== shortestClause
  );
  return competingAtSameLength ? [] : shortest.map((span) => span.spanId);
}

function sourceSpansSayCityTip(
  index: SourceDocumentIndexV1,
  sourceSpanIds: string[]
) {
  const boundSpans = sourceSpanIds
    .map((spanId) => index.lookups.spanById.get(spanId) ?? null)
    .filter((span): span is SourceDocumentIndexV1["spans"][number] =>
      Boolean(span)
    );
  return boundSpans.some((bound) =>
    index.spans.some(
      (span) =>
        span.sourceIdentityHash === bound.sourceIdentityHash &&
        span.lineOccurrence <= bound.lineOccurrence &&
        span.lineOccurrence >= bound.lineOccurrence - 1 &&
        hasCityTipSignal(span.normalizedClause)
    )
  );
}

const SOURCE_TITLE_FUNCTION_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
]);

function sourceTitleHasExplicitUncertainty({
  allowedSpanIds,
  index,
  title,
}: {
  allowedSpanIds: Set<string>;
  index: SourceDocumentIndexV1;
  title: string;
}) {
  const titleTokens = comparableTokens(title).filter(
    (token) => token.length >= 3 && !SOURCE_TITLE_FUNCTION_WORDS.has(token)
  );
  if (titleTokens.length < 2) return false;
  const matches = index.spans
    .filter((span) => {
      if (
        !allowedSpanIds.has(span.spanId) ||
        span.normalizedClause.length > 240
      ) {
        return false;
      }
      const spanTokens = new Set(comparableTokens(span.normalizedClause));
      return titleTokens.every((token) => spanTokens.has(token));
    })
    .map((span) => ({
      extraTokenCount: comparableTokens(span.normalizedClause).filter(
        (token) => !titleTokens.includes(token)
      ).length,
      span,
    }));
  if (matches.length === 0) return false;
  const fewestExtraTokens = Math.min(
    ...matches.map((match) => match.extraTokenCount)
  );
  const mostSpecific = matches.filter(
    (match) => match.extraTokenCount === fewestExtraTokens
  );
  return mostSpecific.every(({ span }) =>
    hasWeakRecommendationLanguage(span.normalizedClause)
  );
}

function uniqueNoteTitleWitnessSpanIds({
  allowedSpanIds,
  index,
  record,
}: {
  allowedSpanIds: Set<string>;
  index: SourceDocumentIndexV1;
  record: Record<string, unknown>;
}) {
  const itemType = normalizeText(stringValue(record, "itemType"));
  const evidenceRole = stringValue(record, "evidenceRole");
  if (
    itemType !== "note" ||
    (evidenceRole !== "rejected" && evidenceRole !== "city_note_candidate")
  ) {
    return [];
  }
  const titleTokens = normalizeText(stringValue(record, "title"))
    .split(/\s+/)
    .filter(
      (token) =>
        token.length >= 3 && !GENERIC_NOTE_TITLE_TOKENS.has(token)
    );
  if (titleTokens.length === 0) return [];
  const matches = index.spans.filter((span) => {
    if (!allowedSpanIds.has(span.spanId)) return false;
    const spanTokens = new Set(span.normalizedClause.split(/\s+/));
    return titleTokens.every((token) => spanTokens.has(token));
  });
  return mostSpecificSourceSpanIds(matches);
}

function uniqueActivityTitleWitnessSpanIds({
  allowedSpanIds,
  index,
  record,
}: {
  allowedSpanIds: Set<string>;
  index: SourceDocumentIndexV1;
  record: Record<string, unknown>;
}) {
  const evidenceRole = stringValue(record, "evidenceRole");
  if (
    evidenceRole !== "atomic_candidate" &&
    evidenceRole !== "accessory_detail" &&
    evidenceRole !== "city_note_candidate" &&
    evidenceRole !== "context" &&
    evidenceRole !== "rejected"
  ) {
    return [];
  }
  const titleTokens = comparableTokens(stringValue(record, "title") ?? "")
    .filter(
      (token) =>
        token.length >= 3 &&
        !SOURCE_TITLE_FUNCTION_WORDS.has(token) &&
        !GENERIC_NOTE_TITLE_TOKENS.has(token)
    );
  if (titleTokens.length === 0) return [];
  const matches = index.spans.filter((span) => {
    if (!allowedSpanIds.has(span.spanId) || span.normalizedClause.length > 240) {
      return false;
    }
    const spanTokens = new Set(comparableTokens(span.normalizedClause));
    return titleTokens.every((token) => spanTokens.has(token));
  });
  return mostSpecificSourceSpanIds(matches);
}

function uniqueOwnTextWitnessSpanIds({
  allowedSpanIds,
  index,
  record,
  sourceText,
}: {
  allowedSpanIds: Set<string>;
  index: SourceDocumentIndexV1;
  record: Record<string, unknown>;
  sourceText: string | null;
}) {
  if (stringValue(record, "evidenceRole") === "grouping_proposal") return [];
  const ownText = normalizeText(
    stringValue(record, "evidence") ?? stringValue(record, "description")
  );
  if (ownText.length < 20) return [];
  const normalizedSourceText = normalizeText(sourceText);
  const matches = index.spans.filter((span) => {
    if (
      allowedSpanIds.size > 0
        ? !allowedSpanIds.has(span.spanId)
        : !normalizedSourceText.includes(span.normalizedClause)
    ) {
      return false;
    }
    if (span.normalizedClause.length < 20) return false;
    return (
      ownText.includes(span.normalizedClause) ||
      span.normalizedClause.includes(ownText)
    );
  });
  if (
    matches.length === 0 ||
    new Set(matches.map((span) => span.sourceIdentityHash)).size !== 1
  ) {
    return [];
  }
  return mostSpecificSourceSpanIds(matches);
}

function uniqueGroupingProposalWitnessSpanIds({
  allowedSpanIds,
  index,
  record,
  sourceText,
}: {
  allowedSpanIds: Set<string>;
  index: SourceDocumentIndexV1;
  record: Record<string, unknown>;
  sourceText: string | null;
}) {
  if (stringValue(record, "evidenceRole") !== "grouping_proposal") {
    return [];
  }
  const ownText = normalizeText(
    stringValue(record, "evidence") ?? stringValue(record, "description")
  );
  if (ownText.length < 20) return [];
  const normalizedSourceText = normalizeText(sourceText);
  if (
    allowedSpanIds.size === 0 &&
    (!normalizedSourceText || !normalizedSourceText.includes(ownText))
  ) {
    return [];
  }
  const matches = index.spans.filter((span) => {
    if (
      allowedSpanIds.size > 0
        ? !allowedSpanIds.has(span.spanId)
        : !normalizedSourceText.includes(span.normalizedClause)
    ) {
      return false;
    }
    if (span.normalizedClause.length < 20) return false;
    return (
      ownText.includes(span.normalizedClause) ||
      span.normalizedClause.includes(ownText)
    );
  });
  if (
    allowedSpanIds.size === 0 &&
    new Set(matches.map((span) => span.sourceIdentityHash)).size !== 1
  ) {
    return [];
  }
  return mostSpecificSourceSpanIds(matches);
}

function bindCandidates({
  candidates,
  index,
  sourceLedger,
  stages,
}: {
  candidates: ResolverCandidate[];
  index: SourceDocumentIndexV1;
  sourceLedger: SourceFactLedgerBuildResultV1;
  stages: EvidenceStageInput[];
}) {
  const entityFactsByKey = new Map<string, SourceFactV1[]>();
  for (const fact of sourceLedger.factSet.facts) {
    if (fact.kind !== "entity" || fact.payload.recordClass !== "activity") {
      continue;
    }
    const semanticIdentityDigest = stringValue(
      fact.payload,
      "semanticIdentityDigest"
    );
    if (!semanticIdentityDigest) continue;
    const key = entityFactKey({
      date: stringValue(fact.payload, "date"),
      semanticIdentityDigest,
    });
    entityFactsByKey.set(key, [...(entityFactsByKey.get(key) ?? []), fact]);
  }

  const bindings = candidates.map((candidate): CandidateBinding => {
    const record = recordForCandidate(stages, candidate);
    const stage = stages[candidate.stageIndex];
    if (!stage) {
      return {
        candidate,
        fact: null,
        record,
        sourceIsRecovery: false,
        sourceSaysCityTip: false,
        sourceSpanIds: [],
        sourceTitleHasExplicitUncertainty: false,
      };
    }
    const alignment = alignSourceCandidateV1({ index, record, stage });
    const allowedSpanIds = new Set(
      stage.sourceSpanIds?.length
        ? stage.sourceSpanIds
        : stage.sourceUploadId
          ? index.lookups.spanIdsBySourceUploadId.get(stage.sourceUploadId) ?? []
          : stage.source === "model_spine"
            ? index.spans.map((span) => span.spanId)
            : []
    );
    const positionalSpanIds =
      alignment.status === "unresolved_source" &&
      candidate.sourceLine !== null
        ? index.spans
            .filter(
              (span) =>
                allowedSpanIds.has(span.spanId) &&
                span.lineOccurrence === candidate.sourceLine
            )
            .map((span) => span.spanId)
        : [];
    const noteTitleSpanIds =
      alignment.status === "unresolved_source" && positionalSpanIds.length === 0
        ? uniqueNoteTitleWitnessSpanIds({ allowedSpanIds, index, record })
        : [];
    const ownTextSpanIds =
      alignment.status === "unresolved_source" &&
      noteTitleSpanIds.length === 0
        ? uniqueOwnTextWitnessSpanIds({
            allowedSpanIds,
            index,
            record,
            sourceText: stage.sourceText ?? null,
          })
        : [];
    const activityTitleSpanIds =
      alignment.status === "unresolved_source" &&
      noteTitleSpanIds.length === 0 &&
      ownTextSpanIds.length === 0
        ? uniqueActivityTitleWitnessSpanIds({ allowedSpanIds, index, record })
        : [];
    const proposalSpanIds =
      alignment.status === "unresolved_source" &&
      noteTitleSpanIds.length === 0 &&
      activityTitleSpanIds.length === 0 &&
      ownTextSpanIds.length === 0
        ? uniqueGroupingProposalWitnessSpanIds({
            allowedSpanIds,
            index,
            record,
            sourceText: stage.sourceText ?? null,
          })
        : [];
    const sourceSpanIds =
      alignment.sourceSpanIds.length > 0
        ? alignment.sourceSpanIds
        : candidate.evidenceRole === "grouping_proposal" &&
            proposalSpanIds.length > 0
          ? proposalSpanIds
          : noteTitleSpanIds.length > 0
            ? noteTitleSpanIds
            : ownTextSpanIds.length > 0
              ? ownTextSpanIds
              : activityTitleSpanIds.length > 0
                ? activityTitleSpanIds
                : positionalSpanIds;
    const semanticIdentityDigest = hashStableValue({
      sourceSpanIds: alignment.sourceSpanIds,
      title: normalizeText(stringValue(record, "title")),
    }).slice(0, 20);
    const facts = entityFactsByKey.get(
      entityFactKey({ date: stringValue(record, "date"), semanticIdentityDigest })
    ) ?? [];
    const sameRoleFacts = facts.filter(
      (fact) =>
        stringValue(fact.payload, "sourceRole") === candidate.evidenceRole
    );
    const expectedSourceAlignment =
      alignment.status === "aligned"
        ? { method: alignment.method }
        : {
            ambiguityCount: alignment.plausibleSpanIds.length,
            plausibleSpanIds: alignment.plausibleSpanIds,
            reason: alignment.reason,
            status: alignment.status,
          };
    const sameAlignmentFacts = sameRoleFacts.filter(
      (fact) =>
        hashStableValue(fact.payload.sourceAlignment) ===
        hashStableValue(expectedSourceAlignment)
    );
    const selectedFact =
      sameAlignmentFacts.length === 1
        ? sameAlignmentFacts[0]
        : sameRoleFacts.length === 1
          ? sameRoleFacts[0]
          : facts.length === 1
            ? facts[0]
            : null;
    return {
      candidate,
      fact: selectedFact,
      record,
      sourceIsRecovery:
        normalizeText(stage.label).startsWith("source recovery") ||
        asRecord(stage.stage)._sourceRecovery === true ||
        record._sourceRecovery === true,
      sourceSaysCityTip: sourceSpansSayCityTip(index, sourceSpanIds),
      sourceSpanIds,
      sourceTitleHasExplicitUncertainty: sourceTitleHasExplicitUncertainty({
        allowedSpanIds,
        index,
        title: candidate.title,
      }),
    };
  });

  const siblingWitnesses = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (binding.sourceSpanIds.length === 0) continue;
    const key = hashStableValue({
      date: binding.candidate.date,
      sourceIdentity: binding.candidate.sourceIdentity,
      title: normalizeText(binding.candidate.title),
    });
    const witnessKey = hashStableValue([...binding.sourceSpanIds].sort());
    siblingWitnesses.set(
      key,
      new Set([...(siblingWitnesses.get(key) ?? []), witnessKey])
    );
  }
  for (const binding of bindings) {
    if (binding.sourceSpanIds.length > 0) continue;
    const key = hashStableValue({
      date: binding.candidate.date,
      sourceIdentity: binding.candidate.sourceIdentity,
      title: normalizeText(binding.candidate.title),
    });
    if ((siblingWitnesses.get(key)?.size ?? 0) !== 1) continue;
    const witness = bindings.find(
      (candidate) =>
        candidate.sourceSpanIds.length > 0 &&
        candidate.candidate.date === binding.candidate.date &&
        candidate.candidate.sourceIdentity === binding.candidate.sourceIdentity &&
        normalizeText(candidate.candidate.title) ===
          normalizeText(binding.candidate.title)
    );
    if (!witness) continue;
    binding.sourceSpanIds = [...witness.sourceSpanIds];
    binding.sourceSaysCityTip = witness.sourceSaysCityTip;
  }
  return bindings;
}

function intentFactsBySubject(facts: SourceFactV1[]) {
  const result = new Map<string, SourceFactV1[]>();
  for (const fact of facts) {
    if (fact.kind !== "intent") continue;
    const subjectFactId = stringValue(fact.payload, "subjectFactId");
    if (!subjectFactId) continue;
    result.set(subjectFactId, [...(result.get(subjectFactId) ?? []), fact]);
  }
  return result;
}

function sourceReferenceDuplicateTargetIds(bindings: CandidateBinding[]) {
  const targetIds = new Set<string>();
  const references = bindings.filter((binding) => {
    if (binding.sourceSpanIds.length === 0) return false;
    const itemType = normalizeText(stringValue(binding.record, "itemType"));
    return (
      itemType === "note" ||
      binding.candidate.evidenceRole === "city_note_candidate" ||
      (binding.candidate.evidenceRole === "grouping_proposal" &&
        binding.sourceSaysCityTip &&
        !binding.candidate.hasBookingSignal &&
        !binding.candidate.hasTime)
    );
  });
  for (const reference of references) {
    const referenceText = normalizeText(
      reference.candidate.evidenceRole === "grouping_proposal"
        ? stringValue(reference.record, "evidence") ??
            stringValue(reference.record, "description")
        : reference.candidate.title
    );
    if (referenceText.length < 5) continue;
    for (const target of bindings) {
      const title = normalizeText(target.candidate.title);
      const targetText = normalizeText(
        `${target.candidate.title} ${stringValue(target.record, "description") ?? ""} ${stringValue(target.record, "evidence") ?? ""}`
      );
      const isDatedDiningRecommendation =
        /\brestaurant\b/.test(targetText) ||
        (/\bor\b/.test(targetText) &&
          /\b(?:bistro|cafe|dining|food|lunch|restaurant)\b/.test(targetText));
      if (
        target.candidate.candidateId === reference.candidate.candidateId ||
        target.candidate.evidenceRole !== "atomic_candidate" ||
        target.candidate.sourceIdentity !== reference.candidate.sourceIdentity ||
        title.length < 5 ||
        !referenceText.includes(title) ||
        (target.candidate.date !== null &&
          (target.candidate.date !== reference.candidate.date ||
            !target.sourceSaysCityTip ||
            !reference.sourceSaysCityTip ||
            !isDatedDiningRecommendation)) ||
        target.candidate.hasBookingSignal ||
        target.candidate.hasTime
      ) {
        continue;
      }
      targetIds.add(target.candidate.candidateId);
    }
  }
  return targetIds;
}

function sourceRecoveryReferenceTargetIds(
  bindings: CandidateBinding[],
  index: SourceDocumentIndexV1
) {
  const targetIds = new Set<string>();
  for (const binding of bindings) {
    const { candidate } = binding;
    if (
      !binding.sourceIsRecovery ||
      candidate.date !== null ||
      candidate.evidenceRole !== "atomic_candidate" ||
      candidate.hasBookingSignal ||
      candidate.hasTime
    ) {
      continue;
    }
    const title = normalizeText(candidate.title);
    if (title.length < 5) continue;
    const matchingOccurrences = index.spans.filter(
      (span) =>
        span.normalizedClause.length <= 240 &&
        (span.normalizedClause === title ||
          span.normalizedClause.includes(title))
    );
    const shortestOccurrenceLength = matchingOccurrences.reduce(
      (shortest, span) => Math.min(shortest, span.normalizedClause.length),
      Number.POSITIVE_INFINITY
    );
    const occurrences = matchingOccurrences.filter(
      (span) => span.normalizedClause.length === shortestOccurrenceLength
    );
    const recommendationBacked = occurrences.some((occurrence) =>
      index.spans.some(
        (span) =>
          span.sourceIdentityHash === occurrence.sourceIdentityHash &&
          span.normalizedSectionLabel === occurrence.normalizedSectionLabel &&
          span.lineOccurrence <= occurrence.lineOccurrence &&
          span.lineOccurrence >= occurrence.lineOccurrence - 3 &&
          (hasGenericCityTipHeader(span.normalizedClause) ||
            hasWeakRecommendationLanguage(span.normalizedClause) ||
            hasExplicitRecommendationVerb(span.normalizedClause) ||
            /\b(?:skippable|worth skipping|avoid)\b/.test(
              span.normalizedClause
            ))
      )
    );
    if (recommendationBacked) targetIds.add(candidate.candidateId);
  }
  return targetIds;
}

function verifiedCoordinates(record: Record<string, unknown>) {
  const latitude = record.verifiedLatitude;
  const longitude = record.verifiedLongitude;
  return record._geoVerified === true &&
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function coordinateDistanceKm(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number }
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) *
      Math.cos(radians(right.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(value));
}

function bindingSourceLine(
  binding: CandidateBinding,
  index: SourceDocumentIndexV1
) {
  const lines = binding.sourceSpanIds
    .map((spanId) => index.lookups.spanById.get(spanId)?.lineOccurrence ?? null)
    .filter((line): line is number => line !== null);
  return lines.length > 0 ? Math.min(...lines) : null;
}

function sourceRelationshipTailReferenceTargetIds({
  bindings,
  facts,
  index,
}: {
  bindings: CandidateBinding[];
  facts: SourceFactV1[];
  index: SourceDocumentIndexV1;
}) {
  const targetIds = new Set<string>();
  const bindingsByFactId = new Map<string, CandidateBinding[]>();
  for (const binding of bindings) {
    if (!binding.fact) continue;
    bindingsByFactId.set(binding.fact.factId, [
      ...(bindingsByFactId.get(binding.fact.factId) ?? []),
      binding,
    ]);
  }
  for (const fact of facts) {
    if (
      fact.kind !== "relationship" ||
      stringValue(fact.payload, "relationshipType") !== "contains"
    ) {
      continue;
    }
    const parentFactId = stringValue(fact.payload, "parentFactId");
    if (!parentFactId) continue;
    const parents = bindingsByFactId.get(parentFactId) ?? [];
    if (parents.length !== 1) continue;
    const parent = parents[0];
    const parentCoordinates = verifiedCoordinates(parent.record);
    if (!parentCoordinates) continue;
    const members = arrayStrings(fact.payload.memberFactIds)
      .flatMap((factId) => bindingsByFactId.get(factId) ?? [])
      .filter(
        (binding) =>
          binding.candidate.stageIndex === parent.candidate.stageIndex &&
          binding.candidate.date === parent.candidate.date
      )
      .flatMap((binding) => {
        const coordinates = verifiedCoordinates(binding.record);
        const sourceLine = bindingSourceLine(binding, index);
        return coordinates && sourceLine !== null
          ? [{ binding, coordinates, sourceLine }]
          : [];
      })
      .sort((left, right) => left.sourceLine - right.sourceLine);
    const boundary = members.find(
      ({ coordinates }) =>
        coordinateDistanceKm(parentCoordinates, coordinates) > 1.2
    );
    if (!boundary) continue;
    for (const binding of bindings) {
      const sourceLine = bindingSourceLine(binding, index);
      if (
        binding.candidate.stageIndex !== parent.candidate.stageIndex ||
        binding.candidate.date !== parent.candidate.date ||
        binding.candidate.sourceIdentity !== parent.candidate.sourceIdentity ||
        binding.candidate.evidenceRole === "grouping_proposal" ||
        binding.candidate.hasBookingSignal ||
        binding.candidate.hasTime ||
        binding.candidate.hasPlanSignal ||
        binding.candidate.hasRecommendationSignal ||
        sourceLine === null ||
        sourceLine < boundary.sourceLine
      ) {
        continue;
      }
      targetIds.add(binding.candidate.candidateId);
    }
  }
  return targetIds;
}

function roleDecisionFor(
  binding: CandidateBinding,
  intents: Map<string, SourceFactV1[]>,
  excludedSpanIds: Set<string>,
  sourceReferenceDuplicateTargetIds: Set<string>,
  sourceTailReferenceTargetIds: Set<string>
): CanonicalEvidenceResolution["roleDecisions"][number] | null {
  const { candidate, fact, record } = binding;
  const hasSourceBoundFact = Boolean(
    fact && fact.sourceSpanIds.length > 0 && binding.sourceSpanIds.length > 0
  );
  // A ticket-page row carrying admission vocabulary and a time/booking signal
  // is still only supporting evidence when the immutable ledger cannot bind
  // it to an exact source entity. Exact, source-bound venue tickets remain
  // eligible Activities; ambiguous booking artifacts do not create a second
  // visit merely because the parser supplied a clock time.
  if (
    !hasSourceBoundFact &&
    candidate.evidenceRole === "atomic_candidate" &&
    stringValue(record, "sourceSectionType") === "booking_detail" &&
    (candidate.hasBookingSignal || candidate.hasTime) &&
    /\b(?:admission|entry|pass|skip the line|ticket|voucher)\b/i.test(
      `${candidate.title} ${stringValue(record, "description") ?? ""}`
    )
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "accessory",
      confidence: "high",
      reason: "source_fact_unbound_booking_detail",
    };
  }
  if (candidate.evidenceRole === "grouping_proposal") {
    return binding.sourceSpanIds.length > 0 &&
      binding.sourceSaysCityTip &&
      !candidate.hasBookingSignal &&
      !candidate.hasTime
      ? {
          candidateId: candidate.candidateId,
          classification: "city_note",
          confidence: "high",
          reason: "source_span_recommendation_block",
        }
      : null;
  }
  if (sourceReferenceDuplicateTargetIds.has(candidate.candidateId)) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_fact_reference_duplicate",
    };
  }
  if (sourceTailReferenceTargetIds.has(candidate.candidateId)) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_fact_post_site_reference_tail",
    };
  }
  if (
    hasSourceBoundFact &&
    binding.sourceSaysCityTip &&
    candidate.evidenceRole === "atomic_candidate" &&
    !candidate.hasBookingSignal &&
    !candidate.hasTime &&
    /\bor\b/i.test(
      `${candidate.title} ${stringValue(record, "description") ?? ""} ${stringValue(record, "evidence") ?? ""}`
    ) &&
    /\b(?:breakfast|brunch|cafe|dinner|food|lunch|restaurant)\b/i.test(
      `${stringValue(record, "category") ?? ""} ${candidate.title} ${stringValue(record, "description") ?? ""}`
    )
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_fact_unsettled_recommendation_choice",
    };
  }
  if (record._sourceFactCompositePlanRecovery === true) {
    return {
      candidateId: candidate.candidateId,
      classification: "keep_activity",
      confidence: "high",
      reason: "source_fact_exact_composite_plan_member",
    };
  }
  // Recovery output is proposed evidence, not source truth. Source-backed
  // reference detection above gets the first chance to give an exact
  // recommendation its City Note home. Anything still unbound may enrich a
  // uniquely identified owner, but it may never mint a traveler-facing
  // Activity or City Note of its own.
  if (
    binding.sourceIsRecovery &&
    !hasSourceBoundFact &&
    candidate.evidenceRole === "atomic_candidate"
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "accessory",
      confidence: "high",
      reason: "source_fact_unbound_recovery_detail",
    };
  }
  if (
    binding.sourceTitleHasExplicitUncertainty &&
    candidate.evidenceRole === "atomic_candidate" &&
    !candidate.hasBookingSignal &&
    !candidate.hasTime &&
    !SITE_CONTAINER_NOUN_PATTERN.test(candidate.title)
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_fact_explicit_uncertainty",
    };
  }
  const itemType = normalizeText(stringValue(record, "itemType"));
  const hasUsableSourceSpan =
    binding.sourceSpanIds.length > 0 &&
    binding.sourceSpanIds.every((spanId) => !excludedSpanIds.has(spanId));
  if (
    binding.sourceSpanIds.some((spanId) => excludedSpanIds.has(spanId))
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "accessory",
      confidence: "high",
      reason: "source_fact_excluded_material",
    };
  }
  if (
    hasUsableSourceSpan &&
    (candidate.evidenceRole === "accessory_detail" ||
      candidate.evidenceRole === "context" ||
      (candidate.evidenceRole === "rejected" && itemType !== "note"))
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "accessory",
      confidence: "high",
      reason: "source_fact_existing_nontraveler_terminal",
    };
  }
  const factIntents = fact ? intents.get(fact.factId) ?? [] : [];
  const signals = new Set(
    factIntents.flatMap((intent) => arrayStrings(intent.payload.signals))
  );
  const hasCommitment =
    signals.has("booking_signal") ||
    signals.has("commitment_language") ||
    signals.has("fixed_time");
  const hasUncertainIntent = factIntents.some(
    (intent) => stringValue(intent.payload, "intent") === "uncertain"
  );
  const sourceRole = fact
    ? stringValue(fact.payload, "sourceRole") ?? candidate.evidenceRole
    : candidate.evidenceRole;
  const sourceSectionType = stringValue(record, "sourceSectionType");

  if (hasCommitment) {
    return {
      candidateId: candidate.candidateId,
      classification: "keep_activity",
      confidence: "high",
      reason: "source_fact_commitment",
    };
  }
  if (
    hasUncertainIntent ||
    (hasUsableSourceSpan &&
      (sourceRole === "city_note_candidate" ||
        sourceSectionType === "city_reference" ||
        itemType === "note"))
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_fact_reference",
    };
  }
  if (
    hasUsableSourceSpan &&
    candidate.hasRecommendationSignal &&
    !candidate.hasBookingSignal &&
    !candidate.hasTime &&
    !candidate.hasPlanSignal
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "city_note",
      confidence: "high",
      reason: "source_span_recommendation",
    };
  }
  if (
    hasUsableSourceSpan &&
    (candidate.hasBookingSignal ||
      candidate.hasTime ||
      candidate.hasPlanSignal)
  ) {
    return {
      candidateId: candidate.candidateId,
      classification: "keep_activity",
      confidence: "high",
      reason: "source_span_commitment",
    };
  }
  return null;
}

function hasBehaviorSignal(
  binding: CandidateBinding,
  intents: Map<string, SourceFactV1[]>
) {
  if (binding.candidate.evidenceRole === "grouping_proposal") return false;
  if (binding.sourceIsRecovery && binding.sourceSpanIds.length === 0) {
    return false;
  }
  const factIntents = binding.fact ? intents.get(binding.fact.factId) ?? [] : [];
  return (
    binding.candidate.hasBookingSignal ||
    binding.candidate.hasTime ||
    binding.candidate.hasPlanSignal ||
    binding.candidate.hasRecommendationSignal ||
    binding.candidate.evidenceRole === "city_note_candidate" ||
    stringValue(binding.record, "sourceSectionType") === "city_reference" ||
    normalizeText(stringValue(binding.record, "itemType")) === "note" ||
    factIntents.length > 0
  );
}

function relationshipResolution({
  bindings,
  facts,
}: {
  bindings: CandidateBinding[];
  facts: SourceFactV1[];
}) {
  const candidateIdsByFactId = new Map<string, string[]>();
  for (const binding of bindings) {
    if (!binding.fact) continue;
    candidateIdsByFactId.set(binding.fact.factId, [
      ...(candidateIdsByFactId.get(binding.fact.factId) ?? []),
      binding.candidate.candidateId,
    ]);
  }
  const bindingByCandidateId = new Map(
    bindings.map((binding) => [binding.candidate.candidateId, binding])
  );
  const proposalBindings = bindings.filter(
    (binding) => binding.candidate.evidenceRole === "grouping_proposal"
  );
  const groupings: CanonicalEvidenceResolution["groupings"] = [];
  const roleBindings: Array<{
    decision: CanonicalEvidenceResolution["roleDecisions"][number];
    sourceFactId: string;
  }> = [];
  const intents = intentFactsBySubject(facts);
  let unresolved = 0;

  for (const fact of facts) {
    if (fact.kind !== "relationship") continue;
    const relationshipType = stringValue(fact.payload, "relationshipType");
    const matchingProposals = proposalBindings.filter((binding) => {
      if (!binding.sourceSpanIds.length) return false;
      return binding.sourceSpanIds.every((spanId) =>
        fact.sourceSpanIds.includes(spanId)
      );
    });
    if (relationshipType === "alternative_set") {
      const proposal =
        matchingProposals.length === 1 ? matchingProposals[0] : null;
      if (!proposal) continue;
      const relationshipSignals = new Set(
        (intents.get(fact.factId) ?? []).flatMap((intent) =>
          arrayStrings(intent.payload.signals)
        )
      );
      const relationshipCommitted =
        relationshipSignals.has("booking_signal") ||
        relationshipSignals.has("commitment_language") ||
        relationshipSignals.has("fixed_time");
      if (relationshipCommitted) continue;
      for (const binding of bindings) {
        if (
          binding.candidate.evidenceRole === "grouping_proposal" ||
          binding.candidate.date !== proposal.candidate.date ||
          normalizeText(binding.candidate.title) !==
            normalizeText(proposal.candidate.title) ||
          binding.candidate.hasBookingSignal ||
          binding.candidate.hasTime
        ) {
          continue;
        }
        roleBindings.push({
          decision: {
            candidateId: binding.candidate.candidateId,
            classification: "city_note",
            confidence: "high",
            reason: "source_fact_alternative_reference",
          },
          sourceFactId: fact.factId,
        });
      }
      continue;
    }
    if (relationshipType !== "contains" && relationshipType !== "ordered_route") {
      continue;
    }
    const parentFactId = stringValue(fact.payload, "parentFactId");
    const memberFactIds = arrayStrings(fact.payload.memberFactIds);
    const unresolvedMemberSpanIds = arrayStrings(
      fact.payload.unresolvedMemberSpanIds
    );
    const parentCandidateIds = parentFactId
      ? candidateIdsByFactId.get(parentFactId) ?? []
      : [];
    const memberCandidateIds = memberFactIds.flatMap(
      (factId) => candidateIdsByFactId.get(factId) ?? []
    );
    const executionCandidateIds = [
      ...new Set([...parentCandidateIds, ...memberCandidateIds]),
    ];
    const executionBindings = executionCandidateIds
      .map((candidateId) => bindingByCandidateId.get(candidateId) ?? null)
      .filter((binding): binding is CandidateBinding => Boolean(binding));
    // A recovered atomic record proves that the source named the entity; it
    // does not, by itself, prove that every adjacent proposal line belongs
    // inside the same site. Keep this relationship unresolved here so the
    // existing source-order + verified-geocode containment authority can
    // admit members and stop at the first off-site boundary.
    const containsRecoveredRelationshipMember = executionBindings.some(
      (binding) => binding.record._sourceFactRelationshipRecovery === true
    );
    const dates = new Set(
      executionBindings.map((binding) => binding.candidate.date).filter(Boolean)
    );
    const missingMemberCount = memberFactIds.filter(
      (factId) => (candidateIdsByFactId.get(factId) ?? []).length !== 1
    ).length;
    if (
      unresolvedMemberSpanIds.length > 0 ||
      missingMemberCount > 0 ||
      executionCandidateIds.length < 2 ||
      executionBindings.length !== executionCandidateIds.length ||
      containsRecoveredRelationshipMember ||
      dates.size !== 1
    ) {
      unresolved += 1;
      continue;
    }
    const proposal = matchingProposals.length === 1 ? matchingProposals[0] : null;
    const parentBinding =
      parentCandidateIds.length === 1
        ? bindingByCandidateId.get(parentCandidateIds[0]) ?? null
        : null;
    const parentTitle =
      parentBinding?.candidate.title ?? proposal?.candidate.title ??
      executionBindings[0]?.candidate.title;
    if (!parentTitle) {
      unresolved += 1;
      continue;
    }
    const candidateIds = [
      ...new Set([
        ...(proposal ? [proposal.candidate.candidateId] : []),
        ...executionCandidateIds,
      ]),
    ];
    groupings.push({
      candidateIds,
      claim:
        relationshipType === "ordered_route"
          ? "source-authored continuous walking route"
          : "source-authored components of one continuous site visit",
      confidence: "high",
      parentCandidateId:
        parentBinding?.candidate.candidateId ??
        proposal?.candidate.candidateId ??
        executionCandidateIds[0],
      parentTitle,
      relationshipType,
      sourceAuthority: "source_fact",
      sourceFactId: fact.factId,
    });
  }
  return { groupings, roleBindings, unresolved };
}

function stampSourceFactRoleDecisions({
  bindings,
  roleDecisions,
  stages,
}: {
  bindings: CandidateBinding[];
  roleDecisions: CanonicalEvidenceResolution["roleDecisions"];
  stages: EvidenceStageInput[];
}) {
  const bindingByCandidateId = new Map(
    bindings.map((binding) => [binding.candidate.candidateId, binding])
  );
  for (const decision of roleDecisions) {
    const binding = bindingByCandidateId.get(decision.candidateId);
    if (!binding) continue;
    const stage = asRecord(stages[binding.candidate.stageIndex]?.stage);
    const activities = Array.isArray(stage.activities) ? stage.activities : [];
    const record = asRecord(activities[binding.candidate.itemIndex]);
    if (Object.keys(record).length === 0) continue;
    const evidenceTitle = cleanSourceFactNoteTitle(
      stringValue(record, "evidence") ?? ""
    );
    const sourceAlignment = asRecord(binding.fact?.payload.sourceAlignment);
    if (
      decision.classification === "city_note" &&
      binding.sourceSpanIds.length === 1 &&
      stringValue(sourceAlignment, "method") === "exact_evidence" &&
      /\b(?:idea|ideas|note|notes|tip|tips)\b/i.test(
        stringValue(record, "title") ?? ""
      ) &&
      evidenceTitle &&
      comparableTokens(evidenceTitle).length >= 2 &&
      !/[,;/]|\b(?:and|or)\b/i.test(evidenceTitle)
    ) {
      // A parser may wrap one exact source entity in a generic label such as
      // "Vienna museum note". Preserve the source entity as the canonical
      // lineage title before the note is collected, so later conservation can
      // prove that it remained separate from neighboring source rows.
      record.title = evidenceTitle;
    }
    record._sourceFactAuthorityDecision = {
      classification: decision.classification,
      reason: decision.reason,
      version: SOURCE_FACT_ASSEMBLY_AUTHORITY_VERSION,
    };
  }
  return stages;
}

export function applySourceFactAssemblyAuthorityV1({
  index,
  stages,
}: {
  index: SourceDocumentIndexV1;
  stages: EvidenceStageInput[];
}): SourceFactAssemblyAuthorityResultV1 {
  // The immutable ledger is built from pre-authority parser/recovery stages.
  // No resolver metadata or resolver-created grouping may enter this boundary.
  const sourceLedger = buildSourceFactLedgerV1({ index, stages });
  const candidates = buildCanonicalEvidenceCandidates(stages);
  const bindings = bindCandidates({ candidates, index, sourceLedger, stages });
  const intents = intentFactsBySubject(sourceLedger.factSet.facts);
  const excludedSpanIds = new Set(
    sourceLedger.factSet.facts
      .filter((fact) => fact.kind === "exclusion")
      .flatMap((fact) => fact.sourceSpanIds)
  );
  const referenceDuplicateTargetIds = new Set([
    ...sourceReferenceDuplicateTargetIds(bindings),
    ...sourceRecoveryReferenceTargetIds(bindings, index),
  ]);
  const tailReferenceTargetIds = sourceRelationshipTailReferenceTargetIds({
    bindings,
    facts: sourceLedger.factSet.facts,
    index,
  });
  const sourceRoleDecisions = bindings
    .map((binding) =>
      roleDecisionFor(
        binding,
        intents,
        excludedSpanIds,
        referenceDuplicateTargetIds,
        tailReferenceTargetIds
      )
    )
    .filter(
      (
        decision
      ): decision is CanonicalEvidenceResolution["roleDecisions"][number] =>
        Boolean(decision)
    );
  const relationships = relationshipResolution({
    bindings,
    facts: sourceLedger.factSet.facts,
  });
  const roleDecisionsByCandidateId = new Map(
    sourceRoleDecisions.map((decision) => [decision.candidateId, decision])
  );
  for (const { decision } of relationships.roleBindings) {
    if (!roleDecisionsByCandidateId.has(decision.candidateId)) {
      roleDecisionsByCandidateId.set(decision.candidateId, decision);
    }
  }
  const roleDecisions = [...roleDecisionsByCandidateId.values()];
  const resolution: CanonicalEvidenceResolution = {
    groupings: relationships.groupings,
    roleDecisions,
  };
  const applied = applyCanonicalEvidenceResolution(stages, resolution);
  const authorityStages = stampSourceFactRoleDecisions({
    bindings,
    roleDecisions,
    stages: applied.stages,
  });
  const behaviorSignals = bindings.filter((binding) =>
    hasBehaviorSignal(binding, intents)
  );
  const decisionsByCandidateId = new Set(
    roleDecisions.map((decision) => decision.candidateId)
  );
  const unresolvedBehaviorCandidateCount = behaviorSignals.filter(
    (binding) =>
      !binding.fact ||
      binding.sourceSpanIds.length === 0 ||
      !decisionsByCandidateId.has(binding.candidate.candidateId)
  ).length;
  const unresolvedBehaviorCandidates = behaviorSignals
    .filter(
      (binding) =>
        !binding.fact ||
        binding.sourceSpanIds.length === 0 ||
        !decisionsByCandidateId.has(binding.candidate.candidateId)
    )
    .map((binding) => ({
      candidateId: binding.candidate.candidateId,
      date: binding.candidate.date,
      evidenceRole: binding.candidate.evidenceRole,
      hasDecision: decisionsByCandidateId.has(binding.candidate.candidateId),
      hasFact: Boolean(binding.fact),
      sourceSpanCount: binding.sourceSpanIds.length,
      title: binding.candidate.title,
    }));
  const authorityHash = hashStableValue({
    recoveredRelationshipSourceSpanIds: bindings
      .filter(
        (binding) => binding.record._sourceFactRelationshipRecovery === true
      )
      .flatMap((binding) => binding.sourceSpanIds)
      .sort(),
    relationships: relationships.groupings.map((grouping) => ({
      relationshipType: grouping.relationshipType,
      sourceFactId: grouping.sourceFactId,
    })),
    roles: roleDecisions.map((decision) => ({
      classification: decision.classification,
      relationshipFactId:
        relationships.roleBindings.find(
          (binding) => binding.decision.candidateId === decision.candidateId
        )?.sourceFactId ?? null,
      subjectFactId:
        bindings.find(
          (binding) => binding.candidate.candidateId === decision.candidateId
        )?.fact?.factId ?? null,
      sourceSpanIds:
        bindings.find(
          (binding) => binding.candidate.candidateId === decision.candidateId
        )?.sourceSpanIds ?? [],
    })),
    sourceFingerprint: sourceLedger.factSet.sourceFingerprint,
    version: SOURCE_FACT_ASSEMBLY_AUTHORITY_VERSION,
  });

  return {
    diagnostics: { unresolvedBehaviorCandidates },
    groupingDecisions: applied.groupingDecisions,
    metrics: {
      authorityHash,
      behaviorSignalCandidateCount: behaviorSignals.length,
      candidateCount: candidates.length,
      compositePlanRecoveredCandidateCount: bindings.filter(
        (binding) => binding.record._sourceFactCompositePlanRecovery === true
      ).length,
      mappedCandidateCount: bindings.filter((binding) => binding.fact).length,
      relationshipDecisionCount: applied.groupingDecisions.filter(
        (decision) => decision.source === "source_fact"
      ).length,
      relationshipRecoveredCandidateCount: bindings.filter(
        (binding) => binding.record._sourceFactRelationshipRecovery === true
      ).length,
      relationshipRecoveryStageCount: stages.filter((stage) => {
        const stageRecord = asRecord(stage.stage);
        const activities = Array.isArray(stageRecord.activities)
          ? stageRecord.activities
          : [];
        return activities.some(
          (activity) =>
            asRecord(activity)._sourceFactRelationshipRecovery === true
        );
      }).length,
      relationshipUnresolvedCount: relationships.unresolved,
      roleDecisionCount: roleDecisions.length,
      schemaVersion: SOURCE_FACT_ASSEMBLY_AUTHORITY_VERSION,
      tailReferenceRecoveredCandidateCount: bindings.filter(
        (binding) => binding.record._sourceFactTailReferenceRecovery === true
      ).length,
      unresolvedBehaviorCandidateCount,
      unresolvedSourceBindingCount: bindings.filter(
        (binding) =>
          binding.candidate.evidenceRole !== "grouping_proposal" &&
          (!binding.fact || binding.sourceSpanIds.length === 0)
      ).length,
    },
    sourceLedger,
    stages: authorityStages,
  };
}
