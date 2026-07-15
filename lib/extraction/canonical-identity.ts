import { createHash } from "node:crypto";
import {
  type DraftObject,
  getArray,
  getObject,
  getString,
} from "@/lib/extraction/draft-value";

export const CANONICAL_IDENTITY_VERSION = 1;
export const CANONICAL_ID_FIELD = "_canonicalId";
export const CANONICAL_REVIEW_ID_FIELD = "_canonicalReviewId";

export type CanonicalEntityRecordType =
  | "item"
  | "leg"
  | "stay"
  | "transport";

export type CanonicalIdentityManifest = {
  entities: Array<{
    canonicalId: string;
    collection: "activities" | "places" | "stays" | "transport";
    recordType: CanonicalEntityRecordType;
    semanticHash: string;
    sourceOrder: number;
  }>;
  reviews: Array<{
    canonicalId: string;
    disposition: string;
    semanticHash: string;
    sourceOrder: number;
    subjectCanonicalId: string | null;
    targetField: string | null;
  }>;
  version: number;
};

export class CanonicalIdentityInvariantError extends Error {
  constructor(public violations: string[]) {
    super(`Canonical identity is invalid: ${violations.join("; ")}`);
    this.name = "CanonicalIdentityInvariantError";
  }
}

const ENTITY_COLLECTIONS = [
  { collection: "activities", recordType: "item" },
  { collection: "places", recordType: "leg" },
  { collection: "stays", recordType: "stay" },
  { collection: "transport", recordType: "transport" },
] as const;

function asDraftObject(value: unknown): DraftObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DraftObject)
    : {};
}

function semanticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(semanticValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, semanticValue(child)])
  );
}

function semanticHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(semanticValue(value)))
    .digest("hex")
    .slice(0, 24);
}

export function getCanonicalDraftId(value: unknown) {
  return getString(asDraftObject(value), CANONICAL_ID_FIELD);
}

export function getCanonicalReviewId(value: unknown) {
  return getString(asDraftObject(value), CANONICAL_REVIEW_ID_FIELD);
}

export function createCanonicalIdentityManifest(
  draft: unknown
): CanonicalIdentityManifest {
  const violations: string[] = [];
  const entities: CanonicalIdentityManifest["entities"] = [];
  const canonicalIds = new Set<string>();
  const evidence = getObject(draft, "_evidence");
  const evidencePieceIdValues = getArray(
    evidence,
    "canonicalPieceIds"
  ).filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const evidencePieceIds = new Set(evidencePieceIdValues);
  const evidenceEntityIdValues = getArray(evidence, "canonicalEntityIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value)
  );
  const evidenceEntityIds = new Set(evidenceEntityIdValues);

  if (evidenceEntityIdValues.length !== evidenceEntityIds.size) {
    violations.push("evidence contains duplicate canonical entity identities");
  }
  if (evidencePieceIdValues.length !== evidencePieceIds.size) {
    violations.push("evidence contains duplicate canonical piece identities");
  }

  for (const { collection, recordType } of ENTITY_COLLECTIONS) {
    getArray(draft, collection).forEach((value, index) => {
      const item = asDraftObject(value);
      const canonicalId = getString(item, CANONICAL_ID_FIELD);
      const canonicalPieceId = getString(item, "_canonicalPieceId");
      const label = `${collection}[${index}]`;

      if (!canonicalId) {
        violations.push(`${label} is missing ${CANONICAL_ID_FIELD}`);
        return;
      }
      if (canonicalPieceId !== canonicalId) {
        violations.push(
          `${label} canonical identity does not match its evidence piece`
        );
      }
      if (!evidencePieceIds.has(canonicalId)) {
        violations.push(`${label} canonical identity is absent from evidence`);
      }
      if (canonicalIds.has(canonicalId)) {
        violations.push(`${label} duplicates canonical identity ${canonicalId}`);
        return;
      }

      canonicalIds.add(canonicalId);
      entities.push({
        canonicalId,
        collection,
        recordType,
        semanticHash: semanticHash(item),
        sourceOrder: index,
      });
    });
  }

  for (const canonicalId of canonicalIds) {
    if (!evidenceEntityIds.has(canonicalId)) {
      violations.push(
        `canonical identity ${canonicalId} is absent from the evidence entity manifest`
      );
    }
  }
  for (const canonicalId of evidenceEntityIds) {
    if (!canonicalIds.has(canonicalId)) {
      violations.push(
        `evidence entity identity ${canonicalId} has no canonical output entity`
      );
    }
  }

  const reviews: CanonicalIdentityManifest["reviews"] = [];
  const reviewIds = new Set<string>();
  getArray(draft, "missingDetails").forEach((value, index) => {
    const detail = asDraftObject(value);
    const canonicalId = getString(detail, CANONICAL_REVIEW_ID_FIELD);
    const disposition =
      getString(detail, "_canonicalReviewDisposition") ?? "question";
    const subjectCanonicalId = getString(
      detail,
      "relatedCanonicalPieceId"
    );
    const label = `missingDetails[${index}]`;

    if (!canonicalId) {
      violations.push(`${label} is missing ${CANONICAL_REVIEW_ID_FIELD}`);
      return;
    }
    if (reviewIds.has(canonicalId)) {
      violations.push(
        `${label} duplicates canonical review identity ${canonicalId}`
      );
      return;
    }
    if (
      subjectCanonicalId &&
      disposition !== "dismissed" &&
      !canonicalIds.has(subjectCanonicalId)
    ) {
      violations.push(
        `${label} targets missing canonical identity ${subjectCanonicalId}`
      );
    }

    reviewIds.add(canonicalId);
    reviews.push({
      canonicalId,
      disposition,
      semanticHash: semanticHash(detail),
      sourceOrder: index,
      subjectCanonicalId,
      targetField: getString(detail, "targetField"),
    });
  });

  if (violations.length > 0) {
    throw new CanonicalIdentityInvariantError(violations);
  }

  return {
    entities: entities.sort((left, right) =>
      left.canonicalId.localeCompare(right.canonicalId)
    ),
    reviews: reviews.sort((left, right) =>
      left.canonicalId.localeCompare(right.canonicalId)
    ),
    version: CANONICAL_IDENTITY_VERSION,
  };
}
