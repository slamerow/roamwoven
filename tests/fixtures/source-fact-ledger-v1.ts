import type { CanonicalEvidenceResolverMetadata } from "@/lib/extraction/canonical-evidence-resolver";
import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import {
  buildSourceDocumentIndexV1,
  type SourceDocumentIndexV1,
} from "@/lib/extraction/source-document-index";

export const sourceFactFixtureMaterial = {
  filename: "sanitized-central-europe.txt",
  sourceProvenance: "manual_note",
  sourceUploadId: "upload-sanitized-central-europe",
  text: [
    "Wednesday, January 16th",
    "Lesser Town & Prague Castle",
    "Prague Castle",
    "Changing of the Guard - 12:00 PM",
    "St. Vitus Cathedral",
    "Lesser Town route: Kafka statue, Vinárna Čertovka, John Lennon Wall, Nový Svět",
    "Saturday, January 19th",
    "Explore Vienna: Schönbrunn Palace area",
    "Schönbrunn Palace",
    "Gloriette",
    "Orangeriegarten",
    "Palm House",
    "Apple Strudel Show",
    "Panorama Train",
    "maybe Museum of Communism",
    "Old tram colors",
    "Budget: $900",
    "Write postcards before leaving",
  ].join("\n"),
  type: "note",
} as const;

function activity(
  title: string,
  evidence: string,
  section: string,
  extras: Record<string, unknown> = {}
) {
  return {
    category: "sightseeing",
    date: section.includes("16") ? "2019-01-16" : "2019-01-19",
    description: null,
    evidence,
    evidenceRole: "atomic_candidate",
    itemType: "activity",
    sourceSectionLabel: section,
    title,
    ...extras,
  };
}

export function sourceFactFixture(
  index: SourceDocumentIndexV1 = buildSourceDocumentIndexV1([
    sourceFactFixtureMaterial,
  ])
) {
  const prague = "Wednesday, January 16th";
  const vienna = "Saturday, January 19th";
  const activities = [
    activity(
      "Lesser Town & Prague Castle",
      "Lesser Town & Prague Castle",
      prague,
      {
        _resolverCandidateId: "candidate-castle-structure",
        description:
          "Prague Castle, Changing of the Guard, and St. Vitus Cathedral",
        evidenceRole: "grouping_proposal",
      }
    ),
    activity("Prague Castle", "Prague Castle", prague, {
      _resolverCandidateId: "candidate-castle",
    }),
    activity(
      "Changing of the Guard",
      "Changing of the Guard - 12:00 PM",
      prague,
      {
        _resolverCandidateId: "candidate-guard",
        startTime: "12:00",
      }
    ),
    activity("St. Vitus Cathedral", "St. Vitus Cathedral", prague, {
      _resolverCandidateId: "candidate-st-vitus",
    }),
    activity(
      "Lesser Town route",
      "Lesser Town route: Kafka statue",
      prague,
      {
        description:
          "Kafka statue, Vinárna Čertovka, John Lennon Wall, Nový Svět",
        evidenceRole: "grouping_proposal",
      }
    ),
    activity("Kafka statue", "Kafka statue", prague),
    activity("Vinárna Čertovka", "Vinárna Čertovka", prague, {
      category: "food_and_drink",
    }),
    activity("John Lennon Wall", "John Lennon Wall", prague),
    activity("Nový Svět", "Nový Svět", prague),
    activity(
      "Explore Vienna: Schönbrunn Palace area",
      "Explore Vienna: Schönbrunn Palace area",
      vienna,
      {
        description:
          "Schönbrunn Palace, Gloriette, Orangeriegarten, Palm House, Apple Strudel Show, Panorama Train",
        evidenceRole: "grouping_proposal",
      }
    ),
    activity("Schönbrunn Palace", "Schönbrunn Palace", vienna),
    activity("Gloriette", "Gloriette", vienna),
    activity(
      "Museum of Communism",
      "maybe Museum of Communism",
      vienna
    ),
    activity("Old tram colors", "Old tram colors", vienna, {
      evidenceRole: "context",
    }),
  ];
  const allSpanIds = index.spans.map((span) => span.spanId);
  const stage: EvidenceStageInput = {
    label: "sanitized source",
    source: "model_chunk",
    sourceFilename: sourceFactFixtureMaterial.filename,
    sourceProvenance: sourceFactFixtureMaterial.sourceProvenance,
    sourceSpanIds: allSpanIds,
    sourceText: sourceFactFixtureMaterial.text,
    sourceUploadId: sourceFactFixtureMaterial.sourceUploadId,
    stage: { activities },
  };
  const claimEvaluations: CanonicalEvidenceResolverMetadata["claimEvaluations"] = [
    {
      candidateIds: [
        "candidate-castle-structure",
        "candidate-castle",
        "candidate-st-vitus",
      ],
      claimDigest: "resolver-claim-digest-sanitized",
      confidence: "high",
      parentCandidateId: null,
      rejectionCodes: ["resolver_policy_rejected"],
      status: "rejected",
    },
  ];
  const resolverMetadata: CanonicalEvidenceResolverMetadata = {
    cacheHit: false,
    candidateCount: activities.length,
    claimEvaluations,
    claims: [],
    lookupKey: null,
    resolvedAt: null,
    roleDecisions: [],
    sources: [],
    version: 7,
    windowCount: 1,
  };

  return { activities, index, resolverMetadata, stage };
}
