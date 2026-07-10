import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";
import {
  extractSourceTransportAnchorsFromMaterials,
  type SourceTransportAnchor,
} from "@/lib/extraction/source-transport-anchors";

const DEFAULT_TOTAL_CHAR_BUDGET = 60000;
const DEFAULT_PER_MATERIAL_CHAR_BUDGET = 18000;
const MIN_MEANINGFUL_LINE_LENGTH = 4;
const MAX_REPEATED_LINE_OCCURRENCES = 2;
const MAX_PRESERVED_TRANSPORT_ANCHORS_PER_MATERIAL = 20;
const MAX_PRESERVED_TRANSPORT_EVIDENCE_CHARS = 5000;

export type MaterialBudgetSummary = {
  estimatedInputTokens: number;
  materialCount: number;
  perMaterialCharBudget: number;
  rawCharCount: number;
  submittedCharCount: number;
  totalCharBudget: number;
  truncatedMaterialCount: number;
};

export type OptimizedTripExtractionMaterials = {
  materials: TripExtractionMaterial[];
  summary: MaterialBudgetSummary;
};

function normalizeLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getLineKey(value: string) {
  return normalizeLine(value).toLowerCase();
}

function removeRepeatedBoilerplate(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length >= MIN_MEANINGFUL_LINE_LENGTH);
  const counts = new Map<string, number>();
  const kept: string[] = [];

  for (const line of lines) {
    const key = getLineKey(line);
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);

    if (count < MAX_REPEATED_LINE_OCCURRENCES) {
      kept.push(line);
    }
  }

  return kept.join("\n").trim();
}

function trimToBudget(text: string, budget: number) {
  if (text.length <= budget) {
    return text;
  }

  if (budget < 1000) {
    return text.slice(0, budget).trim();
  }

  const headLength = Math.floor(budget * 0.82);
  const tailLength = budget - headLength - 120;
  const head = text.slice(0, headLength).trim();
  const tail = text.slice(Math.max(0, text.length - tailLength)).trim();

  return [
    head,
    "[Roamwoven trimmed repeated or lower-priority material text here to keep extraction cost bounded.]",
    tail,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function estimateInputTokens(charCount: number) {
  return Math.ceil(charCount / 4);
}

function materialMatchesAnchor(
  material: TripExtractionMaterial,
  anchor: SourceTransportAnchor
) {
  if (anchor.sourceUploadId && material.sourceUploadId) {
    return anchor.sourceUploadId === material.sourceUploadId;
  }

  return anchor.sourceFilename === material.filename;
}

function createPreservedTransportEvidenceBlock({
  anchors,
  material,
}: {
  anchors: SourceTransportAnchor[];
  material: TripExtractionMaterial;
}) {
  const matchingEvidence = anchors
    .filter((anchor) => materialMatchesAnchor(material, anchor))
    .map((anchor) => anchor.evidence.trim())
    .filter(Boolean);
  const uniqueEvidence = Array.from(new Set(matchingEvidence)).slice(
    0,
    MAX_PRESERVED_TRANSPORT_ANCHORS_PER_MATERIAL
  );
  const kept: string[] = [];
  let charCount = 0;

  for (const evidence of uniqueEvidence) {
    const nextCharCount = charCount + evidence.length;

    if (
      kept.length > 0 &&
      nextCharCount > MAX_PRESERVED_TRANSPORT_EVIDENCE_CHARS
    ) {
      break;
    }

    kept.push(evidence);
    charCount = nextCharCount;
  }

  if (kept.length === 0) {
    return null;
  }

  return [
    "Roamwoven extraction-critical source travel evidence preserved from this material:",
    ...kept.map((evidence, index) => `Travel evidence ${index + 1}:\n${evidence}`),
  ].join("\n\n");
}

function prependPreservedTransportEvidence({
  anchors,
  material,
}: {
  anchors: SourceTransportAnchor[];
  material: TripExtractionMaterial;
}) {
  const preservedBlock = createPreservedTransportEvidenceBlock({
    anchors,
    material,
  });

  if (!preservedBlock) {
    return material;
  }

  return {
    ...material,
    text: [preservedBlock, "Original material text:", material.text].join("\n\n"),
  };
}

export function optimizeTripExtractionMaterials({
  materials,
  perMaterialCharBudget = DEFAULT_PER_MATERIAL_CHAR_BUDGET,
  totalCharBudget = DEFAULT_TOTAL_CHAR_BUDGET,
}: {
  materials: TripExtractionMaterial[];
  perMaterialCharBudget?: number;
  totalCharBudget?: number;
}): OptimizedTripExtractionMaterials {
  const rawCharCount = materials.reduce(
    (sum, material) => sum + material.text.length,
    0
  );
  const cleaned = materials
    .map((material) => ({
      ...material,
      text: removeRepeatedBoilerplate(material.text),
    }))
    .filter((material) => material.text.trim());
  const estimatedAfterPerMaterialTrim = cleaned.reduce(
    (sum, material) => sum + Math.min(material.text.length, perMaterialCharBudget),
    0
  );
  const willTrim =
    cleaned.some((material) => material.text.length > perMaterialCharBudget) ||
    estimatedAfterPerMaterialTrim > totalCharBudget;
  const sourceTransportAnchors = willTrim
    ? extractSourceTransportAnchorsFromMaterials(cleaned)
    : [];
  const preservationReady = willTrim
    ? cleaned.map((material) =>
        prependPreservedTransportEvidence({
          anchors: sourceTransportAnchors,
          material,
        })
      )
    : cleaned;
  const perMaterialTrimmed = preservationReady.map((material) => ({
    ...material,
    text: trimToBudget(material.text, perMaterialCharBudget),
  }));
  const totalBeforeFinalTrim = perMaterialTrimmed.reduce(
    (sum, material) => sum + material.text.length,
    0
  );
  const scale =
    totalBeforeFinalTrim > totalCharBudget
      ? totalCharBudget / totalBeforeFinalTrim
      : 1;
  const optimized = perMaterialTrimmed
    .map((material) => ({
      ...material,
      text:
        scale < 1
          ? trimToBudget(
              material.text,
              Math.max(500, Math.floor(material.text.length * scale))
            )
          : material.text,
    }))
    .filter((material) => material.text.trim());
  const submittedCharCount = optimized.reduce(
    (sum, material) => sum + material.text.length,
    0
  );
  const truncatedMaterialCount = optimized.filter((material) => {
    const original = materials.find(
      (candidate) =>
        candidate.filename === material.filename && candidate.type === material.type
    );

    return Boolean(original && material.text.length < original.text.length);
  }).length;

  return {
    materials: optimized,
    summary: {
      estimatedInputTokens: estimateInputTokens(submittedCharCount),
      materialCount: optimized.length,
      perMaterialCharBudget,
      rawCharCount,
      submittedCharCount,
      totalCharBudget,
      truncatedMaterialCount,
    },
  };
}
