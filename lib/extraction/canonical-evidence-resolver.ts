import { createHash } from "node:crypto";
import { createOpenAIStructuredResponse } from "@/lib/ai/openai";
import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import { normalizeText } from "@/lib/extraction/traveler-text";

const CANONICAL_RESOLVER_VERSION = 1;
const MAX_RESOLVER_CANDIDATES = 120;
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
  evidenceRole: string | null;
  hasBookingSignal: boolean;
  hasTime: boolean;
  headingPath: string[];
  itemIndex: number;
  sectionLabel: string | null;
  sectionType: string | null;
  sourceBlock: number | null;
  sourceLine: number | null;
  sourcePrecedingLabel: string | null;
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
  "You are the bounded canonical source-structure and public venue relationship resolver for a travel itinerary.",
  "The input intentionally contains only public venue names and structural metadata. Never search for or infer private booking data, addresses, confirmation codes, traveler names, or access details.",
  "Source hierarchy is authoritative. Classify an item as city_note only when the structural fields show it belongs to a city-reference, ideas, recommendations, or notes block rather than an actual itinerary block. Public venue knowledge must not turn a reference item into an itinerary item.",
  "A repeated venue on different dates stays distinct when both sightings are actual itinerary visits. If one is a weak untimed sighting under a city-reference block and another is a concrete itinerary visit, classify only the weak reference sighting as city_note.",
  "Propose a grouping only when the source positions put the candidates in one contiguous source block and public sources confirm they are components of one official site, complex, route, tour, or included pass. Proximity in the same city is not enough.",
  "Never group candidates on different dates. Never absorb a separately timed or separately booked candidate. Never group a generic clean itinerary merely because several activities share a day.",
  "Use web search only as a tie-breaker for public venue relationships. Return high confidence only when both the source structure and public evidence agree. If inconclusive, return no grouping and keep activities separate.",
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

    const normalizedLine = normalizeText(line);
    const matches = Boolean(
      normalizedTitle &&
        normalizedLine &&
        (normalizedLine.includes(normalizedTitle) ||
          (normalizedTitle.includes(normalizedLine) && normalizedLine.length >= 5))
    );

    if (!matches) {
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

function buildCandidates(stages: EvidenceStageInput[]) {
  return stages.flatMap((stageInput, stageIndex) => {
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

      return [{
        candidateId: `stage-${stageIndex + 1}-item-${itemIndex + 1}`,
        city: stringValue(activity, "city"),
        date: stringValue(activity, "date"),
        evidenceRole: stringValue(activity, "evidenceRole"),
        hasBookingSignal: /\b(?:booking|confirmation|paid|reservation|ticket|timed|voucher)\b/i.test(
          description
        ),
        hasTime: Boolean(
          stringValue(activity, "startTime") || stringValue(activity, "endTime")
        ),
        headingPath,
        itemIndex,
        sectionLabel: stringValue(activity, "sourceSectionLabel"),
        sectionType: stringValue(activity, "sourceSectionType"),
        sourceBlock: position.block,
        sourceLine: position.line,
        sourcePrecedingLabel: position.precedingLabel,
        stageIndex,
        stageLabel: stageInput.label,
        title,
      } satisfies ResolverCandidate];
    });
  }).slice(0, MAX_RESOLVER_CANDIDATES);
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

  return Array.from(groups.values()).some((group) => group.length >= 3) ||
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

  for (const decision of resolution.roleDecisions) {
    if (decision.confidence !== "high" || decision.classification !== "city_note") {
      continue;
    }

    const item = itemFor(decision.candidateId);
    if (!item) continue;
    item.date = null;
    item.evidenceRole = "city_note_candidate";
    item.itemType = "note";
    item.sourceSectionType = "city_reference";
  }

  for (const grouping of resolution.groupings) {
    const uniqueIds = Array.from(new Set(grouping.candidateIds));
    if (grouping.confidence !== "high" || uniqueIds.length < 2) {
      continue;
    }

    const groupCandidates = uniqueIds
      .map((id) => candidateById.get(id))
      .filter((candidate): candidate is ResolverCandidate => Boolean(candidate));
    const dates = new Set(groupCandidates.map((candidate) => candidate.date));
    const blocks = new Set(
      groupCandidates.map((candidate) =>
        `${candidate.stageIndex}:${candidate.sourceBlock ?? "unknown"}`
      )
    );

    if (
      groupCandidates.length !== uniqueIds.length ||
      groupCandidates.some(
        (candidate) => candidate.sourceBlock === null || candidate.sourceLine === null
      ) ||
      dates.size !== 1 ||
      blocks.size !== 1 ||
      (grouping.parentCandidateId !== null &&
        !uniqueIds.includes(grouping.parentCandidateId))
    ) {
      continue;
    }

    const parentCandidate = grouping.parentCandidateId
      ? candidateById.get(grouping.parentCandidateId)
      : groupCandidates[0];
    const parent = parentCandidate ? itemFor(parentCandidate.candidateId) : null;
    if (!parent || parent.startTime || parent.endTime) {
      continue;
    }

    const childTitles = groupCandidates
      .filter((candidate) => candidate.candidateId !== parentCandidate?.candidateId)
      .filter((candidate) => !candidate.hasTime && !candidate.hasBookingSignal)
      .map((candidate) => candidate.title);

    if (childTitles.length === 0) {
      continue;
    }

    const existingDescription = stringValue(parent, "description");
    parent.description = [
      existingDescription,
      `Verified same-site visit within the ${grouping.parentTitle} complex. Includes ${childTitles.join(", ")}.`,
    ]
      .filter(Boolean)
      .join(" ");
    parent.evidenceRole = "grouping_proposal";
    parent._publicLookupClaim = grouping.claim;
  }

  return nextStages;
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
  const emptyMetadata: CanonicalEvidenceResolverMetadata = {
    cacheHit: false,
    candidateCount: candidates.length,
    claims: [],
    lookupKey: null,
    resolvedAt: null,
    roleDecisions: [],
    sources: [],
    version: CANONICAL_RESOLVER_VERSION,
  };

  if (!hasAmbiguousCandidateCluster(candidates)) {
    return { metadata: emptyMetadata, stages, usage: null };
  }

  const lookupKey = resolutionKey(candidates);
  const cached = resolverCache.get(lookupKey);
  let resolution: CanonicalEvidenceResolution;
  let sources: Array<{ title: string | null; url: string }> = [];
  let usage: unknown = null;

  if (cached) {
    resolution = cached.resolution;
    sources = cached.sources;
  } else {
    const result = await createOpenAIStructuredResponse({
      input: JSON.stringify({ candidates }),
      schema: resolverSchema,
      schemaName: "roamwoven_canonical_evidence_resolution",
      system: resolverSystemPrompt,
      webSearch: { maxToolCalls: 3, searchContextSize: "low" },
    });
    resolution = parseResolution(result.json);
    sources = result.sources;
    usage = result.usage;
    resolverCache.set(lookupKey, {
      resolution,
      resolvedAt: new Date().toISOString(),
      sources,
    });
  }

  const acceptedClaims = resolution.groupings
    .filter((grouping) => grouping.confidence === "high")
    .map((grouping) => ({
      candidateIds: grouping.candidateIds,
      claim: grouping.claim,
      parentTitle: grouping.parentTitle,
    }));
  const acceptedRoleDecisions = resolution.roleDecisions
    .filter((decision) => decision.confidence === "high")
    .map((decision) => ({
      candidateId: decision.candidateId,
      classification: decision.classification,
      reason: decision.reason,
    }));

  return {
    metadata: {
      ...emptyMetadata,
      cacheHit: Boolean(cached),
      claims: acceptedClaims,
      lookupKey,
      resolvedAt: cached?.resolvedAt ?? new Date().toISOString(),
      roleDecisions: acceptedRoleDecisions,
      sources,
    },
    stages: applyCanonicalEvidenceResolution(stages, resolution),
    usage,
  };
}
