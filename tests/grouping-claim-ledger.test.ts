import assert from "node:assert/strict";
import {
  createContainmentLedger,
  createGroupingClaimLedger,
} from "@/lib/extraction/grouping-claim-ledger";

// Arc G.3b. The ledger replaced a bare `Set` whose only arbitration rule
// was which lane's code was written first. These tests pin the three
// behaviors that rule could not express.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const alwaysSpare = () => true;
const neverSpare = () => false;

export default async function run() {
  await test("containment records relations without mutating its inputs", () => {
    const ledger = createContainmentLedger();
    const decision = {
      callPolicy: "required" as const,
      containerObservationIds: ["obs-parent"],
      containerPieceId: "parent",
      containerTitle: "River Palace",
      date: "2026-08-06",
      decisionId: "site-1",
      members: [
        {
          evidence: ["source_hierarchy" as const],
          observationIds: ["obs-garden"],
          pieceId: "garden",
          sourceOrder: 1,
          title: "Garden at River Palace",
        },
        {
          evidence: ["source_order" as const],
          observationIds: ["obs-orangerie"],
          pieceId: "orangerie",
          sourceOrder: 2,
          title: "Orangerie",
        },
      ],
      relationType: "same_site" as const,
      rejections: [],
      source: "deterministic_containment" as const,
    };
    const before = JSON.stringify(decision);

    assert.equal(ledger.addDecision(decision), true);
    assert.equal(JSON.stringify(decision), before, "the input remains untouched");
    assert.equal(
      ledger.doNotMerge(
        { observationIds: ["obs-parent"], pieceId: "parent", title: "River Palace" },
        { observationIds: ["obs-garden"], pieceId: "garden", title: "Garden" }
      ),
      true,
      "a parent and member can never collapse in identity"
    );
    assert.equal(ledger.telemetry().decisions.length, 1);
  });

  await test("containment refuses one-child pseudo-groups", () => {
    const ledger = createContainmentLedger();
    assert.equal(
      ledger.addDecision({
        callPolicy: "required",
        containerObservationIds: ["obs-parent"],
        containerPieceId: "parent",
        containerTitle: "River Palace",
        date: "2026-08-06",
        decisionId: "site-one-child",
        members: [{
          evidence: ["source_hierarchy"],
          observationIds: ["obs-child"],
          pieceId: "child",
          sourceOrder: 1,
          title: "Garden at River Palace",
        }],
        relationType: "same_site",
        rejections: [],
        source: "deterministic_containment",
      }),
      false
    );
    assert.deepEqual(ledger.telemetry().decisions, []);
  });

  await test("the first lane to claim a piece holds it", () => {
    const ledger = createGroupingClaimLedger();
    ledger.claim({
      decisionId: "site-1",
      entries: [{ pieceId: "p1", strength: "geo" }],
      lane: "same_site",
    });
    const accepted = ledger.claim({
      decisionId: "walk-1",
      entries: [{ pieceId: "p1", strength: "geo" }],
      lane: "walk",
    });

    assert.deepEqual(accepted, []);
    assert.equal(ledger.claimFor("p1")?.lane, "same_site");
  });

  await test("a source-confirmed member is never taken by a contest", () => {
    const ledger = createGroupingClaimLedger();
    ledger.claim({
      decisionId: "site-1",
      entries: [{ pieceId: "p1", strength: "hierarchy" }],
      lane: "same_site",
    });

    assert.equal(
      ledger.contest({ pieceId: "p1", survivesWithout: alwaysSpare }),
      false,
      "hierarchy evidence outranks any contest, even a spare-able one"
    );
    assert.equal(ledger.claimFor("p1")?.lane, "same_site");
  });

  await test("a proximity-only member moves lanes only if its holder can spare it", () => {
    const ledger = createGroupingClaimLedger();
    ledger.claim({
      decisionId: "site-1",
      entries: [{ pieceId: "p1", strength: "geo" }],
      lane: "same_site",
    });

    assert.equal(
      ledger.contest({ pieceId: "p1", survivesWithout: neverSpare }),
      false,
      "a group that would fall apart keeps its member"
    );
    assert.equal(
      ledger.contest({ pieceId: "p1", survivesWithout: alwaysSpare }),
      true
    );
    assert.equal(ledger.claimFor("p1"), null, "the piece is free again");
    assert.equal(ledger.telemetry().contestedPieceCount, 2);
  });

  await test("an abandoned decision gives its pieces back instead of stranding them", () => {
    // The silent-consumption case: the site lane claims three stops, the
    // decision is dropped later, and before the ledger those pieces were
    // simply gone from the walk pool with nothing recorded.
    const ledger = createGroupingClaimLedger();
    ledger.claim({
      decisionId: "site-1",
      entries: [
        { pieceId: "p1", strength: "geo" },
        { pieceId: "p2", strength: "hierarchy" },
        { pieceId: "p3", strength: "geo" },
      ],
      lane: "same_site",
    });
    assert.equal(ledger.isClaimed("p2"), true);

    const released = ledger.releaseDecision("site-1");
    assert.deepEqual(released.sort(), ["p1", "p2", "p3"]);
    assert.equal(ledger.isClaimed("p1"), false);
    assert.equal(ledger.isClaimed("p2"), false);
    assert.equal(ledger.telemetry().releasedDecisionCount, 1);
    assert.equal(ledger.telemetry().claimedPieceCount, 0);
  });

  await test("telemetry reports who holds what, so contention is visible in the run", () => {
    const ledger = createGroupingClaimLedger();
    ledger.claim({
      decisionId: "site-1",
      entries: [
        { pieceId: "p1", strength: "hierarchy" },
        { pieceId: "p2", strength: "geo" },
      ],
      lane: "same_site",
    });
    ledger.claim({
      decisionId: "walk-1",
      entries: [
        { pieceId: "p3", strength: "geo" },
        { pieceId: "p4", strength: "geo" },
        { pieceId: "p5", strength: "geo" },
      ],
      lane: "walk",
    });

    assert.deepEqual(ledger.telemetry(), {
      claimedPieceCount: 5,
      claimsByLane: { same_site: 2, walk: 3 },
      contestedPieceCount: 0,
      releasedDecisionCount: 0,
    });
  });
}
