import assert from "node:assert/strict";
import { clusterExtractedEvidence } from "@/lib/extraction/evidence-clustering";

// Run-2 §3 / work-order Task 3 — THE 6TH STAY.
//
// Live shape (run 2, MUST-HOLD bar item "5 stays" scored FAIL — 6):
//
//   Rome Stay   2019-01-12 -> 2019-01-14   same leg as The Yellow
//   The Yellow  2019-01-13 -> 2019-01-14
//
// `reconcileCanonicalStayIdentity` Pass 1 merges on VENUE identity and the
// two names share no distinctive token, so it correctly declined and both
// shipped. Pass 2 declined too: it requires a fragment with NO checkOut, and
// Rome Stay carries one.
//
// The fix is a third pass keyed on the one thing that separates the live pair
// from every negative control below: `Rome Stay`'s only identity token is its
// own CITY, which names the leg and never the venue.
//
// TWO PROPERTIES ARE ASSERTED TOGETHER, and the second is the one that makes
// this a fix rather than a different defect: the named venue's dates ALWAYS
// win (Eli, 2026-07-31). A range UNION would give The Yellow a 2019-01-12
// check-in — the exact fabricated stay RW-TRV-001 forbids and that
// `tests/assembly-ground-truth.test.ts` ("no fabricated stay for the
// overnight-flight night") already fails on. The Jan-12 night is covered by
// the overnight Delta 444 arrival, not by lodging.

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function stayDraft(stage: {
  places: Array<Record<string, unknown>>;
  stays: Array<Record<string, unknown>>;
}) {
  return clusterExtractedEvidence({
    sourceTransportAnchors: [],
    stages: [
      {
        label: "generic placeholder stay",
        source: "model_chunk",
        stage: {
          activities: [],
          missingDetails: [],
          places: stage.places,
          sensitiveDetails: [],
          stays: stage.stays,
          transport: [],
        },
      },
    ],
    tripOverview: { dateRange: "January 12-25, 2019" },
  }).draft as {
    stays: Array<{
      checkIn?: string | null;
      checkOut?: string | null;
      name: string;
    }>;
  };
}

const ROME_LEG = {
  arriveDate: "2019-01-12",
  city: "Rome",
  leaveDate: "2019-01-14",
};

export default async function run() {
  await test(
    "run-2 6th stay: a generic placeholder is absorbed by the one named venue it overlaps, and never lends it a date",
    () => {
      const draft = stayDraft({
        places: [ROME_LEG],
        stays: [
          {
            checkIn: "2019-01-12",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "Rome Stay",
          },
          {
            checkIn: "2019-01-13",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "The Yellow",
          },
        ],
      });

      assert.deepEqual(
        draft.stays.map((stay) => stay.name),
        ["The Yellow"],
        "the placeholder collapses into the named venue"
      );
      assert.equal(
        draft.stays[0].checkIn,
        "2019-01-13",
        "the named venue keeps its own check-in — a union would fabricate the Jan-12 transit-night stay RW-TRV-001 forbids"
      );
      assert.equal(draft.stays[0].checkOut, "2019-01-14");
    }
  );

  await test(
    "negative control: two independently named same-city stays on identical dates never collapse",
    () => {
      const draft = stayDraft({
        places: [
          { arriveDate: "2019-02-01", city: "Paris", leaveDate: "2019-02-05" },
        ],
        stays: [
          {
            checkIn: "2019-02-01",
            checkOut: "2019-02-05",
            city: "Paris",
            name: "Hotel Central",
          },
          {
            checkIn: "2019-02-01",
            checkOut: "2019-02-05",
            city: "Paris",
            name: "Hotel Plaza",
          },
        ],
      });

      assert.equal(
        draft.stays.length,
        2,
        "neither side is a placeholder, so the new pass cannot see them"
      );
    }
  );

  await test(
    "negative control: an ambiguous placeholder with TWO named venues in range stays put",
    () => {
      const draft = stayDraft({
        places: [ROME_LEG],
        stays: [
          {
            checkIn: "2019-01-12",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "Rome Stay",
          },
          {
            checkIn: "2019-01-13",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "The Yellow",
          },
          {
            checkIn: "2019-01-13",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "Hotel Splendide",
          },
        ],
      });

      assert.equal(
        draft.stays.length,
        3,
        "guessing which venue the placeholder duplicates is a wrong merge, and a wrong merge is worse than a duplicate"
      );
    }
  );

  await test(
    "negative control: a placeholder-named stay carrying an address is real lodging, not residue",
    () => {
      const draft = stayDraft({
        places: [ROME_LEG],
        stays: [
          {
            address: "Via Palestro 51, Rome",
            checkIn: "2019-01-12",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "Rome Stay",
          },
          {
            checkIn: "2019-01-13",
            checkOut: "2019-01-14",
            city: "Rome",
            name: "The Yellow",
          },
        ],
      });

      assert.equal(draft.stays.length, 2);
    }
  );

  await test(
    "negative control: a placeholder that overlaps no named venue survives",
    () => {
      const draft = stayDraft({
        places: [
          { arriveDate: "2019-01-18", city: "Vienna", leaveDate: "2019-01-24" },
        ],
        stays: [
          {
            checkIn: "2019-01-18",
            checkOut: "2019-01-19",
            city: "Vienna",
            name: "Vienna Stay",
          },
          {
            checkIn: "2019-01-21",
            checkOut: "2019-01-24",
            city: "Vienna",
            name: "Wombats City Hostel Vienna",
          },
        ],
      });

      assert.equal(
        draft.stays.length,
        2,
        "overlap is required — absorbing a non-overlapping placeholder would delete real night coverage"
      );
    }
  );
}
