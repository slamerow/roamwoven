import type { TripExtractionMaterial } from "@/lib/extraction/openai-trip-parser";

const DEFAULT_TOTAL_CHAR_BUDGET = 60000;
const DEFAULT_PER_MATERIAL_CHAR_BUDGET = 18000;
const MIN_MEANINGFUL_LINE_LENGTH = 4;
const MAX_REPEATED_LINE_OCCURRENCES = 2;

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
  const perMaterialTrimmed = cleaned.map((material) => ({
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
