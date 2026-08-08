import assert from "node:assert/strict";

import {
  evaluateCanonicalResolverRoleProposals,
  reconcileCanonicalEvidenceResolutions,
} from "@/lib/extraction/canonical-evidence-resolver";

export default function run() {
  const proposals = [
    {
      candidateId: "candidate-a",
      classification: "city_note" as const,
      confidence: "high" as const,
      reason: "The source places this in an ideas block.",
      windowCandidateIds: ["candidate-b", "candidate-a"],
    },
    {
      candidateId: "candidate-a",
      classification: "city_note" as const,
      confidence: "high" as const,
      reason: "The source places this in an ideas block.",
      windowCandidateIds: ["candidate-a", "candidate-b"],
    },
    {
      candidateId: "candidate-b",
      classification: "city_note" as const,
      confidence: "high" as const,
      reason: "One window reads reference intent.",
      windowCandidateIds: ["candidate-a", "candidate-b"],
    },
    {
      candidateId: "candidate-b",
      classification: "keep_activity" as const,
      confidence: "high" as const,
      reason: "Another window reads plan intent.",
      windowCandidateIds: ["candidate-b"],
    },
    {
      candidateId: "candidate-c",
      classification: "keep_activity" as const,
      confidence: "medium" as const,
      reason: "The evidence is not conclusive.",
      windowCandidateIds: ["candidate-c"],
    },
    {
      candidateId: "unknown-candidate",
      classification: "city_note" as const,
      confidence: "high" as const,
      reason: "The model returned an id outside the supplied window.",
      windowCandidateIds: ["candidate-a"],
    },
  ];

  const evaluations = evaluateCanonicalResolverRoleProposals({
    knownCandidateIds: ["candidate-a", "candidate-b", "candidate-c"],
    proposals,
  });
  assert.equal(evaluations.length, proposals.length);
  assert.equal(
    evaluations.filter((evaluation) => evaluation.reconciliationOutcome === "applied")
      .length,
    1
  );
  assert.equal(
    evaluations.filter(
      (evaluation) => evaluation.reconciliationOutcome === "supporting"
    ).length,
    1
  );
  assert.equal(
    evaluations.filter((evaluation) => evaluation.reconciliationOutcome === "rejected")
      .length,
    4
  );

  const duplicate = evaluations.find(
    (evaluation) => evaluation.reconciliationOutcome === "supporting"
  );
  assert.deepEqual(duplicate?.rejectionCodes, ["duplicate_proposal"]);
  assert.equal(duplicate?.candidateId, "candidate-a");

  const conflicts = evaluations.filter(
    (evaluation) => evaluation.candidateId === "candidate-b"
  );
  assert.equal(conflicts.length, 2);
  assert.ok(
    conflicts.every(
      (evaluation) =>
        evaluation.reconciliationOutcome === "rejected" &&
        evaluation.rejectionCodes.includes("conflicting_classification")
    )
  );
  assert.deepEqual(
    evaluations.find((evaluation) => evaluation.candidateId === "candidate-c")
      ?.rejectionCodes,
    ["low_confidence"]
  );
  assert.deepEqual(
    evaluations.find(
      (evaluation) => evaluation.candidateId === "unknown-candidate"
    )?.rejectionCodes,
    ["unknown_candidate"]
  );

  assert.deepEqual(
    evaluateCanonicalResolverRoleProposals({
      knownCandidateIds: ["candidate-c", "candidate-a", "candidate-b"],
      proposals: [...proposals].reverse(),
    }),
    evaluations,
    "resolver response order cannot change durable evaluation semantics"
  );

  const reconciled = reconcileCanonicalEvidenceResolutions([
    { groupings: [], roleDecisions: proposals.slice(0, 2) },
    { groupings: [], roleDecisions: proposals.slice(2, 4) },
  ]);
  assert.deepEqual(
    reconciled.roleDecisions,
    [proposals[0]],
    "raw evaluation capture cannot change the existing reconciled role decisions"
  );
}
