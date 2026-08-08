import assert from "node:assert/strict";

import { buildRecoverySourceBindingSidecarV1 } from "@/lib/extraction/recovery-source-binding";
import {
  buildSourceDocumentIndexV1,
  hashStableValue,
  sourceSpanIdsForMaterialTextV1,
  stableJsonStringify,
} from "@/lib/extraction/source-document-index";
import type { EvidenceStageInput } from "@/lib/extraction/evidence-clustering";
import type { SourceRecoveryPlan } from "@/lib/extraction/source-recovery";

const material = {
  filename: "sanitized-recovery.txt",
  sourceProvenance: "sanitized_test",
  sourceUploadId: "recovery-source-upload",
  text: [
    "Monday, April 7th",
    "Old observatory if weather is clear",
    "Riverside market",
    "Tuesday, April 8th",
    "Riverside market",
  ].join("\n"),
  type: "note",
};

function sourceStage(
  index: ReturnType<typeof buildSourceDocumentIndexV1>,
  text: string,
  label = "recovery source chunk"
): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceSpanIds: sourceSpanIdsForMaterialTextV1({ index, material, text }),
    sourceText: text,
    sourceUploadId: material.sourceUploadId,
    stage: { activities: [] },
  };
}

function recoveryStage(
  evidence: string | null,
  title: string,
  section: string
): EvidenceStageInput {
  return {
    label: "source recovery",
    source: "model_chunk",
    sourceText: evidence,
    stage: {
      _sourceRecovery: true,
      activities: [
        {
          _resolverCandidateId: "stage-2-item-1",
          evidence,
          sourceSectionLabel: section,
          title,
        },
      ],
    },
  };
}

export default function run() {
  const index = buildSourceDocumentIndexV1([material]);
  const mondayText = [
    "Monday, April 7th",
    "Old observatory if weather is clear",
    "Riverside market",
  ].join("\n");
  const mondayStage = sourceStage(index, mondayText);
  const plan: SourceRecoveryPlan = {
    batchedLineCount: 1,
    droppedLineCount: 0,
    excludedPlanningCostLineCount: 0,
    input: [
      "These source lines were not captured by the first structuring pass.",
      "Source section: recovery source chunk",
      "Day heading: Monday, April 7th",
      "- Old observatory if weather is clear",
    ].join("\n"),
    sections: [
      {
        dayHeading: "Monday, April 7th",
        excerpts: ["Old observatory if weather is clear"],
        label: "recovery source chunk",
      },
    ],
  };
  const recovered = recoveryStage(
    "Old observatory if weather is clear",
    "Old observatory",
    "Monday, April 7th"
  );
  const planBefore = structuredClone(plan);
  const stageBefore = structuredClone(recovered);
  const requestCacheKeyBefore = hashStableValue({
    input: plan.input,
    schema: "unchanged-recovery-schema",
    system: "unchanged-recovery-system",
  });
  const sidecar = buildRecoverySourceBindingSidecarV1({
    index,
    plan,
    recoveryStage: recovered,
    stages: [mondayStage, recovered],
  });

  assert.deepEqual(plan, planBefore);
  assert.deepEqual(recovered, stageBefore);
  assert.equal(sidecar.requestDigest, hashStableValue(plan.input));
  assert.equal(
    hashStableValue({
      input: plan.input,
      schema: "unchanged-recovery-schema",
      system: "unchanged-recovery-system",
    }),
    requestCacheKeyBefore,
    "the sidecar cannot change request bytes or cache identity"
  );
  assert.equal(sidecar.excerptBindings.length, 1);
  assert.equal(sidecar.excerptBindings[0].status, "exact");
  assert.equal(sidecar.excerptBindings[0].sourceSpanIds.length, 1);
  assert.equal(sidecar.candidateBindings.length, 1);
  assert.equal(sidecar.candidateBindings[0].status, "exact");
  assert.equal(
    sidecar.candidateBindings[0].ephemeralResolverCandidateId,
    "stage-2-item-1"
  );

  const titleOnlyRecovery = recoveryStage(
    null,
    "Old observatory",
    "Monday, April 7th"
  );
  const titleOnly = buildRecoverySourceBindingSidecarV1({
    index,
    plan,
    recoveryStage: titleOnlyRecovery,
    stages: [mondayStage, titleOnlyRecovery],
  });
  assert.equal(
    titleOnly.candidateBindings[0].status,
    "unique_section_match"
  );

  const repeatedText = [
    "Monday, April 7th",
    "Riverside market",
    "Riverside market",
  ].join("\n");
  const repeatedMaterial = { ...material, text: repeatedText };
  const repeatedIndex = buildSourceDocumentIndexV1([repeatedMaterial]);
  const repeatedStage: EvidenceStageInput = {
    label: "duplicate recovery chunk",
    source: "model_chunk",
    sourceSpanIds: sourceSpanIdsForMaterialTextV1({
      index: repeatedIndex,
      material: repeatedMaterial,
      text: repeatedText,
    }),
    sourceText: repeatedText,
    sourceUploadId: repeatedMaterial.sourceUploadId,
    stage: { activities: [] },
  };
  const duplicatePlan: SourceRecoveryPlan = {
    ...plan,
    input: "duplicate wording request bytes",
    sections: [
      {
        dayHeading: "Monday, April 7th",
        excerpts: ["Riverside market"],
        label: "duplicate recovery chunk",
      },
    ],
  };
  const duplicateRecovery = recoveryStage(
    "Riverside market",
    "Riverside market",
    "Monday, April 7th"
  );
  const ambiguous = buildRecoverySourceBindingSidecarV1({
    index: repeatedIndex,
    plan: duplicatePlan,
    recoveryStage: duplicateRecovery,
    stages: [repeatedStage, duplicateRecovery],
  });
  assert.equal(ambiguous.excerptBindings[0].status, "ambiguous");
  assert.equal(ambiguous.excerptBindings[0].sourceSpanIds.length, 0);
  assert.equal(
    ambiguous.excerptBindings[0].unresolvedSourceSpanIds.length,
    2
  );
  assert.equal(ambiguous.candidateBindings[0].status, "ambiguous");

  const serializedSidecar = stableJsonStringify(sidecar);
  assert.doesNotMatch(serializedSidecar, /Old observatory|weather is clear/i);
}
