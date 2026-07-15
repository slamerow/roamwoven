import { createHash } from "node:crypto";
import { createOpenAIStructuredResponse } from "@/lib/ai/openai";
import type {
  CanonicalGroupingDecision,
  EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { normalizeText } from "@/lib/extraction/traveler-text";

const CANONICAL_RESOLVER_VERSION = 7;
const MAX_RESOLVER_WINDOW_CANDIDATES = 24;
const MAX_RESOLVER_WINDOWS = 30;
const RESOLVER_WINDOW_CONCURRENCY = 3;
const resolverCache = new Map<
  string,
  {
    resolution: CanonicalEvidenceResolution;
    resolvedAt: string;
    sources: Array<{ title: string | null; url: string }>;
  }
>();

type ResolverCandidate = {
  candidateId: string;
  city: string | null;
  date: string | null;
  dayActivityCount: number;
  evidenceRole: string | null;
  fixedActivityCount: number;
  hasBookingSignal: boolean;
  hasPlanSignal: boolean;
  hasRecommendationSignal: boolean;
  hasTime: boolean;
  headingPath: string[];
  itemIndex: number;
  sectionLabel: string | null;
  sectionType: string | null;
  sourceBlock: number | null;
  sourceBlockIds: string[];
  sourceIdentity: string;
  sourceLine: number | null;
  sourcePrecedingLabel: string | null;
  sourceRelationshipSignal: boolean;
  stageIndex: number;
  stageLabel: string;
  title: string;
};

export type CanonicalEvidenceResolution = {
  groupings: Array<{
    candidateIds: string[];
    claim: string;
    confidence: "high" | "medium" | "low";
    parentCandidateId: string | null;
    parentTitle: string;
  }>;
  roleDecisions: Array<{
    candidateId: string;
    classification: "city_note" | "keep_activity";
    confidence: "high" | "medium" | "low";
    reason: string;
  }>;
};

export type CanonicalEvidenceResolverMetadata = {
  cacheHit: boolean;
  candidateCount: number;
  claims: Array<{
    candidateIds: string[];
    claim: string;
    parentTitle: string;
  }>;
  lookupKey: string | null;
  roleDecisions: Array<{
    candidateId: string;
    classification: "city_note" | "keep_activity";
    reason: string;
  }>;
  resolvedAt: string | null;
  sources: Array<{ title: string | null; url: string }>;
  version: number;
  windowCount: number;
};

export type CanonicalEvidenceResolverPlan = {
  candidateCount: number;
  requiresResolution: boolean;
  windows: Array<{
    candidateIds: string[];
    titles: string[];
  }>;
};

const resolverSchema = {
  additionalProperties: false,
  properties: {
    groupings: {
      items: {
        additionalProperties: false,
        properties: {
          candidateIds: { items: { type: "string" }, type: "array" },
          claim: { type: "string" },
          confidence: { enum: ["high", "medium", "low"] },
          parentCandidateId: { type: ["string", "null"] },
          parentTitle: { type: "string" },
        },
        required: [
          "candidateIds",
          "claim",
          "confidence",
          "parentCandidateId",
          "parentTitle",
        ],
        type: "object",
      },
      type: "array",
    },
    roleDecisions: {
      items: {
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          classification: { enum: ["city_note", "keep_activity"] },
          confidence: { enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
        required: ["candidateId", "classification", "confidence", "reason"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["groupings", "roleDecisions"],
  type: "object",
};

const resolverSystemPrompt = [
  "You are the bounded canonical source-structure resolver for a travel itinerary.",
  "Use only the supplied source structure and itinerary evidence. Never search for or infer private booking data, addresses, confirmation codes, traveler names, access details, or public venue facts.",
  "Source hierarchy is authoritative. Classify an item as city_note only when the structural fields show it belongs to a city-reference, ideas, recommendations, or notes block rather than an actual itinerary block. Public venue knowledge must not turn a reference item into an itinerary item.",
  "A date is supporting evidence, not proof of traveler intent. Use section labels, headings, list context, explicit plan language, fixed anchors, and the rest of that day's plan together. Day activity counts are soft context only; never classify by a numeric cap.",
  "A time, reservation, ticket, booking, or explicit planned action overrides nearby loose recommendation text and should remain an activity unless it is clearly accessory evidence for another canonical record.",
  "A repeated venue on different dates stays distinct when both sightings are actual itinerary visits. If one is a weak untimed sighting under a city-reference block and another is a concrete itinerary visit, classify only the weak reference sighting as city_note.",
  "Propose a grouping only when the supplied source structure presents the candidates as components of one continuous site, complex, route, or tour. A shared date, heading, paragraph, list, or city is not enough.",
  "Picking up or activating a citywide card or pass is a standalone logistics activity. Never group it with attractions the card may cover. A pass tied to one site may support a group only when the source explicitly says it covers that one continuous visit.",
  "Never group candidates on different dates. A verified continuous visit may contain exactly one timed or booked anchor; preserve that anchor on the grouped card. Never group two independently timed or booked candidates, and never group a generic clean itinerary merely because several activities share a day.",
  "Return high confidence only when the supplied source structure is conclusive. If inconclusive, return no grouping and keep activities separate.",
  "Keep claims short and factual. Return only candidate IDs supplied in the input.",
].join(" ");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safePrecedingLabel(value: string | undefined) {
  const text = value?.trim();

  if (
    !text ||
    text.length > 90 ||
    /@|\b(?:address|booking|confirmation|door|gate|lockbox|password|phone|ticket number|wifi|wi-fi)\b/i.test(
      text
    ) ||
    /\d{5,}/.test(text)
  ) {
    return null;
  }

  return text;
}

function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function sourceLineMatchesTitle(title: string, line: string) {
  const normalizedTitle = normalizeText(title);
  const normalizedLine = normalizeText(line);
  const exactMatch = Boolean(
    normalizedTitle &&
      normalizedLine &&
      (normalizedLine.includes(normalizedTitle) ||
        (normalizedTitle.includes(normalizedLine) && normalizedLine.length >= 5))
  );
  const titleTokens = normalizedTitle.split(/\s+/).filter(Boolean);
  const lineTokens = normalizedLine.split(/\s+/).filter(Boolean);
  const typoTolerantMatch = Boolean(
    titleTokens.length >= 2 &&
      titleTokens.every((titleToken) =>
        lineTokens.some(
          (lineToken) =>
            lineToken === titleToken ||
            (titleToken.length >= 5 &&
              lineToken.length >= 5 &&
              editDistanceAtMostOne(titleToken, lineToken))
        )
      )
  );

  return exactMatch || typoTolerantMatch;
}

function sourceTextHasGroupingRelationship(value: string) {
  return /\b(?:components?|complex|grounds|campus|estate|includes?|including|one continuous visit|same[ -]?site|walking route|walking tour|guided route|tour stops?|route stops?)\b/i.test(
    value
  );
}

function isCitywidePassTask(value: string) {
  return (
    /\b(?:city|tourist|travel|transit|metro)\s+(?:card|pass)\b/i.test(
      value
    ) ||
    /\b(?:card|pass)\s+(?:activation|collection|pick[ -]?up)\b/i.test(value) ||
    /\b(?:activate|collect|pick up)\s+(?:the\s+)?(?:city\s+)?(?:card|pass)\b/i.test(
      value
    )
  );
}

function isConclusiveGroupingClaim(value: string) {
  if (
    /\b(?:same day|same dated itinerary heading|same heading|presented together|listed together|all in (?:the same )?city|under the same date)\b/i.test(
      value
    )
  ) {
    return false;
  }

  return /\b(?:components?|complex|grounds|campus|estate|same[ -]?site|continuous (?:site|visit|route|tour)|one .{0,24} visit|walking route|walking tour|guided route|tour stops?|route stops?|covers? (?:the|one|this) visit)\b/i.test(
    value
  );
}

function isGenericGroupingParent(
  value: string,
  candidates: ResolverCandidate[]
) {
  const normalized = normalizeText(value);
  const cityLabels = new Set(
    candidates
      .map((candidate) => normalizeText(candidate.city))
      .filter(Boolean)
  );
  const genericSuffix = /^(?:attractions|day plan|highlights|sights|things to do)$/;
  const citywideLabel = [...cityLabels].some((city) =>
    genericSuffix.test(normalized.slice(city.length).trim()) &&
    normalized.startsWith(`${city} `)
  );

  return (
    !normalized ||
    /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+.*)?$/.test(
      normalized
    ) ||
    genericSuffix.test(normalized) ||
    citywideLabel
  );
}

function sourcePosition(title: string, sourceText: string | null | undefined) {
  if (!sourceText?.trim()) {
    return { block: null, line: null, precedingLabel: null };
  }

  const lines = sourceText.split(/\r?\n/);
  const normalizedTitle = normalizeText(title);
  let block = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      block += 1;
      continue;
    }

    if (!sourceLineMatchesTitle(title, line)) {
      continue;
    }

    let precedingLabel: string | null = null;
    for (let previous = index - 1; previous >= Math.max(0, index - 8); previous -= 1) {
      if (!lines[previous]?.trim()) {
        break;
      }

      const candidate = safePrecedingLabel(lines[previous]);
      if (candidate && normalizeText(candidate) !== normalizedTitle) {
        precedingLabel = candidate;
      }
    }

    return { block, line: index + 1, precedingLabel };
  }

  return { block: null, line: null, precedingLabel: null };
}

type SourceBlockWitness = {
  id: string;
  lines: string[];
  sourceIdentity: string;
};

function sourceIdentityFor(stage: EvidenceStageInput) {
  return normalizeText(
    stage.sourceUploadId ??
      stage.sourceFilename ??
      stage.sourceProvenance ??
      stage.label
  );
}

function buildSourceBlockWitnesses(stages: EvidenceStageInput[]) {
  const witnesses = new Map<string, SourceBlockWitness>();

  for (const stage of stages) {
    const sourceIdentity = sourceIdentityFor(stage);
    const blocks = (stage.sourceText ?? "")
      .split(/(?:\r?\n\s*){2,}/)
      .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
      .filter((lines) => lines.length > 0);

    for (const lines of blocks) {
      const normalizedBlock = lines.map((line) => normalizeText(line)).join("\n");
      const id = `source-block-${createHash("sha256")
        .update(JSON.stringify({ normalizedBlock, sourceIdentity }))
        .digest("hex")
        .slice(0, 20)}`;
      witnesses.set(id, { id, lines, sourceIdentity });
    }
  }

  return [...witnesses.values()];
}

function buildCandidates(stages: EvidenceStageInput[]) {
  const sourceBlocks = buildSourceBlockWitnesses(stages);
  const candidates = stages.flatMap((stageInput, stageIndex) => {
    const stage = asRecord(stageInput.stage);
    const activities = Array.isArray(stage.activities) ? stage.activities : [];

    return activities.flatMap((value, itemIndex) => {
      const activity = asRecord(value);
      const title = stringValue(activity, "title");

      if (
        !title ||
        /^(?:fly|flight|train|bus|ferry|transfer)\b|\b(?:flight|train|bus|ferry)\s+(?:to|from)\b/i.test(
          title
        )
      ) {
        return [];
      }

      const position = sourcePosition(title, stageInput.sourceText);
      const headingPath = Array.isArray(activity.sourceHeadingPath)
        ? activity.sourceHeadingPath.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0
          )
        : [];
      const description = stringValue(activity, "description") ?? "";
      const structuralText = [
        title,
        description,
        stringValue(activity, "sourceSectionLabel"),
        ...headingPath,
        position.precedingLabel,
      ].filter(Boolean).join(" ");
      const sourceIdentity = sourceIdentityFor(stageInput);
      const sourceBlockIds = sourceBlocks
        .filter(
          (block) =>
            block.sourceIdentity === sourceIdentity &&
            block.lines.some((line) => sourceLineMatchesTitle(title, line))
        )
        .map((block) => block.id)
        .sort();
      const sourceRelationshipSignal = sourceBlocks.some(
        (block) =>
          sourceBlockIds.includes(block.id) &&
          sourceTextHasGroupingRelationship(block.lines.join(" "))
      );

      return [{
        candidateId: `stage-${stageIndex + 1}-item-${itemIndex + 1}`,
        city: stringValue(activity, "city"),
        date: stringValue(activity, "date"),
        dayActivityCount: 0,
        evidenceRole: stringValue(activity, "evidenceRole"),
        fixedActivityCount: 0,
        hasBookingSignal: /\b(?:booking|confirmation|paid|reservation|ticket|timed|voucher)\b/i.test(
          description
        ),
        hasPlanSignal: /\b(?:booked|continue|dinner|explore|guided|lunch|plan(?:ned)? to|reservation|reserved|stop|tour|visit|walk|we will|we'll)\b/i.test(
          structuralText
        ),
        hasRecommendationSignal: /\b(?:ideas?|if time|maybe|notes?|possible|recommendations?|things to check out|where to eat)\b/i.test(
          structuralText
        ),
        hasTime: Boolean(
          stringValue(activity, "startTime") || stringValue(activity, "endTime")
        ),
        headingPath,
        itemIndex,
        sectionLabel: stringValue(activity, "sourceSectionLabel"),
        sectionType: stringValue(activity, "sourceSectionType"),
        sourceBlock: position.block,
        sourceBlockIds,
        sourceIdentity,
        sourceLine: position.line,
        sourcePrecedingLabel: position.precedingLabel,
        sourceRelationshipSignal,
        stageIndex,
        stageLabel: stageInput.label,
        title,
      } satisfies ResolverCandidate];
    });
  });

  const dayGroups = new Map<string, ResolverCandidate[]>();
  for (const candidate of candidates) {
    const key = candidateWindowKey(candidate);
    dayGroups.set(key, [...(dayGroups.get(key) ?? []), candidate]);
  }

  return candidates.map((candidate) => {
    const day = dayGroups.get(candidateWindowKey(candidate)) ?? [];
    return {
      ...candidate,
      dayActivityCount: day.length,
      fixedActivityCount: day.filter(
        (item) => item.hasTime || item.hasBookingSignal || item.hasPlanSignal
      ).length,
    };
  });
}

function hasAmbiguousCandidateCluster(candidates: ResolverCandidate[]) {
  const groups = new Map<string, ResolverCandidate[]>();

  for (const candidate of candidates) {
    const key = [
      candidate.stageIndex,
      candidate.date ?? "undated",
      normalizeText(candidate.city),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return candidates.some((candidate) => candidate.evidenceRole === "grouping_proposal") ||
    Array.from(groups.values()).some((group) => group.length >= 2) ||
    candidates.some(
      (candidate, index) =>
        candidates.findIndex(
          (other) =>
            other !== candidate &&
            normalizeText(other.title) === normalizeText(candidate.title) &&
            other.date !== candidate.date
        ) > index
    );
}

function resolutionKey(candidates: ResolverCandidate[]) {
  return createHash("sha256")
    .update(JSON.stringify({ candidates, version: CANONICAL_RESOLVER_VERSION }))
    .digest("hex");
}

function candidateWindowKey(candidate: ResolverCandidate) {
  return [
    candidate.sourceIdentity,
    candidate.date ?? "undated",
    normalizeText(candidate.city) || "unknown-city",
  ].join("|");
}

function proposalScopeMatches(
  proposal: ResolverCandidate,
  candidate: ResolverCandidate
) {
  if (proposal.sourceIdentity !== candidate.sourceIdentity) return false;
  if (proposal.date && candidate.date && proposal.date !== candidate.date) return false;
  if (
    proposal.city &&
    candidate.city &&
    normalizeText(proposal.city) !== normalizeText(candidate.city)
  ) {
    return false;
  }

  const sharesSourceBlock = proposal.sourceBlockIds.some((blockId) =>
    candidate.sourceBlockIds.includes(blockId)
  );
  const proposalLabels = new Set(
    [...proposal.headingPath, proposal.sectionLabel]
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );
  const sharesHeading = [...candidate.headingPath, candidate.sectionLabel]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .some((value) => proposalLabels.has(value));

  return sharesSourceBlock || sharesHeading || Boolean(proposal.date && candidate.date);
}

function buildResolutionWindows(candidates: ResolverCandidate[]) {
  const windows = new Map<string, ResolverCandidate[]>();
  const addWindow = (
    key: string,
    values: ResolverCandidate[],
    priorityCandidateId?: string
  ) => {
    const unique = Array.from(
      new Map(values.map((candidate) => [candidate.candidateId, candidate])).values()
    )
      .sort(
        (left, right) =>
          Number(right.candidateId === priorityCandidateId) -
            Number(left.candidateId === priorityCandidateId) ||
          left.stageIndex - right.stageIndex ||
          left.itemIndex - right.itemIndex
      )
      .slice(0, MAX_RESOLVER_WINDOW_CANDIDATES);

    if (unique.length > 0) windows.set(key, unique);
  };

  for (const proposal of candidates.filter(
    (candidate) => candidate.evidenceRole === "grouping_proposal"
  )) {
    addWindow(
      `grouping|${proposal.candidateId}`,
      [proposal, ...candidates.filter((candidate) =>
        candidate.candidateId !== proposal.candidateId &&
        proposalScopeMatches(proposal, candidate)
      )],
      proposal.candidateId
    );
  }

  const roleCandidates = candidates.filter(
    (candidate) =>
      candidate.sectionType === "city_reference" ||
      candidate.evidenceRole === "city_note_candidate" ||
      candidate.hasRecommendationSignal ||
      (!candidate.hasTime &&
        !candidate.hasBookingSignal &&
        !candidate.hasPlanSignal &&
        candidate.dayActivityCount >= 8 &&
        candidate.fixedActivityCount >= 2)
  );
  for (const key of new Set(roleCandidates.map(candidateWindowKey))) {
    addWindow(
      `role|${key}`,
      candidates.filter((candidate) => candidateWindowKey(candidate) === key)
    );
  }

  const structuralGroups = new Map<string, ResolverCandidate[]>();
  for (const candidate of candidates) {
    if (
      candidate.evidenceRole === "grouping_proposal" ||
      candidate.sectionType === "city_reference"
    ) {
      continue;
    }

    for (const sourceBlockId of candidate.sourceBlockIds) {
      const key = [
        candidate.sourceIdentity,
        candidate.date ?? "undated",
        normalizeText(candidate.city) || "unknown-city",
        sourceBlockId,
      ].join("|");
      structuralGroups.set(key, [
        ...(structuralGroups.get(key) ?? []),
        candidate,
      ]);
    }
  }
  for (const [key, group] of structuralGroups) {
    if (group.length < 2) continue;
    addWindow(`structure|${key}`, group);
  }

  const duplicateGroups = new Map<string, ResolverCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.sourceIdentity}|${normalizeText(candidate.title)}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), candidate]);
  }
  for (const [key, duplicates] of duplicateGroups) {
    if (new Set(duplicates.map((candidate) => candidate.date)).size < 2) continue;
    addWindow(`duplicate|${key}`, duplicates);
  }

  const seen = new Set<string>();
  return [...windows.values()]
    .filter((window) => {
      const key = window.map((candidate) => candidate.candidateId).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_RESOLVER_WINDOWS);
}

export function inspectCanonicalEvidenceResolutionPlan(
  stages: EvidenceStageInput[]
): CanonicalEvidenceResolverPlan {
  const candidates = buildCandidates(stages);
  const windows = buildResolutionWindows(candidates);

  return {
    candidateCount: candidates.length,
    requiresResolution:
      windows.length > 0 && hasAmbiguousCandidateCluster(candidates),
    windows: windows.map((window) => ({
      candidateIds: window.map((candidate) => candidate.candidateId),
      titles: window.map((candidate) => candidate.title),
    })),
  };
}

function commonSourceBlockIds(candidates: ResolverCandidate[]) {
  if (candidates.length === 0) return [];
  return candidates[0].sourceBlockIds.filter((blockId) =>
    candidates.every((candidate) => candidate.sourceBlockIds.includes(blockId))
  );
}

function reconcileRoleDecisions(
  decisions: CanonicalEvidenceResolution["roleDecisions"]
) {
  const highConfidence = decisions.filter((decision) => decision.confidence === "high");
  const grouped = new Map<string, typeof highConfidence>();

  for (const decision of highConfidence) {
    grouped.set(decision.candidateId, [
      ...(grouped.get(decision.candidateId) ?? []),
      decision,
    ]);
  }

  return [...grouped.values()].flatMap((candidateDecisions) =>
    new Set(candidateDecisions.map((decision) => decision.classification)).size === 1
      ? [candidateDecisions[0]]
      : []
  );
}

function reconcileGroupings(
  groupings: CanonicalEvidenceResolution["groupings"]
) {
  const unique = new Map<string, CanonicalEvidenceResolution["groupings"][number]>();

  for (const grouping of groupings) {
    const key = Array.from(new Set(grouping.candidateIds)).sort().join("|");
    if (!unique.has(key)) unique.set(key, grouping);
  }

  const remaining = [...unique.values()];
  const components: typeof remaining[] = [];

  while (remaining.length > 0) {
    const component = [remaining.shift()!];
    const ids = new Set(component[0].candidateIds);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        if (!candidate.candidateIds.some((id) => ids.has(id))) continue;
        component.push(candidate);
        candidate.candidateIds.forEach((id) => ids.add(id));
        remaining.splice(index, 1);
        expanded = true;
      }
    }
    components.push(component);
  }

  return components.flatMap((component) => {
    if (component.length === 1) return component;
    const parentKeys = new Set(
      component.map((grouping) =>
        grouping.parentCandidateId ?? normalizeText(grouping.parentTitle)
      )
    );
    const nested = component.every((left) =>
      component.every((right) => {
        const leftIds = new Set(left.candidateIds);
        const rightIds = new Set(right.candidateIds);
        return (
          left.candidateIds.every((id) => rightIds.has(id)) ||
          right.candidateIds.every((id) => leftIds.has(id))
        );
      })
    );

    if (parentKeys.size !== 1 || !nested) return [];
    return [component.sort(
      (left, right) =>
        right.candidateIds.length - left.candidateIds.length ||
        left.candidateIds.slice().sort().join("|").localeCompare(
          right.candidateIds.slice().sort().join("|")
        )
    )[0]];
  });
}

export function reconcileCanonicalEvidenceResolutions(
  resolutions: CanonicalEvidenceResolution[]
): CanonicalEvidenceResolution {
  return {
    groupings: reconcileGroupings(
      resolutions.flatMap((resolution) => resolution.groupings)
    ),
    roleDecisions: reconcileRoleDecisions(
      resolutions.flatMap((resolution) => resolution.roleDecisions)
    ),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    })
  );

  return results;
}

function parseResolution(value: unknown): CanonicalEvidenceResolution {
  const record = asRecord(value);

  return {
    groupings: Array.isArray(record.groupings)
      ? (record.groupings as CanonicalEvidenceResolution["groupings"])
      : [],
    roleDecisions: Array.isArray(record.roleDecisions)
      ? (record.roleDecisions as CanonicalEvidenceResolution["roleDecisions"])
      : [],
  };
}

function applyResolution({
  candidates,
  resolution,
  stages,
}: {
  candidates: ResolverCandidate[];
  resolution: CanonicalEvidenceResolution;
  stages: EvidenceStageInput[];
}) {
  const nextStages = stages.map((stageInput) => {
    const stage = asRecord(stageInput.stage);
    return {
      ...stageInput,
      stage: {
        ...stage,
        activities: Array.isArray(stage.activities)
          ? stage.activities.map((activity) => ({ ...asRecord(activity) }))
          : [],
      },
    };
  });
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const itemFor = (candidateId: string) => {
    const candidate = candidateById.get(candidateId);
    if (!candidate) return null;
    const stage = asRecord(nextStages[candidate.stageIndex]?.stage);
    const activities = Array.isArray(stage.activities) ? stage.activities : [];
    return asRecord(activities[candidate.itemIndex]);
  };

  for (const candidate of candidates) {
    const item = itemFor(candidate.candidateId);
    if (item) item._resolverCandidateId = candidate.candidateId;
  }

  for (const decision of resolution.roleDecisions) {
    if (decision.confidence !== "high") {
      continue;
    }

    const item = itemFor(decision.candidateId);
    if (!item) continue;
    item._canonicalRoleDecision = decision.classification;

    if (decision.classification === "city_note") {
      item.date = null;
      item.evidenceRole = "city_note_candidate";
      item.itemType = "note";
      item.sourceSectionType = "city_reference";
    } else {
      item.evidenceRole = "atomic_candidate";
      item.itemType = "activity";
    }
  }

  const groupingDecisions: CanonicalGroupingDecision[] = [];
  const groupedCandidateIds = new Set<string>();

  for (const grouping of resolution.groupings) {
    const uniqueIds = Array.from(new Set(grouping.candidateIds));
    if (grouping.confidence !== "high" || uniqueIds.length < 2) {
      continue;
    }

    const groupCandidates = uniqueIds
      .map((id) => candidateById.get(id))
      .filter((candidate): candidate is ResolverCandidate => Boolean(candidate));
    const executionCandidates = groupCandidates.filter(
      (candidate) => candidate.evidenceRole !== "grouping_proposal"
    );
    const dates = new Set(executionCandidates.map((candidate) => candidate.date));
    const sharedSourceBlocks = commonSourceBlockIds(executionCandidates);
    const requestedParent = grouping.parentCandidateId
      ? candidateById.get(grouping.parentCandidateId)
      : null;
    const nestedUnderRequestedParent = Boolean(
      requestedParent &&
        executionCandidates.every(
          (candidate) =>
            candidate.candidateId === requestedParent.candidateId ||
            candidate.headingPath.some(
              (heading) =>
                normalizeText(heading) === normalizeText(requestedParent.title)
            )
        )
    );
    const independentlyProvenRelationship =
      executionCandidates.some((candidate) => candidate.sourceRelationshipSignal) ||
      nestedUnderRequestedParent;

    if (
      groupCandidates.length !== uniqueIds.length ||
      executionCandidates.length < 2 ||
      dates.size !== 1 ||
      sharedSourceBlocks.length === 0 ||
      !isConclusiveGroupingClaim(grouping.claim) ||
      !independentlyProvenRelationship ||
      isGenericGroupingParent(grouping.parentTitle, executionCandidates) ||
      groupCandidates.some((candidate) => isCitywidePassTask(candidate.title)) ||
      executionCandidates.some((candidate) =>
        groupedCandidateIds.has(candidate.candidateId)
      )
    ) {
      continue;
    }

    const parentCandidate =
      (requestedParent?.evidenceRole !== "grouping_proposal"
        ? requestedParent
        : null) ??
      executionCandidates.find(
        (candidate) => normalizeText(candidate.title) === normalizeText(grouping.parentTitle)
      ) ??
      executionCandidates[0];
    const parent = parentCandidate ? itemFor(parentCandidate.candidateId) : null;
    if (!parent) {
      continue;
    }

    const fixedCandidates = executionCandidates.filter(
      (candidate) => candidate.hasTime || candidate.hasBookingSignal
    );
    const childCandidates = executionCandidates
      .filter((candidate) => candidate.candidateId !== parentCandidate?.candidateId);
    if (fixedCandidates.length > 1) {
      continue;
    }
    const childTitles = childCandidates.map((candidate) => candidate.title);

    if (childTitles.length === 0) {
      continue;
    }

    const decisionId = `group_${createHash("sha256")
      .update(JSON.stringify({
        candidateIds: uniqueIds.slice().sort(),
        claim: grouping.claim,
        parentCandidateId: parentCandidate?.candidateId,
        version: CANONICAL_RESOLVER_VERSION,
      }))
      .digest("hex")
      .slice(0, 24)}`;
    parent._canonicalGroupingDecisionIds = [
      ...(Array.isArray(parent._canonicalGroupingDecisionIds)
        ? parent._canonicalGroupingDecisionIds
        : []),
      decisionId,
    ];
    parent._canonicalRoleDecision = "keep_activity";
    parent.evidenceRole = "atomic_candidate";
    parent.itemType = "activity";
    groupingDecisions.push({
      callRequired: !groupCandidates.some(
        (candidate) =>
          candidate.evidenceRole === "grouping_proposal" &&
          candidate.sectionType === "dated_itinerary" &&
          candidate.sourceLine !== null
      ),
      candidateIds: executionCandidates.map((candidate) => candidate.candidateId),
      claim: grouping.claim,
      containerCandidateId:
        groupCandidates.find(
          (candidate) => candidate.evidenceRole === "grouping_proposal"
        )?.candidateId ?? null,
      decisionId,
      parentCandidateId: parentCandidate?.candidateId ?? uniqueIds[0],
      parentTitle: grouping.parentTitle,
      source: "canonical_resolver",
    });
    executionCandidates.forEach((candidate) =>
      groupedCandidateIds.add(candidate.candidateId)
    );
  }

  return { groupingDecisions, stages: nextStages };
}

export function applyCanonicalEvidenceResolution(
  stages: EvidenceStageInput[],
  resolution: CanonicalEvidenceResolution
) {
  return applyResolution({
    candidates: buildCandidates(stages),
    resolution,
    stages,
  });
}

export async function resolveCanonicalEvidenceStages(stages: EvidenceStageInput[]) {
  const candidates = buildCandidates(stages);
  const windows = buildResolutionWindows(candidates);
  const emptyMetadata: CanonicalEvidenceResolverMetadata = {
    cacheHit: false,
    candidateCount: candidates.length,
    claims: [],
    lookupKey: null,
    resolvedAt: null,
    roleDecisions: [],
    sources: [],
    version: CANONICAL_RESOLVER_VERSION,
    windowCount: windows.length,
  };

  if (windows.length === 0 || !hasAmbiguousCandidateCluster(candidates)) {
    return { groupingDecisions: [], metadata: emptyMetadata, stages, usage: null };
  }

  const windowResults = await mapWithConcurrency(
    windows,
    RESOLVER_WINDOW_CONCURRENCY,
    async (windowCandidates) => {
    const windowKey = resolutionKey(windowCandidates);
    const cached = resolverCache.get(windowKey);

    if (cached) {
      return { ...cached, cacheHit: true, lookupKey: windowKey, usage: null };
    }

    const result = await createOpenAIStructuredResponse({
      input: JSON.stringify({ candidates: windowCandidates }),
      schema: resolverSchema,
      schemaName: "roamwoven_canonical_evidence_resolution",
      system: resolverSystemPrompt,
    });
    const resolution = parseResolution(result.json);
    const resolvedAt = new Date().toISOString();
    resolverCache.set(windowKey, {
      resolution,
      resolvedAt,
      sources: result.sources,
    });
    return {
      cacheHit: false,
      lookupKey: windowKey,
      resolution,
      resolvedAt,
      sources: result.sources,
      usage: result.usage,
    };
  });

  const resolution = reconcileCanonicalEvidenceResolutions(
    windowResults.map((result) => ({
      groupings: result.resolution.groupings,
      roleDecisions: result.resolution.roleDecisions,
    }))
  );
  const sources = Array.from(
    new Map(
      windowResults.flatMap((result) => result.sources).map((source) => [source.url, source])
    ).values()
  );
  const acceptedRoleDecisions = resolution.roleDecisions
    .filter((decision) => decision.confidence === "high")
    .map((decision) => ({
      candidateId: decision.candidateId,
      classification: decision.classification,
      reason: decision.reason,
    }));

  const applied = applyCanonicalEvidenceResolution(stages, resolution);
  const acceptedClaims = applied.groupingDecisions.map((grouping) => ({
    candidateIds: grouping.candidateIds,
    claim: grouping.claim,
    parentTitle: grouping.parentTitle,
  }));

  return {
    groupingDecisions: applied.groupingDecisions,
    metadata: {
      ...emptyMetadata,
      cacheHit: windowResults.every((result) => result.cacheHit),
      claims: acceptedClaims,
      lookupKey: createHash("sha256")
        .update(windowResults.map((result) => result.lookupKey).join("|"))
        .digest("hex"),
      resolvedAt: windowResults.map((result) => result.resolvedAt).sort().at(-1) ?? null,
      roleDecisions: acceptedRoleDecisions,
      sources,
    },
    stages: applied.stages,
    usage: windowResults.map((result) => result.usage).filter(Boolean),
  };
}
