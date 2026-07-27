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

export type GroupingLane = "same_site" | "walk";

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
