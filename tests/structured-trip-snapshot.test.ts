import assert from "node:assert/strict";
import {
  attachStructuredTripSnapshot,
  readStructuredTripSnapshot,
  STRUCTURED_TRIP_SNAPSHOT_KEY,
  STRUCTURED_TRIP_SNAPSHOT_VERSION,
} from "@/lib/extraction/structured-trip-snapshot";
import { getAsiaDemoStructuredTripRecords } from "@/lib/traveler-view-model";

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

export default async function run() {
  await test("structured records round-trip inside the immutable draft snapshot", () => {
    const records = getAsiaDemoStructuredTripRecords();
    const persisted = attachStructuredTripSnapshot({
      draft: { tripOverview: { title: "Asia" } },
      records,
    });

    assert.deepEqual(readStructuredTripSnapshot(persisted), records);
    assert.equal(
      (persisted[STRUCTURED_TRIP_SNAPSHOT_KEY] as { version: number }).version,
      STRUCTURED_TRIP_SNAPSHOT_VERSION
    );
  });

  await test("missing, stale, or malformed structured snapshots never recompile", () => {
    assert.equal(readStructuredTripSnapshot({ tripOverview: {} }), null);
    assert.equal(
      readStructuredTripSnapshot({
        [STRUCTURED_TRIP_SNAPSHOT_KEY]: {
          records: getAsiaDemoStructuredTripRecords(),
          version: STRUCTURED_TRIP_SNAPSHOT_VERSION - 1,
        },
      }),
      null
    );
    assert.equal(
      readStructuredTripSnapshot({
        [STRUCTURED_TRIP_SNAPSHOT_KEY]: {
          records: { trip: { id: "incomplete" } },
          version: STRUCTURED_TRIP_SNAPSHOT_VERSION,
        },
      }),
      null
    );
  });
}
