import { createHash } from "node:crypto";

import {
  distinctiveLineTokens,
  isBoilerplateSourceLine,
  splitLineClauses,
} from "@/lib/extraction/source-coverage";
import { fingerprintExtractionMaterials } from "@/lib/extraction/extraction-pinning";
import { isDayHeadingLine } from "@/lib/extraction/parser-artifact-normalization";
import { normalizeText } from "@/lib/extraction/traveler-text";

export const SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION = 1 as const;

export type SourceDocumentMaterialInput = {
  filename: string;
  sourceProvenance?: string | null;
  sourceUploadId?: string | null;
  text: string;
  type?: string | null;
};

export type SourceSpanRefV1 = {
  spanId: string;
  sourceIdentityHash: string;
  materialFingerprint: string;
  sourceUploadId: string | null;
  lineOccurrence: number;
  clauseOrdinal: number;
  excerptDigest: string;
};

export type SourceDocumentSpanV1 = SourceSpanRefV1 & {
  /** In-memory alignment value. Never copy this field into the persisted ledger. */
  isDayHeading: boolean;
  normalizedClause: string;
  normalizedDocumentIdentity: string;
  normalizedSectionLabel: string | null;
};

export type SourceDocumentIndexV1 = {
  schemaVersion: typeof SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION;
  sourceFingerprint: string;
  spans: SourceDocumentSpanV1[];
  lookups: {
    spanIdsByNormalizedClause: Map<string, string[]>;
    spanIdsBySectionAndNormalizedClause: Map<string, string[]>;
    spanIdsBySourceAndExcerptDigest: Map<string, string[]>;
    spanIdsBySourceUploadId: Map<string, string[]>;
    spanIdsByToken: Map<string, string[]>;
    spanById: Map<string, SourceDocumentSpanV1>;
  };
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashStableValue(value: unknown) {
  return sha256(stableJsonStringify(value));
}

function stripLineDecorations(line: string) {
  return line
    .trim()
    .replace(/^[-*•●▪◦>·]+\s*/, "")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .trim();
}

function normalizeDocumentIdentity(material: SourceDocumentMaterialInput) {
  return [
    normalizeText(material.filename),
    normalizeText(material.type ?? "unknown"),
    normalizeText(material.sourceProvenance ?? "unknown"),
  ].join("|");
}

function meaningfulClauses(line: string) {
  const clean = stripLineDecorations(line);
  if (!clean || isBoilerplateSourceLine(clean)) return [];

  // A dated heading can itself carry the source-authored route or visit name.
  // Preserve it as one structural clause instead of splitting its members.
  const clauses =
    isDayHeadingLine(clean) || /\s(?:&|or)\s/i.test(clean)
      ? [clean]
      : splitLineClauses(clean);

  return clauses.filter((clause) => {
    if (isBoilerplateSourceLine(clause)) return false;
    if (distinctiveLineTokens(clause).length > 0) return true;
    // Keep short named/source-control clauses such as "Eat" or "Wi-Fi".
    // Pure punctuation, dates, and amounts are not independent facts.
    return /[\p{L}]{3,}/u.test(clause);
  });
}

function lookupKey(sourceIdentityHash: string, excerptDigest: string) {
  return `${sourceIdentityHash}:${excerptDigest}`;
}

export function buildSourceDocumentIndexV1(
  materials: SourceDocumentMaterialInput[]
): SourceDocumentIndexV1 {
  const materialRows = materials
    .filter((material) => material.text.trim())
    .map((material) => {
      const materialFingerprint = fingerprintExtractionMaterials([
        { filename: material.filename, text: material.text },
      ])[0];
      const normalizedDocumentIdentity = normalizeDocumentIdentity(material);
      const sourceIdentityHash = sha256(
        stableJsonStringify({
          materialFingerprint,
          normalizedDocumentIdentity,
          version: SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION,
        })
      );
      return {
        material,
        materialFingerprint,
        normalizedDocumentIdentity,
        sourceIdentityHash,
      };
    });

  // The upstream material pipeline already deduplicates byte-identical input.
  // Keep that property here too so repeat uploads cannot mint parallel facts.
  const uniqueMaterials = Array.from(
    new Map(
      materialRows.map((row) => [
        `${row.normalizedDocumentIdentity}:${row.materialFingerprint}`,
        row,
      ])
    ).values()
  );
  const spans: SourceDocumentSpanV1[] = [];

  for (const row of uniqueMaterials) {
    let normalizedSectionLabel: string | null = null;
    const lines = row.material.text.replace(/\r\n?/g, "\n").split("\n");

    lines.forEach((rawLine, lineIndex) => {
      const cleanLine = stripLineDecorations(rawLine);
      if (cleanLine && isDayHeadingLine(cleanLine)) {
        normalizedSectionLabel = normalizeText(cleanLine);
      }

      meaningfulClauses(rawLine).forEach((clause, clauseOrdinal) => {
        const normalizedClause = normalizeText(clause);
        const excerptDigest = sha256(normalizedClause);
        const lineOccurrence = lineIndex + 1;
        const spanId = `span_${sha256(
          stableJsonStringify({
            clauseOrdinal,
            excerptDigest,
            lineOccurrence,
            materialFingerprint: row.materialFingerprint,
            normalizedDocumentIdentity: row.normalizedDocumentIdentity,
            version: SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION,
          })
        ).slice(0, 32)}`;

        spans.push({
          clauseOrdinal,
          excerptDigest,
          isDayHeading: isDayHeadingLine(cleanLine),
          lineOccurrence,
          materialFingerprint: row.materialFingerprint,
          normalizedClause,
          normalizedDocumentIdentity: row.normalizedDocumentIdentity,
          normalizedSectionLabel,
          sourceIdentityHash: row.sourceIdentityHash,
          sourceUploadId: row.material.sourceUploadId ?? null,
          spanId,
        });
      });
    });
  }

  spans.sort(
    (left, right) =>
      left.sourceIdentityHash.localeCompare(right.sourceIdentityHash) ||
      left.lineOccurrence - right.lineOccurrence ||
      left.clauseOrdinal - right.clauseOrdinal ||
      left.spanId.localeCompare(right.spanId)
  );

  const spanById = new Map(spans.map((span) => [span.spanId, span]));
  const spanIdsByNormalizedClause = new Map<string, string[]>();
  const spanIdsBySectionAndNormalizedClause = new Map<string, string[]>();
  const spanIdsBySourceAndExcerptDigest = new Map<string, string[]>();
  const spanIdsBySourceUploadId = new Map<string, string[]>();
  const spanIdsByToken = new Map<string, string[]>();
  for (const span of spans) {
    const key = lookupKey(span.sourceIdentityHash, span.excerptDigest);
    spanIdsBySourceAndExcerptDigest.set(key, [
      ...(spanIdsBySourceAndExcerptDigest.get(key) ?? []),
      span.spanId,
    ]);
    spanIdsByNormalizedClause.set(span.normalizedClause, [
      ...(spanIdsByNormalizedClause.get(span.normalizedClause) ?? []),
      span.spanId,
    ]);
    const sectionKey = `${span.normalizedSectionLabel ?? ""}:${span.normalizedClause}`;
    spanIdsBySectionAndNormalizedClause.set(sectionKey, [
      ...(spanIdsBySectionAndNormalizedClause.get(sectionKey) ?? []),
      span.spanId,
    ]);
    if (span.sourceUploadId) {
      spanIdsBySourceUploadId.set(span.sourceUploadId, [
        ...(spanIdsBySourceUploadId.get(span.sourceUploadId) ?? []),
        span.spanId,
      ]);
    }
    for (const token of new Set(distinctiveLineTokens(span.normalizedClause))) {
      spanIdsByToken.set(token, [
        ...(spanIdsByToken.get(token) ?? []),
        span.spanId,
      ]);
    }
  }

  return {
    lookups: {
      spanById,
      spanIdsByNormalizedClause,
      spanIdsBySectionAndNormalizedClause,
      spanIdsBySourceAndExcerptDigest,
      spanIdsBySourceUploadId,
      spanIdsByToken,
    },
    schemaVersion: SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION,
    sourceFingerprint: hashStableValue({
      materials: uniqueMaterials
        .map((row) => ({
          materialFingerprint: row.materialFingerprint,
          normalizedDocumentIdentity: row.normalizedDocumentIdentity,
        }))
        .sort((left, right) =>
          stableJsonStringify(left).localeCompare(stableJsonStringify(right))
        ),
      version: SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION,
    }),
    spans,
  };
}

export function sourceSpanRefsV1(
  index: SourceDocumentIndexV1
): SourceSpanRefV1[] {
  return index.spans.map(
    ({
      isDayHeading: _isDayHeading,
      normalizedClause: _normalizedClause,
      normalizedDocumentIdentity: _normalizedDocumentIdentity,
      normalizedSectionLabel: _normalizedSectionLabel,
      ...ref
    }) => ref
  );
}

export function sourceSpanIdsForMaterialTextV1({
  index,
  material,
  text,
}: {
  index: SourceDocumentIndexV1;
  material: SourceDocumentMaterialInput;
  text: string;
}) {
  const materialFingerprint = fingerprintExtractionMaterials([
    { filename: material.filename, text: material.text },
  ])[0];
  const sourceIdentityHash = sha256(
    stableJsonStringify({
      materialFingerprint,
      normalizedDocumentIdentity: normalizeDocumentIdentity(material),
      version: SOURCE_DOCUMENT_INDEX_SCHEMA_VERSION,
    })
  );
  const spanIds = new Set<string>();

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    for (const clause of meaningfulClauses(line)) {
      const excerptDigest = sha256(normalizeText(clause));
      for (const spanId of
        index.lookups.spanIdsBySourceAndExcerptDigest.get(
          lookupKey(sourceIdentityHash, excerptDigest)
        ) ?? []) {
        spanIds.add(spanId);
      }
    }
  }

  return [...spanIds].sort();
}
