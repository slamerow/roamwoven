import assert from "node:assert/strict";
import {
  clusterExtractedEvidence,
  type EvidenceStageInput,
} from "@/lib/extraction/evidence-clustering";
import { assembleCanonicalTripDraft } from "@/lib/extraction/canonical-trip-assembly";

// Live-run 7.23.0 (trip 892b2e3e, Arc E R1 attempt): assembly died with
// "missingDetails[8] targets missing canonical identity piece_a7a0bcd4…" —
// a repeat-fold merge refreshed the surviving piece's canonical id AFTER a
// question had bound to it, and the rebuild path left the stale subject in
// place, so the bounded retry failed and a USABLE draft terminated in a
// technical recovery state (forbidden: AGENTS.md dark-factory rule,
// RW-QA-001, RW-OPS-001). These tests pin the whole class:
//   - a subject whose piece id was refreshed FORWARDS to the same entity
//     (prior-id trail — identity forwarding, never title similarity);
//   - a subject that truly no longer exists dismisses its review item at
//     the rebuild boundary, so finalization's missing-identity invariant
//     is unreachable by construction and the draft survives.

function stage(label: string, activities: unknown[]): EvidenceStageInput {
  return {
    label,
    source: "model_chunk",
    sourceFilename: "czech-out.pdf",
    stage: {
      activities,
      missingDetails: [],
      places: [
        {
          arriveDate: "2019-01-14",
          city: "Prague",
          country: "Czech Republic",
          leaveDate: "2019-01-18",
        },
      ],
      sensitiveDetails: [],
      stays: [],
      transport: [],
    },
  };
}

function baseCluster() {
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      stage("Wednesday, January 16th", [
        {
          address: null,
          category: "art_culture",
          city: "Prague",
          date: "2019-01-16",
          description: "Timed visit, decide the ticket at the gate.",
          endTime: null,
          itemType: "activity",
          sourceSectionLabel: "Wednesday, January 16th",
          startTime: "10:00",
          title: "Prague Castle",
        },
      ]),
    ],
    tripOverview: { dateRange: "January 12-25, 2019" },
  });
}

type Draft = Record<string, unknown> & {
  missingDetails: Array<Record<string, unknown>>;
};

function syntheticQuestion(relatedCanonicalPieceId: string) {
  return {
    _canonicalReviewDisposition: "question",
    _canonicalReviewId: "review_deadbeef00112233",
    answerType: "text",
    confidence: "low",
    evidence: "Need to decide which ticket to get",
    guessedValue: null,
    prompt: "Which ticket should be selected for Prague Castle?",
    reason: "The source says the ticket type still needs to be decided.",
    relatedCanonicalPieceId,
    subjectType: "item",
    targetField: "ticketType",
  };
}

export default async function run() {
  const { test } = await import("node:test");

  await test("run 7.23.0 class: a review item whose subject id no longer exists is dismissed by bounded repair — the draft survives", () => {
    const evidence = baseCluster();
    const draft = evidence.draft as Draft;
    // The 7.23.0 shape: a question bound to a canonical id that no piece
    // carries anymore (the merge refreshed the winner's id and the prior
    // trail was lost in pre-fix code).
    draft.missingDetails = [
      ...draft.missingDetails,
      syntheticQuestion("piece_a7a0bcd4fdf628f8a466ecd1"),
    ];

    // Pre-fix behavior: CanonicalAssemblyRecoveryError after the bounded
    // retry. Post-fix: the rebuild's review canonicalization dismisses the
    // dead-target item and finalization succeeds.
    const result = assembleCanonicalTripDraft({
      draft,
      evidencePieces: evidence.pieces,
      fallbackTripName: "7.23.0 repro",
      tripId: "892b2e3e-177e-429b-89ee-b8c8259f535f",
    });

    assert.equal(result.recovery.attempted, true, "recovery path engaged");
    const resultDraft = result.draft as Draft;
    const dead = resultDraft.missingDetails.find(
      (detail) =>
        detail._canonicalDeadSubjectId === "piece_a7a0bcd4fdf628f8a466ecd1"
    );
    assert.ok(dead, "the review item is retained, auditable in place");
    assert.equal(
      dead?._canonicalReviewDisposition,
      "dismissed",
      "a review item cannot outlive its subject — and cannot kill the draft"
    );
    assert.equal(
      dead?.relatedCanonicalPieceId,
      null,
      "the dead subject is unbound so draft and projection agree (trip-level dismissed item)"
    );
  });

  await test("containment: a raw non-canonical exception in the assembly corridor is repaired by rebuild, not a dead run", () => {
    const evidence = baseCluster();
    const draft = evidence.draft as Draft;
    // A malformed draft record whose property access THROWS — the
    // unknown-bug class (TypeError et al.) that used to bypass the repair
    // corridor entirely and die as an untyped extraction failure. The
    // rebuild reads only canonical pieces, so it is immune to the poison.
    const activities = (draft as Record<string, unknown>).activities as unknown[];
    const poisoned: Record<string, unknown> = { itemType: "activity" };
    // The identity field itself throws, so the exception fires INSIDE the
    // artifact inspection — the exact place pre-containment code died with
    // recoveryFailure(stage: "repair") without attempting any rebuild.
    Object.defineProperty(poisoned, "_canonicalId", {
      enumerable: true,
      get() {
        throw new TypeError("boom: malformed draft record");
      },
    });
    (draft as Record<string, unknown>).activities = [...activities, poisoned];

    const result = assembleCanonicalTripDraft({
      draft,
      evidencePieces: evidence.pieces,
      fallbackTripName: "containment repro",
      tripId: "892b2e3e-177e-429b-89ee-b8c8259f535f",
    });

    assert.equal(result.recovery.attempted, true, "repair engaged");
    assert.ok(
      result.recovery.actions.includes("rebuilt_canonical_outputs_from_evidence"),
      "the draft was rebuilt from canonical pieces"
    );
    const resultDraft = result.draft as Draft;
    const castle = (resultDraft as Record<string, unknown>).activities as Array<
      Record<string, unknown>
    >;
    assert.ok(
      castle.some((item) => /prague castle/i.test(String(item.title ?? ""))),
      "real content survives the containment rebuild"
    );
  });

  await test("id forwarding: a subject whose piece id was refreshed follows the prior-id trail and the question SURVIVES", () => {
    const evidence = baseCluster();
    const castle = evidence.pieces.find(
      (piece) =>
        piece.outputEligible &&
        /prague castle/i.test(String(piece.payload.title ?? ""))
    );
    assert.ok(castle, "castle piece exists");
    // Simulate the merge-refresh: the piece once carried a different id
    // (mergeCanonicalPieceInto -> refreshCanonicalPieceId records the
    // prior trail on the payload).
    castle!.payload._canonicalPriorPieceIds = ["piece_prior_castle_id"];

    const draft = evidence.draft as Draft;
    draft.missingDetails = [
      ...draft.missingDetails,
      syntheticQuestion("piece_prior_castle_id"),
    ];

    const result = assembleCanonicalTripDraft({
      draft,
      evidencePieces: evidence.pieces,
      fallbackTripName: "forwarding repro",
      tripId: "892b2e3e-177e-429b-89ee-b8c8259f535f",
    });

    const resultDraft = result.draft as Draft;
    const question = resultDraft.missingDetails.find((detail) =>
      /which ticket/i.test(String(detail.prompt ?? ""))
    );
    assert.ok(question, "the question survives");
    assert.equal(
      question?._canonicalReviewDisposition,
      "question",
      "a mere id refresh never kills a question"
    );
    assert.equal(
      question?.relatedCanonicalPieceId,
      castle!.id,
      "the subject re-keys to the same entity's current id"
    );
  });
}
