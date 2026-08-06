// Arc G.3b — the grouping claim ledger.
//
// Before this, the deterministic grouping pass tracked membership in a
// bare `Set` of piece references, and the two lanes settled contention by
// STATEMENT ORDER: the same-site loop is written above the walk block, so
// it claimed every piece it wanted and the walk lane worked from whatever
// was left. "No score, no contest" (7.25.0 docket, chain B). Two things
// went wrong with that:
//
//   1. SILENT CONSUMPTION. A same-site decision can still be dropped
//      downstream — the executor re-verifies membership and abandons a
//      decision that no longer has two verified children. Its pieces were
//      already out of the walk pool by then, and nothing gave them back.
//      The day ends with no group at all and no record of why.
//   2. NO STRENGTH. A member the SOURCE places inside a site ("Palm House
//      at Schönbrunn") and a member that merely fell within 300 m were
//      the same kind of claim. Only the first is real evidence of
//      containment.
//
// The ledger makes claims explicit, typed by strength, releasable, and
// countable. It is deliberately ignorant of pieces — it holds ids — so it
// stays a pure data structure that can be tested on its own and reused by
// any future lane without importing the 11k-line clustering file.
//
// What it is NOT: an arbitration policy. It reports contention and
// enforces the release rules; deciding whether a lane may contest a claim
// stays with the caller, where the grouping doctrine lives.

import { isSiteComponentTitlePair } from "@/lib/extraction/activity-classifier";

export type GroupingLane = "same_site" | "walk";

export type ContainmentRelationType =
  | "authored_route"
  | "same_site"
  | "source_area_walk";

export type ContainmentEvidenceKind =
  | "resolver_source_relationship"
  | "source_area"
  | "source_bounded_extension"
  | "source_hierarchy"
  | "source_order"
  | "verified_address"
  | "verified_geo";

export type ContainmentMemberDecision = {
  evidence: ContainmentEvidenceKind[];
  observationIds: string[];
  pieceId: string;
  sourceOrder: number;
  title: string;
};

export type ContainmentRejectionReason =
  | "already_claimed"
  | "different_date"
  | "independent_booking"
  | "independent_time"
  | "insufficient_members"
  | "named_peer_site"
  | "no_licensed_evidence"
  | "one_child_pseudo_group"
  | "source_boundary"
  | "type_mismatch";

export type ContainmentRejection = {
  pieceId: string;
  reasonCode: ContainmentRejectionReason;
  title: string;
};

export type ContainmentDecision = {
  callPolicy: "required" | "silent";
  containerObservationIds: string[];
  containerPieceId: string | null;
  containerTitle: string;
  date: string;
  decisionId: string;
  members: ContainmentMemberDecision[];
  relationType: ContainmentRelationType;
  rejections: ContainmentRejection[];
  source: "deterministic_containment" | "resolver_containment";
};

export type ContainmentLedgerTelemetry = {
  decisions: ContainmentDecision[];
  doNotMergePairCount: number;
  rejectedCandidateCount: number;
  version: 1;
};

type ContainmentParticipant = {
  observationIds: string[];
  pieceId: string;
  title: string;
};

function orderedPair(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

// Identity code is allowed to ask the containment authority whether two
// titles describe a site and one of its components. It may not import the
// classifier helper directly and grow another semantic writer.
export function containmentTitleConflict(
  leftTitle: string | null | undefined,
  rightTitle: string | null | undefined
) {
  const comparable = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const left = comparable(leftTitle);
  const right = comparable(rightTitle);
  // Exact repeated evidence is identity, even when the shared title happens
  // to contain an "at Site" phrase. Containment protects distinct entities;
  // it must not manufacture duplicates of the same component.
  if (!left || left === right) return false;
  return isSiteComponentTitlePair(leftTitle, rightTitle);
}

// Containment is a non-mutating semantic ledger. It records relationships
// and the negative identity constraint they imply, but it never creates a
// parent, suppresses a piece, emits a Call, or changes a traveler field.
export function createContainmentLedger() {
  const decisions: ContainmentDecision[] = [];
  const pairKeys = new Set<string>();
  const observationPairKeys = new Set<string>();

  const registerPair = (
    left: ContainmentParticipant,
    right: ContainmentParticipant
  ) => {
    if (left.pieceId === right.pieceId) return;
    pairKeys.add(orderedPair(left.pieceId, right.pieceId));
    for (const leftId of left.observationIds) {
      for (const rightId of right.observationIds) {
        if (leftId !== rightId) {
          observationPairKeys.add(orderedPair(leftId, rightId));
        }
      }
    }
  };

  const registerTitleConflict = (
    left: ContainmentParticipant,
    right: ContainmentParticipant
  ) => {
    if (!containmentTitleConflict(left.title, right.title)) return false;
    registerPair(left, right);
    return true;
  };

  const addDecision = (decision: ContainmentDecision) => {
    if (decision.members.length < 2) return false;
    if (decisions.some((candidate) => candidate.decisionId === decision.decisionId)) {
      return false;
    }
    const participants: ContainmentParticipant[] = [
      ...(decision.containerPieceId
        ? [{
            observationIds: decision.containerObservationIds,
            pieceId: decision.containerPieceId,
            title: decision.containerTitle,
          }]
        : []),
      ...decision.members,
    ];
    for (let left = 0; left < participants.length; left += 1) {
      for (let right = left + 1; right < participants.length; right += 1) {
        registerPair(participants[left], participants[right]);
      }
    }
    decisions.push(decision);
    return true;
  };

  const doNotMerge = (
    left: { observationIds: string[]; pieceId: string; title: string },
    right: { observationIds: string[]; pieceId: string; title: string }
  ) => {
    if (left.pieceId === right.pieceId) return false;
    if (pairKeys.has(orderedPair(left.pieceId, right.pieceId))) return true;
    if (
      left.observationIds.some((leftId) =>
        right.observationIds.some((rightId) =>
          observationPairKeys.has(orderedPair(leftId, rightId))
        )
      )
    ) {
      return true;
    }
    return containmentTitleConflict(left.title, right.title);
  };

  const telemetry = (): ContainmentLedgerTelemetry => ({
    decisions: decisions.map((decision) => ({
      ...decision,
      containerObservationIds: [...decision.containerObservationIds],
      members: decision.members.map((member) => ({
        ...member,
        evidence: [...member.evidence],
        observationIds: [...member.observationIds],
      })),
      rejections: decision.rejections.map((rejection) => ({ ...rejection })),
    })),
    doNotMergePairCount: pairKeys.size,
    rejectedCandidateCount: decisions.reduce(
      (total, decision) => total + decision.rejections.length,
      0
    ),
    version: 1,
  });

  return { addDecision, doNotMerge, registerTitleConflict, telemetry };
}

export type ContainmentLedger = ReturnType<typeof createContainmentLedger>;

// A HIERARCHY claim is source-confirmed containment (a component list, a
// "<stop> at <Site>" title, or a geocoded address that names the site).
// A GEO claim is proximity alone. Only geo claims are ever contestable.
export type GroupingClaimStrength = "geo" | "hierarchy";

export type GroupingClaim = {
  decisionId: string;
  lane: GroupingLane;
  pieceId: string;
  strength: GroupingClaimStrength;
};

export type GroupingClaimLedgerTelemetry = {
  claimedPieceCount: number;
  claimsByLane: Record<GroupingLane, number>;
  contestedPieceCount: number;
  releasedDecisionCount: number;
};

export function createGroupingClaimLedger() {
  const claimsByPiece = new Map<string, GroupingClaim>();
  const pieceIdsByDecision = new Map<string, string[]>();
  let contestedPieceCount = 0;
  let releasedDecisionCount = 0;

  const claim = ({
    decisionId,
    entries,
    lane,
  }: {
    decisionId: string;
    entries: Array<{ pieceId: string; strength: GroupingClaimStrength }>;
    lane: GroupingLane;
  }) => {
    const accepted: string[] = [];
    for (const entry of entries) {
      // First claim wins. A lane that wants a piece another lane already
      // holds must contest it explicitly and be granted the release.
      if (claimsByPiece.has(entry.pieceId)) continue;
      claimsByPiece.set(entry.pieceId, {
        decisionId,
        lane,
        pieceId: entry.pieceId,
        strength: entry.strength,
      });
      accepted.push(entry.pieceId);
    }
    const existing = pieceIdsByDecision.get(decisionId) ?? [];
    pieceIdsByDecision.set(decisionId, [...existing, ...accepted]);
    return accepted;
  };

  const isClaimed = (pieceId: string) => claimsByPiece.has(pieceId);

  const claimFor = (pieceId: string) => claimsByPiece.get(pieceId) ?? null;

  // Releasing a whole decision — the abandoned-decision path. Everything
  // it held goes back to the pool BEFORE the next lane looks.
  const releaseDecision = (decisionId: string) => {
    const pieceIds = pieceIdsByDecision.get(decisionId) ?? [];
    for (const pieceId of pieceIds) {
      const held = claimsByPiece.get(pieceId);
      if (held?.decisionId === decisionId) claimsByPiece.delete(pieceId);
    }
    pieceIdsByDecision.delete(decisionId);
    if (pieceIds.length > 0) releasedDecisionCount += 1;
    return pieceIds;
  };

  // Contesting a single piece. Granted only when the holding claim is
  // proximity-only AND the holder can spare it (`survivesWithout`), so a
  // contest can never dissolve a group that the source itself supports.
  const contest = ({
    pieceId,
    survivesWithout,
  }: {
    pieceId: string;
    survivesWithout: (claim: GroupingClaim) => boolean;
  }) => {
    const held = claimsByPiece.get(pieceId);
    if (!held) return true;
    contestedPieceCount += 1;
    if (held.strength !== "geo") return false;
    if (!survivesWithout(held)) return false;
    claimsByPiece.delete(pieceId);
    pieceIdsByDecision.set(
      held.decisionId,
      (pieceIdsByDecision.get(held.decisionId) ?? []).filter(
        (value) => value !== pieceId
      )
    );
    return true;
  };

  const telemetry = (): GroupingClaimLedgerTelemetry => {
    const claimsByLane: Record<GroupingLane, number> = {
      same_site: 0,
      walk: 0,
    };
    for (const held of claimsByPiece.values()) {
      claimsByLane[held.lane] += 1;
    }
    return {
      claimedPieceCount: claimsByPiece.size,
      claimsByLane,
      contestedPieceCount,
      releasedDecisionCount,
    };
  };

  return { claim, claimFor, contest, isClaimed, releaseDecision, telemetry };
}

export type GroupingClaimLedger = ReturnType<typeof createGroupingClaimLedger>;
