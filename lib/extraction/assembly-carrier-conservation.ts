import type { AssemblyDecisionCarrierSetV1 } from "@/lib/extraction/assembly-decision-carrier-ledger";
import type { EvidenceObservation } from "@/lib/extraction/evidence-clustering";
import type { SourceCoverageSummary } from "@/lib/extraction/source-coverage";
import { hashStableValue } from "@/lib/extraction/source-document-index";
import type { SourceFactSetV1 } from "@/lib/extraction/source-fact-ledger";
import type { StructuredTripRecords } from "@/lib/generated-trip-model";

function countsBy(values: readonly string[]) {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  );
}

/**
 * Compares conservation inside four deliberately different universes.
 *
 * A V3 meaningful line is not a V1 source fact, an assembly observation, or a
 * final traveler record. This report therefore exposes separate denominators
 * and hashes and never claims their counts should be equal.
 */
export function createAssemblyCarrierConservationReportV1({
  decisionSet,
  legacyCoverage,
  observations,
  records,
  sourceFactSet,
}: {
  decisionSet: AssemblyDecisionCarrierSetV1;
  legacyCoverage: SourceCoverageSummary;
  observations: EvidenceObservation[];
  records: StructuredTripRecords;
  sourceFactSet: SourceFactSetV1;
}) {
  const dispositionedObservationCount = observations.filter(
    (observation) => observation.disposition
  ).length;
  if (decisionSet.factDispositions.length !== sourceFactSet.facts.length) {
    throw new Error("Source-fact conservation failed inside the V1 fact universe.");
  }
  if (dispositionedObservationCount !== observations.length) {
    throw new Error("RW-ORD-001 observation conservation is incomplete.");
  }
  if (
    legacyCoverage.uncoveredLineCount > legacyCoverage.meaningfulLineCount
  ) {
    throw new Error("V3 line coverage has an impossible denominator.");
  }

  const sourceFacts = {
    countsByTerminal: countsBy(
      decisionSet.factDispositions.map(
        (disposition) => `${disposition.factKind}:${disposition.outcome}`
      )
    ),
    hash: hashStableValue(decisionSet.factDispositions),
    total: sourceFactSet.facts.length,
    unit: "source_fact" as const,
  };
  const assemblyObservations = {
    countsByTerminal: countsBy(
      observations.map(
        (observation) => observation.disposition?.outcome ?? "missing"
      )
    ),
    dispositioned: dispositionedObservationCount,
    hash: hashStableValue(
      observations.map((observation) => ({
        id: observation.id,
        outcome: observation.disposition?.outcome ?? "missing",
      }))
    ),
    total: observations.length,
    unit: "evidence_observation" as const,
  };
  const finalRecords = {
    countsByClass: {
      activity: records.items.filter((item) => item.itemType !== "note").length,
      city_note: records.items.filter((item) => item.itemType === "note").length,
      protected_detail: records.privateDetails.length,
      review_item: records.reviewQuestions.length,
      stay: records.stays.length,
      transport: records.transport.length,
    },
    hash: hashStableValue({
      itemIds: records.items.map((item) => item.canonicalId).sort(),
      privateDetailIds: records.privateDetails.map((detail) => detail.id).sort(),
      reviewIds: records.reviewQuestions.map((review) => review.canonicalId).sort(),
      stayIds: records.stays.map((stay) => stay.canonicalId).sort(),
      transportIds: records.transport
        .map((transport) => transport.canonicalId)
        .sort(),
    }),
    total:
      records.items.length +
      records.privateDetails.length +
      records.reviewQuestions.length +
      records.stays.length +
      records.transport.length,
    unit: "structured_record" as const,
  };
  const legacyLines = {
    covered: legacyCoverage.meaningfulLineCount - legacyCoverage.uncoveredLineCount,
    crossStageCovered: legacyCoverage.crossStageCoveredLineCount,
    hash: hashStableValue({
      crossStageCoveredLineCount: legacyCoverage.crossStageCoveredLineCount,
      meaningfulLineCount: legacyCoverage.meaningfulLineCount,
      uncoveredLineCount: legacyCoverage.uncoveredLineCount,
      version: legacyCoverage.version,
    }),
    total: legacyCoverage.meaningfulLineCount,
    uncovered: legacyCoverage.uncoveredLineCount,
    unit: "meaningful_source_line" as const,
  };

  return {
    comparisonPolicy: "independent_conservation_only" as const,
    universes: {
      assemblyObservations,
      finalRecords,
      legacyLines,
      sourceFacts,
    },
    version: 1 as const,
  };
}
